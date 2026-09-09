"use client";

import { useMemo, useState } from "react";

import {
  useServiceHistory,
  useServiceHourlyHistory,
  type DailyHistory,
  type HourlyBucket,
} from "@/features/services-monitor/api/useServiceHistory";
import { STATUS_META } from "@/features/services-monitor/components/status-meta";
import type {
  HealthStatus,
  UptimeSlot,
} from "@/features/services-monitor/types";
import { cn, formatLatency } from "@/lib/utils";

const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * HOUR_MS;
const TZ = "Asia/Kathmandu";

const RANGES = [
  { key: "24h", label: "24 hours", days: 1, hourly: true },
  { key: "7d", label: "7 days", days: 7, hourly: true },
  { key: "30d", label: "30 days", days: 30, hourly: false },
  { key: "90d", label: "90 days", days: 90, hourly: false },
] as const;

type RangeKey = (typeof RANGES)[number]["key"];

interface ServiceHistoryRangeProps {
  serviceId: string;
  serviceName: string;
  initialSlots: UptimeSlot[];
}

function statusClass(status: HealthStatus | null): string {
  return status ? STATUS_META[status].bar : "bg-muted";
}

function ktParts(date: Date): { dayKey: string; hour: number } {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: TZ,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    hourCycle: "h23",
  }).formatToParts(date);
  const get = (type: string) =>
    parts.find((p) => p.type === type)?.value ?? "";
  return {
    dayKey: `${get("year")}-${get("month")}-${get("day")}`,
    hour: Number(get("hour")),
  };
}

function ktStamp(iso: string): string {
  const date = new Date(iso);
  const dateLabel = date.toLocaleDateString("en-US", {
    timeZone: TZ,
    month: "short",
    day: "numeric",
  });
  const timeLabel = date.toLocaleTimeString("en-GB", {
    timeZone: TZ,
    hour: "2-digit",
    minute: "2-digit",
  });
  return `${dateLabel}, ${timeLabel}`;
}

function weekdayDayLabel(dayKey: string): string {
  return new Date(`${dayKey}T00:00:00Z`)
    .toLocaleDateString("en-US", { timeZone: "UTC", weekday: "short", day: "numeric" })
    .replace(",", "");
}

function dayPosition(dayKey: string): { row: number; col: number } {
  const [year, month, day] = dayKey.split("-").map(Number);
  const epochDay = Math.floor(Date.UTC(year, month - 1, day) / DAY_MS);
  return {
    row: (epochDay + 3) % 7,
    col: Math.floor((epochDay + 3) / 7),
  };
}

function expandHourWindow(
  buckets: HourlyBucket[] | undefined,
  days: number
): UptimeSlot[] {
  const endBucket = Math.floor(Date.now() / HOUR_MS) * HOUR_MS;
  const count = days * 24;
  const byStart = new Map(buckets?.map((b) => [Date.parse(b.bucket), b]) ?? []);
  return Array.from({ length: count }, (_, i) => {
    const ts = endBucket - (count - 1 - i) * HOUR_MS;
    const bucket = byStart.get(ts);
    return {
      timestamp: new Date(ts).toISOString(),
      status: bucket?.status ?? null,
      responseTime: bucket?.averageResponseTime ?? null,
    };
  });
}

const HOUR_TICKS = [0, 6, 12, 18, 23];

function HourGrid({
  cells,
  serviceName,
}: {
  cells: UptimeSlot[];
  serviceName: string;
}) {
  const rows = useMemo(() => {
    const byDay = new Map<string, UptimeSlot[]>();
    for (const cell of cells) {
      const { dayKey } = ktParts(new Date(cell.timestamp));
      const list = byDay.get(dayKey);
      if (list) list.push(cell);
      else byDay.set(dayKey, [cell]);
    }
    return [...byDay.entries()].sort((a, b) => a[0].localeCompare(b[0]));
  }, [cells]);

  const today = useMemo(() => ktParts(new Date()).dayKey, []);

  return (
    <div
      role="img"
      aria-label={`Hourly heatmap for ${serviceName}, one square per hour, rows are days, columns are the 24 hours`}
      className="overflow-x-auto pb-1"
    >
      <div
        className="mb-1 grid gap-[2px]"
        style={{ gridTemplateColumns: "44px repeat(24, minmax(9px, 1fr))" }}
      >
        <span aria-hidden />
        {HOUR_TICKS.map((hour) => (
          <span
            key={hour}
            aria-hidden
            className="text-center font-mono text-[9px] text-muted-foreground"
            style={{ gridColumn: hour + 2 }}
          >
            {String(hour).padStart(2, "0")}
          </span>
        ))}
      </div>

      <div className="space-y-[3px]">
        {rows.map(([dayKey, dayCells]) => {
          const hourCells = new Map(
            dayCells.map((c) => [ktParts(new Date(c.timestamp)).hour, c])
          );
          return (
            <div
              key={dayKey}
              className="grid gap-[2px]"
              style={{ gridTemplateColumns: "44px repeat(24, minmax(9px, 1fr))" }}
            >
              <span className="self-center pr-1 text-right font-mono text-[9px] uppercase tracking-wide text-muted-foreground">
                {dayKey === today ? "Today" : weekdayDayLabel(dayKey)}
              </span>
              {Array.from({ length: 24 }, (_, hour) => {
                const cell = hourCells.get(hour);
                if (!cell) return null;
                const meta = cell.status ? STATUS_META[cell.status] : null;
                return (
                  <div
                    key={hour}
                    title={`${ktStamp(cell.timestamp)} — ${
                      meta
                        ? meta.label +
                          (cell.responseTime !== null
                            ? ` (${formatLatency(cell.responseTime)})`
                            : "")
                        : "No data"
                    }`}
                    aria-hidden
                    className={cn(
                      "aspect-square w-full rounded-[3px]",
                      statusClass(cell.status)
                    )}
                    style={{ gridColumn: hour + 2 }}
                  />
                );
              })}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function DayCalendar({
  history,
  days,
  serviceName,
}: {
  history: DailyHistory[];
  days: number;
  serviceName: string;
}) {
  const { cells, minCol } = useMemo(() => {
    const now = new Date();
    const todayStart = Date.UTC(
      now.getUTCFullYear(),
      now.getUTCMonth(),
      now.getUTCDate()
    );
    const byDay = new Map(history.map((d) => [d.day, d]));
    const dates = Array.from(
      { length: days },
      (_, i) =>
        new Date(todayStart - (days - 1 - i) * DAY_MS)
          .toISOString()
          .slice(0, 10)
    );
    const cells = dates.map((day) => ({
      day,
      position: dayPosition(day),
      record: byDay.get(day) ?? null,
    }));
    const minCol = Math.min(...cells.map((c) => c.position.col));
    return { cells, minCol };
  }, [history, days]);

  const weeks = useMemo(() => {
    const maxCol = Math.max(...cells.map((c) => c.position.col));
    return maxCol - minCol + 1;
  }, [cells, minCol]);

  const months = useMemo(() => {
    const grouped = new Map<string, { start: number; end: number }>();
    for (const { day, position } of cells) {
      const month = day.slice(0, 7);
      const entry = grouped.get(month);
      if (entry) {
        entry.start = Math.min(entry.start, position.col);
        entry.end = Math.max(entry.end, position.col);
      } else {
        grouped.set(month, { start: position.col, end: position.col });
      }
    }
    return [...grouped.entries()].sort((a, b) => a[0].localeCompare(b[0]));
  }, [cells]);

  const WEEKS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
  const GUTTER_ROWS = [0, 2, 4];

  return (
    <div
      role="img"
      aria-label={`GitHub-style calendar for ${serviceName} over the last ${days} days, one square per day`}
      className="overflow-x-auto pb-1"
    >
      <div
        className="mb-1 grid gap-[3px]"
        style={{ gridTemplateColumns: `44px repeat(${weeks}, 12px)` }}
      >
        <span aria-hidden />
        {months.map(([month, range]) => (
          <span
            key={month}
            aria-hidden
            className="overflow-hidden font-mono text-[9px] leading-3 text-muted-foreground"
            style={{
              gridColumnStart: range.start - minCol + 2,
              gridColumnEnd: range.end - minCol + 3,
            }}
          >
            {new Date(`${month}-01T00:00:00Z`)
              .toLocaleDateString("en-US", { timeZone: "UTC", month: "short" })}
          </span>
        ))}
      </div>

      <div className="space-y-[3px]">
        {WEEKS.map((label, rowIndex) => (
          <div
            key={label}
            className="grid gap-[3px]"
            style={{ gridTemplateColumns: `44px repeat(${weeks}, 12px)` }}
          >
            <span
              aria-hidden
              className={cn(
                "self-center pr-1 text-right font-mono text-[9px] uppercase tracking-wide",
                GUTTER_ROWS.includes(rowIndex)
                  ? "text-muted-foreground"
                  : "text-transparent"
              )}
            >
              {label}
            </span>
            {cells
              .filter((cell) => cell.position.row === rowIndex)
              .map(({ day, position, record }) => {
                const meta = record ? STATUS_META[record.status] : null;
                const col = position.col - minCol + 2;
                return (
                  <div
                    key={day}
                    title={
                      record
                        ? `${day} · ${Math.round(record.uptime * 100)}% up · ${
                            meta?.label
                          }${
                            record.coverage < 1
                              ? ` · ${Math.round(record.coverage * 24)}h recorded`
                              : ""
                          }`
                        : `${day} — no data`
                    }
                    aria-hidden
                    className={cn(
                      "aspect-square w-[12px] rounded-[3px]",
                      record ? statusClass(record.status) : "bg-muted"
                    )}
                    style={{ gridColumn: col }}
                  />
                );
              })}
          </div>
        ))}
      </div>
    </div>
  );
}

function RangeSwitch({
  value,
  onChange,
}: {
  value: RangeKey;
  onChange: (key: RangeKey) => void;
}) {
  return (
    <div
      role="group"
      aria-label="History range"
      className="flex items-center gap-0.5 rounded-md border border-border p-0.5"
    >
      {RANGES.map((range) => (
        <button
          key={range.key}
          type="button"
          aria-pressed={range.key === value}
          onClick={() => onChange(range.key)}
          className={cn(
            "rounded-[4px] px-2 py-1 font-mono text-xs transition-colors",
            range.key === value
              ? "bg-muted text-foreground"
              : "text-muted-foreground hover:text-foreground"
          )}
        >
          {range.key}
        </button>
      ))}
    </div>
  );
}

export function ServiceHistoryRange({
  serviceId,
  serviceName,
  initialSlots,
}: ServiceHistoryRangeProps) {
  const [rangeKey, setRangeKey] = useState<RangeKey>("24h");
  const range = RANGES.find((r) => r.key === rangeKey) ?? RANGES[0];

  const dayDays = range.hourly ? null : range.days;
  const daily = useServiceHistory(dayDays ? serviceId : null, dayDays ?? 30);
  const hourDays = range.hourly && range.days > 1 ? range.days : null;
  const hourly = useServiceHourlyHistory(
    hourDays ? serviceId : null,
    hourDays ?? 7
  );

  const cells = useMemo(() => {
    if (!range.hourly) return [];
    if (range.days === 1) return initialSlots;
    return hourly.data ? expandHourWindow(hourly.data, range.days) : [];
  }, [range, initialSlots, hourly.data]);

  const summary = useMemo(() => {
    if (range.hourly) {
      const recorded = cells.filter((c) => c.status !== null);
      const operational = recorded.filter(
        (c) => c.status === "operational"
      ).length;
      const down = recorded.filter((c) => c.status === "down").length;
      const degraded = recorded.filter((c) => c.status === "degraded").length;
      const uptime =
        recorded.length > 0 ? (operational / recorded.length) * 100 : null;
      const parts: string[] = [
        uptime === null ? "No recorded data" : `${uptime.toFixed(1)}% uptime`,
      ];
      if (degraded > 0) parts.push(`${degraded}h degraded`);
      if (down > 0) parts.push(`${down}h down`);
      return parts.join(" · ");
    }

    const present = daily.data ?? [];
    if (present.length === 0) return "No recorded data";
    const downDays = present.filter((d) => d.status === "down").length;
    const degradedDays = present.filter(
      (d) => d.status === "degraded"
    ).length;
    const uptime =
      (present.reduce((sum, d) => sum + d.uptime, 0) / present.length) * 100;
    const parts = [`${uptime.toFixed(1)}% uptime`, `${present.length} days`];
    if (degradedDays > 0) parts.push(`${degradedDays}d degraded`);
    if (downDays > 0) parts.push(`${downDays}d down`);
    return parts.join(" · ");
  }, [range, cells, daily.data]);

  const loading =
    range.hourly
      ? range.days > 1 && !hourly.data && hourly.isPending
      : !daily.data && daily.isPending;

  return (
    <div className="mt-5 space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
        <RangeSwitch value={rangeKey} onChange={setRangeKey} />
        <p className="font-mono text-xs text-muted-foreground">{summary}</p>
      </div>

      {loading ? (
        <p className="py-1.5 text-xs text-muted-foreground">
          Loading {range.label.toLowerCase()} history…
        </p>
      ) : range.hourly ? (
        cells.length > 0 ? (
          <HourGrid cells={cells} serviceName={serviceName} />
        ) : null
      ) : (
        <DayCalendar
          history={daily.data ?? []}
          days={range.days}
          serviceName={serviceName}
        />
      )}

      <p className="text-xs text-muted-foreground">
        {range.hourly
          ? `Square heatmap · rows are days, columns are the 24 hours (shown in Asia/Kathmandu time) · worst status per hour · grey = no data.`
          : `GitHub-style calendar · each square is one day coloured by its worst status · rows are Mon–Sun · grey = no recorded data.`}
      </p>
    </div>
  );
}
