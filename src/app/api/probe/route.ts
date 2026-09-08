import { probeNow, SERVE_ONLY } from "@/features/services-monitor/server/health-probe";

export const runtime = "nodejs";

/**
 * Cron-triggered probe cycle. The only path that runs network probes —
 * reads (/api/health, SSR) never probe, they serve the last published cache
 * or D1 snapshot. Auth: `Authorization: Bearer <CRON_SECRET>` (Vercel Cron
 * sends this automatically) or `x-cron-secret: <CRON_SECRET>`.
 */
export async function POST(req: Request) {
  // Serve-only deployments (Cloudflare Worker) never probe — the Nepal-vantage
  // probe (`probe/nepal-probe.mjs`) owns probing and writes D1 directly.
  if (SERVE_ONLY) {
    return Response.json(
      { error: "Probing disabled on this deployment" },
      { status: 403 }
    );
  }

  const secret = process.env.CRON_SECRET;
  if (!secret) {
    return Response.json(
      { error: "CRON_SECRET not configured" },
      { status: 500 }
    );
  }

  const auth = req.headers.get("authorization");
  const header = req.headers.get("x-cron-secret");
  if (auth !== `Bearer ${secret}` && header !== secret) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const data = await probeNow();
  return Response.json({
    ok: true,
    checkedAt: data.checkedAt,
    total: data.summary.total,
    down: data.summary.down,
    degraded: data.summary.degraded,
  });
}