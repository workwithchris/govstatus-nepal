/// <reference types="@cloudflare/workers-types" />

export interface Env {
  /** Public URL of the Next.js app's probe endpoint. */
  PROBE_URL: string;
  /** Shared secret; must match CRON_SECRET in the app's environment. */
  CRON_SECRET: string;
}

/**
 * Cloudflare Cron trigger — wakes the Next.js probe cycle once a minute.
 * Probing stays in the app (/api/probe); this worker is just the scheduler.
 */
export default {
  async scheduled(
    _controller: ScheduledController,
    env: Env,
    _ctx: ExecutionContext
  ): Promise<void> {
    let res: Response;
    try {
      res = await fetch(env.PROBE_URL, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${env.CRON_SECRET}`,
        },
      });
    } catch (err) {
      console.error(`[govstatus-cron] fetch failed: ${err}`);
      return;
    }

    if (!res.ok) {
      console.error(
        `[govstatus-cron] probe trigger failed: ${res.status} ${await res.text()}`
      );
      return;
    }

    const body = (await res.json()) as {
      checkedAt: string;
      total: number;
      down: number;
      degraded: number;
    };
    console.log(
      `[govstatus-cron] probe cycle ok — ${body.checkedAt} · ${body.total} services · ${body.down} down · ${body.degraded} degraded`
    );
  },
};