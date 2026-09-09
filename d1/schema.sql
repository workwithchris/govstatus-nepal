-- GovStatus D1 schema (fresh installs).
--
-- status_checks: one row per service per hourly bucket holding *aggregates*
-- over all probe samples in that hour (worst observed status + average
-- latency). This keeps the table small (~2.2k rows/day for 92 services) and
-- makes hourly bars honest: a bucket shows "down" if any sample in that hour
-- was down, not just the last sample.
--
-- service_meta: current per-service state used for transition alerts and as
-- the fast "last known" snapshot source. Also caches TLS certificate expiry.

CREATE TABLE IF NOT EXISTS status_checks (
  service_id TEXT NOT NULL,
  bucket_ms INTEGER NOT NULL,          -- start of the hour bucket (UTC epoch ms)
  worst_status TEXT NOT NULL CHECK (worst_status IN ('operational', 'degraded', 'down')),
  sample_count INTEGER NOT NULL DEFAULT 0,
  sum_response_ms INTEGER NOT NULL DEFAULT 0,
  checked_at_ms INTEGER NOT NULL,      -- timestamp of the latest sample in the bucket
  -- Per-sample outcome counters for the bucket (one of these increments per
  -- probe sample). Lets the history API tell real outages (http5xx/network)
  -- apart from firewall blocks (blocked=403) and rate limiting (rate_limited).
  outcome_ok INTEGER NOT NULL DEFAULT 0,
  outcome_slow INTEGER NOT NULL DEFAULT 0,
  outcome_blocked INTEGER NOT NULL DEFAULT 0,
  outcome_rate_limited INTEGER NOT NULL DEFAULT 0,
  outcome_http5xx INTEGER NOT NULL DEFAULT 0,
  outcome_network INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (service_id, bucket_ms)
);

CREATE INDEX IF NOT EXISTS idx_status_checks_time
  ON status_checks (bucket_ms);

CREATE TABLE IF NOT EXISTS service_meta (
  service_id TEXT PRIMARY KEY,
  last_status TEXT NOT NULL CHECK (last_status IN ('operational', 'degraded', 'down')),
  last_checked_at_ms INTEGER NOT NULL,
  cert_expires_at_ms INTEGER,          -- epoch ms of TLS cert expiry (null = not probed)
  cert_checked_at_ms INTEGER           -- when the cert was last probed
);

-- Public per-service email subscriptions for status-change notifications.
CREATE TABLE IF NOT EXISTS subscribers (
  email TEXT NOT NULL,
  service_id TEXT NOT NULL,
  created_at_ms INTEGER NOT NULL,
  PRIMARY KEY (email, service_id)
);
CREATE INDEX IF NOT EXISTS idx_subscribers_service
  ON subscribers (service_id);