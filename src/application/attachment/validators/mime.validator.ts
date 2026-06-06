const DEFAULT_ALLOWED_MIME_TYPES = new Set([
  'image/png',
  'image/jpeg',
  'image/webp',
  'application/pdf',
  'text/plain',
  'application/zip',
]);

export class MimeValidator {
  constructor(
    private readonly allowedMimeTypes: Set<string> = DEFAULT_ALLOWED_MIME_TYPES,
  ) {}

  isAllowed(mimeType: string): boolean {
    return this.allowedMimeTypes.has(mimeType.toLowerCase());
  }
}
