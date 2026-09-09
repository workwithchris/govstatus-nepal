"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { EmptyState } from "@/features/services-monitor/components/EmptyState";
import { ProbeLoader } from "@/features/services-monitor/components/ProbeLoader";
import { STATUS_META } from "@/features/services-monitor/components/status-meta";
import { UptimeBar } from "@/features/services-monitor/components/UptimeBar";
import { useServiceHistory } from "@/features/services-monitor/api/useServiceHistory";
import { useServicesHealth } from "@/features/services-monitor/api/useServicesHealth";
import type { ServiceHealth } from "@/features/services-monitor/types";
import { cn, formatLatency } from "@/lib/utils";

const MAX_COMPARE = 3;

export function CompareView({
  initialServiceIds,
}: {
  initialServiceIds: string[];
}) {
  const router = useRouter();
  const { data, isLoading } = useServicesHealth();
  const [selectedIds, setSelectedIds] = useState<string[]>(initialServiceIds);

  const selected = useMemo(() => {
    const all = data?.services ?? [];
    return selectedIds
      .map((id) => all.find((s) => s.id === id))
      .filter((s): s is ServiceHealth => !!s);
  }, [selectedIds, data]);

  useEffect(() => {
    const query =
      selectedIds.length > 0 ? `?services=${selectedIds.join(",")}` : "";
    router.replace(`/compare${query}`, { scroll: false });
  }, [router, selectedIds]);

  const add = (id: string) => {
    if (selected.length >= MAX_COMPARE || selected.some((s) => s.id === id))
      return;
    setSelectedIds((ids) => [...ids, id]);
  };
  const remove = (id: string) =>
    setSelectedIds((ids) => ids.filter((existing) => existing !== id));

  const options = (data?.services ?? [])
    .filter((s) => !selected.some((chosen) => chosen.id === s.id))
    .sort((a, b) => a.name.localeCompare(b.name));

  if (isLoading) return <ProbeLoader variant="compact" />;

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-border bg-card px-4 py-3">
        <label className="flex min-w-0 flex-1 items-center gap-2">
          <span className="shrink-0 text-sm text-muted-foreground">Add:</span>
          <select
            aria-label="Add a portal to compare"
            value=""
            onChange={(e) => e.target.value && add(e.target.value)}
            disabled={selected.length >= MAX_COMPARE || options.length === 0}
            className="min-w-0 flex-1 rounded-md border border-border bg-background px-2 py-1.5 text-sm text-foreground outline-none focus:ring-2 focus:ring-ring/50 disabled:opacity-50"
          >
            <option value="">
              {selected.length >= MAX_COMPARE
                ? "Maximum 3 portals selected"
                : "Choose a portal…"}
            </option>
            {options.map((service) => (
              <option key={service.id} value={service.id}>
                {service.name}
              </option>
            ))}
          </select>
        </label>
        <span className="font-mono text-xs text-muted-foreground">
          {selected.length}/{MAX_COMPARE}
        </span>
      </div>

      {selected.length === 0 ? (
        <EmptyState />
      ) : (
        <div className="grid grid-cols-1 gap-4">
          {selected.map((service) => (
            <CompareRow
              key={service.id}
              service={service}
              onRemove={() => remove(service.id)}
            />
          ))}
        </div>
      )}

      <p className="text-xs text-muted-foreground">
        Rows share the same time axis: each strip is the last 24 hours (worst
        status per hour), and the 30-day bars show worst-status-per-day. Status
        pages link each portal&apos;s full history.
      </p>
    </div>
  );
}

function CompareRow({
  service,
  onRemove,
}: {
  service: ServiceHealth;
  onRemove: () => void;
}) {
  const meta = STATUS_META[service.status];
  const { data: history } = useServiceHistory(service.id, 30);

  const longStats = useMemo(() => {
    if (!history || history.length === 0) return null;
    const days = history.length;
    const uptimePct =
      (history.reduce((sum, d) => sum + d.uptime, 0) / days) * 100;
    const downDays = history.filter((d) => d.status === "down").length;
    return { days, uptimePct, downDays };
  }, [history]);

  return (
    <div className="rounded-xl border border-border bg-card p-4 sm:p-5">
      <div className="flex items-start gap-3">
        <span
          className={cn("mt-1.5 size-2 shrink-0 rounded-full", meta.dot)}
          aria-hidden
        />
        <div className="min-w-0 flex-1">
          <p className="truncate text-base font-semibold tracking-[-0.01em] text-foreground">
            {service.name}
          </p>
          <p className="truncate text-xs text-muted-foreground">
            {meta.label} · {formatLatency(service.responseTime)} · HTTP{" "}
            {service.httpStatus ?? "—"}
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-1">
          <Button variant="outline" size="sm" asChild>
            <Link href={`/status/${service.id}`}>Details</Link>
          </Button>
          <Button
            variant="ghost"
            size="icon"
            aria-label={`Remove ${service.name} from comparison`}
            onClick={onRemove}
          >
            <X className="size-4" />
          </Button>
        </div>
      </div>

      <div className="mt-4 flex items-center justify-between gap-3 text-xs text-muted-foreground">
        <span className="font-mono">24h uptime</span>
        <span className="font-mono">
          {service.uptimePercentage.toFixed(1)}%
        </span>
      </div>
      <UptimeBar service={service} className="mt-1.5 h-4" />

      {longStats ? (
        <div className="mt-4">
          <div className="flex items-center justify-between gap-3 text-xs text-muted-foreground">
            <span className="font-mono">30-day reliability</span>
            <span className="font-mono">
              {longStats.uptimePct.toFixed(1)}% up · {longStats.downDays} day
              {longStats.downDays === 1 ? "" : "s"} down
            </span>
          </div>
          <div className="mt-1.5 flex h-5 items-end gap-px">
            {history?.map((day) => (
              <div
                key={day.day}
                title={`${day.day} · ${Math.round(day.uptime * 100)}% up · ${
                  STATUS_META[day.status].label
                }`}
                className={cn(
                  "min-w-0 flex-1 rounded-[2px]",
                  day.status === "down"
                    ? "bg-rose-500"
                    : day.status === "degraded"
                      ? "bg-amber-500"
                      : "bg-emerald-500"
                )}
                style={{ height: Math.max(3, Math.round(day.uptime * 20)) }}
              />
            ))}
          </div>
        </div>
      ) : (
        <p className="mt-3 text-xs text-muted-foreground">
          No 30-day history recorded yet.
        </p>
      )}
    </div>
  );
}
