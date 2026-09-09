import { NextRequest } from "next/server";

import {
  getDailyHistory,
  historyQuerySchema,
} from "@/features/services-monitor/server/history";

export const dynamic = "force-dynamic";

/**
 * Daily uptime history for one service (last 30/90 days), rolled up from the
 * persisted hourly buckets. Empty until D1 holds history for that service.
 */
export async function GET(request: NextRequest) {
  const parsed = historyQuerySchema.safeParse(
    Object.fromEntries(request.nextUrl.searchParams)
  );
  if (!parsed.success) {
    return Response.json({ error: "invalid query" }, { status: 400 });
  }
  const { service, days } = parsed.data;
  const history = await getDailyHistory(service, days);
  return Response.json(
    { serviceId: service, days, history },
    { headers: { "Cache-Control": "s-maxage=300, stale-while-revalidate=300" } }
  );
}