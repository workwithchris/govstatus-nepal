import type { Metadata } from "next";
import Link from "next/link";

import { getServicesHealth } from "@/features/services-monitor/server/health-probe";
import { STATUS_META } from "@/features/services-monitor/components/status-meta";
import type { ServiceHealth } from "@/features/services-monitor/types";
import { cn, formatLatency } from "@/lib/utils";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Most & least reliable portals",
  description:
    "Which Nepali government portals are the most and least reliable, ranked by uptime over the last 24 hours.",
};

function downHours(service: ServiceHealth): number {
  let hours = 0;
  for (const char of service.history) if (char === "x") hours += 1;
  return hours;
}

function uptimeTone(pct: number): string {
  return pct >= 99
    ? "text-emerald-600 dark:text-emerald-400"
    : pct >= 95
      ? "text-amber-600 dark:text-amber-400"
      : "text-rose-600 dark:text-rose-400";
}

function RankingList({
  title,
  services,
}: {
  title: string;
  services: ServiceHealth[];
}) {
  return (
    <section>
      <h2 className="text-xl font-semibold tracking-[-0.02em] text-foreground">
        {title}
      </h2>
      <ol className="mt-4 space-y-2">
        {services.map((service, index) => {
          const meta = STATUS_META[service.status];
          return (
            <li key={service.id}>
              <div className="flex items-center gap-3 rounded-lg border border-border bg-card px-4 py-2.5">
                <span className="w-6 shrink-0 font-mono text-xs text-muted-foreground">
                  {index + 1}
                </span>
                <span
                  className={cn("size-2 shrink-0 rounded-full", meta.dot)}
                  aria-hidden
                />
                <Link
                  href={`/status/${service.id}`}
                  className="min-w-0 flex-1 truncate text-sm font-medium text-foreground hover:underline underline-offset-2"
                >
                  {service.name}
                </Link>
                <span className="hidden shrink-0 font-mono text-xs text-muted-foreground sm:inline">
                  {downHours(service)}h down · 24h
                </span>
                <span className="shrink-0 font-mono text-xs text-muted-foreground">
                  {formatLatency(service.responseTime)}
                </span>
                <span
                  className={cn(
                    "w-16 shrink-0 text-right font-mono text-sm font-semibold",
                    uptimeTone(service.uptimePercentage)
                  )}
                >
                  {service.uptimePercentage.toFixed(1)}%
                </span>
              </div>
            </li>
          );
        })}
      </ol>
    </section>
  );
}

export default async function ReliabilityRankingPage() {
  const { services, summary } = await getServicesHealth();

  const worst = [...services]
    .sort(
      (a, b) =>
        a.uptimePercentage - b.uptimePercentage ||
        downHours(b) - downHours(a)
    )
    .slice(0, 10);
  const best = [...services]
    .sort(
      (a, b) =>
        b.uptimePercentage - a.uptimePercentage ||
        downHours(a) - downHours(b)
    )
    .slice(0, 10);

  return (
    <main className="mx-auto w-full max-w-3xl px-4 py-10 sm:px-6 lg:py-14">
      <header className="mb-8 space-y-3">
        <p className="font-mono text-xs font-medium uppercase tracking-wide text-muted-foreground">
          Reliability · IsGovOnline
        </p>
        <h1 className="text-4xl font-semibold leading-none tracking-[-0.05em] text-foreground sm:text-5xl">
          Which portals are reliable?
        </h1>
        <p className="max-w-2xl text-base text-muted-foreground">
          Uptime over the last 24 hours for all {summary.total} monitored
          services. {summary.operational} are operational right now,{" "}
          {summary.degraded} degraded, and {summary.down} down.
        </p>
      </header>

      <div className="space-y-10">
        <RankingList title="Least reliable · last 24h" services={worst} />
        <RankingList title="Most reliable · last 24h" services={best} />
      </div>

      <p className="mt-10 text-sm text-muted-foreground">
        Rankings use the honest 24-hour uptime percentage — hours with no
        recorded data are never counted as up. See how status is measured on the{" "}
        <Link href="/methodology" className="text-primary underline underline-offset-2">
          methodology page
        </Link>
        , or open any portal&apos;s{" "}
        <Link href="/" className="text-primary underline underline-offset-2">
          status page
        </Link>{" "}
        for its full history.
      </p>
    </main>
  );
}
