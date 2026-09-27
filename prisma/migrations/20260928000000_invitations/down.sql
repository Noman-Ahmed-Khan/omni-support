-- Reverts 20260928000000_invitations. Customer ticket access falls back to no link.
DROP TABLE IF EXISTS "customer_links";
DROP TABLE IF EXISTS "invitations";
