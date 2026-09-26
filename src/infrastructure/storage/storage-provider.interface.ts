import type { Readable } from 'stream';

export interface UploadOptions {
  filename: string;
  mimeType: string;
  sizeBytes: number;
  tenantId: string;
  folder?: string;
  metadata?: Record<string, string>;
}

export interface UploadResult {
  storagePath: string;
  publicUrl?: string;
  provider: string;
}

export interface SignedUrlOptions {
  expiresIn?: number; // seconds, default 3600
}

export interface IStorageProvider {
  upload(buffer: Buffer, options: UploadOptions): Promise<UploadResult>;
  getSignedUrl(storagePath: string, options?: SignedUrlOptions): Promise<string>;
  delete(storagePath: string): Promise<void>;
  exists(storagePath: string): Promise<boolean>;
}

/** Providers whose files are served through this API's signed download route. */
export interface ISignedDownloadProvider {
  /** True when token/expires were produced by getSignedUrl and have not expired. */
  verifySignedUrl(storagePath: string, expires: string, token: string): boolean;
  openReadStream(storagePath: string): Readable;
}

export function supportsSignedDownloads(
  provider: IStorageProvider,
): provider is IStorageProvider & ISignedDownloadProvider {
  const candidate = provider as Partial<ISignedDownloadProvider>;
  return (
    typeof candidate.verifySignedUrl === 'function' &&
    typeof candidate.openReadStream === 'function'
  );
}

/** File extension that is safe to use in a storage key ("" when there is none). */
export function safeExtension(filename: string): string {
  const match = /\.([a-z0-9]{1,10})$/i.exec(filename);
  return match ? `.${match[1].toLowerCase()}` : '';
}

export type StorageProvider = IStorageProvider;
