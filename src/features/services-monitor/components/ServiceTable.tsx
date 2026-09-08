"use client";

import { ExternalLink } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { CATEGORY_LABELS, STATUS_META } from "@/features/services-monitor/components/status-meta";
import { EmptyState } from "@/features/services-monitor/components/EmptyState";
import { ProbeLoader } from "@/features/services-monitor/components/ProbeLoader";
import { ServiceLogo } from "@/features/services-monitor/components/ServiceLogo";
import { UptimeBar } from "@/features/services-monitor/components/UptimeBar";
import { useFilteredServices } from "@/features/services-monitor/api/useFilteredServices";
import { useDetailStore } from "@/features/services-monitor/store/useDetailStore";
import { useFilterStore } from "@/features/services-monitor/store/useFilterStore";
import type { SortBy } from "@/features/services-monitor/types";
import { cn, formatLatency } from "@/lib/utils";

const SORTABLE_COLUMNS: { key: SortBy; label: string }[] = [
  { key: "name", label: "Service" },
  { key: "status", label: "Status" },
  { key: "latency", label: "Latency" },
];

function SortHeader({ column }: { column: SortBy }) {
  const sortBy = useFilterStore((s) => s.sortBy);
  const setSortBy = useFilterStore((s) => s.setSortBy);
  const active = sortBy === column;
  const label = SORTABLE_COLUMNS.find((c) => c.key === column)?.label;

  return (
    <button
      type="button"
      onClick={() => setSortBy(column)}
      className={cn(
        "inline-flex items-center gap-1 font-mono text-xs font-medium uppercase tracking-wide",
        active ? "text-foreground" : "text-muted-foreground hover:text-foreground"
      )}
    >
      {label}
      {active && (
        <span aria-hidden className="text-[10px] leading-none">
          ▲
        </span>
      )}
    </button>
  );
}

export function ServiceTable() {
  const { services, isLoading } = useFilteredServices();
  const sortBy = useFilterStore((s) => s.sortBy);
  const setSelectedServiceId = useDetailStore((s) => s.setSelectedServiceId);

  if (isLoading) {
    return <ProbeLoader variant="compact" />;
  }

  if (services.length === 0) {
    return <EmptyState />;
  }

  return (
    <div className="overflow-x-auto rounded-xl border border-border bg-card shadow-xs">
      <table className="w-full min-w-[760px] text-left text-sm">
        <thead>
          <tr className="border-b border-border">
            <th className="px-4 py-3" aria-sort={sortBy === "name" ? "ascending" : "none"}>
              <SortHeader column="name" />
            </th>
            <th className="px-4 py-3 font-mono text-xs font-medium uppercase tracking-wide text-muted-foreground">
              Category
            </th>
            <th className="px-4 py-3" aria-sort={sortBy === "status" ? "ascending" : "none"}>
              <SortHeader column="status" />
            </th>
            <th className="px-4 py-3" aria-sort={sortBy === "latency" ? "ascending" : "none"}>
              <SortHeader column="latency" />
            </th>
            <th className="px-4 py-3 font-mono text-xs font-medium uppercase tracking-wide text-muted-foreground">
              Uptime · 24h
            </th>
            <th className="px-4 py-3" aria-label="Open service" />
          </tr>
        </thead>
        <tbody className="divide-y divide-border">
          {services.map((service) => {
            const meta = STATUS_META[service.status];
            return (
              <tr
                key={service.id}
                onClick={() => setSelectedServiceId(service.id)}
                onKeyDown={(e) => {
                  // Don't swallow keys from the nested external link.
                  if (e.target !== e.currentTarget) return;
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    setSelectedServiceId(service.id);
                  }
                }}
                tabIndex={0}
                aria-label={`Show details for ${service.name}`}
                className="cursor-pointer transition-colors hover:bg-accent/50 focus-visible:outline focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ring"
              >
                <td className="px-4 py-3">
                  <div className="flex items-center gap-3">
                    <ServiceLogo url={service.url} name={service.name} />
                    <div className="min-w-0">
                      <p className="truncate font-medium text-foreground">
                        {service.name}
                      </p>
                      <p className="truncate text-xs text-muted-foreground">
                        {service.description}
                      </p>
                    </div>
                  </div>
                </td>
                <td className="px-4 py-3">
                  <Badge variant="secondary">
                    {CATEGORY_LABELS[service.category] ?? service.category}
                  </Badge>
                </td>
                <td className="px-4 py-3">
                  <Badge variant={meta.badge}>
                    <span
                      className={cn("size-1.5 rounded-full", meta.dot)}
                      aria-hidden
                    />
                    {meta.label}
                  </Badge>
                </td>
                <td className="px-4 py-3 font-mono text-xs text-foreground">
                  {formatLatency(service.responseTime)}
                </td>
                <td className="px-4 py-3">
                  <div className="flex items-center gap-3">
                    <UptimeBar
                      service={service}
                      className="h-4 w-36"
                    />
                    <span className="font-mono text-xs text-muted-foreground">
                      {service.uptimePercentage.toFixed(1)}%
                    </span>
                  </div>
                </td>
                <td className="px-4 py-3">
                  <a
                    href={service.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    aria-label={`Open ${service.name} in a new tab`}
                    onClick={(e) => e.stopPropagation()}
                    className="inline-flex size-8 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
                  >
                    <ExternalLink className="size-4" />
                  </a>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
