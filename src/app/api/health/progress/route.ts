import {
  getProbeProgress,
  getServicesHealth,
  SERVE_ONLY,
} from "@/features/services-monitor/server/health-probe";
import { probeProgressSchema } from "@/features/services-monitor/types";

// Live probe state — must never be cached.
export const dynamic = "force-dynamic";

export function GET() {
  // Serve-only: no probe cycle ever runs, so report "done" immediately.
  // Otherwise the loader would poll every 500ms forever, hammering the
  // progress endpoint and tripping Cloudflare rate limits.
  if (SERVE_ONLY) {
    return Response.json(
      probeProgressSchema.parse({
        phase: "done",
        total: 0,
        checked: 0,
        down: 0,
        degraded: 0,
        recent: [],
        startedAt: null,
        lastRun: null,
      })
    );
  }

  let progress = getProbeProgress();

  // First poll after a cold boot: kick the probe cycle so the loader shows
  // live counts instead of idling until the page render gets there.
  if (!progress || progress.phase === "idle") {
    void getServicesHealth().catch(() => {});
    progress = getProbeProgress();
  }

  return Response.json(
    probeProgressSchema.parse(
      progress ?? {
        phase: "idle",
        total: 0,
        checked: 0,
        down: 0,
        degraded: 0,
        recent: [],
        startedAt: null,
        lastRun: null,
      }
    )
  );
}
