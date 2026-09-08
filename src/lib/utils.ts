import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

import type {
  HealthStatus,
  UptimeSlot,
} from "@/features/services-monitor/types";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

const HOUR_MS = 60 * 60 * 1000;

const CHAR_STATUS: Record<string, HealthStatus | null> = {
  o: "operational",
  d: "degraded",
  x: "down",
  n: null,
};

/** Rebuilds the 24 hourly slots from the compact history codec. */
export function decodeHistory(
  checkedAt: string,
  history: string,
  latencies: (number | null)[]
): UptimeSlot[] {
  const bucketStart =
    Math.floor(Date.parse(checkedAt) / HOUR_MS) * HOUR_MS;
  return history.split("").map((char, index) => ({
    timestamp: new Date(bucketStart - (23 - index) * HOUR_MS).toISOString(),
    status: CHAR_STATUS[char] ?? null,
    responseTime: latencies[index] ?? null,
  }));
}

/** Formats a response-time in milliseconds, e.g. `420 ms`. */
export function formatLatency(ms: number | null): string {
  if (ms === null) return "—";
  return `${Math.round(ms)} ms`;
}

/** Formats an ISO timestamp as a relative label, e.g. `12s ago`. */
export function formatTimeAgo(iso: string | null): string {
  if (!iso) return "—";
  const seconds = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 1000));
  if (seconds < 60) return `${seconds}s ago`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  return `${Math.floor(minutes / 60)}h ago`;
}

/** Formats an ISO timestamp as an hour label, e.g. `14:00`. */
export function formatHour(iso: string): string {
  return new Date(iso).toLocaleTimeString("en-GB", {
    hour: "2-digit",
    minute: "2-digit",
  });
}

/** Whole days remaining until a TLS cert expires (negative = expired). */
export function certDaysLeft(iso: string): number {
  return Math.floor((Date.parse(iso) - Date.now()) / 86_400_000);
}
