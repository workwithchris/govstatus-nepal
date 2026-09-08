import { Agent, fetch as undiciFetch } from "undici";

import seedData from "@/data/seed-services.json";
import { d1Batch, d1Config, d1Query } from "@/lib/d1";
import {
  healthResponseSchema,
  seedServiceSchema,
  type HealthResponse,
  type HealthStatus,
  type ProbeProgress,
  type SeedService,
  type ServiceHealth,
  type UptimeSlot,
} from "@/features/services-monitor/types";

const PROBE_TIMEOUT_MS = 8000;
const SLOW_THRESHOLD_MS = 3500;
const HISTORY_SLOTS = 24;
const HOUR_MS = 60 * 60 * 1000;
const CACHE_TTL_MS = 60 * 1000;
const USER_AGENT = "GovStatusNepal-HealthBot/1.0 (+https://govstatus.np)";

/**
 * Node/undici strictly validates certificate chains; browsers additionally
 * chase AIA intermediates and tolerate chain gaps, so several .np gov portals
 * that load fine in a browser get rejected here. Retry once with relaxed TLS
 * so certificate quirks don't read as outages.
 */
const relaxedTlsAgent = new Agent({ connect: { rejectUnauthorized: false } });

function probeRequest(url: string, signal: AbortSignal, dispatcher?: Agent) {
  return undiciFetch(url, {
    headers: {
      "User-Agent": USER_AGENT,
      Accept: "text/html,application/xhtml+xml,*/*;q=0.8",
    },
    redirect: "follow",
    signal,
    ...(dispatcher ? { dispatcher } : {}),
  });
}

interface ProbeResult {
  status: HealthStatus;
  responseTime: number | null;
  httpStatus: number | null;
}

/**
 * Non-blocking probe with an 8s AbortController cap.
 *  - operational: 200–399 and responded under 3500ms
 *  - degraded:    responded but slow (>3500ms) or 403 (WAF block)
 *  - down:        5xx, other 4xx, connection refused, or timeout
 */
async function probeService(url: string): Promise<ProbeResult> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), PROBE_TIMEOUT_MS);
  const startedAt = performance.now();

  try {
    let res: Awaited<ReturnType<typeof probeRequest>>;
    try {
      res = await probeRequest(url, controller.signal);
    } catch (err) {
      if (controller.signal.aborted) throw err;
      res = await probeRequest(url, controller.signal, relaxedTlsAgent);
    }
    const responseTime = Math.round(performance.now() - startedAt);

    if (res.status >= 200 && res.status < 400) {
      return {
        status: responseTime > SLOW_THRESHOLD_MS ? "degraded" : "operational",
        responseTime,
        httpStatus: res.status,
      };
    }
    // 403 usually means a WAF/bot filter, not a real outage.
    return {
      status: res.status === 403 ? "degraded" : "down",
      responseTime,
      httpStatus: res.status,
    };
  } catch {
    return { status: "down", responseTime: null, httpStatus: null };
  } finally {
    clearTimeout(timeout);
  }
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
 * probe result.
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

/**
 * Persisted status history (Cloudflare D1): latest check per service per
 * hourly bucket over the last 24 hours.
 */
interface HistoryRow {
  service_id: string;
  status: HealthStatus;
  response_time: number | null;
  last_ms: number;
}

type HistoryIndex = Map<string, Map<number, HistoryRow>>;

async function loadHistory(sinceMs: number): Promise<HistoryIndex> {
  const rows = await d1Query<HistoryRow>(
    `SELECT service_id, status, response_time, MAX(checked_at_ms) AS last_ms
     FROM status_checks
     WHERE checked_at_ms >= ?
     GROUP BY service_id, checked_at_ms / ${HOUR_MS}`,
    [sinceMs]
  );

  const index: HistoryIndex = new Map();
  for (const row of rows) {
    let byHour = index.get(row.service_id);
    if (!byHour) {
      byHour = new Map();
      index.set(row.service_id, byHour);
    }
    byHour.set(Math.floor(row.last_ms / HOUR_MS) * HOUR_MS, row);
  }
  return index;
}

async function persistChecks(
  services: ServiceHealth[],
  checkedAtMs: number,
  checkedAt: string
): Promise<void> {
  const values = services
    .map(() => "(?, ?, ?, ?, ?, ?)")
    .join(", ");
  const params = services.flatMap((service) => [
    service.id,
    service.status,
    service.responseTime,
    service.httpStatus,
    checkedAtMs,
    checkedAt,
  ]);

  await d1Batch([
    {
      sql: `INSERT INTO status_checks (service_id, status, response_time, http_status, checked_at_ms, checked_at) VALUES ${values}`,
      params,
    },
    // Retention: keep one week of history.
    {
      sql: "DELETE FROM status_checks WHERE checked_at_ms < ?",
      params: [checkedAtMs - 7 * 24 * HOUR_MS],
    },
  ]);
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
      slots.push({ timestamp: new Date(bucketStart).toISOString(), status: live.status, responseTime: live.responseTime });
      continue;
    }

    // Real recorded history when available; grey "no data" slots otherwise.
    if (realHistory) {
      const row = realHistory.get(bucketStart);
      slots.push({
        timestamp: new Date(bucketStart).toISOString(),
        status: row?.status ?? null,
        responseTime: row?.response_time ?? null,
      });
      continue;
    }

    // No persisted history yet (D1 unconfigured or empty) → simulation.
    slots.push(simulateSlot(service, bucketStart));
  }

  return slots;
}

async function checkService(
  service: SeedService,
  checkedAt: string,
  realHistory?: Map<number, HistoryRow>
): Promise<ServiceHealth> {
  const live = await probeService(service.url);
  const uptime24h = buildHistory(service, live, checkedAt, realHistory);
  const knownSlots = uptime24h.filter(
    (slot) => slot.status !== null
  ).length;
  const operationalSlots = uptime24h.filter(
    (slot) => slot.status === "operational"
  ).length;

  return {
    ...service,
    status: live.status,
    responseTime: live.responseTime,
    httpStatus: live.httpStatus,
    checkedAt,
    uptimePercentage:
      knownSlots > 0
        ? Math.round((operationalSlots / knownSlots) * 1000) / 10
        : 100,
    uptime24h,
  };
}

/**
 * Module-level cache so repeated requests (dev server, page + API route,
 * concurrent visitors) never re-probe more than once per TTL. An in-flight
 * promise is shared to prevent probe stampedes.
 */
let cached: { data: HealthResponse; at: number } | null = null;
let inFlight: Promise<HealthResponse> | null = null;

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
  // database is unconfigured, unreachable, or still empty.
  let realHistory: HistoryIndex | null = null;
  try {
    realHistory = await loadHistory(checkedAtMs - 24 * HOUR_MS);
  } catch (err) {
    console.error("[govstatus] D1 history read failed, simulating:", err);
  }

  const services = await Promise.all(
    seeds.map(async (service) => {
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
    })
  );

  if (d1Config) {
    currentProgress = { ...currentProgress!, phase: "persisting" };
    try {
      await persistChecks(services, checkedAtMs, checkedAt);
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
        count("down") > 0 ? "outage" : count("degraded") > 0 ? "degraded" : "normal",
    },
    services,
  });
}

export function getServicesHealth(): Promise<HealthResponse> {
  if (cached && Date.now() - cached.at < CACHE_TTL_MS) {
    return Promise.resolve(cached.data);
  }
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
