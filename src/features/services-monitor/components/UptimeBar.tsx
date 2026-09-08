"use client";

import { STATUS_META } from "@/features/services-monitor/components/status-meta";
import type { ServiceHealth } from "@/features/services-monitor/types";
import { cn, decodeHistory, formatHour } from "@/lib/utils";

interface UptimeBarProps {
  service: ServiceHealth;
  className?: string;
}

/**
 * 24-segment hourly uptime bar with hover tooltips.
 */
export function UptimeBar({ service, className }: UptimeBarProps) {
  const slots = decodeHistory(service.checkedAt, service.history, service.latencies);
  return (
    <div
      className={cn("flex gap-[3px]", className)}
      role="img"
      aria-label={`24-hour uptime history for ${service.name}`}
    >
      {slots.map((slot) => {
        const meta = slot.status ? STATUS_META[slot.status] : null;
        return (
          <div
            key={slot.timestamp}
            title={`${formatHour(slot.timestamp)} — ${
              meta
                ? meta.label +
                  (slot.responseTime !== null ? ` (${slot.responseTime} ms)` : "")
                : "No data"
            }`}
            className={cn(
              "h-full flex-1 rounded-[2px]",
              meta ? meta.bar : "bg-muted"
            )}
          />
        );
      })}
    </div>
  );
}