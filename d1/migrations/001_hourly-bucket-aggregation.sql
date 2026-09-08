-- Migration: legacy per-minute rows -> hourly aggregate buckets + service_meta.
--
-- Run on an existing database:
--   npx wrangler d1 execute govstatus-history --remote --file d1/migrations/001_hourly-bucket-aggregation.sql
--
-- Rebuilds status_checks as (service_id, bucket_ms) aggregate rows. Legacy
-- per-bucket data is collapsed to the worst status seen and summed latency;
-- sample_count/sum_response_ms best-effort from whatever rows existed.
-- Drops the per-minute rows (they were never surfaced anyway).

CREATE TABLE IF NOT EXISTS status_checks_new (
  service_id TEXT NOT NULL,
  bucket_ms INTEGER NOT NULL,
  worst_status TEXT NOT NULL,
  sample_count INTEGER NOT NULL DEFAULT 1,
  sum_response_ms INTEGER NOT NULL DEFAULT 0,
  checked_at_ms INTEGER NOT NULL,
  PRIMARY KEY (service_id, bucket_ms)
);

INSERT OR IGNORE INTO status_checks_new (service_id, bucket_ms, worst_status, sample_count, sum_response_ms, checked_at_ms)
SELECT service_id,
       checked_at_ms - (checked_at_ms % 3600000) AS bucket_ms,
       CASE MAX(CASE status WHEN 'down' THEN 2 WHEN 'degraded' THEN 1 ELSE 0 END)
            WHEN 2 THEN 'down'
            WHEN 1 THEN 'degraded'
            ELSE 'operational' END,
       COUNT(*),
       SUM(COALESCE(response_time, 0)),
       MAX(checked_at_ms)
FROM status_checks
GROUP BY service_id, bucket_ms;

DROP TABLE IF EXISTS status_checks;
ALTER TABLE status_checks_new RENAME TO status_checks;

CREATE INDEX IF NOT EXISTS idx_status_checks_time
  ON status_checks (bucket_ms);

CREATE TABLE IF NOT EXISTS service_meta (
  service_id TEXT PRIMARY KEY,
  last_status TEXT NOT NULL,
  last_checked_at_ms INTEGER NOT NULL,
  cert_expires_at_ms INTEGER,
  cert_checked_at_ms INTEGER
);

-- Seed current per-service state from the newest bucket available.
INSERT OR IGNORE INTO service_meta (service_id, last_status, last_checked_at_ms)
SELECT service_id, worst_status, checked_at_ms
FROM status_checks
WHERE (service_id, checked_at_ms) IN (
  SELECT service_id, MAX(checked_at_ms) FROM status_checks GROUP BY service_id
);