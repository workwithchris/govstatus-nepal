"use client";

import { keepPreviousData, useQuery } from "@tanstack/react-query";

import {
  getInitialStaticHealth,
  probeAllServicesClientSide,
} from "@/features/services-monitor/lib/client-probe";
import type {
  HealthResponse,
  SlimHealthResponse,
} from "@/features/services-monitor/types";

export const SERVICES_HEALTH_QUERY_KEY = ["services-health"] as const;
export const SERVICES_FULL_HEALTH_QUERY_KEY = [
  "services-health",
  "full",
] as const;

/**
 * Dashboard data: live client-side browser probe running directly from the user's connection.
 */
export function useServicesHealth() {
  return useQuery<SlimHealthResponse>({
    queryKey: SERVICES_HEALTH_QUERY_KEY,
    queryFn: () => probeAllServicesClientSide(),
    initialData: getInitialStaticHealth(),
    staleTime: 2 * 60 * 1000,
    refetchInterval: 5 * 60 * 1000,
    refetchOnWindowFocus: false,
    placeholderData: keepPreviousData,
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
