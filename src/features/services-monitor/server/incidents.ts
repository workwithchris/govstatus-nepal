import { z } from "zod";

import seedData from "@/data/seed-services.json";
import { d1Config, d1Query } from "@/lib/d1";

const HOUR_MS = 60 * 60 * 1000;
const DEFAULT_WINDOW_MS = 7 * 24 * HOUR_MS;

/** Raw hourly aggregate bucket row from D1. */
interface BucketRow {
  service_id: string;
  bucket_ms: number;
  worst_status: "operational" | "degraded" | "down";
}

export const incidentSchema = z.object({
  id: z.string(),
  serviceId: z.string(),
  serviceName: z.string(),
  serviceUrl: z.url(),
  status: z.enum(["degraded", "down"]),
  startedAt: z.string(),
  endedAt: z.string().nullable(),
  ongoing: z.boolean(),
  durationHours: z.number(),
});
export type Incident = z.infer<typeof incidentSchema>;

const seedById = new Map(seedData.map((seed) => [seed.id, seed]));

/**
 * Derives incidents from the persisted hourly buckets: a run of consecutive
 * non-operational hours per service. Hour-granularity only — a 5-minute blip
 * inside an otherwise-fine hour shows up once that hour resolves to
 * "down"/"degraded". Empty until D1 holds history.
 */
export async function getIncidents(
  windowMs: number = DEFAULT_WINDOW_MS
): Promise<Incident[]> {
  if (!d1Config) return [];

  let rows: BucketRow[];
  try {
    rows = await d1Query<BucketRow>(
      `SELECT service_id, bucket_ms, worst_status
       FROM status_checks
       WHERE bucket_ms >= ?
       ORDER BY service_id, bucket_ms`,
      [Date.now() - windowMs]
    );
  } catch (err) {
    console.error("[govstatus] incident read failed:", err);
    return [];
  }

  const incidents: Incident[] = [];
  const currentHourFloor = Math.floor(Date.now() / HOUR_MS) * HOUR_MS;

  let i = 0;
  while (i < rows.length) {
    const serviceId = rows[i].service_id;
    let j = i;
    while (j < rows.length && rows[j].service_id === serviceId) j++;
    const buckets = rows.slice(i, j);
    i = j;

    let runStart: number | null = null;
    let runStatus: "degraded" | "down" = "degraded";
    let prevBucket: number | null = null;

    for (const bucket of buckets) {
      const isOperational = bucket.worst_status === "operational";
      const isContiguous = prevBucket !== null && bucket.bucket_ms === prevBucket + HOUR_MS;

      if (isOperational || (runStart !== null && !isContiguous)) {
        if (runStart !== null) {
          incidents.push(makeIncident(serviceId, runStart, prevBucket!, runStatus, currentHourFloor));
          runStart = null;
        }
      }
      if (!isOperational) {
        if (runStart === null) {
          runStart = bucket.bucket_ms;
          runStatus = bucket.worst_status === "down" ? "down" : "degraded";
        } else if (bucket.worst_status === "down") {
          runStatus = "down";
        }
      }
      prevBucket = bucket.bucket_ms;
    }

    if (runStart !== null) {
      incidents.push(makeIncident(serviceId, runStart, prevBucket!, runStatus, currentHourFloor));
    }
  }

  return incidents.sort((a, b) => b.startedAt.localeCompare(a.startedAt));
}

function makeIncident(
  serviceId: string,
  startMs: number,
  endBucketMs: number,
  status: Incident["status"],
  currentHourFloor: number
): Incident {
  const seed = seedById.get(serviceId);
  const endMs = endBucketMs + HOUR_MS;
  const ongoing = endBucketMs >= currentHourFloor;
  return {
    id: `${serviceId}-${startMs}`,
    serviceId,
    serviceName: seed?.name ?? serviceId,
    serviceUrl: seed?.url ?? `https://${serviceId}`,
    status,
    startedAt: new Date(startMs).toISOString(),
    endedAt: ongoing ? null : new Date(endMs).toISOString(),
    ongoing,
    durationHours: Math.round(((endMs - startMs) / HOUR_MS) * 10) / 10,
  };
}