import crypto from 'crypto';

export interface EncryptionResult {
  iv: string;
  ciphertext: string;
  authTag: string;
}

export class EncryptionService {
  constructor(private readonly secret: string) {}

  encrypt(plaintext: string): EncryptionResult {
    const iv = crypto.randomBytes(12);
    const key = this.deriveKey();
    const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);

    const ciphertext = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
    const authTag = cipher.getAuthTag();

    return {
      iv: iv.toString('base64'),
      ciphertext: ciphertext.toString('base64'),
      authTag: authTag.toString('base64'),
    };
  }

  decrypt(payload: EncryptionResult): string {
    const key = this.deriveKey();
    const decipher = crypto.createDecipheriv(
      'aes-256-gcm',
      key,
      Buffer.from(payload.iv, 'base64'),
    );

    decipher.setAuthTag(Buffer.from(payload.authTag, 'base64'));

    const plaintext = Buffer.concat([
      decipher.update(Buffer.from(payload.ciphertext, 'base64')),
      decipher.final(),
    ]);

    return plaintext.toString('utf8');
  }

  private deriveKey(): Buffer {
    return crypto.createHash('sha256').update(this.secret).digest();
  }
}
