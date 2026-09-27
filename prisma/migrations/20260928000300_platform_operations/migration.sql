-- Operator controls for webhook and outbox records.

-- Platform-admin record views are audited.
ALTER TYPE "AuditAction" ADD VALUE IF NOT EXISTS 'VIEW';

ALTER TABLE "outbox_events" ADD COLUMN "replay_of_id" UUID;
-- At most one unfinished replay per original event.
CREATE UNIQUE INDEX "outbox_events_active_replay_key" ON "outbox_events"("replay_of_id")
  WHERE "replay_of_id" IS NOT NULL AND "status" IN ('PENDING', 'PROCESSING', 'FAILED');

ALTER TABLE "webhook_events" ADD COLUMN "status" TEXT NOT NULL DEFAULT 'RECEIVED';
ALTER TABLE "webhook_events" ADD COLUMN "lockedAt" TIMESTAMP(3);
ALTER TABLE "webhook_events" ADD COLUMN "lockedBy" TEXT;
ALTER TABLE "webhook_events" ADD COLUMN "replayOfId" TEXT;
UPDATE "webhook_events" SET "status" = CASE
  WHEN "processed" THEN 'PROCESSED'
  WHEN "error" IS NOT NULL AND "retryCount" > 0 THEN 'FAILED'
  WHEN "error" IS NOT NULL THEN 'SKIPPED'
  ELSE 'RECEIVED'
END;
CREATE INDEX "webhook_events_status_createdAt_idx" ON "webhook_events"("status", "createdAt");
CREATE UNIQUE INDEX "webhook_events_active_replay_key" ON "webhook_events"("replayOfId")
  WHERE "replayOfId" IS NOT NULL AND "status" IN ('RECEIVED', 'PROCESSING', 'FAILED');

CREATE TABLE "operational_interventions" (
  "id" TEXT NOT NULL,
  "targetType" TEXT NOT NULL,
  "targetId" TEXT,
  "action" TEXT NOT NULL,
  "reason" TEXT NOT NULL,
  "actorId" TEXT NOT NULL,
  "resultId" TEXT,
  "outcome" TEXT NOT NULL,
  "error" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "operational_interventions_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "operational_interventions_targetType_targetId_idx" ON "operational_interventions"("targetType", "targetId");
CREATE INDEX "operational_interventions_createdAt_idx" ON "operational_interventions"("createdAt");

CREATE TABLE "operational_settings" (
  "key" TEXT NOT NULL,
  "value" JSONB NOT NULL,
  "updatedById" TEXT,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "operational_settings_pkey" PRIMARY KEY ("key")
);
