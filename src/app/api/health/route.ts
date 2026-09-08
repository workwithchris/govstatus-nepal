import { getServicesHealth } from "@/features/services-monitor/server/health-probe";

// Re-probe at most once per minute (ISR + CDN cache header below).
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
