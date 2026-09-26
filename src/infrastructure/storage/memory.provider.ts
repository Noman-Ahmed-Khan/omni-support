import crypto from 'crypto';

import {
  safeExtension,
  type IStorageProvider,
  type UploadOptions,
  type UploadResult,
  type SignedUrlOptions,
} from './storage-provider.interface';

interface MemoryFile {
  buffer: Buffer;
  mimeType: string;
  sizeBytes: number;
  tenantId: string;
  metadata?: Record<string, string>;
  createdAt: number;
}

export class MemoryStorageProvider implements IStorageProvider {
  private readonly files = new Map<string, MemoryFile>();

  upload(buffer: Buffer, options: UploadOptions): Promise<UploadResult> {
    const storagePath = this.buildStoragePath(options);

    this.files.set(storagePath, {
      buffer,
      mimeType: options.mimeType,
      sizeBytes: options.sizeBytes,
      tenantId: options.tenantId,
      metadata: options.metadata,
      createdAt: Date.now(),
    });

    return Promise.resolve({ storagePath, provider: 'memory' });
  }

  getSignedUrl(storagePath: string, options: SignedUrlOptions = {}): Promise<string> {
    const expiresIn = options.expiresIn ?? 3600;
    const expires = Math.floor(Date.now() / 1000) + expiresIn;
    return Promise.resolve(`memory://${storagePath}?expires=${expires}`);
  }

  delete(storagePath: string): Promise<void> {
    this.files.delete(storagePath);
    return Promise.resolve();
  }

  exists(storagePath: string): Promise<boolean> {
    return Promise.resolve(this.files.has(storagePath));
  }

  private buildStoragePath(options: UploadOptions): string {
    const folder = options.folder ?? 'attachments';
    const fileName = `${Date.now()}-${crypto.randomUUID()}${safeExtension(options.filename)}`;
    return `${options.tenantId}/${folder}/${fileName}`;
  }
}
