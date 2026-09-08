"use client";

import { keepPreviousData, useQuery } from "@tanstack/react-query";

import {
  healthResponseSchema,
  type HealthResponse,
} from "@/features/services-monitor/types";

async function fetchServicesHealth(): Promise<HealthResponse> {
  const res = await fetch("/api/health");
  if (!res.ok) {
    throw new Error(`Health probe failed: ${res.status}`);
  }
  return healthResponseSchema.parse(await res.json());
}

export const SERVICES_HEALTH_QUERY_KEY = ["services-health"] as const;

export function useServicesHealth() {
  return useQuery({
    queryKey: SERVICES_HEALTH_QUERY_KEY,
    queryFn: fetchServicesHealth,
    staleTime: 5 * 60 * 1000,
    refetchInterval: 5 * 60 * 1000,
    refetchOnWindowFocus: true,
    // Keep the last-known list on screen during background refetches so the
    // view never blanks out or flashes a loader while a probe is running.
    placeholderData: keepPreviousData,
  });
}
