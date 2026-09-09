import type { Metadata } from "next";
import { Activity, Database, ShieldCheck } from "lucide-react";

export const metadata: Metadata = {
  title: "Methodology",
  description:
    "How IsGovOnline measures uptime for Nepal's government portals, and what the statuses mean.",
};

const SECTION_ICON = "size-4 shrink-0 text-muted-foreground";

export default function MethodologyPage() {
  return (
    <main className="mx-auto w-full max-w-3xl px-4 py-10 sm:px-6 lg:py-14">
      <header className="mb-10 space-y-3">
        <p className="font-mono text-xs font-medium uppercase tracking-wide text-muted-foreground">
          Methodology · IsGovOnline
        </p>
        <h1 className="text-4xl font-semibold leading-none tracking-[-0.05em] text-foreground sm:text-5xl">
          How status is measured
        </h1>
        <p className="text-base text-muted-foreground">
          Everything here is independently measured from a Nepal vantage point
          and persisted to a time-series database.
        </p>
      </header>

      <div className="space-y-8">
        <section className="space-y-2">
          <h2 className="flex items-center gap-2 text-lg font-semibold tracking-[-0.02em] text-foreground">
            <Activity className={SECTION_ICON} aria-hidden />
            Probing
          </h2>
          <div className="space-y-3 text-sm leading-relaxed text-muted-foreground">
            <p>
              Every 5 minutes, from a machine on a Nepal network, each service
              is fetched over HTTPS. The result is classified as operational
              (responds normally under 3.5s), degraded (slow, firewall-blocked
              with 403, or rate-limited with 429), or down (5xx, connection
              refused, or no response).
            </p>
            <p>
              A &quot;down&quot; result is confirmed with a second probe before
              it is recorded, which cuts false alarms on flaky .np
              infrastructure. Deep checks — a key API or login page, where
              configured — are probed too, and the worse result wins.
            </p>
          </div>
        </section>

        <section className="space-y-2">
          <h2 className="flex items-center gap-2 text-lg font-semibold tracking-[-0.02em] text-foreground">
            <Database className={SECTION_ICON} aria-hidden />
            Recording
          </h2>
          <div className="space-y-3 text-sm leading-relaxed text-muted-foreground">
            <p>
              Probe results are aggregated into hourly buckets that store the
              worst status seen that hour, the number of samples, and summed
              response times — never a fabricated average. An hour counts as
              down if any check in that hour failed, so a one-minute blip is
              never hidden. History is retained for 90 days.
            </p>
            <p>
              Uptime percentages are honest: they only divide by hours that
              have recorded data. If the monitor itself was unreachable, those
              hours render as grey &quot;no data&quot; rather than counting as
              up. When the database is down, the dashboard says so instead of
              pretending.
            </p>
          </div>
        </section>

        <section className="space-y-2">
          <h2 className="flex items-center gap-2 text-lg font-semibold tracking-[-0.02em] text-foreground">
            <ShieldCheck className={SECTION_ICON} aria-hidden />
            Caveats
          </h2>
          <div className="space-y-3 text-sm leading-relaxed text-muted-foreground">
            <p>
              Status is vantage-relative. A service that works from your ISP
              may look down from our Nepal probe (or the reverse) — many .np
              portals filter foreign traffic or reject non-browser clients. We
              report what we measure, at the location we measure it from.
            </p>
          </div>
        </section>
      </div>
    </main>
  );
}
