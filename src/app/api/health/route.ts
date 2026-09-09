import { getServicesHealth } from "@/features/services-monitor/server/health-probe";

// Serve the persisted snapshot with a short cache TTL. The Worker is
// serve-only (never probes); data freshness follows the probe cadence.
export const dynamic = "force-dynamic";
export const revalidate = 60;

export const runtime = "nodejs";

export async function GET() {
  const payload = await getServicesHealth();
  return Response.json(payload, {
    headers: {
      "Cache-Control": "s-maxage=60, stale-while-revalidate=30",
    },
  });
}
