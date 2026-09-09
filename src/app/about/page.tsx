import type { Metadata } from "next";
import { Activity, Eye, MapPin, ShieldCheck } from "lucide-react";

import { STATUS_META } from "@/features/services-monitor/components/status-meta";

export const metadata: Metadata = {
  title: "About",
  description:
    "IsGovOnline exists — an independent uptime tracker for Nepal's digital public services, and how it works.",
};

const SECTION_ICON = "size-4 shrink-0 text-muted-foreground";

export default function AboutPage() {
  return (
    <main className="mx-auto w-full max-w-3xl px-4 py-10 sm:px-6 lg:py-14">
      <header className="mb-10 space-y-3">
        <p className="font-mono text-xs font-medium uppercase tracking-wide text-muted-foreground">
          About · IsGovOnline
        </p>
        <h1 className="text-4xl font-semibold leading-none tracking-[-0.05em] text-foreground sm:text-5xl">
          Why this exists
        </h1>
        <p className="text-base text-muted-foreground">
          Digital government services are becoming essential infrastructure in
          Nepal — but when one stops working, there&apos;s no public record of
          it. This project makes that invisible failure visible.
        </p>
      </header>

      <div className="space-y-8">
        <section className="space-y-2">
          <h2 className="flex items-center gap-2 text-lg font-semibold tracking-[-0.02em] text-foreground">
            <Activity className={SECTION_ICON} aria-hidden />
            The problem
          </h2>
          <div className="space-y-3 text-sm leading-relaxed text-muted-foreground">
            <p>
              Passport booking, tax filing, driving licenses, exam results,
              land records — these aren&apos;t optional extras, they&apos;re how
              citizens interact with the state. When the passport portal is
              down, people don&apos;t have a convenient alternative; they wait.
            </p>
            <p>
              Yet there&apos;s no public, neutral record of whether these
              systems are up, how often they fail, or which ones are
              chronically unreliable. Government bodies publish their own
              notices, but an independent, continuously-measured view helps
              citizens plan around outages and helps agencies see their own
              reliability honestly.
            </p>
          </div>
        </section>

        <section className="space-y-2">
          <h2 className="flex items-center gap-2 text-lg font-semibold tracking-[-0.02em] text-foreground">
            <Eye className={SECTION_ICON} aria-hidden />
            What this project does
          </h2>
          <div className="space-y-3 text-sm leading-relaxed text-muted-foreground">
            <p>
              Every 5 minutes, from a Nepal vantage point, we check 145
              government portals and public services — ministries, citizen
              services, banks, universities, municipalities, provinces — and
              record whether each one is operational, degraded, or down. The
              history accumulates into hourly and daily records, so you can see
              not just what&apos;s down right now, but which services are
              reliably up over weeks and months.
            </p>
            <p>
              It&apos;s an independent tracker. We&apos;re not affiliated with
              any government body, and we don&apos;t host any of the services we
              monitor.
            </p>
          </div>
        </section>

        <section className="space-y-2">
          <h2 className="flex items-center gap-2 text-lg font-semibold tracking-[-0.02em] text-foreground">
            <MapPin className={SECTION_ICON} aria-hidden />
            🇳🇵 How status is measured
          </h2>
          <div className="space-y-3 text-sm leading-relaxed text-muted-foreground">
            <p>
              Status is measured from our probe&apos;s vantage point in Nepal:
            </p>
            <div className="space-y-2">
              {(["operational", "degraded", "down"] as const).map((status) => (
                <div key={status} className="flex items-start gap-3">
                  <span
                    className={`mt-1.5 size-2 shrink-0 rounded-full ${STATUS_META[status].dot}`}
                    aria-hidden
                  />
                  <p>
                    <span className="font-semibold text-foreground">
                      {STATUS_META[status].label}
                    </span>
                    {" — "}
                    {status === "operational" &&
                      "responding normally under 3.5s."}
                    {status === "degraded" &&
                      "responding slowly, blocked by a firewall (403), or rate-limited (429)."}
                    {status === "down" &&
                      "unreachable — server error, connection refused, or no response."}
                  </p>
                </div>
              ))}
            </div>
            <p className="text-xs text-muted-foreground">
              A service that works from your ISP may show as down from our
              vantage point (or the reverse) — many .np portals filter traffic
              by region. We report what we measure, honestly.
            </p>
          </div>
        </section>

        <section className="space-y-2">
          <h2 className="flex items-center gap-2 text-lg font-semibold tracking-[-0.02em] text-foreground">
            <ShieldCheck className={SECTION_ICON} aria-hidden />
            Data honesty
          </h2>
          <div className="space-y-3 text-sm leading-relaxed text-muted-foreground">
            <p>
              Uptime percentages only count hours with recorded data. If the
              monitor itself was offline, those hours show as grey
              &quot;no data&quot; slots rather than being counted as up — we
              never fabricate availability. When the underlying database is
              unreachable, the dashboard says so instead of pretending.
            </p>
          </div>
        </section>

        <section className="space-y-2">
          <h2 className="text-lg font-semibold tracking-[-0.02em] text-foreground">
            The bigger question
          </h2>
          <p className="text-sm leading-relaxed text-muted-foreground">
            Reliability data has a purpose beyond reporting: if it&apos;s public
            and continuous, the people running these services can see their own
            record, and citizens can hold the systems they depend on to a
            standard. A government whose portals are chronically down is a
            government that&apos;s harder to reach — and the first step toward
            fixing that is being able to see it clearly.
          </p>
        </section>
      </div>
    </main>
  );
}