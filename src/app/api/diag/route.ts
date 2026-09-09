import { d1Config } from "@/lib/d1";
import { getServicesHealth } from "@/features/services-monitor/server/health-probe";

export const dynamic = "force-dynamic";

/**
 * Read-only diagnosis for ops. Reports whether D1 is configured (and with
 * which account/database ids) and how stale the served snapshot is — so a
 * mismatch between the Worker's CLOUDFLARE_D1_DATABASE_ID and the DB the Nepal
 * probe writes is visible instead of silently producing mass false "down".
 * No secrets are exposed (db id is public-ish, token never returned).
 */
export async function GET() {
  const payload = await getServicesHealth();
  return Response.json(
    {
      d1Configured: !!d1Config,
      accountId: d1Config?.accountId ?? null,
      databaseId: d1Config?.databaseId ?? null,
      source: payload.source,
      servedCheckedAt: payload.checkedAt,
      servedMinutesOld: Math.round(
        (Date.now() - Date.parse(payload.checkedAt)) / 60000
      ),
      summary: payload.summary,
    },
    { headers: { "Cache-Control": "no-store" } }
  );
}