"use client";

import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import type { ServiceHealth, UptimeSlot } from "@/features/services-monitor/types";
import { decodeHistory, formatHour } from "@/lib/utils";

const AXIS_TICK = {
  fontSize: 11,
  fill: "var(--muted-foreground)",
};

const TOOLTIP_STYLE = {
  background: "var(--card)",
  border: "1px solid var(--border)",
  borderRadius: 12,
  fontSize: 12,
  color: "var(--foreground)",
} as const;

/** Average response time across all services, per hourly bucket. */
export function LatencyTrendChart({ services }: { services: ServiceHealth[] }) {
  const data = buildHourly(services, (samples) => {
    const times = samples
      .map((slot) => slot.responseTime)
      .filter((time): time is number => time !== null);
    return times.length > 0
      ? Math.round(times.reduce((sum, time) => sum + time, 0) / times.length)
      : null;
  });

  return (
    <ResponsiveContainer width="100%" height={240}>
      <AreaChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
        <defs>
          <linearGradient id="latencyFill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="5%" stopColor="#0070f3" stopOpacity={0.25} />
            <stop offset="95%" stopColor="#0070f3" stopOpacity={0} />
          </linearGradient>
        </defs>
        <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
        <XAxis dataKey="time" tick={AXIS_TICK} tickLine={false} axisLine={false} interval={3} />
        <YAxis tick={AXIS_TICK} tickLine={false} axisLine={false} width={48} unit=" ms" />
        <Tooltip
          contentStyle={TOOLTIP_STYLE}
          labelStyle={{ color: "var(--muted-foreground)" }}
          formatter={(value) => [`${value} ms`, "Avg response"]}
        />
        <Area
          type="monotone"
          dataKey="value"
          stroke="#0070f3"
          strokeWidth={2}
          fill="url(#latencyFill)"
          connectNulls
        />
      </AreaChart>
    </ResponsiveContainer>
  );
}

/** Count of down/degraded services per hourly bucket. */
export function IncidentChart({ services }: { services: ServiceHealth[] }) {
  const data = buildHourly(services, (samples) => ({
    down: samples.filter((slot) => slot.status === "down").length,
    degraded: samples.filter((slot) => slot.status === "degraded").length,
  }));

  return (
    <ResponsiveContainer width="100%" height={240}>
      <BarChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
        <XAxis dataKey="time" tick={AXIS_TICK} tickLine={false} axisLine={false} interval={3} />
        <YAxis tick={AXIS_TICK} tickLine={false} axisLine={false} width={32} allowDecimals={false} />
        <Tooltip
          contentStyle={TOOLTIP_STYLE}
          labelStyle={{ color: "var(--muted-foreground)" }}
          cursor={{ fill: "var(--accent)" }}
        />
        <Bar dataKey="down" name="Down" stackId="incidents" fill="#f43f5e" radius={[0, 0, 0, 0]} />
        <Bar dataKey="degraded" name="Degraded" stackId="incidents" fill="#f59e0b" radius={[4, 4, 0, 0]} />
      </BarChart>
    </ResponsiveContainer>
  );
}

/** Average 24h uptime percentage per category. */
export function CategoryUptimeChart({ services }: { services: ServiceHealth[] }) {
  const data = Object.entries(
    services.reduce<Record<string, { sum: number; count: number }>>(
      (groups, service) => {
        groups[service.category] ??= { sum: 0, count: 0 };
        groups[service.category].sum += service.uptimePercentage;
        groups[service.category].count += 1;
        return groups;
      },
      {}
    )
  )
    .map(([category, { sum, count }]) => ({
      category: category.charAt(0).toUpperCase() + category.slice(1),
      value: Math.round((sum / count) * 10) / 10,
    }))
    .sort((a, b) => b.value - a.value);

  return (
    <ResponsiveContainer width="100%" height={240}>
      <BarChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
        <XAxis dataKey="category" tick={AXIS_TICK} tickLine={false} axisLine={false} />
        <YAxis tick={AXIS_TICK} tickLine={false} axisLine={false} width={40} domain={[0, 100]} unit="%" />
        <Tooltip
          contentStyle={TOOLTIP_STYLE}
          labelStyle={{ color: "var(--muted-foreground)" }}
          cursor={{ fill: "var(--accent)" }}
          formatter={(value) => [`${value}%`, "Avg uptime"]}
        />
        <Bar dataKey="value" fill="#10b981" radius={[4, 4, 0, 0]} maxBarSize={48} />
      </BarChart>
    </ResponsiveContainer>
  );
}

/** Number of down hours in the compact 24h history codec. */
function countDown(slots: string): number {
  let n = 0;
  for (const char of slots) if (char === "x") n += 1;
  return n;
}

/** Bottom 5 services by 24h uptime. */
export function SlowestServices({ services }: { services: ServiceHealth[] }) {
  const worst = [...services]
    .sort(
      (a, b) =>
        a.uptimePercentage - b.uptimePercentage ||
        countDown(b.history) - countDown(a.history)
    )
    .slice(0, 5);

  return (
    <ul className="space-y-3">
      {worst.map((service) => (
        <li key={service.id} className="space-y-1">
          <div className="flex items-center justify-between gap-3 text-sm">
            <span className="truncate text-foreground">{service.name}</span>
            <span className="shrink-0 font-mono text-xs text-muted-foreground">
              {service.uptimePercentage.toFixed(1)}%
            </span>
          </div>
          <div className="h-1.5 overflow-hidden rounded-full bg-muted">
            <div
              className={cnBar(service.uptimePercentage)}
              style={{ width: `${service.uptimePercentage}%` }}
            />
          </div>
        </li>
      ))}
    </ul>
  );
}

function cnBar(pct: number): string {
  return pct >= 95 ? "bg-emerald-500" : pct >= 80 ? "bg-amber-500" : "bg-rose-500";
}

function buildHourly<T>(
  services: ServiceHealth[],
  reduce: (samples: UptimeSlot[]) => T
): { time: string; value: T }[] {
  const first = services[0];
  const hours = first
    ? decodeHistory(first.checkedAt, first.history, first.latencies)
    : [];
  return hours.map((hour, index) => ({
    time: formatHour(hour.timestamp),
    value: reduce(
      services
        .map((service) =>
          decodeHistory(service.checkedAt, service.history, service.latencies)[index]
        )
        .filter((slot): slot is UptimeSlot => !!slot)
    ),
  }));
}
