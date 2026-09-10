import crypto from "node:crypto";
import http from "node:http";
import https from "node:https";
import { Agent, fetch as undiciFetch } from "undici";

import seedData from "@/data/seed-services.json";
import { d1Batch, d1Config, d1Query, isD1Available } from "@/lib/d1";
import {
  OUTCOME_COLUMNS,
  OUTCOME_ORDER,
  outcomeFor,
} from "@/features/services-monitor/server/outcomes";
import {
  healthResponseSchema,
  seedServiceSchema,
  type HealthResponse,
  type HealthSource,
  type HealthStatus,
  type ProbeProgress,
  type SeedService,
  type ServiceHealth,
  type UptimeSlot,
} from "@/features/services-monitor/types";

// Long timeout: several .np municipal portals take 20-40s to respond (bharatpur
// ~19s, biratnagar ~28s, pokhara ~38s). An 8s abort marked them "down" even
// though they work. Overridable via PROBE_TIMEOUT_MS.
const PROBE_TIMEOUT_MS = Math.max(1000, Number(process.env.PROBE_TIMEOUT_MS) || 45000);
const SLOW_THRESHOLD_MS = 3500;
const HISTORY_SLOTS = 24;
const HOUR_MS = 60 * 60 * 1000;
const RETENTION_DAYS = 90;
/**
 * How often D1 is written. Probes still run every cycle (live status is
 * served from the module cache), but persisting history every cycle would
 * blow past D1's free-tier write limit (~266k rows/day vs 100k). Batching to
 * every 5 minutes lands at ~53k writes/day. History reads are gated the same
 * way, cutting D1 reads ~5x too.
 *
 * Overridable via PERSIST_INTERVAL_MINUTES (min 1). Example: 10 → ~27k
 * writes/day, safer if the Cloudflare account hosts other D1 databases.
 */
const persistIntervalMinutes = Number(process.env.PERSIST_INTERVAL_MINUTES);
const PERSIST_INTERVAL_MS =
  (persistIntervalMinutes >= 1 && Number.isFinite(persistIntervalMinutes)
    ? persistIntervalMinutes
    : 5) * 60 * 1000;

/**
 * How often the serve-only worker re-reads the D1 snapshot.
 */
const SNAPSHOT_TTL_MS = 5 * 60 * 1000;
/** How often TLS certs are re-probed (not every probe cycle). */
const CERT_CHECK_INTERVAL_MS = 6 * 60 * 60 * 1000;
// A self-describing bot UA makes .np WAFs drop or stall the probe (e.g.
// kathmandu.gov.np resets bot connections, nea.org.np serves different
// redirects). A browser-like UA gets the same responses a visitor does.
const USER_AGENT =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36";

/**
 * Node/undici strictly validates certificate chains; browsers additionally
 * chase AIA intermediates and tolerate chain gaps, so several .np gov portals
 * that load fine in a browser get rejected here. Retry once with relaxed TLS
 * so certificate quirks don't read as outages. Cloudflare Workers (via
 * OpenNext / nodejs_compat) can't disable cert validation, so that path just
 * skips the retry.
 */
const IS_NODE =
  typeof process !== "undefined" && process.release?.name === "node";

/**
 * Serve-only mode. Probing from a Cloudflare datacenter (foreign IP, strict
 * TLS) marks many healthy .np portals as down, so the Worker never probes or
 * writes D1 — it serves the last-known snapshot written by the Nepal-vantage
 * probe (`probe/nepal-probe.mjs`). Auto-enabled on non-Node runtimes
 * (workerd); can be forced with SERVE_ONLY=true for Node deployments too.
 */
export const SERVE_ONLY =
  process.env.SERVE_ONLY === "true" || !IS_NODE;

/** Logs the first probe failure once (diagnostic). */
let probeErrorLogged = false;

const SSL_OP_ALLOW_UNSAFE_LEGACY_RENEGOTIATION =
  crypto.constants?.SSL_OP_ALLOW_UNSAFE_LEGACY_RENEGOTIATION ?? 0x00040000;

// Explicit connect.timeout, headersTimeout, and bodyTimeout are critical:
// Undici connector defaults connect.timeout to 10s, which silently aborts
// slow .np portals (e.g. municipal servers taking 15-30s) despite PROBE_TIMEOUT_MS.
// allowH2: false is required because several .np WAFs/Nginx proxies reset on h2.
let primaryAgent: Agent | null = null;
function getPrimaryAgent(): Agent | null {
  if (!IS_NODE || primaryAgent) return primaryAgent;
  try {
    primaryAgent = new Agent({
      allowH2: false,
      connect: {
        timeout: PROBE_TIMEOUT_MS,
        secureOptions: SSL_OP_ALLOW_UNSAFE_LEGACY_RENEGOTIATION,
      },
      headersTimeout: PROBE_TIMEOUT_MS,
      bodyTimeout: PROBE_TIMEOUT_MS,
    });
  } catch {
    primaryAgent = null;
  }
  return primaryAgent;
}

let relaxedTlsAgent: Agent | null = null;
function getRelaxedTlsAgent(): Agent | null {
  if (!IS_NODE || relaxedTlsAgent) return relaxedTlsAgent;
  try {
    relaxedTlsAgent = new Agent({
      allowH2: false,
      connect: {
        timeout: PROBE_TIMEOUT_MS,
        rejectUnauthorized: false,
        secureOptions: SSL_OP_ALLOW_UNSAFE_LEGACY_RENEGOTIATION,
      },
      headersTimeout: PROBE_TIMEOUT_MS,
      bodyTimeout: PROBE_TIMEOUT_MS,
    });
  } catch {
    relaxedTlsAgent = null;
  }
  return relaxedTlsAgent;
}

function probeRequest(url: string, dispatcher?: Agent) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), PROBE_TIMEOUT_MS);
  const base = {
    headers: {
      "User-Agent": USER_AGENT,
      Accept: "text/html,application/xhtml+xml,*/*;q=0.8",
    },
    redirect: "follow" as const,
    signal: controller.signal,
  };
  const agent = dispatcher ?? (IS_NODE ? getPrimaryAgent() ?? undefined : undefined);
  const promise = agent ? undiciFetch(url, { ...base, dispatcher: agent }) : fetch(url, base);
  return promise.finally(() => clearTimeout(timer));
}

/**
 * Fallback probe using Node's native http/https modules. Immune to ALPN-rejecting
 * legacy servers (e.g. Oracle WebLogic on OPCR or older Apache) where undici's
 * forced ALPN extension causes ECONNRESET.
 */
function nativeProbeFallback(urlString: string): Promise<number | null> {
  if (!IS_NODE) return Promise.resolve(null);
  return new Promise((resolve) => {
    try {
      const u = new URL(urlString);
      const mod = u.protocol === "http:" ? http : https;
      const req = mod.request(
        u,
        {
          method: "GET",
          headers: {
            "User-Agent": USER_AGENT,
            Accept: "text/html,application/xhtml+xml,*/*;q=0.8",
          },
          rejectUnauthorized: false,
          secureOptions: SSL_OP_ALLOW_UNSAFE_LEGACY_RENEGOTIATION,
          timeout: PROBE_TIMEOUT_MS,
        },
        (res) => {
          res.resume();
          resolve(res.statusCode ?? 200);
        }
      );
      req.on("error", () => resolve(null));
      req.on("timeout", () => {
        req.destroy();
        resolve(null);
      });
      req.end();
    } catch {
      resolve(null);
    }
  });
}

/**
 * Release the response socket: undici keeps the connection in-flight until
 * the body is drained/cancelled. Probing 145 services every cycle would
 * otherwise leak sockets and defeat keep-alive reuse. We only need the
 * status line, so cancel the body immediately.
 */
async function drainBody(res: Awaited<ReturnType<typeof probeRequest>>): Promise<void> {
  try {
    if (res.body) await res.body.cancel();
  } catch {
    /* already aborted/closed */
  }
}

export interface ProbeResult {
  status: HealthStatus;
  responseTime: number | null;
  httpStatus: number | null;
}

/**
 * Classify a single probe outcome. Pure decision table — the piece that
 * decides what the dashboard shows:
 *  - operational: 200–399 and responded under `slowMs`
 *  - degraded:    responded but slow (>`slowMs`), 403 (WAF block), or 429 (rate limit)
 *  - down:        5xx, other 4xx, connection refused, or timeout (httpStatus null)
 */
export function classifyProbe(
  httpStatus: number | null,
  responseTime: number,
  slowMs: number = SLOW_THRESHOLD_MS
): ProbeResult {
  if (httpStatus !== null && httpStatus >= 200 && httpStatus < 400) {
    return {
      status: responseTime > slowMs ? "degraded" : "operational",
      responseTime,
      httpStatus,
    };
  }
  if (httpStatus === 403 || httpStatus === 429) {
    return { status: "degraded", responseTime, httpStatus };
  }
  return {
    status: "down",
    responseTime: httpStatus !== null ? responseTime : null,
    httpStatus,
  };
}

/**
 * Single-probe attempt with the 3-tier resilient fallback:
 *  1. Primary undici probe (HTTP/1.1, browser UA, legacy TLS renegotiation)
 *  2. Relaxed-TLS undici retry (tolerates self-signed / missing CA chain gaps)
 *  3. Native node:https fallback (no ALPN extension, covers WebLogic/CentOS servers)
 */
async function probeOnce(url: string): Promise<ProbeResult> {
  const startedAt = performance.now();

  try {
    let res: Awaited<ReturnType<typeof probeRequest>> | undefined;
    let httpStatus: number | null = null;
    try {
      res = await probeRequest(url);
      httpStatus = res.status;
    } catch {
      const relaxed = getRelaxedTlsAgent();
      if (relaxed) {
        try {
          res = await probeRequest(url, relaxed);
          httpStatus = res.status;
        } catch {
          // Native fallback for legacy servers that reject ALPN
          httpStatus = await nativeProbeFallback(url);
        }
      } else {
        httpStatus = await nativeProbeFallback(url);
      }
    }
    if (res) await drainBody(res);
    const responseTime = Math.round(performance.now() - startedAt);

    return classifyProbe(httpStatus, responseTime);
  } catch (err) {
    if (!probeErrorLogged) {
      probeErrorLogged = true;
      console.error(
        "[govstatus] first probe error:",
        err,
        "| isNode:",
        IS_NODE
      );
    }
    return { status: "down", responseTime: null, httpStatus: null };
  }
}

/** Short delay before confirming a "down" reading, to absorb transient blips. */
const CONFIRM_DELAY_MS = 2500;

/**
 * Probes `url` (plus an optional deep `checkUrl`) and returns the worse
 * result. A result that looks "down" is re-probed once after a short delay and
 * only reported down if it fails again — cuts single-fetch false alarms on
 * flaky .np infra. For deep checks the worse of (homepage, checkUrl) wins.
 *
 * `probeFn`/`confirmDelayMs` are injectable for tests; production uses the
 * real network probe and the standard confirmation delay.
 */
export async function probeService(
  url: string,
  checkUrl?: string,
  probeFn: (u: string) => Promise<ProbeResult> = probeOnce,
  confirmDelayMs: number = CONFIRM_DELAY_MS
): Promise<ProbeResult> {
  const first = await probeFn(url);
  let result = first;

  // Deep check: also hit the critical endpoint and keep the worse outcome.
  if (checkUrl && checkUrl !== url) {
    const deep = await probeFn(checkUrl);
    result = worse(result, deep);
  }

  // Confirm a down reading before reporting it. Re-checks the same endpoints
  // that produced the down (homepage + optional checkUrl, worse wins) so a
  // transient blip on either endpoint doesn't report "down" — but a genuinely
  // broken deep-check endpoint still does.
  if (result.status === "down") {
    await new Promise((resolve) => setTimeout(resolve, confirmDelayMs));
    let confirm = await probeFn(url);
    if (checkUrl && checkUrl !== url) {
      const deepConfirm = await probeFn(checkUrl);
      confirm = worse(confirm, deepConfirm);
    }
    if (confirm.status !== "down") result = confirm;
  }

  return result;
}

/** The worse of two probe results: down > degraded > operational. */
export function worse(a: ProbeResult, b: ProbeResult): ProbeResult {
  const rank = { down: 2, degraded: 1, operational: 0 } as const;
  if (rank[b.status] > rank[a.status]) return b;
  if (rank[b.status] === rank[a.status]) {
    // Prefer the result with an httpStatus (more diagnostic info).
    return a.httpStatus != null ? a : b;
  }
  return a;
}

/* -------------------------- Adaptive probe cadence ------------------------- */

/**
 * Anti-blocking pacing for government WAFs. Two problems it solves:
 *
 *  1. **Lockstep bursts** — probing all services every cycle at :00/:05/:10
 *     from one IP looks like a crawler. Each service gets a deterministic
 *     `phase` (0..7) so, once backed off, services are spread across cycles
 *     instead of re-pinging together.
 *  2. **No relief when throttled** — a portal that 429s/403s you was hit
 *     again 5 minutes later. After `CADENCE_STRESS_THRESHOLD` consecutive
 *     stressful outcomes the service's `shift` rises (probe every 2nd, 4th,
 *     8th cycle); it drops back down after sustained healthy responses.
 *
 * A "skipped" service keeps its last persisted status from D1 — nothing is
 * fabricated, the dashboard just shows it with an older `lastChecked`.
 */
export interface CadenceState {
  /** 0 = every cycle, 1 = every 2nd, 2 = every 4th, 3 = every 8th cycle. */
  shift: number;
  /** Consecutive stressful probes since the last healthy one. */
  stress: number;
  /** Consecutive healthy probes since the last stressful one. */
  healthy: number;
}

export const CADENCE_MAX_SHIFT = 3;
export const CADENCE_STRESS_THRESHOLD = 2;
export const CADENCE_RECOVERY_HITS = 2;
/** Probe cycle length — must match the cron cadence (5 minutes). */
export const PROBE_CYCLE_MS = 5 * 60 * 1000;

/** Deterministic per-service phase so backed-off services aren't in lockstep. */
export function probePhase(seedId: string): number {
  return hashSeed(seedId) % (1 << CADENCE_MAX_SHIFT);
}

/** Cycle index from a timestamp (same value for overlapping cron runs). */
export function cycleIndex(nowMs: number): number {
  return Math.floor(nowMs / PROBE_CYCLE_MS);
}

export function isProbeDue(state: CadenceState, cycle: number, phase: number): boolean {
  const stride = 1 << state.shift;
  return (cycle + phase) % stride === 0;
}

/**
 * Outcomes that look like the origin throttling us: a hard "down"
 * (refused/timeout/5xx) or an explicit 403 (WAF block) / 429 (rate limit).
 * Slow-but-responding (degraded by latency alone) is not backoff-worthy.
 */
export function isStressful(probe: ProbeResult): boolean {
  return (
    probe.status === "down" ||
    probe.httpStatus === 403 ||
    probe.httpStatus === 429
  );
}

export function updateCadence(prev: CadenceState, stressful: boolean): CadenceState {
  if (stressful) {
    const stress = prev.stress + 1;
    return {
      shift:
        stress >= CADENCE_STRESS_THRESHOLD
          ? Math.min(prev.shift + 1, CADENCE_MAX_SHIFT)
          : prev.shift,
      stress: stress >= CADENCE_STRESS_THRESHOLD ? 0 : stress,
      healthy: 0,
    };
  }
  const healthy = prev.healthy + 1;
  return {
    shift:
      healthy >= CADENCE_RECOVERY_HITS
        ? Math.max(prev.shift - 1, 0)
        : prev.shift,
    stress: 0,
    healthy: healthy >= CADENCE_RECOVERY_HITS ? 0 : healthy,
  };
}

/* --------------------------- TLS certificate probe ------------------------- */

/**
 * Lightweight TLS handshake (Node only) to read the peer certificate's
 * expiry. Separate from the HTTP probe because undici's fetch doesn't expose
 * the socket. Rate-limited by a module cache — re-checked every
 * CERT_CHECK_INTERVAL_MS instead of every cycle. Never throws; returns epoch
 * ms of `valid_to`, or null when the cert can't be read.
 */
async function probeCertExpiryMs(urlString: string): Promise<number | null> {
  if (!IS_NODE) return null;
  let url: URL;
  try {
    url = new URL(urlString);
  } catch {
    return null;
  }
  if (url.protocol !== "https:") return null;

  try {
    const tls = await import("node:tls");
    const result = await new Promise<number | null>((resolve) => {
      const socket = tls.connect({
        host: url.hostname,
        servername: url.hostname,
        port: Number(url.port) || 443,
        rejectUnauthorized: false,
      });
      const timer = setTimeout(() => {
        socket.destroy();
        resolve(null);
      }, 15000);
      socket.once("secureConnect", () => {
        clearTimeout(timer);
        const cert = socket.getPeerCertificate();
        socket.destroy();
        resolve(cert.valid_to ? Date.parse(cert.valid_to) || null : null);
      });
      socket.once("error", () => {
        clearTimeout(timer);
        socket.destroy();
        resolve(null);
      });
    });
    return result;
  } catch {
    return null;
  }
}

interface CertCacheEntry {
  expiresMs: number | null;
  checkedMs: number;
}

const certCache = new Map<string, CertCacheEntry>();

/** Certs due for re-probing this cycle (not seen within the last 6h). */
function certsDue(services: SeedService[]): SeedService[] {
  const now = Date.now();
  return services.filter((service) => {
    const entry = certCache.get(service.id);
    return !entry || now - entry.checkedMs >= CERT_CHECK_INTERVAL_MS;
  });
}

/** Deterministic string hash so simulated history is stable per hour slot. */
export function hashSeed(input: string): number {
  let hash = 0;
  for (let i = 0; i < input.length; i++) {
    hash = (hash * 31 + input.charCodeAt(i)) | 0;
  }
  return Math.abs(hash);
}

/**
 * Simulated 24-hour history (24 hourly bars) used until D1 history exists.
 * Slots are derived from a deterministic hash of (service id, hour bucket) so
 * they stay stable across refetches; the newest slot always reflects the live
 * probe result. Only used when D1 is unconfigured/unreachable.
 */
export function simulateSlot(service: SeedService, bucketStart: number): UptimeSlot {
  const timestamp = new Date(bucketStart).toISOString();
  const roll = hashSeed(`${service.id}:${timestamp}`) % 100;
  const status: HealthStatus =
    roll < 5 ? "down" : roll < 15 ? "degraded" : "operational";
  const base = 180 + (hashSeed(`${service.id}:rt:${timestamp}`) % 1400);
  const responseTime =
    status === "down" ? null : status === "degraded" ? base + 2600 : base;
  return { timestamp, status, responseTime };
}

/* ---------------------------------- D1 ------------------------------------ */

/**
 * Hourly aggregate history: one row per service per hour bucket. `worst_status`
 * is the worst status observed across all probe samples in that hour and
 * `sample_count`/`sum_response_ms` give the average latency.
 */
interface HistoryRow {
  service_id: string;
  bucket_ms: number;
  worst_status: HealthStatus;
  sample_count: number;
  sum_response_ms: number;
  checked_at_ms: number;
}

type HistoryIndex = Map<string, Map<number, HistoryRow>>;

async function loadHistory(sinceMs: number): Promise<HistoryIndex> {
  const [nepalRows, foreignRows] = await Promise.all([
    d1Query<HistoryRow>(
      `SELECT service_id, bucket_ms, worst_status, sample_count, sum_response_ms, checked_at_ms
       FROM status_checks
       WHERE bucket_ms >= ?`,
      [sinceMs]
    ),
    // Best-effort: absent on a pre-migration DB, and only used to fill hours
    // the Nepal-vantage probe has no row for.
    d1Query<HistoryRow>(
      `SELECT service_id, bucket_ms, worst_status, sample_count, sum_response_ms, checked_at_ms
       FROM status_checks_foreign
       WHERE bucket_ms >= ?`,
      [sinceMs]
    ).catch(() => [] as HistoryRow[]),
  ]);

  const index: HistoryIndex = new Map();
  const put = (row: HistoryRow, overwrite: boolean) => {
    let byHour = index.get(row.service_id);
    if (!byHour) {
      byHour = new Map();
      index.set(row.service_id, byHour);
    }
    if (overwrite || !byHour.has(row.bucket_ms)) byHour.set(row.bucket_ms, row);
  };
  // Foreign readings only fill gaps; Nepal-vantage rows always win the hour.
  for (const row of foreignRows) put(row, false);
  for (const row of nepalRows) put(row, true);
  return index;
}

/** Average latency for an aggregate bucket, or null when no latency recorded. */
export function bucketLatency(row: HistoryRow): number | null {
  if (row.sample_count <= 0) return null;
  return Math.round(row.sum_response_ms / row.sample_count);
}

interface MetaRow {
  service_id: string;
  last_status: HealthStatus;
  last_checked_at_ms: number;
  cert_expires_at_ms: number | null;
  cert_checked_at_ms: number | null;
}

type MetaIndex = Map<string, MetaRow>;

async function loadServiceMeta(): Promise<MetaIndex> {
  const rows = await d1Query<MetaRow>(
    `SELECT service_id, last_status, last_checked_at_ms, cert_expires_at_ms, cert_checked_at_ms
     FROM service_meta`
  );
  return new Map(rows.map((row) => [row.service_id, row]));
}

/** Split D1 batch statements so no single call exceeds the statement cap. */
async function d1BatchChunked(
  statements: { sql: string; params: unknown[] }[],
  chunkSize = 60
): Promise<void> {
  for (let i = 0; i < statements.length; i += chunkSize) {
    await d1Batch(statements.slice(i, i + chunkSize));
  }
}

/**
 * Persist this cycle: upsert each service's current hour bucket (worst-status
 * aggregation), refresh per-service meta (current status + refreshed certs),
 * and prune buckets older than the retention window. All in one batch.
 *
 * When the bucket row carries outcome-counter columns (schema.sql), each
 * sample also increments the matching outcome counter so the history API can
 * tell a 5xx outage from a firewall block. On a pre-migration DB the extended
 * INSERT fails and the batch is retried with the legacy SQL, so probing never
 * breaks because the columns are missing.
 */
export async function persistChecks(
  services: ServiceHealth[],
  checkedAtMs: number,
  certRefreshes: Map<string, number>
): Promise<void> {
  const bucketMs = Math.floor(checkedAtMs / HOUR_MS) * HOUR_MS;

  const statusStatement = (service: ServiceHealth, withOutcomes: boolean) => {
    if (!withOutcomes) {
      return {
        sql: `INSERT INTO status_checks (service_id, bucket_ms, worst_status, sample_count, sum_response_ms, checked_at_ms)
              VALUES (?, ?, ?, 1, ?, ?)
              ON CONFLICT(service_id, bucket_ms) DO UPDATE SET
                worst_status = CASE
                  WHEN worst_status = 'down' OR excluded.worst_status = 'down' THEN 'down'
                  WHEN worst_status = 'degraded' OR excluded.worst_status = 'degraded' THEN 'degraded'
                  ELSE 'operational' END,
                sample_count = sample_count + 1,
                sum_response_ms = sum_response_ms + excluded.sum_response_ms,
                checked_at_ms = excluded.checked_at_ms`,
        params: [
          service.id,
          bucketMs,
          service.status,
          service.responseTime ?? 0,
          checkedAtMs,
        ],
      };
    }

    const outcomeCols = OUTCOME_ORDER.map((key) => OUTCOME_COLUMNS[key]).join(
      ", "
    );
    const outcomeKeys = OUTCOME_ORDER.map(
      (key) => OUTCOME_COLUMNS[key] + " = " + OUTCOME_COLUMNS[key] + " + excluded." + OUTCOME_COLUMNS[key]
    );
    const outcome = OUTCOME_ORDER.map((key) =>
      outcomeFor(service.status, service.httpStatus) === key ? 1 : 0
    );
    return {
      sql: `INSERT INTO status_checks (service_id, bucket_ms, worst_status, sample_count, sum_response_ms, checked_at_ms, ${outcomeCols})
            VALUES (?, ?, ?, 1, ?, ?, ${outcome.map(() => "?").join(", ")})
            ON CONFLICT(service_id, bucket_ms) DO UPDATE SET
              worst_status = CASE
                WHEN worst_status = 'down' OR excluded.worst_status = 'down' THEN 'down'
                WHEN worst_status = 'degraded' OR excluded.worst_status = 'degraded' THEN 'degraded'
                ELSE 'operational' END,
              sample_count = sample_count + 1,
              sum_response_ms = sum_response_ms + excluded.sum_response_ms,
              checked_at_ms = excluded.checked_at_ms,
              ${outcomeKeys.join(", ")}`,
      params: [
        service.id,
        bucketMs,
        service.status,
        service.responseTime ?? 0,
        checkedAtMs,
        ...outcome,
      ],
    };
  };

  const metaStatement = (service: ServiceHealth) => ({
    sql: `INSERT INTO service_meta
            (service_id, last_status, last_checked_at_ms, cert_expires_at_ms, cert_checked_at_ms)
          VALUES (?, ?, ?, ?, ?)
          ON CONFLICT(service_id) DO UPDATE SET
            last_status = excluded.last_status,
            last_checked_at_ms = excluded.last_checked_at_ms,
            cert_expires_at_ms = COALESCE(excluded.cert_expires_at_ms, service_meta.cert_expires_at_ms),
            cert_checked_at_ms = COALESCE(excluded.cert_checked_at_ms, service_meta.cert_checked_at_ms)`,
    params: [
      service.id,
      service.status,
      checkedAtMs,
      certRefreshes.get(service.id) ?? null,
      certRefreshes.has(service.id) ? Date.now() : null,
    ],
  });

  const prune = {
    sql: "DELETE FROM status_checks WHERE bucket_ms < ?",
    params: [checkedAtMs - RETENTION_DAYS * 24 * HOUR_MS],
  };

  const build = (withOutcomes: boolean) => [
    ...services.flatMap((service) => [
      statusStatement(service, withOutcomes),
      metaStatement(service),
    ]),
    prune,
  ];

  try {
    await d1BatchChunked(build(true));
  } catch (err) {
    console.error(
      "[govstatus] outcome-column write failed (legacy DB?), retrying without:",
      err
    );
    await d1BatchChunked(build(false));
  }
}

export function buildHistory(
  service: SeedService,
  live: ProbeResult,
  checkedAt: string,
  realHistory?: Map<number, HistoryRow>
): UptimeSlot[] {
  const checkedTime = new Date(checkedAt).getTime();
  const slots: UptimeSlot[] = [];

  for (let i = HISTORY_SLOTS - 1; i >= 0; i--) {
    const bucketStart =
      Math.floor((checkedTime - i * HOUR_MS) / HOUR_MS) * HOUR_MS;

    // Newest slot always reflects the live probe result.
    if (i === 0) {
      slots.push({
        timestamp: new Date(bucketStart).toISOString(),
        status: live.status,
        responseTime: live.responseTime,
      });
      continue;
    }

    // Real recorded history when available; grey "no data" slots otherwise.
    if (realHistory) {
      const row = realHistory.get(bucketStart);
      slots.push({
        timestamp: new Date(bucketStart).toISOString(),
        status: row?.worst_status ?? null,
        responseTime: row ? bucketLatency(row) : null,
      });
      continue;
    }

    // No persisted history yet (D1 unconfigured or unreachable) → simulation.
    slots.push(simulateSlot(service, bucketStart));
  }

  return slots;
}

export function computeUptimePercentage(uptime24h: UptimeSlot[]): number {
  const knownSlots = uptime24h.filter((slot) => slot.status !== null).length;
  const operationalSlots = uptime24h.filter(
    (slot) => slot.status === "operational"
  ).length;
  return knownSlots > 0
    ? Math.round((operationalSlots / knownSlots) * 1000) / 10
    : 100;
}

const STATUS_CHAR: Record<HealthStatus, string> = {
  operational: "o",
  degraded: "d",
  down: "x",
};

/**
 * Compact history codec: 24 status chars (o/d/x, n = no data) plus one
 * nullable latency per slot. Replaces the verbose per-slot objects so the
 * API payload stays small at scale.
 */
export function encodeHistory(uptime24h: UptimeSlot[]): {
  history: string;
  latencies: (number | null)[];
} {
  return {
    history: uptime24h
      .map((slot) => (slot.status ? STATUS_CHAR[slot.status] : "n"))
      .join(""),
    latencies: uptime24h.map((slot) => slot.responseTime),
  };
}

async function checkService(
  service: SeedService,
  checkedAt: string,
  realHistory?: Map<number, HistoryRow>
): Promise<ServiceHealth> {
  const live = await probeService(service.url, service.checkUrl);
  const uptime24h = buildHistory(service, live, checkedAt, realHistory);

  return {
    ...service,
    status: live.status,
    responseTime: live.responseTime,
    httpStatus: live.httpStatus,
    checkedAt,
    uptimePercentage: computeUptimePercentage(uptime24h),
    certExpiresAt: null,
    ...encodeHistory(uptime24h),
  };
}

export function buildHealthResponse(
  services: ServiceHealth[],
  checkedAt: string,
  source: HealthSource
): HealthResponse {
  const count = (status: HealthStatus) =>
    services.filter((service) => service.status === status).length;

  const responseTimes = services
    .map((service) => service.responseTime)
    .filter((time): time is number => time !== null);

  return healthResponseSchema.parse({
    checkedAt,
    summary: {
      total: services.length,
      operational: count("operational"),
      degraded: count("degraded"),
      down: count("down"),
      averageResponseTime:
        responseTimes.length > 0
          ? Math.round(
              responseTimes.reduce((sum, time) => sum + time, 0) /
                responseTimes.length
            )
          : null,
      overallStatus:
        count("down") >= 5
          ? "outage"
          : count("down") > 0 || count("degraded") > 0
            ? "degraded"
            : "normal",
    },
    services,
    source,
  });
}

/* --------------------------------- Alerting -------------------------------- */

interface TransitionEvent {
  serviceId: string;
  name: string;
  url: string;
  previousStatus: HealthStatus | null;
  currentStatus: HealthStatus;
  httpStatus: number | null;
}

/** Status transitions worth alerting on: worsening or recovery. */
export function computeTransitions(
  services: ServiceHealth[],
  prevMeta: MetaIndex | null
): TransitionEvent[] {
  if (!prevMeta) return [];
  const events: TransitionEvent[] = [];
  for (const service of services) {
    const previous = prevMeta.get(service.id)?.last_status ?? null;
    if (previous === null || previous === service.status) continue;
    events.push({
      serviceId: service.id,
      name: service.name,
      url: service.url,
      previousStatus: previous,
      currentStatus: service.status,
      httpStatus: service.httpStatus,
    });
  }
  return events;
}

/**
 * Fire a generic JSON webhook for status transitions. Configure
 * `ALERT_WEBHOOK_URL` (any endpoint that accepts POST JSON — Telegram bot,
 * Slack, ntfy, etc.). No-op when unset.
 */
async function sendAlerts(events: TransitionEvent[], checkedAt: string) {
  const webhookUrl = process.env.ALERT_WEBHOOK_URL;
  if (!webhookUrl || events.length === 0) return;

  const text = events
    .map(
      (event) =>
        `[${event.currentStatus.toUpperCase()}] ${event.name} — ${event.url} ` +
        `(was ${event.previousStatus ?? "unknown"}, http ${event.httpStatus ?? "—"})`
    )
    .join("\n");

  try {
    const res = await fetch(webhookUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text, checkedAt, events }),
      signal: AbortSignal.timeout(5000),
    });
    if (!res.ok) {
      console.error(
        `[govstatus] alert webhook failed: ${res.status} ${await res.text()}`
      );
    }
  } catch (err) {
    console.error("[govstatus] alert webhook failed:", err);
  }
}

/* ---------------------------------- Cache ---------------------------------- */

/**
 * Module-level cache so repeated requests (dev server, page + API route,
 * concurrent visitors) never re-probe more than once per TTL. An in-flight
 * promise is shared to prevent probe stampedes.
 */
let cached: { data: HealthResponse; at: number } | null = null;
let inFlight: Promise<HealthResponse> | null = null;

/** Last persisted cycle timestamp; gates D1 writes + history reads. */
let lastPersistAt = 0;
/** Last-loaded history index, reused between persist cycles. */
let historyCache: HistoryIndex | null = null;

/** Adaptive backoff state per service (see "Adaptive probe cadence"). */
const cadenceState = new Map<string, CadenceState>();
const freshCadence = (): CadenceState => ({ shift: 0, stress: 0, healthy: 0 });

/** Live state of the running probe cycle, surfaced to the loader UI. */
let currentProgress: ProbeProgress | null = null;
let lastRun: ProbeProgress["lastRun"] = null;

export function getProbeProgress(): ProbeProgress | null {
  return currentProgress;
}

async function runChecks(): Promise<HealthResponse> {
  const seeds = seedServiceSchema.array().parse(seedData);
  const checkedAt = new Date().toISOString();
  const checkedAtMs = Date.parse(checkedAt);

  currentProgress = {
    phase: "probing",
    total: seeds.length,
    checked: 0,
    down: 0,
    degraded: 0,
    recent: [],
    startedAt: checkedAt,
    lastRun,
  };

  // Real recorded history from D1; falls back to simulation when the
  // database is unconfigured or unreachable. An *empty* configured database
  // yields grey "no data" slots, not fabricated bars. History only changes
  // on persist, so between persist cycles we reuse the last-loaded index —
  // this is what keeps D1 reads within the free-tier limit.
  const d1Available = !!d1Config || (await isD1Available());
  const shouldPersist =
    d1Available &&
    !SERVE_ONLY &&
    checkedAtMs - lastPersistAt >= PERSIST_INTERVAL_MS;

  let realHistory = historyCache;
  if (shouldPersist || !realHistory) {
    try {
      const fresh = await loadHistory(checkedAtMs - HISTORY_SLOTS * HOUR_MS);
      historyCache = fresh;
      realHistory = fresh;
    } catch (err) {
      console.error("[govstatus] D1 history read failed, simulating:", err);
      // Keep the previous index (if any) rather than regressing to simulation.
    }
  }
  const source: HealthSource = realHistory ? "live" : "simulated";

  // Current per-service state (transition compare + persisted certs).
  let prevMeta: MetaIndex | null = null;
  if (d1Available) {
    try {
      prevMeta = await loadServiceMeta();
    } catch (err) {
      console.error("[govstatus] D1 meta read failed:", err);
    }
  }

/** Runs `fn` over `items` with at most `limit` concurrent calls. */
async function mapLimit<T, R>(
  items: T[],
  limit: number,
  fn: (item: T, index: number) => Promise<R>
): Promise<R[]> {
  const results = new Array<R>(items.length);
  let next = 0;
  const worker = async () => {
    while (next < items.length) {
      const index = next++;
      results[index] = await fn(items[index], index);
    }
  };
  await Promise.all(
    Array.from({ length: Math.min(limit, items.length) }, worker)
  );
  return results;
}

  // Refresh due TLS certs in parallel with the HTTP probes (Node only).
  const certPromises = mapLimit(certsDue(seeds), 15, async (service) => ({
    id: service.id,
    expiresMs: await probeCertExpiryMs(service.url),
  }));

  const cycle = cycleIndex(checkedAtMs);

  const services = await mapLimit(seeds, 15, async (service) => {
    const cadence = cadenceState.get(service.id) ?? freshCadence();

    // Backed-off this cycle? Reuse the last persisted state and leave the
    // origin alone — WAFs only calm down when the pinging stops.
    if (!isProbeDue(cadence, cycle, probePhase(service.id))) {
      const metaRow = prevMeta?.get(service.id);
      const status: HealthStatus = metaRow?.last_status ?? "operational";
      const uptime24h = buildHistory(
        service,
        { status, responseTime: null, httpStatus: null },
        checkedAt,
        realHistory?.get(service.id)
      );
      return {
        ...service,
        status,
        responseTime: null,
        httpStatus: null,
        checkedAt: metaRow
          ? new Date(metaRow.last_checked_at_ms).toISOString()
          : checkedAt,
        uptimePercentage: computeUptimePercentage(uptime24h),
        certExpiresAt: null,
        ...encodeHistory(uptime24h),
      };
    }

    const result = await checkService(
      service,
      checkedAt,
      realHistory?.get(service.id)
    );
    cadenceState.set(
      service.id,
      updateCadence(cadence, isStressful(result))
    );
    const progress = currentProgress!;
    progress.checked += 1;
    if (result.status === "down") progress.down += 1;
    if (result.status === "degraded") progress.degraded += 1;
    progress.recent = [
      { name: result.name, status: result.status },
      ...progress.recent,
    ].slice(0, 5);
    return result;
  });

  const certResults = await certPromises;

  const certRefreshes = new Map<string, number>();
  for (const cert of await Promise.all(certResults)) {
    if (cert.expiresMs === null) continue;
    certCache.set(cert.id, {
      expiresMs: cert.expiresMs,
      checkedMs: Date.now(),
    });
    certRefreshes.set(cert.id, cert.expiresMs);
  }

  // Attach certificate expiry to each service (fresh probe or persisted).
  const withCerts = services.map((service) => {
    const fresh = certCache.get(service.id)?.expiresMs;
    const persisted = prevMeta?.get(service.id)?.cert_expires_at_ms ?? null;
    const expiresMs = fresh ?? persisted;
    return {
      ...service,
      certExpiresAt: expiresMs ? new Date(expiresMs).toISOString() : null,
    };
  });

  if (shouldPersist) {
    currentProgress = { ...currentProgress!, phase: "persisting" };
    try {
      await persistChecks(withCerts, checkedAtMs, certRefreshes);
      lastPersistAt = checkedAtMs;
      // Alerts only fire on the persist cycle, so a failed persist retries
      // and never double-sends a transition.
      await sendAlerts(computeTransitions(withCerts, prevMeta), checkedAt);
    } catch (err) {
      console.error("[govstatus] D1 persist failed:", err);
    }
  }
  currentProgress = { ...currentProgress!, phase: "done" };
  lastRun = {
    total: currentProgress.total,
    down: currentProgress.down,
    degraded: currentProgress.degraded,
    finishedAt: new Date().toISOString(),
  };

  return buildHealthResponse(withCerts, checkedAt, source);
}

/**
 * Fast path: build a snapshot of the last-known state straight from D1 (no
 * network probes). Returns null when the database is unconfigured or doesn't
 * yet hold a meta row for every service.
 */
async function getLastKnownFromDb(): Promise<HealthResponse | null> {
  const d1Available = !!d1Config || (await isD1Available());
  if (!d1Available) return null;
  const seeds = seedServiceSchema.array().parse(seedData);
  const now = Date.now();
  const checkedAt = new Date(now).toISOString();

  try {
    const [history, meta] = await Promise.all([
      loadHistory(now - HISTORY_SLOTS * HOUR_MS),
      loadServiceMeta(),
    ]);
    const services: ServiceHealth[] = [];

    for (const seed of seeds) {
      const metaRow = meta.get(seed.id);
      const status: HealthStatus = metaRow?.last_status ?? "operational";
      const byHour = history.get(seed.id) ?? new Map();
      const uptime24h = buildHistory(
        seed,
        { status, responseTime: null, httpStatus: null },
        checkedAt,
        byHour
      );
      services.push({
        ...seed,
        status,
        responseTime: null,
        httpStatus: null,
        checkedAt: metaRow
          ? new Date(metaRow.last_checked_at_ms).toISOString()
          : checkedAt,
        uptimePercentage: computeUptimePercentage(uptime24h),
        certExpiresAt: metaRow?.cert_expires_at_ms
          ? new Date(metaRow.cert_expires_at_ms).toISOString()
          : null,
        ...encodeHistory(uptime24h),
      });
    }

    return buildHealthResponse(services, checkedAt, "live");
  } catch (err) {
    console.error("[govstatus] D1 snapshot failed:", err);
    return null;
  }
}

/**
 * Runs a full probe cycle and publishes the result to the module cache + D1.
 * Called only by the cron job (/api/probe). The in-flight promise is shared
 * so overlapping cron ticks never run two cycles at once.
 */
export function probeNow(): Promise<HealthResponse> {
  inFlight ??= runChecks()
    .then((data) => {
      cached = { data, at: Date.now() };
      return data;
    })
    .finally(() => {
      inFlight = null;
    });
  return inFlight;
}

/**
 * Read-only entry point. Serves the last published probe cycle from the
 * module cache, or the last-known D1 snapshot on a cold start. Never probes —
 * refreshing is owned by the cron job. The blocking fallback fires only when
 * the database is genuinely empty (first run before any cron tick).
 */
export function getServicesHealth(): Promise<HealthResponse> {
  const cachedAge = cached ? Date.now() - cached.at : Infinity;

  if (SERVE_ONLY) {
    // Serve-only worker: prefer the D1 snapshot (written by the Nepal-vantage
    // probe) and refresh the module cache on a TTL.
    // Cloudflare Workers must NEVER self-probe from foreign datacenters,
    // because foreign datacenter IPs are blocked by .np WAFs and cause mass false "down".
    if (cached && cachedAge < SNAPSHOT_TTL_MS) {
      return Promise.resolve(cached.data);
    }
    return getLastKnownFromDb().then((snapshot) => {
      if (snapshot) {
        cached = { data: snapshot, at: Date.now() };
        return snapshot;
      }
      if (cached) {
        // Serve-only snapshot read failed but we have a previous snapshot —
        // keep serving it but flag the failure loudly so the mismatch that
        // causes mass false "down" is never silent.
        console.error(
          "[govstatus] serve-only D1 snapshot read FAILED (stale config?). " +
            "Serving cached snapshot from " + new Date(cached.at).toISOString() +
            ". Check CLOUDFLARE_D1_DATABASE_ID matches the DB the Nepal probe writes."
        );
        return cached.data;
      }
      // Fallback if D1 is temporarily unreachable: serve graceful simulated structure, never probe
      console.error(
        "[govstatus] serve-only D1 snapshot read FAILED and no cache. " +
          "Falling back to simulated structure. Verify CLOUDFLARE_D1_DATABASE_ID " +
          "points at the DB the Nepal probe writes, or served status will be wrong."
      );
      const seeds = seedServiceSchema.array().parse(seedData);
      const checkedAt = new Date().toISOString();
      const fallbackServices: ServiceHealth[] = seeds.map((seed) => {
        const uptime24h = buildHistory(
          seed,
          { status: "operational", responseTime: null, httpStatus: null },
          checkedAt,
          new Map()
        );
        return {
          ...seed,
          status: "operational",
          responseTime: null,
          httpStatus: null,
          checkedAt,
          uptimePercentage: computeUptimePercentage(uptime24h),
          certExpiresAt: null,
          ...encodeHistory(uptime24h),
        };
      });
      const fallback = buildHealthResponse(fallbackServices, checkedAt, "simulated");
      cached = { data: fallback, at: Date.now() };
      return fallback;
    });
  }

  // Node runtime (local dev or self-hosted probe node)
  if (cached && cachedAge < SNAPSHOT_TTL_MS) {
    return Promise.resolve(cached.data);
  }
  return getLastKnownFromDb().then((snapshot) => {
    if (snapshot) {
      cached = { data: snapshot, at: Date.now() };
      return snapshot;
    }
    // Stale-while-revalidate: if we have existing cached data, return it immediately so
    // users never experience a 30s-40s delay waiting for 92 probes, and refresh in the background.
    if (cached) {
      void probeNow();
      return cached.data;
    }
    return probeNow();
  });
}