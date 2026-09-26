import { AntivirusValidator, type AntivirusVerdict } from './antivirus.validator';
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
  antivirus: AntivirusVerdict;
}

export interface AttachmentPolicyOptions {
  /** Reject uploads when no antivirus scanner is available (fail closed). */
  requireAntivirusScan?: boolean;
}

export class AttachmentPolicyValidator {
  constructor(
    private readonly options: AttachmentPolicyOptions = {},
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

    const contentProblem = this.fileContentValidator.validate(
      input.content,
      input.mimeType,
    );
    if (contentProblem) {
      reasons.push(contentProblem);
    }

    const antivirus =
      reasons.length === 0
        ? await this.antivirusValidator.scan(input.content, input.filename)
        : 'not-scanned';

    if (antivirus === 'infected') {
      reasons.push('Antivirus scan failed');
    } else if (antivirus === 'not-scanned' && this.options.requireAntivirusScan) {
      reasons.push('Antivirus scanning is required but not available');
    }

    return {
      allowed: reasons.length === 0,
      reasons,
      antivirus,
    };
  }
}
