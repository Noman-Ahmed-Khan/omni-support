export type RiskLabel = 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';

export class RiskScore {
  private constructor(
    private readonly score: number,
    private readonly label: RiskLabel,
  ) {}

  static create(score: number, label?: string): RiskScore {
    if (!Number.isFinite(score)) {
      throw new Error('Risk score must be a finite number');
    }

    const normalizedScore = Math.max(0, Math.min(100, Math.round(score)));
    const normalizedLabel = RiskScore.normalizeLabel(
      label ?? RiskScore.labelForScore(normalizedScore),
    );

    return new RiskScore(normalizedScore, normalizedLabel);
  }

  static labelForScore(score: number): RiskLabel {
    if (score >= 90) return 'CRITICAL';
    if (score >= 70) return 'HIGH';
    if (score >= 40) return 'MEDIUM';
    return 'LOW';
  }

  private static normalizeLabel(label: string): RiskLabel {
    const normalized = label.toUpperCase();
    if (!['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'].includes(normalized)) {
      throw new Error(`Invalid risk label: ${label}`);
    }
    return normalized as RiskLabel;
  }

  get value(): number {
    return this.score;
  }

  get riskLabel(): RiskLabel {
    return this.label;
  }
}
