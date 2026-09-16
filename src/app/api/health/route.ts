import { getServicesHealth, toSlim } from "@/features/services-monitor/server/health-probe";

// Serve the persisted snapshot with a short cache TTL. The Worker is
// serve-only (never probes); data freshness follows the probe cadence.
// Kept dynamic: prerendering this handler at build time would run a full probe
// on the build machine, and the response is cached at the edge via `s-maxage`.
export const dynamic = "force-dynamic";
export const revalidate = 60;

export const runtime = "nodejs";

export async function GET(request: Request) {
  const slim = new URL(request.url).searchParams.get("slim") === "1";
  const payload = await getServicesHealth();
  return Response.json(slim ? toSlim(payload) : payload, {
    headers: {
      // Browser caches each visitor's copy for 5 min (so a soft reload/SPA
      // navigation doesn't refetch; a hard reload bypasses it), while the
      // edge caches more briefly with stale-while-revalidate.
      "Cache-Control":
        "public, max-age=300, s-maxage=60, stale-while-revalidate=300",
    },
  });
}
