"use client";

import { useQuery } from "@tanstack/react-query";
import { z } from "zod";

const incidentSchema = z.object({
  id: z.string(),
  serviceId: z.string(),
  serviceName: z.string(),
  serviceUrl: z.string(),
  status: z.enum(["degraded", "down"]),
  startedAt: z.string(),
  endedAt: z.string().nullable(),
  ongoing: z.boolean(),
  durationHours: z.number(),
});

const incidentsResponseSchema = z.object({
  generatedAt: z.string(),
  incidents: z.array(incidentSchema),
});

export type Incident = z.infer<typeof incidentSchema>;

async function fetchIncidents(): Promise<Incident[]> {
  const res = await fetch("/api/incidents");
  if (!res.ok) throw new Error(`Incidents failed: ${res.status}`);
  return incidentsResponseSchema.parse(await res.json()).incidents;
}

export const INCIDENTS_QUERY_KEY = ["incidents"] as const;

export function useIncidents() {
  return useQuery({
    queryKey: INCIDENTS_QUERY_KEY,
    queryFn: fetchIncidents,
    staleTime: 5 * 60 * 1000,
    refetchInterval: 5 * 60 * 1000,
  });
}