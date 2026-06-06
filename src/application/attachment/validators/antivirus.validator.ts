export interface AntivirusScanResult {
  clean: boolean;
  signature?: string;
}

export interface AntivirusScanner {
  scan(buffer: Buffer, filename: string): Promise<AntivirusScanResult>;
}

export class AntivirusValidator {
  constructor(private readonly scanner?: AntivirusScanner) {}

  async isClean(buffer: Buffer, filename: string): Promise<boolean> {
    if (!this.scanner) {
      return true;
    }

    const result = await this.scanner.scan(buffer, filename);
    return result.clean;
  }
}
