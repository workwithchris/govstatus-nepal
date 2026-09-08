import { getIncidents } from "@/features/services-monitor/server/incidents";

export const dynamic = "force-dynamic";

/**
 * Public incident feed (last 7 days, derived from persisted hourly buckets).
 * Empty until D1 holds enough history to detect a non-operational run.
 */
export async function GET() {
  const incidents = await getIncidents();
  return Response.json(
    { generatedAt: new Date().toISOString(), incidents },
    { headers: { "Cache-Control": "no-store" } }
  );
}