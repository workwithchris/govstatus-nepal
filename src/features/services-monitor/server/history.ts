import { z } from "zod";

import seedData from "@/data/seed-services.json";
import { d1Config, d1Query } from "@/lib/d1";

const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * HOUR_MS;

/** One daily aggregate for a service: worst status + uptime fraction. */
export const dailyHistorySchema = z.object({
  /** ISO date (YYYY-MM-DD, UTC) this day covers. */
  day: z.string(),
  status: z.enum(["operational", "degraded", "down"]),
  /** 0–1 fraction of the day with recorded samples. */
  coverage: z.number().min(0).max(1),
  /** 0–1 fraction of recorded hours that were operational. */
  uptime: z.number().min(0).max(1),
  averageResponseTime: z.number().nullable(),
});
export type DailyHistory = z.infer<typeof dailyHistorySchema>;

/** One persisted hourly bucket for a service, as exposed by the API. */
export const hourlyBucketSchema = z.object({
  /** ISO timestamp for the start of the hour this bucket covers. */
  bucket: z.string(),
  status: z.enum(["operational", "degraded", "down"]),
  /** Mean response time (ms) of the samples in that hour; null when none. */
  averageResponseTime: z.number().nullable(),
  sampleCount: z.number().int().nonnegative(),
});
export type HourlyBucket = z.infer<typeof hourlyBucketSchema>;

interface BucketRow {
  bucket_ms: number;
  worst_status: "operational" | "degraded" | "down";
  sample_count: number;
  sum_response_ms: number;
}

const seedById = new Map(seedData.map((seed) => [seed.id, seed]));

/** Loads raw hourly bucket rows for a service since `sinceMs` ([] on failure). */
async function readBuckets(
  serviceId: string,
  sinceMs: number
): Promise<BucketRow[]> {
  if (!d1Config) return [];
  const seed = seedById.get(serviceId);
  if (!seed) return [];

  try {
    return await d1Query<BucketRow>(
      `SELECT bucket_ms, worst_status, sample_count, sum_response_ms
       FROM status_checks
       WHERE service_id = ? AND bucket_ms >= ?
       ORDER BY bucket_ms`,
      [serviceId, sinceMs]
    );
  } catch (err) {
    console.error("[govstatus] history read failed:", err);
    return [];
  }
}

function bucketToHourly(row: BucketRow): HourlyBucket {
  return {
    bucket: new Date(row.bucket_ms).toISOString(),
    status: row.worst_status,
    sampleCount: row.sample_count,
    averageResponseTime:
      row.sample_count > 0 ? Math.round(row.sum_response_ms / row.sample_count) : null,
  };
}

/**
 * Daily uptime history for one service over `days` (up to 90). Each bucket row
 * is an hourly aggregate; days are rolled up as worst-status-per-day with the
 * fraction of recorded hours that were operational. Grey days (no samples) are
 * omitted — coverage < 1 means the day had data gaps.
 */
export async function getDailyHistory(
  serviceId: string,
  days: number
): Promise<DailyHistory[]> {
  const rows = await readBuckets(serviceId, Date.now() - days * DAY_MS);

  // Group hourly buckets into UTC days.
  const byDay = new Map<string, BucketRow[]>();
  for (const row of rows) {
    const day = new Date(row.bucket_ms).toISOString().slice(0, 10);
    const list = byDay.get(day);
    if (list) list.push(row);
    else byDay.set(day, [row]);
  }

  const history: DailyHistory[] = [];
  for (const [day, buckets] of byDay) {
    const down = buckets.filter((b) => b.worst_status === "down").length;
    const degraded = buckets.filter((b) => b.worst_status === "degraded").length;
    const latencyRows = buckets.filter((b) => b.sample_count > 0);
    const averageResponseTime =
      latencyRows.length > 0
        ? Math.round(
            latencyRows.reduce(
              (sum, b) => sum + b.sum_response_ms / b.sample_count,
              0
            ) / latencyRows.length
          )
        : null;

    history.push({
      day,
      status: down > 0 ? "down" : degraded > 0 ? "degraded" : "operational",
      coverage: buckets.length / 24,
      uptime: buckets.length > 0 ? (buckets.length - down) / buckets.length : 0,
      averageResponseTime,
    });
  }

  return history.sort((a, b) => a.day.localeCompare(b.day));
}

/**
 * Raw hourly history for one service over `days` (up to 90), ascending by
 * bucket. Sparse: hours with no recorded samples are absent so callers render
 * the gaps themselves.
 */
export async function getHourlyHistory(
  serviceId: string,
  days: number
): Promise<HourlyBucket[]> {
  const rows = await readBuckets(serviceId, Date.now() - days * DAY_MS);
  return rows.map(bucketToHourly);
}

export const historyQuerySchema = z.object({
  service: z.string().min(1),
  days: z.coerce.number().int().min(1).max(90).default(30),
  granularity: z.enum(["hour", "day"]).default("day"),
});

export { seedById };