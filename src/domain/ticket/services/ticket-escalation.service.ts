import { TicketEscalationPolicy } from '../../policies/ticket-escalation.policy';
import type { TicketEntity } from '../entities/ticket.entity';

export interface EscalationSignal {
  sentimentLabel?: string;
  sentimentConfidence?: number;
  urgencyScore?: number;
  urgencyThreshold?: number;
}

export interface EscalationDecision {
  canEscalate: boolean;
  shouldEscalate: boolean;
  reasons: string[];
}

export class TicketEscalationService {
  private readonly policy = new TicketEscalationPolicy();

  canEscalate(ticket: TicketEntity): boolean {
    return this.policy.canEscalate(ticket);
  }

  shouldEscalateFromSentiment(label: string, confidence: number): boolean {
    return this.policy.shouldAutoEscalateFromSentiment(label, confidence);
  }

  shouldEscalateFromUrgency(score: number, threshold: number): boolean {
    return this.policy.shouldAutoEscalateFromUrgency(score, threshold);
  }

  assess(ticket: TicketEntity, signal: EscalationSignal = {}): EscalationDecision {
    const canEscalate = this.canEscalate(ticket);

    if (!canEscalate) {
      return {
        canEscalate: false,
        shouldEscalate: false,
        reasons: ['Ticket cannot be escalated in its current state'],
      };
    }

    const reasons: string[] = [];

    if (
      signal.sentimentLabel &&
      signal.sentimentConfidence !== undefined &&
      this.shouldEscalateFromSentiment(signal.sentimentLabel, signal.sentimentConfidence)
    ) {
      reasons.push(
        `Frustrated sentiment detected with ${Math.round(
          signal.sentimentConfidence * 100,
        )}% confidence`,
      );
    }

    if (
      signal.urgencyScore !== undefined &&
      this.shouldEscalateFromUrgency(signal.urgencyScore, signal.urgencyThreshold ?? 75)
    ) {
      reasons.push(`Urgency score reached ${signal.urgencyScore}/100`);
    }

    return {
      canEscalate: true,
      shouldEscalate: reasons.length > 0,
      reasons,
    };
  }
}
