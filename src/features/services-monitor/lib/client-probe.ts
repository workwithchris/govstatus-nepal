import seedServices from "@/data/seed-services.json";
import type {
  HealthStatus,
  OverallStatus,
  SeedService,
  SlimHealthResponse,
  SlimServiceHealth,
} from "@/features/services-monitor/types";

const PROBE_TIMEOUT_MS = 7000;
const DEGRADED_THRESHOLD_MS = 4000;
const DEFAULT_CONCURRENCY = 10;

/**
 * Probes a single government portal from the client browser using no-cors mode.
 * This runs directly from the user's ISP/IP, bypassing foreign datacenter WAF blocks.
 */
export async function probeSingleService(
  service: SeedService
): Promise<SlimServiceHealth> {
  const start = typeof performance !== "undefined" ? performance.now() : Date.now();
  const checkedAt = new Date().toISOString();

  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), PROBE_TIMEOUT_MS);

    await fetch(service.url, {
      method: "GET",
      mode: "no-cors",
      cache: "no-store",
      signal: controller.signal,
    });

    clearTimeout(timeoutId);
    const elapsed = Math.round(
      (typeof performance !== "undefined" ? performance.now() : Date.now()) - start
    );

    const status: HealthStatus =
      elapsed > DEGRADED_THRESHOLD_MS ? "degraded" : "operational";

    return {
      ...service,
      status,
      responseTime: elapsed,
      httpStatus: 200,
      checkedAt,
      uptimePercentage: 100,
      certExpiresAt: null,
    };
  } catch {
    return {
      ...service,
      status: "down",
      responseTime: null,
      httpStatus: null,
      checkedAt,
      uptimePercentage: 0,
      certExpiresAt: null,
    };
  }
}

/**
 * Runs client-side probes across all services with a controlled concurrency pool.
 */
export async function probeAllServicesClientSide(
  services: SeedService[] = seedServices as SeedService[],
  concurrency = DEFAULT_CONCURRENCY
): Promise<SlimHealthResponse> {
  const results: SlimServiceHealth[] = [];
  const queue = [...services];
  const checkedAt = new Date().toISOString();

  async function worker() {
    while (queue.length > 0) {
      const item = queue.shift();
      if (!item) break;
      const result = await probeSingleService(item);
      results.push(result);
    }
  }

  const poolSize = Math.min(concurrency, services.length);
  const workers = Array.from({ length: poolSize }, () => worker());
  await Promise.all(workers);

  // Re-sort results to match the original seed order
  const idOrder = new Map(services.map((s, idx) => [s.id, idx]));
  results.sort((a, b) => (idOrder.get(a.id) ?? 0) - (idOrder.get(b.id) ?? 0));

  let operational = 0;
  let degraded = 0;
  let down = 0;
  let totalLatency = 0;
  let latencyCount = 0;

  for (const s of results) {
    if (s.status === "operational") operational++;
    else if (s.status === "degraded") degraded++;
    else if (s.status === "down") down++;

    if (s.responseTime !== null) {
      totalLatency += s.responseTime;
      latencyCount++;
    }
  }

  const averageResponseTime =
    latencyCount > 0 ? Math.round(totalLatency / latencyCount) : null;

  const total = results.length;
  let overallStatus: OverallStatus = "normal";
  if (down > total * 0.2) {
    overallStatus = "outage";
  } else if (down > 0 || degraded > total * 0.15) {
    overallStatus = "degraded";
  }

  return {
    checkedAt,
    summary: {
      total,
      operational,
      degraded,
      down,
      averageResponseTime,
      overallStatus,
    },
    services: results,
    source: "live",
  };
}

/**
 * Returns initial static baseline data synchronously for instant SSR / initial state.
 */
export function getInitialStaticHealth(
  services: SeedService[] = seedServices as SeedService[]
): SlimHealthResponse {
  const checkedAt = new Date().toISOString();
  const baselineServices: SlimServiceHealth[] = services.map((s) => ({
    ...s,
    status: "operational",
    responseTime: null,
    httpStatus: null,
    checkedAt,
    uptimePercentage: 100,
    certExpiresAt: null,
  }));

  return {
    checkedAt,
    summary: {
      total: services.length,
      operational: services.length,
      degraded: 0,
      down: 0,
      averageResponseTime: null,
      overallStatus: "normal",
    },
    services: baselineServices,
    source: "live",
  };
}
