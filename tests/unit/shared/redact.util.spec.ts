import {
  REDACTED,
  redactSecrets,
  redactSensitive,
} from '../../../src/shared/utils/redact.util';

describe('redaction', () => {
  const payload = {
    ticketId: 'ticket-1',
    eventType: 'ticket.created',
    From: 'whatsapp:+15550100000',
    Body: 'my card number is 4242',
    customer: { fullName: 'Ada', email: 'ada@example.com', id: 'customer-1' },
    webhookSecret: 'abc',
    authorId: 'user-1',
    items: [{ phone: '+1' }],
  };

  it('removes personal data and secrets but keeps identifiers', () => {
    expect(redactSensitive(payload)).toEqual({
      ticketId: 'ticket-1',
      eventType: 'ticket.created',
      From: REDACTED,
      Body: REDACTED,
      customer: { fullName: REDACTED, email: REDACTED, id: 'customer-1' },
      webhookSecret: REDACTED,
      authorId: 'user-1',
      items: [{ phone: REDACTED }],
    });
  });

  it('can remove only secrets', () => {
    const result = redactSecrets(payload) as typeof payload;
    expect(result.webhookSecret).toBe(REDACTED);
    expect(result.customer.email).toBe('ada@example.com');
  });

  it('does not modify the input', () => {
    redactSensitive(payload);
    expect(payload.customer.email).toBe('ada@example.com');
  });
});
