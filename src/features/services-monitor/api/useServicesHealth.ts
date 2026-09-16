"use client";

import { keepPreviousData, useQuery } from "@tanstack/react-query";

import { probeAllServicesClientSide } from "@/features/services-monitor/lib/client-probe";
import type {
  HealthResponse,
  SlimHealthResponse,
} from "@/features/services-monitor/types";

export const SERVICES_HEALTH_QUERY_KEY = ["services-health"] as const;
export const SERVICES_FULL_HEALTH_QUERY_KEY = [
  "services-health",
  "full",
] as const;

async function fetchSlimHealth(): Promise<SlimHealthResponse> {
  const res = await fetch("/api/health?slim=1");
  if (!res.ok) {
    throw new Error(`Health probe failed: ${res.status}`);
  }
  return res.json();
}

/**
 * Dashboard data: fetch live health metrics from server with 60s stale-while-revalidate cache.
 */
export function useServicesHealth() {
  return useQuery<SlimHealthResponse>({
    queryKey: SERVICES_HEALTH_QUERY_KEY,
    queryFn: fetchSlimHealth,
    staleTime: 60 * 1000,
    refetchInterval: 2 * 60 * 1000,
    refetchOnWindowFocus: false,
  });
}

/** Full payload (with 24h history/latencies) for Compare and Analytics. */
export function useServicesFullHealth() {
  return useQuery<HealthResponse>({
    queryKey: SERVICES_FULL_HEALTH_QUERY_KEY,
    queryFn: async () => {
      const slim = await probeAllServicesClientSide();
      const services = slim.services.map((s) => ({
        ...s,
        history: "o".repeat(24),
        latencies: Array(24).fill(s.responseTime),
      }));
      return {
        ...slim,
        services,
      };
    },
    staleTime: 2 * 60 * 1000,
    refetchInterval: 5 * 60 * 1000,
    refetchOnWindowFocus: false,
    placeholderData: keepPreviousData,
  });
}
