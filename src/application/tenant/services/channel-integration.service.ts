import crypto from 'crypto';

import type { Prisma, PrismaClient, TenantIntegration } from '@prisma/client';

import { getMessagingConfig } from '../../../config/messaging.config';
import type { AuditRepository } from '../../../infrastructure/database/repositories/audit.repository';
import type { IEmailProvider } from '../../../infrastructure/messaging/email/email-provider.interface';
import type { EncryptionService } from '../../../infrastructure/security/encryption.service';
import {
  ConflictError,
  NotFoundError,
  ValidationError,
} from '../../../shared/errors/domain.error';

export type ChannelProvider = 'whatsapp' | 'email';

export interface WhatsAppChannelConfig {
  phoneNumber: string;
  displayName?: string;
}

export interface EmailChannelConfig {
  fromName: string;
  replyTo?: string;
}

export type ChannelConfig = WhatsAppChannelConfig | EmailChannelConfig;

export interface ChannelTestResult {
  status: 'SUCCEEDED' | 'FAILED';
  checkedAt: string;
  message: string;
}

/** Redacted view: the signing secret itself is never returned by read APIs. */
export interface ChannelView {
  provider: ChannelProvider;
  isEnabled: boolean;
  config: Record<string, unknown>;
  hasSigningSecret: boolean;
  secretRotatedAt: string | null;
  lastTest: ChannelTestResult | null;
  sharedProviderConfigured: boolean;
  updatedAt: Date;
}

export interface SharedProviderStatus {
  whatsappConfigured(): boolean;
  emailConfigured(): boolean;
}

interface ChannelMetadata {
  secretRotatedAt?: string;
  lastTest?: ChannelTestResult;
  configVersion?: number;
  testedConfigVersion?: number;
}

const TEST_TIMEOUT_MS = 5_000;

export function normalizePhone(value: string): string {
  const trimmed = value.trim();
  return (trimmed.startsWith('+') ? '+' : '') + trimmed.replace(/\D/g, '');
}

function readMetadata(integration: TenantIntegration): ChannelMetadata {
  const metadata = integration.metadata;
  return metadata && typeof metadata === 'object' && !Array.isArray(metadata)
    ? (metadata as ChannelMetadata)
    : {};
}

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((_, reject) =>
      setTimeout(() => reject(new Error('Connection test timed out')), ms).unref(),
    ),
  ]);
}

/**
 * Tenant messaging channels. Provider credentials (Twilio, SMTP) are shared deployment
 * configuration; a tenant configures its channel identity (WhatsApp business number,
 * email sender name and reply-to), a per-channel signing secret, and whether the channel
 * is enabled. A channel can only be enabled after a successful connection test of its
 * current configuration.
 */
export class ChannelIntegrationService {
  constructor(
    private readonly prisma: PrismaClient,
    private readonly encryption: EncryptionService,
    private readonly emailProvider: Pick<IEmailProvider, 'verify'>,
    private readonly shared: SharedProviderStatus,
    private readonly auditRepo: AuditRepository,
  ) {}

  async list(tenantId: string): Promise<ChannelView[]> {
    const integrations = await this.prisma.tenantIntegration.findMany({
      where: { tenantId, provider: { in: ['whatsapp', 'email'] } },
      orderBy: { provider: 'asc' },
    });
    return integrations.map((integration) => this.toView(integration));
  }

  async get(tenantId: string, provider: ChannelProvider): Promise<ChannelView> {
    return this.toView(await this.find(tenantId, provider));
  }

  async configure(
    actor: { id: string; tenantId: string },
    provider: ChannelProvider,
    config: ChannelConfig,
  ): Promise<ChannelView> {
    const normalized = this.normalizeConfig(provider, config);
    if (provider === 'whatsapp') {
      await this.assertPhoneAvailable(
        actor.tenantId,
        (normalized as WhatsAppChannelConfig).phoneNumber,
      );
    }
    const existing = await this.prisma.tenantIntegration.findUnique({
      where: { tenantId_provider: { tenantId: actor.tenantId, provider } },
    });
    const metadata = existing ? readMetadata(existing) : {};
    const nextMetadata: ChannelMetadata = {
      ...metadata,
      configVersion: (metadata.configVersion ?? 0) + 1,
    };
    // A changed identity must be re-tested before the channel carries traffic again.
    const integration = await this.prisma.tenantIntegration.upsert({
      where: { tenantId_provider: { tenantId: actor.tenantId, provider } },
      create: {
        tenantId: actor.tenantId,
        provider,
        isEnabled: false,
        config: normalized as unknown as Prisma.InputJsonValue,
        metadata: nextMetadata as unknown as Prisma.InputJsonValue,
      },
      update: {
        isEnabled: false,
        config: normalized as unknown as Prisma.InputJsonValue,
        metadata: nextMetadata as unknown as Prisma.InputJsonValue,
      },
    });
    await this.audit(actor, existing ? 'UPDATE' : 'CREATE', integration.id, {
      provider,
      config: normalized,
    });
    return this.toView(integration);
  }

  /** Returns the new signing secret once; read APIs only report that one exists. */
  async rotateSecret(
    actor: { id: string; tenantId: string },
    provider: ChannelProvider,
  ): Promise<{ secret: string; rotatedAt: string }> {
    const integration = await this.find(actor.tenantId, provider);
    const secret = crypto.randomBytes(32).toString('base64url');
    const rotatedAt = new Date().toISOString();
    await this.prisma.tenantIntegration.update({
      where: { id: integration.id },
      data: {
        webhookSecret: JSON.stringify(this.encryption.encrypt(secret)),
        metadata: {
          ...readMetadata(integration),
          secretRotatedAt: rotatedAt,
        } as unknown as Prisma.InputJsonValue,
      },
    });
    await this.audit(actor, 'UPDATE', integration.id, {
      provider,
      secretRotated: true,
    });
    return { secret, rotatedAt };
  }

  async test(
    actor: { id: string; tenantId: string },
    provider: ChannelProvider,
  ): Promise<ChannelTestResult> {
    const integration = await this.find(actor.tenantId, provider);
    let result: ChannelTestResult;
    try {
      const message = await this.runTest(integration);
      result = { status: 'SUCCEEDED', checkedAt: new Date().toISOString(), message };
    } catch (error) {
      result = {
        status: 'FAILED',
        checkedAt: new Date().toISOString(),
        message: error instanceof Error ? error.message : 'Connection test failed',
      };
    }
    const metadata = readMetadata(integration);
    await this.prisma.tenantIntegration.update({
      where: { id: integration.id },
      data: {
        lastSyncAt: new Date(),
        metadata: {
          ...metadata,
          lastTest: result,
          testedConfigVersion:
            result.status === 'SUCCEEDED'
              ? (metadata.configVersion ?? 0)
              : metadata.testedConfigVersion,
        } as unknown as Prisma.InputJsonValue,
      },
    });
    await this.audit(actor, 'UPDATE', integration.id, {
      provider,
      connectionTest: result.status,
    });
    return result;
  }

  async setEnabled(
    actor: { id: string; tenantId: string },
    provider: ChannelProvider,
    enabled: boolean,
  ): Promise<ChannelView> {
    const integration = await this.find(actor.tenantId, provider);
    if (enabled) {
      const metadata = readMetadata(integration);
      if (
        metadata.lastTest?.status !== 'SUCCEEDED' ||
        metadata.testedConfigVersion !== (metadata.configVersion ?? 0)
      ) {
        throw new ConflictError(
          'Run a successful connection test of the current configuration first',
        );
      }
      if (provider === 'whatsapp') {
        const config = integration.config as unknown as WhatsAppChannelConfig;
        await this.assertPhoneAvailable(actor.tenantId, config.phoneNumber);
      }
    }
    const updated = await this.prisma.tenantIntegration.update({
      where: { id: integration.id },
      data: { isEnabled: enabled },
    });
    await this.audit(actor, 'UPDATE', integration.id, { provider, isEnabled: enabled });
    return this.toView(updated);
  }

  async remove(
    actor: { id: string; tenantId: string },
    provider: ChannelProvider,
  ): Promise<void> {
    const integration = await this.find(actor.tenantId, provider);
    await this.prisma.tenantIntegration.delete({ where: { id: integration.id } });
    await this.audit(actor, 'DELETE', integration.id, { provider });
  }

  /** Sender identity for customer-facing mail of a tenant with an enabled email channel. */
  async resolveEmailIdentity(
    tenantId: string,
  ): Promise<{ from?: string; replyTo?: string } | null> {
    const integration = await this.prisma.tenantIntegration.findUnique({
      where: { tenantId_provider: { tenantId, provider: 'email' } },
    });
    if (!integration?.isEnabled) return null;
    const config = integration.config as unknown as EmailChannelConfig;
    const sharedFrom = getMessagingConfig().email.from;
    // The shared sender address is kept so SPF/DKIM stay valid; only the name changes.
    const name = config.fromName.replace(/["\\\r\n<>]/g, '').trim();
    return {
      from: name ? `"${name}" <${sharedFrom}>` : undefined,
      replyTo: config.replyTo,
    };
  }

  /** Platform view across tenants; always redacted. */
  async listAll(filter: { tenantId?: string; provider?: string }) {
    const integrations = await this.prisma.tenantIntegration.findMany({
      where: {
        ...(filter.tenantId ? { tenantId: filter.tenantId } : {}),
        ...(filter.provider ? { provider: filter.provider } : {}),
      },
      orderBy: [{ tenantId: 'asc' }, { provider: 'asc' }],
      take: 500,
    });
    return integrations.map((integration) => ({
      id: integration.id,
      tenantId: integration.tenantId,
      ...this.toView(integration),
    }));
  }

  private async runTest(integration: TenantIntegration): Promise<string> {
    if (integration.provider === 'whatsapp') {
      if (!this.shared.whatsappConfigured()) {
        throw new Error('Shared WhatsApp provider credentials are not configured');
      }
      const config = integration.config as unknown as WhatsAppChannelConfig;
      if (!/^\+\d{8,15}$/.test(config.phoneNumber ?? '')) {
        throw new Error('WhatsApp number must be in E.164 format');
      }
      await this.assertPhoneAvailable(integration.tenantId, config.phoneNumber);
      return 'Shared WhatsApp provider is configured and the number is routable';
    }
    if (!this.shared.emailConfigured()) {
      throw new Error('Shared email provider is not configured');
    }
    const reachable = await withTimeout(this.emailProvider.verify(), TEST_TIMEOUT_MS);
    if (!reachable) throw new Error('Email provider rejected the connection');
    return 'Email provider accepted the connection';
  }

  private normalizeConfig(
    provider: ChannelProvider,
    config: ChannelConfig,
  ): ChannelConfig {
    if (provider === 'whatsapp') {
      const whatsapp = config as WhatsAppChannelConfig;
      const phoneNumber = normalizePhone(whatsapp.phoneNumber ?? '');
      if (!/^\+\d{8,15}$/.test(phoneNumber)) {
        throw new ValidationError('WhatsApp number must be in E.164 format');
      }
      return { phoneNumber, displayName: whatsapp.displayName };
    }
    const email = config as EmailChannelConfig;
    return { fromName: email.fromName, replyTo: email.replyTo?.toLowerCase() };
  }

  /** Inbound messages are routed by number, so a number may belong to one tenant only. */
  private async assertPhoneAvailable(
    tenantId: string,
    phoneNumber: string,
  ): Promise<void> {
    const others = await this.prisma.tenantIntegration.findMany({
      where: { provider: 'whatsapp', tenantId: { not: tenantId } },
      select: { config: true },
    });
    const target = normalizePhone(phoneNumber);
    const taken = others.some((other) => {
      const phone = (other.config as { phoneNumber?: unknown } | null)?.phoneNumber;
      return typeof phone === 'string' && normalizePhone(phone) === target;
    });
    if (taken)
      throw new ConflictError('This WhatsApp number is used by another organization');
  }

  private async find(
    tenantId: string,
    provider: ChannelProvider,
  ): Promise<TenantIntegration> {
    const integration = await this.prisma.tenantIntegration.findUnique({
      where: { tenantId_provider: { tenantId, provider } },
    });
    if (!integration) throw new NotFoundError('Integration', provider);
    return integration;
  }

  private toView(integration: TenantIntegration): ChannelView {
    const metadata = readMetadata(integration);
    const provider = integration.provider as ChannelProvider;
    return {
      provider,
      isEnabled: integration.isEnabled,
      config: (integration.config ?? {}) as Record<string, unknown>,
      hasSigningSecret: !!integration.webhookSecret,
      secretRotatedAt: metadata.secretRotatedAt ?? null,
      lastTest: metadata.lastTest ?? null,
      sharedProviderConfigured:
        provider === 'whatsapp'
          ? this.shared.whatsappConfigured()
          : this.shared.emailConfigured(),
      updatedAt: integration.updatedAt,
    };
  }

  private audit(
    actor: { id: string; tenantId: string },
    action: 'CREATE' | 'UPDATE' | 'DELETE',
    resourceId: string,
    detail: Record<string, unknown>,
  ): Promise<void> {
    return this.auditRepo.create({
      tenantId: actor.tenantId,
      actorId: actor.id,
      action,
      resource: 'integrations',
      resourceId,
      newValue: detail,
    });
  }
}

/** Shared-provider checks backed by deployment configuration. */
export function createSharedProviderStatus(
  whatsappConfigured: () => boolean,
): SharedProviderStatus {
  return {
    whatsappConfigured,
    emailConfigured: () => {
      try {
        const config = getMessagingConfig();
        return !!config.smtp.host && !!config.email.from;
      } catch {
        return false;
      }
    },
  };
}
