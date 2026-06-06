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

export type StorageProvider = IStorageProvider;
