import crypto from 'crypto';
import { createReadStream } from 'fs';
import fs from 'fs/promises';
import path from 'path';
import type { Readable } from 'stream';

import {
  safeExtension,
  type ISignedDownloadProvider,
  type IStorageProvider,
  type SignedUrlOptions,
  type UploadOptions,
  type UploadResult,
} from './storage-provider.interface';
import type { LocalStorageConfig } from '../../config/storage.config';
import { InfrastructureError } from '../../shared/errors/infrastructure.error';

/**
 * Stores files on local disk. Files are never public: they are served by the signed
 * download route (GET /api/v1/attachments/files/...) after the HMAC signature is verified.
 */
export class LocalStorageProvider implements IStorageProvider, ISignedDownloadProvider {
  private readonly basePath: string;

  constructor(private readonly config: LocalStorageConfig) {
    this.basePath = path.resolve(config.path);
  }

  async upload(buffer: Buffer, options: UploadOptions): Promise<UploadResult> {
    try {
      const storagePath = this.buildStoragePath(options);
      const fullPath = this.resolveFullPath(storagePath);

      await fs.mkdir(path.dirname(fullPath), { recursive: true });
      await fs.writeFile(fullPath, buffer);

      return { storagePath, provider: 'local' };
    } catch (error) {
      throw new InfrastructureError('Local storage upload failed', { error });
    }
  }

  getSignedUrl(storagePath: string, options: SignedUrlOptions = {}): Promise<string> {
    const expires = String(Date.now() + (options.expiresIn ?? 3600) * 1000);
    const token = this.sign(storagePath, expires);
    const encodedPath = storagePath.split('/').map(encodeURIComponent).join('/');

    return Promise.resolve(
      `${this.config.baseUrl}/${encodedPath}?token=${token}&expires=${expires}`,
    );
  }

  verifySignedUrl(storagePath: string, expires: string, token: string): boolean {
    if (!/^\d+$/.test(expires) || Number(expires) < Date.now()) {
      return false;
    }

    const expected = Buffer.from(this.sign(storagePath, expires));
    const actual = Buffer.from(token);
    return expected.length === actual.length && crypto.timingSafeEqual(expected, actual);
  }

  openReadStream(storagePath: string): Readable {
    return createReadStream(this.resolveFullPath(storagePath));
  }

  async delete(storagePath: string): Promise<void> {
    try {
      await fs.unlink(this.resolveFullPath(storagePath));
    } catch (error) {
      throw new InfrastructureError('Local storage delete failed', { error });
    }
  }

  async exists(storagePath: string): Promise<boolean> {
    try {
      await fs.access(this.resolveFullPath(storagePath));
      return true;
    } catch {
      return false;
    }
  }

  private sign(storagePath: string, expires: string): string {
    return crypto
      .createHmac('sha256', this.config.secret)
      .update(`${storagePath}:${expires}`)
      .digest('hex');
  }

  /** Resolves a storage key inside the storage root and rejects any path escape. */
  private resolveFullPath(storagePath: string): string {
    const fullPath = path.resolve(this.basePath, storagePath);
    if (!fullPath.startsWith(this.basePath + path.sep)) {
      throw new InfrastructureError('Invalid storage path');
    }
    return fullPath;
  }

  private buildStoragePath(options: UploadOptions): string {
    const folder = options.folder ?? 'attachments';
    const fileName = `${Date.now()}-${crypto.randomUUID()}${safeExtension(options.filename)}`;
    return `${options.tenantId}/${folder}/${fileName}`;
  }
}
