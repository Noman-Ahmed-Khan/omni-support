import { getStorageConfig } from '../../../config/storage.config';

export class FileSizeValidator {
  constructor(private readonly maxBytes: number = getStorageConfig().maxFileSizeBytes) {}

  isAllowed(sizeBytes: number): boolean {
    return sizeBytes > 0 && sizeBytes <= this.maxBytes;
  }
}
