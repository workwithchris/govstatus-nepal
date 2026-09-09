import { NextRequest } from "next/server";

import {
  getDailyHistory,
  getHourlyHistory,
  historyQuerySchema,
} from "@/features/services-monitor/server/history";

export const dynamic = "force-dynamic";

/**
 * Uptime history for one service (last 30/90 days), rolled up from the
 * persisted hourly buckets. `granularity=hour` returns the raw hourly buckets
 * (sparse); the default `granularity=day` returns worst-status-per-day
 * aggregates. Empty until D1 holds history for that service.
 */
export async function GET(request: NextRequest) {
  const parsed = historyQuerySchema.safeParse(
    Object.fromEntries(request.nextUrl.searchParams)
  );
  if (!parsed.success) {
    return Response.json({ error: "invalid query" }, { status: 400 });
  }
  const { service, days, granularity } = parsed.data;
  const history =
    granularity === "hour"
      ? await getHourlyHistory(service, days)
      : await getDailyHistory(service, days);
  return Response.json(
    { serviceId: service, days, granularity, history },
    { headers: { "Cache-Control": "s-maxage=300, stale-while-revalidate=300" } }
  );
}