import { d1Config, d1Query } from "@/lib/d1";
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

  // True data freshness: the newest *actual* write, not the synthetic
  // response checkedAt. Zero buckets = no history yet (probe never ran).
  let lastWriteMs: number | null = null;
  let bucketCount = 0;
  try {
    const rows = await d1Query<{ m: number | null; c: number }>(
      `SELECT MAX(last_checked_at_ms) AS m, COUNT(*) AS c FROM service_meta`
    );
    lastWriteMs = rows[0]?.m ?? null;
    bucketCount = rows[0]?.c ?? 0;
  } catch {
    /* D1 unreadable */
  }

  return Response.json(
    {
      d1Configured: !!d1Config,
      accountId: d1Config?.accountId ?? null,
      databaseId: d1Config?.databaseId ?? null,
      source: payload.source,
      servedCheckedAt: payload.checkedAt,
      lastWriteAt: lastWriteMs ? new Date(lastWriteMs).toISOString() : null,
      servedMinutesOld: lastWriteMs
        ? Math.round((Date.now() - lastWriteMs) / 60000)
        : null,
      metaRows: bucketCount,
      summary: payload.summary,
    },
    { headers: { "Cache-Control": "no-store" } }
  );
}