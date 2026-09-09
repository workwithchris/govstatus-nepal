import type { HealthStatus } from "@/features/services-monitor/types";

/**
 * Fine-grained outcome types for one probe sample, persisted as per-hour
 * counters alongside the existing worst-status aggregation. Lets readers tell
 * a real outage (5xx / network failure) apart from a firewall block (403) or
 * rate limiting (429) — the most common .np failure modes.
 */
export const OUTCOME_ORDER = [
  "ok",
  "slow",
  "blocked",
  "rateLimited",
  "http5xx",
  "network",
] as const;

export type OutcomeKey = (typeof OUTCOME_ORDER)[number];

export const OUTCOME_COLUMNS: Record<OutcomeKey, string> = {
  ok: "outcome_ok",
  slow: "outcome_slow",
  blocked: "outcome_blocked",
  rateLimited: "outcome_rate_limited",
  http5xx: "outcome_http5xx",
  network: "outcome_network",
};

/** Classifies a single probe sample into an outcome type. */
export function outcomeFor(
  status: HealthStatus,
  httpStatus: number | null
): OutcomeKey {
  if (httpStatus === 403) return "blocked";
  if (httpStatus === 429) return "rateLimited";
  if (httpStatus !== null && httpStatus >= 500) return "http5xx";
  if (status === "down") return "network";
  if (status === "degraded") return "slow";
  return "ok";
}

/** Human label for an outcome key, used in tooltips/legends. */
export function outcomeLabel(key: OutcomeKey): string {
  switch (key) {
    case "ok":
      return "ok";
    case "slow":
      return "slow";
    case "blocked":
      return "blocked (403)";
    case "rateLimited":
      return "rate-limited (429)";
    case "http5xx":
      return "server error (5xx)";
    case "network":
      return "network failure";
  }
}
