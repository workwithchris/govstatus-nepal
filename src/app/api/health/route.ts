import { getServicesHealth } from "@/features/services-monitor/server/health-probe";
import type {
  HealthResponse,
  SlimServiceHealth,
} from "@/features/services-monitor/types";

// Serve the persisted snapshot with a short cache TTL. The Worker is
// serve-only (never probes); data freshness follows the probe cadence.
// Kept dynamic: prerendering this handler at build time would run a full probe
// on the build machine, and the response is CDN-cached via `s-maxage` anyway.
export const dynamic = "force-dynamic";
export const revalidate = 60;

export const runtime = "nodejs";

/**
 * Drop the compact 24h `history` + `latencies` arrays for the dashboard, which
 * no longer renders them. Compare/Analytics/embed request the full payload
 * (no `?slim=1`). Cuts the JSON size and the client-side Zod parse work.
 */
function toSlim(payload: HealthResponse): Omit<HealthResponse, "services"> & {
  services: SlimServiceHealth[];
} {
  return {
    ...payload,
    services: payload.services.map((service) => {
      const rest = { ...service } as Partial<typeof service>;
      delete rest.history;
      delete rest.latencies;
      return rest as SlimServiceHealth;
    }),
  };
}

export async function GET(request: Request) {
  const slim = new URL(request.url).searchParams.get("slim") === "1";
  const payload = await getServicesHealth();
  return Response.json(slim ? toSlim(payload) : payload, {
    headers: {
      "Cache-Control": "public, s-maxage=60, stale-while-revalidate=300",
    },
  });
}
