import fs from 'fs/promises';
import path from 'path';
import crypto from 'crypto';
import {
  IStorageProvider,
  UploadOptions,
  UploadResult,
  SignedUrlOptions,
} from './storage-provider.interface';
import { InfrastructureError } from '../../shared/errors/infrastructure.error';

export class LocalStorageProvider implements IStorageProvider {
  private readonly basePath: string;
  private readonly baseUrl: string;

  constructor() {
    this.basePath = process.env.LOCAL_STORAGE_PATH ?? './uploads';
    this.baseUrl = process.env.LOCAL_STORAGE_URL ?? 'http://localhost:3000/uploads';
  }

  async upload(
    buffer: Buffer,
    options: UploadOptions,
  ): Promise<UploadResult> {
    try {
      const storagePath = this.buildStoragePath(options);
      const fullPath = path.join(this.basePath, storagePath);

      // Ensure directory exists
      await fs.mkdir(path.dirname(fullPath), { recursive: true });

      await fs.writeFile(fullPath, buffer);

      return {
        storagePath,
        publicUrl: `${this.baseUrl}/${storagePath}`,
        provider: 'local',
      };
    } catch (error) {
      throw new InfrastructureError('Local storage upload failed', { error });
    }
  }

  getSignedUrl(
    storagePath: string,
    options: SignedUrlOptions = {},
  ): Promise<string> {
    // For local storage, return a token-based URL
    const expiresIn = options.expiresIn ?? 3600;
    const expires = Date.now() + expiresIn * 1000;
    const token = crypto
      .createHmac('sha256', process.env.LOCAL_STORAGE_SECRET ?? 'secret')
      .update(`${storagePath}:${expires}`)
      .digest('hex');

    return Promise.resolve(
      `${this.baseUrl}/${storagePath}?token=${token}&expires=${expires}`,
    );
  }

  async delete(storagePath: string): Promise<void> {
    try {
      const fullPath = path.join(this.basePath, storagePath);
      await fs.unlink(fullPath);
    } catch (error) {
      throw new InfrastructureError('Local storage delete failed', { error });
    }
  }

  async exists(storagePath: string): Promise<boolean> {
    try {
      const fullPath = path.join(this.basePath, storagePath);
      await fs.access(fullPath);
      return true;
    } catch {
      return false;
    }
  }

  private buildStoragePath(options: UploadOptions): string {
    const timestamp = Date.now();
    const ext = options.filename.split('.').pop();
    const folder = options.folder ?? 'attachments';
    return `${options.tenantId}/${folder}/${timestamp}-${crypto.randomUUID()}.${ext}`;
  }
}
