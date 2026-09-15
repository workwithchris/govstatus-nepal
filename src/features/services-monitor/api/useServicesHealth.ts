"use client";

import { keepPreviousData, useQuery } from "@tanstack/react-query";

import {
  healthResponseSchema,
  slimHealthResponseSchema,
  type HealthResponse,
  type SlimHealthResponse,
} from "@/features/services-monitor/types";

async function fetchSlimHealth(): Promise<SlimHealthResponse> {
  const res = await fetch("/api/health?slim=1");
  if (!res.ok) {
    throw new Error(`Health probe failed: ${res.status}`);
  }
  return slimHealthResponseSchema.parse(await res.json());
}

async function fetchFullHealth(): Promise<HealthResponse> {
  const res = await fetch("/api/health");
  if (!res.ok) {
    throw new Error(`Health probe failed: ${res.status}`);
  }
  return healthResponseSchema.parse(await res.json());
}

export const SERVICES_HEALTH_QUERY_KEY = ["services-health"] as const;
export const SERVICES_FULL_HEALTH_QUERY_KEY = [
  "services-health",
  "full",
] as const;

/**
 * Dashboard data: slim payload (no 24h history/latencies). The snapshot only
 * changes every probe cycle, so a 5-minute stale/refetch window is plenty and
 * window-focus refetches are disabled to avoid redundant round trips.
 */
export function useServicesHealth() {
  return useQuery({
    queryKey: SERVICES_HEALTH_QUERY_KEY,
    queryFn: fetchSlimHealth,
    staleTime: 5 * 60 * 1000,
    refetchInterval: 5 * 60 * 1000,
    refetchOnWindowFocus: false,
    // Keep the last-known list on screen during background refetches so the
    // view never blanks out or flashes a loader while a probe is running.
    placeholderData: keepPreviousData,
  });
}

/** Full payload (with 24h history/latencies) for Compare and Analytics. */
export function useServicesFullHealth() {
  return useQuery({
    queryKey: SERVICES_FULL_HEALTH_QUERY_KEY,
    queryFn: fetchFullHealth,
    staleTime: 5 * 60 * 1000,
    refetchInterval: 5 * 60 * 1000,
    refetchOnWindowFocus: false,
    placeholderData: keepPreviousData,
  });
}
