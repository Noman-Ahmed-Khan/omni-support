import { AntivirusValidator } from './antivirus.validator';
import { FileContentValidator } from './file-content.validator';
import { FileSizeValidator } from './file-size.validator';
import { MimeValidator } from './mime.validator';

export interface AttachmentPolicyInput {
  filename: string;
  mimeType: string;
  sizeBytes: number;
  content: Buffer;
}

export interface AttachmentPolicyResult {
  allowed: boolean;
  reasons: string[];
}

export class AttachmentPolicyValidator {
  constructor(
    private readonly mimeValidator = new MimeValidator(),
    private readonly fileSizeValidator = new FileSizeValidator(),
    private readonly fileContentValidator = new FileContentValidator(),
    private readonly antivirusValidator = new AntivirusValidator(),
  ) {}

  async validate(input: AttachmentPolicyInput): Promise<AttachmentPolicyResult> {
    const reasons: string[] = [];

    if (!this.mimeValidator.isAllowed(input.mimeType)) {
      reasons.push('Unsupported MIME type');
    }

    if (!this.fileSizeValidator.isAllowed(input.sizeBytes)) {
      reasons.push('File exceeds the allowed size');
    }

    if (this.fileContentValidator.hasMaliciousContent(input.content)) {
      reasons.push('File content is not allowed');
    }

    if (!(await this.antivirusValidator.isClean(input.content, input.filename))) {
      reasons.push('Antivirus scan failed');
    }

    return {
      allowed: reasons.length === 0,
      reasons,
    };
  }
}
