"use client";

import { useQuery } from "@tanstack/react-query";
import { z } from "zod";

const dailyHistorySchema = z.object({
  day: z.string(),
  status: z.enum(["operational", "degraded", "down"]),
  coverage: z.number().min(0).max(1),
  uptime: z.number().min(0).max(1),
  averageResponseTime: z.number().nullable(),
});

const historyResponseSchema = z.object({
  serviceId: z.string(),
  days: z.number(),
  history: z.array(dailyHistorySchema),
});

export type DailyHistory = z.infer<typeof dailyHistorySchema>;

const hourlyBucketSchema = z.object({
  bucket: z.string(),
  status: z.enum(["operational", "degraded", "down"]),
  averageResponseTime: z.number().nullable(),
  sampleCount: z.number().int().nonnegative(),
});

const hourlyHistoryResponseSchema = z.object({
  serviceId: z.string(),
  days: z.number(),
  granularity: z.literal("hour"),
  history: z.array(hourlyBucketSchema),
});

export type HourlyBucket = z.infer<typeof hourlyBucketSchema>;

async function fetchServiceHistory(
  serviceId: string,
  days: number
): Promise<DailyHistory[]> {
  const res = await fetch(`/api/health/history?service=${serviceId}&days=${days}`);
  if (!res.ok) throw new Error(`History failed: ${res.status}`);
  return historyResponseSchema.parse(await res.json()).history;
}

async function fetchServiceHourlyHistory(
  serviceId: string,
  days: number
): Promise<HourlyBucket[]> {
  const res = await fetch(
    `/api/health/history?service=${serviceId}&days=${days}&granularity=hour`
  );
  if (!res.ok) throw new Error(`History failed: ${res.status}`);
  return hourlyHistoryResponseSchema.parse(await res.json()).history;
}

export function useServiceHistory(serviceId: string | null, days: number = 30) {
  return useQuery({
    queryKey: ["service-history", serviceId, days] as const,
    queryFn: () => fetchServiceHistory(serviceId!, days),
    enabled: !!serviceId,
    staleTime: 5 * 60 * 1000,
  });
}

export function useServiceHourlyHistory(
  serviceId: string | null,
  days: number = 7
) {
  return useQuery({
    queryKey: ["service-hourly-history", serviceId, days] as const,
    queryFn: () => fetchServiceHourlyHistory(serviceId!, days),
    enabled: !!serviceId,
    staleTime: 5 * 60 * 1000,
  });
}