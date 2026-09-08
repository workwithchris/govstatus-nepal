import crypto from "node:crypto";
import http from "node:http";
import https from "node:https";
import { Agent, fetch as undiciFetch } from "undici";

import seedData from "@/data/seed-services.json";
import { d1Batch, d1Config, d1Query } from "@/lib/d1";
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
const RETENTION_DAYS = 7;
/**
 * How often D1 is written. Probes still run every minute (live status is
 * served from the module cache), but persisting history every minute would
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
 * the body is drained/cancelled. Probing 92 services every minute would
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

interface ProbeResult {
  status: HealthStatus;
  responseTime: number | null;
  httpStatus: number | null;
}

/**
 * 3-tier resilient probe:
 *  1. Primary undici probe (HTTP/1.1, browser UA, legacy TLS renegotiation)
 *  2. Relaxed-TLS undici retry (tolerates self-signed / missing CA chain gaps)
 *  3. Native node:https fallback (no ALPN extension, covers WebLogic/CentOS servers)
 *
 * Status classification:
 *  - operational: 200–399 and responded under 3500ms
 *  - degraded:    responded but slow (>3500ms), 403 (WAF block), or 429 (rate limit)
 *  - down:        5xx, other 4xx, connection refused, or timeout
 */
async function probeService(url: string): Promise<ProbeResult> {
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

    if (httpStatus !== null && httpStatus >= 200 && httpStatus < 400) {
      return {
        status: responseTime > SLOW_THRESHOLD_MS ? "degraded" : "operational",
        responseTime,
        httpStatus,
      };
    }
    if (httpStatus === 403 || httpStatus === 429) {
      return {
        status: "degraded",
        responseTime,
        httpStatus,
      };
    }
    return {
      status: "down",
      responseTime: httpStatus !== null ? responseTime : null,
      httpStatus,
    };
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
function hashSeed(input: string): number {
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
function simulateSlot(service: SeedService, bucketStart: number): UptimeSlot {
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
  const rows = await d1Query<HistoryRow>(
    `SELECT service_id, bucket_ms, worst_status, sample_count, sum_response_ms, checked_at_ms
     FROM status_checks
     WHERE bucket_ms >= ?`,
    [sinceMs]
  );

  const index: HistoryIndex = new Map();
  for (const row of rows) {
    let byHour = index.get(row.service_id);
    if (!byHour) {
      byHour = new Map();
      index.set(row.service_id, byHour);
    }
    byHour.set(row.bucket_ms, row);
  }
  return index;
}

/** Average latency for an aggregate bucket, or null when no latency recorded. */
function bucketLatency(row: HistoryRow): number | null {
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
 */
async function persistChecks(
  services: ServiceHealth[],
  checkedAtMs: number,
  certRefreshes: Map<string, number>
): Promise<void> {
  const statements: { sql: string; params: unknown[] }[] = [];

  const bucketMs = Math.floor(checkedAtMs / HOUR_MS) * HOUR_MS;

  for (const service of services) {
    statements.push({
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
    });

    statements.push({
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
  }

  statements.push({
    sql: "DELETE FROM status_checks WHERE bucket_ms < ?",
    params: [checkedAtMs - RETENTION_DAYS * 24 * HOUR_MS],
  });

  await d1BatchChunked(statements);
}

function buildHistory(
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

function computeUptimePercentage(uptime24h: UptimeSlot[]): number {
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
function encodeHistory(uptime24h: UptimeSlot[]): {
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
  const live = await probeService(service.url);
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

function buildHealthResponse(
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
function computeTransitions(
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
  const shouldPersist =
    !!d1Config &&
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
  if (d1Config) {
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

  const services = await mapLimit(seeds, 15, async (service) => {
    const result = await checkService(
      service,
      checkedAt,
      realHistory?.get(service.id)
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
  if (!d1Config) return null;
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
      if (!metaRow) return null;
      const byHour = history.get(seed.id) ?? new Map();
      const uptime24h = buildHistory(
        seed,
        { status: metaRow.last_status, responseTime: null, httpStatus: null },
        checkedAt,
        byHour
      );
      services.push({
        ...seed,
        status: metaRow.last_status,
        responseTime: null,
        httpStatus: null,
        checkedAt: new Date(metaRow.last_checked_at_ms).toISOString(),
        uptimePercentage: computeUptimePercentage(uptime24h),
        certExpiresAt: metaRow.cert_expires_at_ms
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
    // probe) and refresh the module cache on a TTL, so a one-off fallback
    // probe (empty DB first-run) can never pin foreign-vantage data forever.
    if (cached && cachedAge < SNAPSHOT_TTL_MS) {
      return Promise.resolve(cached.data);
    }
    return getLastKnownFromDb().then((snapshot) => {
      if (snapshot) {
        cached = { data: snapshot, at: Date.now() };
        return snapshot;
      }
      if (cached) return cached.data;
      return probeNow();
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