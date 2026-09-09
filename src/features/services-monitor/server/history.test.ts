import { describe, expect, it, vi } from "vitest";

import seedData from "@/data/seed-services.json";

const { d1QueryMock } = vi.hoisted(() => ({ d1QueryMock: vi.fn() }));

vi.mock("@/lib/d1", () => ({
  d1Config: { accountId: "account", databaseId: "db", apiToken: "token" },
  d1Query: d1QueryMock,
}));

const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * HOUR_MS;

const serviceId = (seedData as { id: string }[])[0].id;

interface FixtureRow {
  bucket_ms: number;
  worst_status: "operational" | "degraded" | "down";
  sample_count: number;
  sum_response_ms: number;
}

async function importHistory() {
  return import("./history");
}

describe("history read + aggregation", () => {
  it("rolls hourly buckets into worst-status-per-day", async () => {
    const now = new Date();
    const todayStart = Date.UTC(
      now.getUTCFullYear(),
      now.getUTCMonth(),
      now.getUTCDate()
    );
    const yesterdayStart = todayStart - DAY_MS;
    const rows: FixtureRow[] = [
      {
        bucket_ms: yesterdayStart + HOUR_MS,
        worst_status: "operational",
        sample_count: 5,
        sum_response_ms: 5000,
      },
      {
        bucket_ms: todayStart + 2 * HOUR_MS,
        worst_status: "operational",
        sample_count: 2,
        sum_response_ms: 400,
      },
      {
        bucket_ms: todayStart + 3 * HOUR_MS,
        worst_status: "down",
        sample_count: 1,
        sum_response_ms: 6000,
      },
      {
        bucket_ms: todayStart + 5 * HOUR_MS,
        worst_status: "degraded",
        sample_count: 0,
        sum_response_ms: 0,
      },
    ];
    d1QueryMock.mockResolvedValue(rows);

    const { getDailyHistory } = await importHistory();
    const history = await getDailyHistory(serviceId, 30);

    expect(history).toHaveLength(2);
    const [first, last] = history;

    expect(first.day).toBe(new Date(yesterdayStart).toISOString().slice(0, 10));
    expect(first.status).toBe("operational");
    expect(first.coverage).toBeCloseTo(1 / 24);
    expect(first.uptime).toBe(1);
    expect(first.averageResponseTime).toBe(1000);

    expect(last.day).toBe(new Date(todayStart).toISOString().slice(0, 10));
    expect(last.status).toBe("down");
    expect(last.coverage).toBeCloseTo(3 / 24);
    expect(last.uptime).toBeCloseTo(2 / 3);
    // Latency only averages hours that actually recorded samples (the degraded
    // zero-sample hour is excluded).
    expect(last.averageResponseTime).toBe((200 + 6000) / 2);
  });

  it("exposes raw hourly buckets with mean response times", async () => {
    const now = new Date();
    const todayStart = Date.UTC(
      now.getUTCFullYear(),
      now.getUTCMonth(),
      now.getUTCDate()
    );
    const rows: FixtureRow[] = [
      {
        bucket_ms: todayStart + 2 * HOUR_MS,
        worst_status: "operational",
        sample_count: 3,
        sum_response_ms: 1234,
      },
      {
        bucket_ms: todayStart + 3 * HOUR_MS,
        worst_status: "down",
        sample_count: 0,
        sum_response_ms: 0,
      },
    ];
    d1QueryMock.mockResolvedValue(rows);

    const { getHourlyHistory } = await importHistory();
    const history = await getHourlyHistory(serviceId, 7);

    expect(history).toEqual([
      {
        bucket: new Date(todayStart + 2 * HOUR_MS).toISOString(),
        status: "operational",
        sampleCount: 3,
        averageResponseTime: Math.round(1234 / 3),
      },
      {
        bucket: new Date(todayStart + 3 * HOUR_MS).toISOString(),
        status: "down",
        sampleCount: 0,
        averageResponseTime: null,
      },
    ]);
  });

  it("returns empty and never queries D1 for an unknown service", async () => {
    d1QueryMock.mockClear();

    const { getDailyHistory, getHourlyHistory } = await importHistory();
    expect(await getDailyHistory("not-a-service", 30)).toEqual([]);
    expect(await getHourlyHistory("not-a-service", 7)).toEqual([]);
    expect(d1QueryMock).not.toHaveBeenCalled();
  });
});
