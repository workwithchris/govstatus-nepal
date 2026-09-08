"use client";

import { STATUS_META } from "@/features/services-monitor/components/status-meta";
import type { UptimeSlot } from "@/features/services-monitor/types";
import { cn, formatHour } from "@/lib/utils";

interface UptimeBarProps {
  slots: UptimeSlot[];
  className?: string;
  label: string;
}

/**
 * 24-segment hourly uptime bar with hover tooltips.
 */
export function UptimeBar({ slots, className, label }: UptimeBarProps) {
  return (
    <div
      className={cn("flex gap-[3px]", className)}
      role="img"
      aria-label={`24-hour uptime history for ${label}`}
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
