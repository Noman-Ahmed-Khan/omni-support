-- Reverts 20260928000300_platform_operations. Replayed rows stay as ordinary events.
DROP TABLE IF EXISTS "operational_settings";
DROP TABLE IF EXISTS "operational_interventions";
DROP INDEX IF EXISTS "webhook_events_active_replay_key";
DROP INDEX IF EXISTS "webhook_events_status_createdAt_idx";
ALTER TABLE "webhook_events" DROP COLUMN IF EXISTS "replayOfId";
ALTER TABLE "webhook_events" DROP COLUMN IF EXISTS "lockedBy";
ALTER TABLE "webhook_events" DROP COLUMN IF EXISTS "lockedAt";
ALTER TABLE "webhook_events" DROP COLUMN IF EXISTS "status";
DROP INDEX IF EXISTS "outbox_events_active_replay_key";
ALTER TABLE "outbox_events" DROP COLUMN IF EXISTS "replay_of_id";
-- The 'VIEW' AuditAction value stays: Postgres cannot drop enum values and audit rows use it.
