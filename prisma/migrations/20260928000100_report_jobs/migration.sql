CREATE TABLE "report_jobs" (
  "id" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "requestedById" TEXT NOT NULL,
  "kind" TEXT NOT NULL,
  "subject" TEXT NOT NULL,
  "format" TEXT NOT NULL,
  "filters" JSONB NOT NULL DEFAULT '{}',
  "status" TEXT NOT NULL DEFAULT 'PENDING',
  "startedAt" TIMESTAMP(3),
  "storagePath" TEXT,
  "rowCount" INTEGER,
  "error" TEXT,
  "expiresAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "report_jobs_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "report_jobs_tenantId_createdAt_idx" ON "report_jobs"("tenantId", "createdAt");
CREATE INDEX "report_jobs_status_createdAt_idx" ON "report_jobs"("status", "createdAt");
ALTER TABLE "report_jobs" ADD CONSTRAINT "report_jobs_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "report_jobs" ADD CONSTRAINT "report_jobs_requestedById_fkey" FOREIGN KEY ("requestedById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
