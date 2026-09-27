import type { Prisma, PrismaClient } from '@prisma/client';
import { z } from 'zod';

export const operationalSettingsSchema = z
  .object({
    /** Stops the outbox relay from claiming new events (in-flight events finish). */
    outboxPaused: z.boolean(),
    /** Attempts granted to an event when an operator retries it. */
    retryMaxAttempts: z.number().int().min(1).max(20),
    /** Processed/cancelled outbox rows are deleted after this many days. */
    outboxRetentionDays: z.number().int().min(1).max(365),
    /** Finished webhook rows (processed/skipped/cancelled) are deleted after this many days. */
    webhookRetentionDays: z.number().int().min(1).max(365),
  })
  .strict();

export type OperationalSettings = z.infer<typeof operationalSettingsSchema>;

export const DEFAULT_OPERATIONAL_SETTINGS: OperationalSettings = {
  outboxPaused: false,
  retryMaxAttempts: 5,
  outboxRetentionDays: 14,
  webhookRetentionDays: 30,
};

const CACHE_MS = 15_000;

export class OperationalSettingsService {
  private cached: { value: OperationalSettings; at: number } | null = null;

  constructor(private readonly prisma: PrismaClient) {}

  async get(): Promise<OperationalSettings> {
    if (this.cached && Date.now() - this.cached.at < CACHE_MS) return this.cached.value;
    const rows = await this.prisma.operationalSetting.findMany();
    const stored = Object.fromEntries(rows.map((row) => [row.key, row.value]));
    const parsed = operationalSettingsSchema.partial().safeParse(stored);
    const value = {
      ...DEFAULT_OPERATIONAL_SETTINGS,
      ...(parsed.success ? parsed.data : {}),
    };
    this.cached = { value, at: Date.now() };
    return value;
  }

  async update(
    changes: Partial<OperationalSettings>,
    actorId: string,
  ): Promise<{ before: OperationalSettings; after: OperationalSettings }> {
    const before = await this.get();
    await this.prisma.$transaction(
      Object.entries(changes).map(([key, value]) =>
        this.prisma.operationalSetting.upsert({
          where: { key },
          create: { key, value: value as Prisma.InputJsonValue, updatedById: actorId },
          update: { value: value as Prisma.InputJsonValue, updatedById: actorId },
        }),
      ),
    );
    this.cached = null;
    return { before, after: await this.get() };
  }
}
