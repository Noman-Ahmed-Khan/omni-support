/** Magic-byte prefixes (hex) per MIME type. */
const SIGNATURES: Record<string, string[]> = {
  'image/png': ['89504e470d0a1a0a'],
  'image/jpeg': ['ffd8ff'],
  'image/gif': ['474946383761', '474946383961'],
  'application/pdf': ['25504446'],
  // Legacy Office documents use the OLE compound file format.
  'application/msword': ['d0cf11e0a1b11ae1'],
  'application/vnd.ms-excel': ['d0cf11e0a1b11ae1'],
  // Office Open XML documents are zip containers.
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': ['504b0304'],
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': ['504b0304'],
};

/** Executables are never accepted, whatever type the client declared. */
const EXECUTABLE_SIGNATURES = ['4d5a', '7f454c46', 'cafebabe', 'feedface', 'cffaedfe'];

const TEXT_TYPES = new Set(['text/plain', 'text/csv']);
const TEXT_SNIFF_BYTES = 4096;

/**
 * Checks that file content matches the MIME type the client declared, so a renamed
 * executable or archive cannot be uploaded as an image or document.
 */
export class FileContentValidator {
  /** Returns a rejection reason, or null when the content is acceptable. */
  validate(buffer: Buffer, mimeType: string): string | null {
    const header = buffer.subarray(0, 16).toString('hex');
    const type = mimeType.toLowerCase();

    if (EXECUTABLE_SIGNATURES.some((signature) => header.startsWith(signature))) {
      return 'Executable files are not allowed';
    }

    if (TEXT_TYPES.has(type)) {
      // Binary data (NUL bytes) is not plain text.
      return buffer.subarray(0, TEXT_SNIFF_BYTES).includes(0)
        ? 'File content does not match its declared type'
        : null;
    }

    if (type === 'image/webp') {
      const isWebp =
        buffer.subarray(0, 4).toString('ascii') === 'RIFF' &&
        buffer.subarray(8, 12).toString('ascii') === 'WEBP';
      return isWebp ? null : 'File content does not match its declared type';
    }

    const signatures = SIGNATURES[type];
    if (!signatures) {
      return 'Unsupported file type';
    }

    return signatures.some((signature) => header.startsWith(signature))
      ? null
      : 'File content does not match its declared type';
  }
}
