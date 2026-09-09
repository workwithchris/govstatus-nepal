"use client";

import Link from "next/link";

import { Skeleton } from "@/components/ui/skeleton";
import { useServiceHistory } from "@/features/services-monitor/api/useServiceHistory";
import { cn } from "@/lib/utils";

function Stat({
  label,
  value,
  valueClass,
}: {
  label: string;
  value: string;
  valueClass?: string;
}) {
  return (
    <div className="rounded-lg border border-border bg-background p-3">
      <p className="font-mono text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
        {label}
      </p>
      <p className={cn("mt-1 text-sm font-semibold text-foreground", valueClass)}>
        {value}
      </p>
    </div>
  );
}

function uptimeTone(pct: number): string {
  return pct >= 99
    ? "text-emerald-600 dark:text-emerald-400"
    : pct >= 95
      ? "text-amber-600 dark:text-amber-400"
      : "text-rose-600 dark:text-rose-400";
}

/**
 * 90-day reliability summary for a single service, read from the daily history
 * rollup. Kept client-side so the status page itself never pays for an extra
 * D1 read per request.
 */
export function ReliabilitySummary({
  serviceId,
}: {
  serviceId: string;
}) {
  const { data: history, isLoading } = useServiceHistory(serviceId, 90);

  return (
    <section className="mt-10 space-y-4" aria-labelledby="reliability-heading">
      <div className="flex flex-wrap items-end justify-between gap-2">
        <h2
          id="reliability-heading"
          className="text-xl font-semibold tracking-[-0.02em] text-foreground"
        >
          Reliability · last 90 days
        </h2>
        <Link
          href="/methodology"
          className="text-xs text-muted-foreground underline-offset-2 hover:text-foreground hover:underline"
        >
          How this is measured →
        </Link>
      </div>

      {isLoading ? (
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          {Array.from({ length: 4 }, (_, i) => (
            <div
              key={i}
              className="rounded-lg border border-border bg-background p-3"
            >
              <Skeleton className="h-2.5 w-20" />
              <Skeleton className="mt-2 h-4 w-14" />
            </div>
          ))}
        </div>
      ) : !history || history.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          No recorded history for the last 90 days yet — the record grows as
          probes persist. Grey sections on the timeline are hours without data.
        </p>
      ) : null}

      {history && history.length > 0 && (
        <>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            <Stat
              label="Uptime"
              value={`${(
                (history.reduce((sum, d) => sum + d.uptime, 0) /
                  history.length) *
                100
              ).toFixed(1)}%`}
              valueClass={uptimeTone(
                (history.reduce((sum, d) => sum + d.uptime, 0) /
                  history.length) *
                  100
              )}
            />
            <Stat
              label="Days with downtime"
              value={`${history.filter((d) => d.status === "down").length}`}
              valueClass={
                history.some((d) => d.status === "down")
                  ? "text-rose-600 dark:text-rose-400"
                  : undefined
              }
            />
            <Stat
              label="Days degraded"
              value={`${history.filter((d) => d.status === "degraded").length}`}
              valueClass={
                history.some((d) => d.status === "degraded")
                  ? "text-amber-600 dark:text-amber-400"
                  : undefined
              }
            />
            <Stat
              label="Avg response"
              value={formatAvgLatency(history)}
            />
          </div>
          <p className="text-xs text-muted-foreground">
            Over {history.length} days with recorded data. An hour counts as
            down if any check failed in it, and days with no data are never
            counted as up.
          </p>
        </>
      )}
    </section>
  );
}

function formatAvgLatency(
  history: NonNullable<ReturnType<typeof useServiceHistory>["data"]>
): string {
  const times = history
    .map((d) => d.averageResponseTime)
    .filter((ms): ms is number => ms !== null);
  if (times.length === 0) return "—";
  const avg = times.reduce((sum, ms) => sum + ms, 0) / times.length;
  return `${Math.round(avg)} ms`;
}
