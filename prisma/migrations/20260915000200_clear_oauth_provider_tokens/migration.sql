-- Google API tokens were stored in plaintext but are never used after sign-in.
-- The application no longer writes them; remove the values that were stored before.
UPDATE "oauth_accounts"
SET "accessToken" = NULL,
    "refreshToken" = NULL,
    "expiresAt" = NULL
WHERE "accessToken" IS NOT NULL
   OR "refreshToken" IS NOT NULL;
