"use client";

import { useMemo, useState, useSyncExternalStore } from "react";
import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import {
  useServiceHistory,
  useServiceHourlyHistory,
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

const AXIS_TICK = { fontSize: 10, fill: "var(--muted-foreground)" };

const TOOLTIP_STYLE = {
  background: "var(--card)",
  border: "1px solid var(--border)",
  borderRadius: 10,
  fontSize: 12,
  color: "var(--foreground)",
} as const;

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

/** One coloured unit on the status band, with its matching latency sample. */
interface UnitPoint {
  id: string;
  status: HealthStatus | null;
  title: string;
  /** Short x-axis label ("14:45" for hours, "Sep 8" for days). */
  time: string;
  /** Average response time in ms; null when nothing was recorded. */
  ms: number | null;
}

function statusClass(status: HealthStatus | null): string {
  return status ? STATUS_META[status].bar : "bg-muted";
}

function ktTime(iso: string): string {
  return new Date(iso).toLocaleTimeString("en-GB", {
    timeZone: TZ,
    hour: "2-digit",
    minute: "2-digit",
  });
}

function ktStamp(iso: string): string {
  const date = new Date(iso);
  const dateLabel = date.toLocaleDateString("en-US", {
    timeZone: TZ,
    month: "short",
    day: "numeric",
  });
  return `${dateLabel}, ${ktTime(iso)}`;
}

const OUTCOME_LABELS: Record<string, string> = {
  ok: "ok",
  slow: "slow",
  blocked: "403 blocked",
  rateLimited: "429 rate-limited",
  http5xx: "5xx error",
  network: "network failure",
};

function formatOutcomes(
  outcomes: NonNullable<HourlyBucket["outcomes"]>
): string | null {
  const parts: string[] = [];
  for (const key of Object.keys(outcomes)) {
    const count = outcomes[key as keyof typeof outcomes];
    if (count > 0) parts.push(`${count} ${OUTCOME_LABELS[key] ?? key}`);
  }
  return parts.length > 0 ? parts.join(", ") : null;
}

function utcDateLabel(dayKey: string): string {
  return new Date(`${dayKey}T00:00:00Z`).toLocaleDateString("en-US", {
    timeZone: "UTC",
    month: "short",
    day: "numeric",
  });
}

function utcDateLong(dayKey: string): string {
  return new Date(`${dayKey}T00:00:00Z`).toLocaleDateString("en-US", {
    timeZone: "UTC",
    weekday: "short",
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

/** Calendar date keys (YYYY-MM-DD, UTC) for the last `days` days incl. today. */
function utcDayAxis(days: number): string[] {
  const now = new Date();
  const todayStart = Date.UTC(
    now.getUTCFullYear(),
    now.getUTCMonth(),
    now.getUTCDate()
  );
  return Array.from(
    { length: days },
    (_, i) =>
      new Date(todayStart - (days - 1 - i) * DAY_MS).toISOString().slice(0, 10)
  );
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

function StatusBand({
  points,
  unit,
  serviceName,
}: {
  points: UnitPoint[];
  unit: string;
  serviceName: string;
}) {
  // Sparse ranges (per-hour) get visible gaps; long per-day runs keep a
  // hairline so the bar stays readable without turning into noise.
  const gap = points.length <= 31 ? "gap-[2px]" : "gap-px";
  return (
    <div
      role="img"
      aria-label={`${serviceName}: status strip, one segment per ${unit}, worst status in each`}
      className={cn("flex h-5 items-stretch overflow-hidden rounded-md", gap)}
    >
      {points.map((point) => (
        <div
          key={point.id}
          title={point.title}
          aria-hidden
          className={cn("h-full min-w-0 flex-1", statusClass(point.status))}
        />
      ))}
    </div>
  );
}

function LatencyChart({
  points,
  unit,
}: {
  points: UnitPoint[];
  unit: string;
}) {
  const interval = Math.max(0, Math.floor(points.length / 7));
  return (
    <div className="h-40 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart
          data={points}
          margin={{ top: 6, right: 4, left: 0, bottom: 0 }}
        >
          <defs>
            <linearGradient id="historyLatencyFill" x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor="#0070f3" stopOpacity={0.2} />
              <stop offset="95%" stopColor="#0070f3" stopOpacity={0} />
            </linearGradient>
          </defs>
          <CartesianGrid
            strokeDasharray="3 3"
            stroke="var(--border)"
            vertical={false}
          />
          <XAxis
            dataKey="time"
            tick={AXIS_TICK}
            tickLine={false}
            axisLine={false}
            interval={interval}
            tickMargin={6}
          />
          <YAxis
            tick={AXIS_TICK}
            tickLine={false}
            axisLine={false}
            width={44}
            unit=" ms"
          />
          <Tooltip
            contentStyle={TOOLTIP_STYLE}
            labelStyle={{ color: "var(--muted-foreground)" }}
            formatter={(value) => [
              `${value} ms`,
              `Avg response · per ${unit}`,
            ]}
          />
          <Area
            type="monotone"
            dataKey="ms"
            stroke="#0070f3"
            strokeWidth={2}
            fill="url(#historyLatencyFill)"
            dot={false}
            activeDot={{ r: 3 }}
          />
        </AreaChart>
      </ResponsiveContainer>
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

function LegendNote({ unit }: { unit: string }) {
  const items = [
    { status: "operational" as const, label: "Operational" },
    { status: "degraded" as const, label: "Degraded" },
    { status: "down" as const, label: "Down" },
  ];
  return (
    <p className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-muted-foreground">
      <span>
        Worst status per {unit}:
      </span>
      {items.map(({ status, label }) => (
        <span key={status} className="inline-flex items-center gap-1.5">
          <span
            className={cn("size-1.5 rounded-full", STATUS_META[status].dot)}
            aria-hidden
          />
          {label}
        </span>
      ))}
      <span className="inline-flex items-center gap-1.5">
        <span className="size-1.5 rounded-full bg-muted" aria-hidden />
        No data
      </span>
      <span className="inline-flex items-center gap-1.5">
        <span className="h-0.5 w-4 rounded-full bg-[#0070f3]" aria-hidden />
        Avg response time
      </span>
    </p>
  );
}

const emptySubscribe = () => () => {};

/** True once rendered in the browser (false during SSR/hydration). */
function useIsClient(): boolean {
  return useSyncExternalStore(
    emptySubscribe,
    () => true,
    () => false
  );
}

export function ServiceHistoryRange({
  serviceId,
  serviceName,
  initialSlots,
}: ServiceHistoryRangeProps) {
  const [rangeKey, setRangeKey] = useState<RangeKey>("24h");
  const isClient = useIsClient();
  const range = RANGES.find((r) => r.key === rangeKey) ?? RANGES[0];

  const dayDays = range.hourly ? null : range.days;
  const daily = useServiceHistory(dayDays ? serviceId : null, dayDays ?? 30);
  const hourDays = range.hourly && range.days > 1 ? range.days : null;
  const hourly = useServiceHourlyHistory(
    hourDays ? serviceId : null,
    hourDays ?? 7
  );

  const hourCells = useMemo<UptimeSlot[]>(() => {
    if (!range.hourly) return [];
    if (range.days === 1) return initialSlots;
    return hourly.data ? expandHourWindow(hourly.data, range.days) : [];
  }, [range, initialSlots, hourly.data]);

  const points = useMemo<UnitPoint[]>(() => {
    if (range.hourly) {
      const outcomeByStart = new Map(
        (hourly.data ?? []).map((b) => [Date.parse(b.bucket), b.outcomes])
      );
      return hourCells.map((cell) => {
        const meta = cell.status ? STATUS_META[cell.status] : null;
        const outcomes = outcomeByStart.get(Date.parse(cell.timestamp));
        const outcomeText = outcomes ? formatOutcomes(outcomes) : null;
        const title = `${ktStamp(cell.timestamp)} — ${
          meta
            ? meta.label +
              (cell.responseTime !== null
                ? ` (${formatLatency(cell.responseTime)})`
                : "")
            : "No data"
        }${outcomeText ? ` · ${outcomeText}` : ""}`;
        return {
          id: cell.timestamp,
          status: cell.status,
          title,
          time: ktTime(cell.timestamp),
          ms: cell.responseTime,
        };
      });
    }

    const byDay = new Map((daily.data ?? []).map((d) => [d.day, d]));
    return utcDayAxis(range.days).map((day) => {
      const record = byDay.get(day) ?? null;
      const title = record
        ? `${utcDateLong(day)} · ${Math.round(record.uptime * 100)}% up · ${
            STATUS_META[record.status].label
          }${
            record.coverage < 1
              ? ` · ${Math.round(record.coverage * 24)}h recorded`
              : ""
          }`
        : `${day} — no data`;
      return {
        id: day,
        status: record?.status ?? null,
        title,
        time: utcDateLabel(day),
        ms: record?.averageResponseTime ?? null,
      };
    });
  }, [range, hourCells, hourly.data, daily.data]);

  const summary = useMemo(() => {
    if (range.hourly) {
      const recorded = points.filter((p) => p.status !== null);
      const operational = recorded.filter(
        (p) => p.status === "operational"
      ).length;
      const down = recorded.filter((p) => p.status === "down").length;
      const degraded = recorded.filter((p) => p.status === "degraded").length;
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
  }, [range, points, daily.data]);

  const loading =
    range.hourly
      ? range.days > 1 && !hourly.data && hourly.isPending
      : !daily.data && daily.isPending;

  const hasLatency = points.some((p) => p.ms !== null);
  const unit = range.hourly ? "hour" : "day";

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
      ) : points.length > 0 ? (
        <div className="space-y-1.5">
          {hasLatency ? (
            isClient ? (
              <LatencyChart points={points} unit={unit} />
            ) : (
              <div aria-hidden className="h-40" />
            )
          ) : (
            <p className="pt-1 text-xs text-muted-foreground">
              No response-time data recorded for this period yet.
            </p>
          )}
          <StatusBand points={points} unit={unit} serviceName={serviceName} />
          <LegendNote unit={unit} />
        </div>
      ) : null}
    </div>
  );
}
