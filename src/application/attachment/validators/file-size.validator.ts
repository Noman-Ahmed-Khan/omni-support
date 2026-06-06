export class FileSizeValidator {
  constructor(private readonly maxBytes: number = 10 * 1024 * 1024) {}

  isAllowed(sizeBytes: number): boolean {
    return sizeBytes > 0 && sizeBytes <= this.maxBytes;
  }
}
