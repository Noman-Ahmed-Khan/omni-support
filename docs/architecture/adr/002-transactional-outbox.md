# ADR-002: Transactional outbox for side effects

- Status: Accepted
- Date: 2026-09-26

## Context

Domain events were inserted with separate statements after the aggregate write, and the
outbox relay could deliver an event twice, lose events stuck in `PROCESSING`, and mark events
done although a handler had failed.

## Decision

- Aggregate writes, activity/audit records and outbox inserts run in one transaction
  (`TransactionManager` + `AsyncLocalStorage`; repositories join the active transaction).
  Calls to external systems (BullMQ, cache invalidation) happen after commit.
- `outbox_events` is managed by Prisma Migrate. Workers claim rows with
  `UPDATE ... WHERE id IN (SELECT ... FOR UPDATE SKIP LOCKED)`, hold a lease, and only the lease
  holder can complete or fail a row. Expired leases are reclaimed.
- Handler failures propagate; failed events retry with exponential backoff (5 s doubling, capped
  at 1 h) and move to `DEAD_LETTER` after `max_attempts`.
- Handlers that already succeeded for an event are recorded in Redis and skipped on retry, so a
  retry does not resend emails.
- Outbox backlog and dead letters are exported at `/metrics`.

## Consequences

Delivery is at-least-once per handler, with duplicates only if Redis loses the completion record.
