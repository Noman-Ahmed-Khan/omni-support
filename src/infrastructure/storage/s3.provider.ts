import {
  S3Client,
  PutObjectCommand,
  DeleteObjectCommand,
  GetObjectCommand,
  HeadObjectCommand,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import {
  IStorageProvider,
  UploadOptions,
  UploadResult,
  SignedUrlOptions,
} from './storage-provider.interface';
import { storageConfig } from '../../config/storage.config';
import { InfrastructureError } from '../../shared/errors/infrastructure.error';
import { logger } from '../../shared/utils/logger.util';

export class S3StorageProvider implements IStorageProvider {
  private readonly client: S3Client;
  private readonly bucket: string;

  constructor() {
    this.client = new S3Client({
      region: storageConfig.aws.region,
      credentials: {
        accessKeyId: storageConfig.aws.accessKeyId,
        secretAccessKey: storageConfig.aws.secretAccessKey,
      },
      endpoint: storageConfig.aws.endpoint, // For MinIO/LocalStack compatibility
    });

    this.bucket = storageConfig.aws.bucket;
  }

  async upload(
    buffer: Buffer,
    options: UploadOptions,
  ): Promise<UploadResult> {
    try {
      const storagePath = this.buildStoragePath(options);

      await this.client.send(
        new PutObjectCommand({
          Bucket: this.bucket,
          Key: storagePath,
          Body: buffer,
          ContentType: options.mimeType,
          ContentLength: options.sizeBytes,
          Metadata: {
            tenantId: options.tenantId,
            originalName: options.filename,
            ...options.metadata,
          },
          ServerSideEncryption: 'AES256',
        }),
      );

      logger.info('File uploaded to S3', {
        storagePath,
        tenantId: options.tenantId,
        sizeBytes: options.sizeBytes,
      });

      return {
        storagePath,
        provider: 's3',
      };
    } catch (error) {
      throw new InfrastructureError('S3 upload failed', { error });
    }
  }

  async getSignedUrl(
    storagePath: string,
    options: SignedUrlOptions = {},
  ): Promise<string> {
    try {
      const command = new GetObjectCommand({
        Bucket: this.bucket,
        Key: storagePath,
      });

      return getSignedUrl(this.client, command, {
        expiresIn: options.expiresIn ?? 3600,
      });
    } catch (error) {
      throw new InfrastructureError('Failed to generate signed URL', { error });
    }
  }

  async delete(storagePath: string): Promise<void> {
    try {
      await this.client.send(
        new DeleteObjectCommand({
          Bucket: this.bucket,
          Key: storagePath,
        }),
      );
    } catch (error) {
      throw new InfrastructureError('S3 delete failed', { error });
    }
  }

  async exists(storagePath: string): Promise<boolean> {
    try {
      await this.client.send(
        new HeadObjectCommand({
          Bucket: this.bucket,
          Key: storagePath,
        }),
      );
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