-- 001_outcome_counters
-- Adds per-sample outcome counters to status_checks (migration for existing DBs;
-- fresh installs already include these in d1/schema.sql).
--
-- Run once on the live database:
--   npx wrangler d1 execute govstatus-history --remote --file=d1/migrations/001_outcome_counters.sql
--
-- SQLite has no `ADD COLUMN IF NOT EXISTS`, so this is not idempotent — run it
-- exactly once. The probes degrade gracefully if the columns are missing.

ALTER TABLE status_checks ADD COLUMN outcome_ok INTEGER NOT NULL DEFAULT 0;
ALTER TABLE status_checks ADD COLUMN outcome_slow INTEGER NOT NULL DEFAULT 0;
ALTER TABLE status_checks ADD COLUMN outcome_blocked INTEGER NOT NULL DEFAULT 0;
ALTER TABLE status_checks ADD COLUMN outcome_rate_limited INTEGER NOT NULL DEFAULT 0;
ALTER TABLE status_checks ADD COLUMN outcome_http5xx INTEGER NOT NULL DEFAULT 0;
ALTER TABLE status_checks ADD COLUMN outcome_network INTEGER NOT NULL DEFAULT 0;