import { getStorageConfig } from '../../../config/storage.config';

export class MimeValidator {
  private readonly allowedMimeTypes: Set<string>;

  constructor(allowedMimeTypes: Iterable<string> = getStorageConfig().allowedMimeTypes) {
    this.allowedMimeTypes = new Set(
      Array.from(allowedMimeTypes, (type) => type.toLowerCase()),
    );
  }

  isAllowed(mimeType: string): boolean {
    return this.allowedMimeTypes.has(mimeType.toLowerCase());
  }
}
