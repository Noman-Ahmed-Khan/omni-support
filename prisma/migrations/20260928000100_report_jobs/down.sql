-- Reverts 20260928000100_report_jobs. Stored report files expire on their own lifetime.
DROP TABLE IF EXISTS "report_jobs";
