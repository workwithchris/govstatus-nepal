"use client";

import { useQuery } from "@tanstack/react-query";

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
    staleTime: 60 * 1000,
    refetchInterval: 60 * 1000,
  });
}
