CREATE TABLE "invitations" (
  "id" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "email" TEXT NOT NULL,
  "role" "UserRole" NOT NULL,
  "customerId" TEXT,
  "tokenHash" TEXT NOT NULL,
  "invitedById" TEXT NOT NULL,
  "expiresAt" TIMESTAMP(3) NOT NULL,
  "acceptedAt" TIMESTAMP(3),
  "revokedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "invitations_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "invitations_tokenHash_key" ON "invitations"("tokenHash");
CREATE INDEX "invitations_tenantId_email_idx" ON "invitations"("tenantId", "email");
CREATE INDEX "invitations_expiresAt_idx" ON "invitations"("expiresAt");
ALTER TABLE "invitations" ADD CONSTRAINT "invitations_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "invitations" ADD CONSTRAINT "invitations_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "customers"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "invitations" ADD CONSTRAINT "invitations_invitedById_fkey" FOREIGN KEY ("invitedById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE TABLE "customer_links" (
  "userId" TEXT NOT NULL,
  "customerId" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "customer_links_pkey" PRIMARY KEY ("userId")
);

CREATE UNIQUE INDEX "customer_links_customerId_key" ON "customer_links"("customerId");
CREATE INDEX "customer_links_tenantId_idx" ON "customer_links"("tenantId");
ALTER TABLE "customer_links" ADD CONSTRAINT "customer_links_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "customer_links" ADD CONSTRAINT "customer_links_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "customers"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "customer_links" ADD CONSTRAINT "customer_links_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Existing verified customer accounts keep their current ticket access during rollout.
INSERT INTO "customer_links" ("userId", "customerId", "tenantId")
SELECT u."id", c."id", u."tenantId"
FROM "users" u
JOIN "customers" c ON c."tenantId" = u."tenantId" AND lower(c."email") = lower(u."email")
WHERE u."role" = 'CUSTOMER' AND u."emailVerifiedAt" IS NOT NULL
ON CONFLICT DO NOTHING;
