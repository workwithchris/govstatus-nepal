"use client";

import { Activity, Clock3, Server } from "lucide-react";

import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { STATUS_META } from "@/features/services-monitor/components/status-meta";
import { useServicesHealth } from "@/features/services-monitor/api/useServicesHealth";
import { cn, formatLatency, formatTimeAgo } from "@/lib/utils";

function OverviewSkeleton() {
  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
      {Array.from({ length: 3 }, (_, i) => (
        <Card key={i} className="p-6">
          <Skeleton className="h-3 w-24" />
          <Skeleton className="mt-3 h-8 w-32" />
          <Skeleton className="mt-2 h-3 w-40" />
        </Card>
      ))}
    </div>
  );
}

export function MetricsOverview() {
  const { data, isLoading } = useServicesHealth();

  if (isLoading || !data) {
    return <OverviewSkeleton />;
  }

  const { summary, checkedAt } = data;
  const isNormal = summary.overallStatus === "normal";
  const statusLabel = isNormal
    ? "All Systems Normal"
    : `${summary.down + summary.degraded} Service${
        summary.down + summary.degraded === 1 ? "" : "s"
      } Experiencing Issues`;

  return (
    <section id="metrics" className="space-y-3">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <Card className="p-6">
          <p className="flex items-center gap-1.5 font-mono text-xs font-medium uppercase tracking-wide text-muted-foreground">
            <Server className="size-3.5" aria-hidden />
            Total Monitored
          </p>
          <p className="mt-2 text-[32px] font-semibold leading-10 tracking-[-0.04em] text-foreground">
            {summary.total}
          </p>
          <p className="mt-1 text-sm text-muted-foreground">
            Government portals &amp; public services
          </p>
        </Card>

        <Card className="p-6">
          <p className="flex items-center gap-1.5 font-mono text-xs font-medium uppercase tracking-wide text-muted-foreground">
            <Activity className="size-3.5" aria-hidden />
            System Status
          </p>
          <p
            className={cn(
              "mt-2 flex items-center gap-2 text-lg font-semibold tracking-[-0.02em]",
              isNormal ? "text-emerald-600 dark:text-emerald-400" : "text-rose-600 dark:text-rose-400"
            )}
          >
            <span
              className={cn(
                "size-2 shrink-0 rounded-full",
                isNormal
                  ? STATUS_META.operational.dot
                  : summary.down > 0
                    ? STATUS_META.down.dot
                    : STATUS_META.degraded.dot
              )}
              aria-hidden
            />
            {statusLabel}
          </p>
          <p className="mt-1 text-sm text-muted-foreground">
            {summary.operational} operational · {summary.degraded} degraded ·{" "}
            {summary.down} down
          </p>
        </Card>

        <Card className="p-6">
          <p className="flex items-center gap-1.5 font-mono text-xs font-medium uppercase tracking-wide text-muted-foreground">
            <Clock3 className="size-3.5" aria-hidden />
            Avg Response Time
          </p>
          <p className="mt-2 font-mono text-[32px] font-semibold leading-10 tracking-[-0.04em] text-foreground">
            {formatLatency(summary.averageResponseTime)}
          </p>
          <p className="mt-1 text-sm text-muted-foreground">
            Last checked {formatTimeAgo(checkedAt)}
          </p>
        </Card>
      </div>
    </section>
  );
}
