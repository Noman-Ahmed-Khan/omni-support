-- The outbox table used to be created at runtime by OutboxRepository.ensureSchema().
-- This migration brings it under Prisma Migrate. It is idempotent so databases that
-- already contain the runtime-created table can apply it safely.

CREATE TABLE IF NOT EXISTS "outbox_events" (
    "id" UUID NOT NULL,
    "tenant_id" TEXT,
    "aggregate_type" TEXT,
    "aggregate_id" TEXT,
    "event_type" TEXT NOT NULL,
    "event_id" TEXT NOT NULL,
    "occurred_at" TIMESTAMPTZ(6) NOT NULL,
    "payload" JSONB NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "max_attempts" INTEGER NOT NULL DEFAULT 5,
    "available_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "locked_at" TIMESTAMPTZ(6),
    "locked_by" TEXT,
    "processed_at" TIMESTAMPTZ(6),
    "failed_at" TIMESTAMPTZ(6),
    "dead_letter_reason" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "outbox_events_pkey" PRIMARY KEY ("id")
);

-- Columns added for lease-based claiming (absent from the runtime-created table).
ALTER TABLE "outbox_events" ADD COLUMN IF NOT EXISTS "locked_at" TIMESTAMPTZ(6);
ALTER TABLE "outbox_events" ADD COLUMN IF NOT EXISTS "locked_by" TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS "outbox_events_event_id_key" ON "outbox_events"("event_id");
CREATE INDEX IF NOT EXISTS "outbox_events_status_available_at_idx" ON "outbox_events"("status", "available_at");
CREATE INDEX IF NOT EXISTS "outbox_events_tenant_status_idx" ON "outbox_events"("tenant_id", "status");
