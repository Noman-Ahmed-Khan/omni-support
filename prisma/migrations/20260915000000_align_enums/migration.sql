-- Add enum values that application code already writes.
-- ADD VALUE is additive and safe to run on a live database.
ALTER TYPE "ActivityEventType" ADD VALUE IF NOT EXISTS 'TICKET_UPDATED';
ALTER TYPE "ActivityEventType" ADD VALUE IF NOT EXISTS 'TICKET_CATEGORY_CHANGED';
ALTER TYPE "ActivityEventType" ADD VALUE IF NOT EXISTS 'COMMENT_EDITED';
ALTER TYPE "ActivityEventType" ADD VALUE IF NOT EXISTS 'COMMENT_DELETED';

ALTER TYPE "AuditAction" ADD VALUE IF NOT EXISTS 'ROLE_CHANGE';
