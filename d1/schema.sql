CREATE TABLE IF NOT EXISTS status_checks (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  service_id TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('operational', 'degraded', 'down')),
  response_time INTEGER,
  http_status INTEGER,
  checked_at_ms INTEGER NOT NULL,
  checked_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_status_checks_service_time
  ON status_checks (service_id, checked_at_ms);

CREATE INDEX IF NOT EXISTS idx_status_checks_time
  ON status_checks (checked_at_ms);
