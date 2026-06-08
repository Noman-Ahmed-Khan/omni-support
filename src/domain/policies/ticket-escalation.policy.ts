import type { TicketEntity } from '../ticket/entities/ticket.entity';

export class TicketEscalationPolicy {
  canEscalate(ticket: TicketEntity): boolean {
    return ticket.isActive() && !ticket.isEscalated;
  }

  shouldAutoEscalateFromSentiment(label: string, confidence: number): boolean {
    return label === 'FRUSTRATED' && confidence >= 0.8;
  }

  shouldAutoEscalateFromUrgency(score: number, threshold: number): boolean {
    return score >= threshold;
  }
}
