export interface AntivirusScanResult {
  clean: boolean;
  signature?: string;
}

export interface AntivirusScanner {
  scan(buffer: Buffer, filename: string): Promise<AntivirusScanResult>;
}

export type AntivirusVerdict = 'clean' | 'infected' | 'not-scanned';

export class AntivirusValidator {
  constructor(private readonly scanner?: AntivirusScanner) {}

  /** Without a configured scanner files are reported as not scanned, never as clean. */
  async scan(buffer: Buffer, filename: string): Promise<AntivirusVerdict> {
    if (!this.scanner) {
      return 'not-scanned';
    }

    const result = await this.scanner.scan(buffer, filename);
    return result.clean ? 'clean' : 'infected';
  }
}
