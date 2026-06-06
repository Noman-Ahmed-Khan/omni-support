export class FileContentValidator {
  hasMaliciousContent(buffer: Buffer): boolean {
    const signature = buffer.subarray(0, 8).toString('hex');
    // Reject obvious archive or executable signatures in this lightweight scan.
    return ['4d5a', '7f454c46', '504b0304'].some((needle) =>
      signature.startsWith(needle),
    );
  }
}
