-- Migration: add public per-service email subscriptions + extend retention.
--
-- Run on an existing database:
--   npx wrangler d1 execute govstatus-history --remote --file d1/migrations/002_subscribers.sql

CREATE TABLE IF NOT EXISTS subscribers (
  email TEXT NOT NULL,
  service_id TEXT NOT NULL,
  created_at_ms INTEGER NOT NULL,
  PRIMARY KEY (email, service_id)
);
CREATE INDEX IF NOT EXISTS idx_subscribers_service
  ON subscribers (service_id);

-- Retention is now 90 days (was 7). No data move required — the probe simply
-- stops pruning rows older than 90d from here on. If you want to keep old rows
-- that were already pruned, nothing to do; new history accumulates going forward.
