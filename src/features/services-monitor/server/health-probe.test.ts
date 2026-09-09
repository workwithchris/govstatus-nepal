import { beforeEach, describe, expect, it, vi } from "vitest";

const d1Mocks = vi.hoisted(() => ({
  d1Batch: vi.fn(async () => undefined),
}));
vi.mock("@/lib/d1", () => ({
  d1Batch: d1Mocks.d1Batch,
  d1Query: vi.fn(async () => []),
  d1Config: null,
  isD1Available: vi.fn(async () => false),
}));

import { d1Batch } from "@/lib/d1";
const d1BatchMock = vi.mocked(d1Batch);
import type {
  HealthStatus,
  SeedService,
  ServiceHealth,
  UptimeSlot,
} from "@/features/services-monitor/types";
import {
  bucketLatency,
  buildHealthResponse,
  buildHistory,
  classifyProbe,
  computeTransitions,
  computeUptimePercentage,
  encodeHistory,
  hashSeed,
  persistChecks,
  probeService,
  simulateSlot,
  type ProbeResult,
} from "./health-probe";

const HOUR_MS = 60 * 60 * 1000;

const seed: SeedService = {
  id: "svc-1",
  name: "Test Service",
  url: "https://example.gov.np",
  category: "citizen",
  description: "Test fixture",
};

function fixture(
  id: string,
  status: HealthStatus,
  overrides: Partial<ServiceHealth> = {}
): ServiceHealth {
  return {
    id,
    name: `Service ${id}`,
    url: `https://${id}.gov.np`,
    category: "citizen",
    description: "fixture",
    status,
    responseTime: status === "down" ? null : 200,
    httpStatus: status === "down" ? null : 200,
    checkedAt: new Date().toISOString(),
    uptimePercentage: 100,
    history: "o".repeat(24),
    latencies: Array(24).fill(200),
    certExpiresAt: null,
    ...overrides,
  };
}

const p = (
  status: ProbeResult["status"],
  responseTime: number | null = 100,
  httpStatus: number | null = 200
): ProbeResult => ({ status, responseTime, httpStatus });

describe("classifyProbe", () => {
  it("operational for fast 2xx/3xx", () => {
    expect(classifyProbe(200, 120).status).toBe("operational");
    expect(classifyProbe(301, 800).status).toBe("operational");
    expect(classifyProbe(399, 3499).status).toBe("operational");
  });

  it("slow responses degrade even on 2xx", () => {
    const r = classifyProbe(200, 4000);
    expect(r.status).toBe("degraded");
    expect(r.responseTime).toBe(4000);
  });

  it("slow boundary is exact: 3500ms stays operational", () => {
    expect(classifyProbe(200, 3500).status).toBe("operational");
    expect(classifyProbe(200, 3501).status).toBe("degraded");
  });

  it("403 and 429 are degraded (WAF block / rate limit)", () => {
    expect(classifyProbe(403, 500).status).toBe("degraded");
    expect(classifyProbe(429, 500).status).toBe("degraded");
  });

  it("5xx and other 4xx are down", () => {
    expect(classifyProbe(500, 900).status).toBe("down");
    expect(classifyProbe(503, 900).status).toBe("down");
    expect(classifyProbe(404, 900).status).toBe("down");
    expect(classifyProbe(401, 900).status).toBe("down");
  });

  it("null status (timeout/network error) is down without a response time", () => {
    const r = classifyProbe(null, 30000);
    expect(r.status).toBe("down");
    expect(r.responseTime).toBeNull();
  });

  it("custom slow threshold respected", () => {
    expect(classifyProbe(200, 100, 50).status).toBe("degraded");
    expect(classifyProbe(200, 40, 50).status).toBe("operational");
  });
});

describe("worse ordering via probeService deep checks", () => {
  it("a broken checkUrl keeps the service down through confirmation", async () => {
    const calls: string[] = [];
    const probeFn = async (u: string): Promise<ProbeResult> => {
      calls.push(u);
      return u.includes("check") ? p("down") : p("operational");
    };
    const r = await probeService("https://a.gov.np", "https://a.gov.np/check", probeFn, 0);
    expect(r.status).toBe("down");
    // first pass: home + deep; confirm pass: home + deep again
    expect(calls).toEqual([
      "https://a.gov.np",
      "https://a.gov.np/check",
      "https://a.gov.np",
      "https://a.gov.np/check",
    ]);
  });

  it("worse of degraded-vs-operational is degraded", async () => {
    const probeFn = async (u: string): Promise<ProbeResult> =>
      u.includes("check") ? p("degraded") : p("operational");
    const r = await probeService("https://a.gov.np", "https://a.gov.np/check", probeFn, 0);
    expect(r.status).toBe("degraded");
  });

  it("no checkUrl probes only the homepage", async () => {
    const probeFn = vi.fn(async (): Promise<ProbeResult> => p("operational"));
    const r = await probeService("https://a.gov.np", undefined, probeFn, 0);
    expect(r.status).toBe("operational");
    expect(probeFn).toHaveBeenCalledTimes(1);
  });
});

describe("probeService down confirmation", () => {
  it("confirms down with a second failure", async () => {
    const results = [p("down"), p("down")];
    const probeFn = vi.fn(async (): Promise<ProbeResult> => results.shift()!);
    const r = await probeService("https://a.gov.np", undefined, probeFn, 0);
    expect(r.status).toBe("down");
    expect(probeFn).toHaveBeenCalledTimes(2);
  });

  it("a single blip is NOT reported down (confirm recovers)", async () => {
    const results = [p("down"), p("operational")];
    const probeFn = vi.fn(async (): Promise<ProbeResult> => results.shift()!);
    const r = await probeService("https://a.gov.np", undefined, probeFn, 0);
    expect(r.status).toBe("operational");
    expect(probeFn).toHaveBeenCalledTimes(2);
  });

  it("confirmation re-probes both homepage and checkUrl (worse wins)", async () => {
    const results = [
      p("down"), // homepage first
      p("down"), // deep check
      p("operational"), // homepage confirm
      p("operational"), // deep confirm
    ];
    const calls: string[] = [];
    const probeFn = async (u: string): Promise<ProbeResult> => {
      calls.push(u);
      return results.shift()!;
    };
    const r = await probeService("https://a.gov.np", "https://a.gov.np/check", probeFn, 0);
    expect(r.status).toBe("operational");
    expect(calls).toEqual([
      "https://a.gov.np",
      "https://a.gov.np/check",
      "https://a.gov.np",
      "https://a.gov.np/check",
    ]);
  });

  it("a broken checkUrl stays down through confirmation", async () => {
    const results = [
      p("operational"), // homepage first
      p("down"), // deep check → worse
      p("operational"), // homepage confirm
      p("down"), // deep confirm → still down
    ];
    const probeFn = async (): Promise<ProbeResult> => results.shift()!;
    const r = await probeService("https://a.gov.np", "https://a.gov.np/check", probeFn, 0);
    expect(r.status).toBe("down");
  });

  it("does not delay or re-probe when up", async () => {
    const probeFn = vi.fn(async (): Promise<ProbeResult> => p("operational"));
    await probeService("https://a.gov.np", undefined, probeFn, 0);
    expect(probeFn).toHaveBeenCalledTimes(1);
  });
});

describe("hashSeed / simulateSlot", () => {
  it("hash is deterministic", () => {
    expect(hashSeed("svc-1:2026-01-01T00:00:00.000Z")).toBe(
      hashSeed("svc-1:2026-01-01T00:00:00.000Z")
    );
  });

  it("simulated slot is stable per (service, hour)", () => {
    const t = Date.parse("2026-09-09T00:00:00.000Z");
    expect(simulateSlot(seed, t)).toEqual(simulateSlot(seed, t));
  });

  it("simulated slot has sane response times: null only when down", () => {
    const t = Date.parse("2026-09-09T00:00:00.000Z");
    for (let i = 0; i < 50; i++) {
      const slot = simulateSlot(seed, t + i * HOUR_MS);
      expect(["operational", "degraded", "down"]).toContain(slot.status);
      if (slot.status === "down") expect(slot.responseTime).toBeNull();
      else expect(slot.responseTime).toBeGreaterThan(0);
    }
  });
});

describe("buildHistory", () => {
  const checkedAt = "2026-09-09T12:30:00.000Z";
  const checkedTime = Date.parse(checkedAt);
  const bucket = (i: number) =>
    Math.floor((checkedTime - i * HOUR_MS) / HOUR_MS) * HOUR_MS;

  it("returns 24 hourly slots aligned to hour boundaries, oldest first", () => {
    const slots = buildHistory(seed, p("operational", 200, 200), checkedAt);
    expect(slots).toHaveLength(24);
    slots.forEach((slot, index) => {
      // buildHistory pushes oldest bucket first: index 0 = bucket(23).
      expect(Date.parse(slot.timestamp)).toBe(bucket(23 - index));
    });
  });

  it("newest slot (last) always reflects the live probe result", () => {
    const slots = buildHistory(seed, p("down", null, null), checkedAt, new Map());
    expect(slots[23].status).toBe("down");
    expect(slots[23].responseTime).toBeNull();
  });

  it("uses real history rows for older slots (grey null when missing)", () => {
    const real = new Map([[bucket(1), {
      service_id: seed.id,
      bucket_ms: bucket(1),
      worst_status: "down" as const,
      sample_count: 2,
      sum_response_ms: 300,
      checked_at_ms: checkedTime,
    }]]);
    const slots = buildHistory(seed, p("operational"), checkedAt, real);
    expect(slots[22].status).toBe("down"); // index 22 = bucket(23-22=1)
    expect(slots[22].responseTime).toBe(150); // 300/2
    expect(slots[21].status).toBeNull(); // missing bucket → grey, not simulated
    expect(slots[21].responseTime).toBeNull();
  });

  it("simulates older slots when no real history is provided", () => {
    const slots = buildHistory(seed, p("operational"), checkedAt);
    for (let i = 0; i < slots.length - 1; i++) {
      expect(slots[i].status).not.toBeNull();
    }
  });
});

describe("bucketLatency", () => {
  it("averages sum/sample", () => {
    expect(bucketLatency({ sample_count: 4, sum_response_ms: 1000 } as never)).toBe(250);
  });

  it("returns null when no samples", () => {
    expect(bucketLatency({ sample_count: 0, sum_response_ms: 0 } as never)).toBeNull();
  });
});

describe("computeUptimePercentage", () => {
  const slots = (statuses: (HealthStatus | null)[]): UptimeSlot[] =>
    statuses.map((status) => ({ timestamp: "t", status, responseTime: 1 }));

  it("100% when all operational", () => {
    expect(computeUptimePercentage(slots(Array(24).fill("operational")))).toBe(100);
  });

  it("counts known slots only, not grey no-data", () => {
    const mixed = slots([
      ...Array(6).fill("down"),
      ...Array(12).fill("operational"),
      ...Array(6).fill(null),
    ]);
    expect(computeUptimePercentage(mixed)).toBe(66.7); // 12/18
  });

  it("100 when nothing known", () => {
    expect(computeUptimePercentage(slots(Array(24).fill(null)))).toBe(100);
  });
});

describe("encodeHistory", () => {
  it("maps o/d/x and n for null, 24 chars, parallel latencies", () => {
    const slots: UptimeSlot[] = [
      { timestamp: "t", status: "operational", responseTime: 100 },
      { timestamp: "t", status: "degraded", responseTime: 4000 },
      { timestamp: "t", status: "down", responseTime: null },
      { timestamp: "t", status: null, responseTime: null },
    ];
    const { history, latencies } = encodeHistory(slots);
    expect(history).toBe("odxn");
    expect(latencies).toEqual([100, 4000, null, null]);
  });
});

describe("computeTransitions", () => {
  it("returns [] without previous meta", () => {
    expect(computeTransitions([fixture("a", "operational")], null)).toEqual([]);
  });

  it("skips new services and unchanged statuses", () => {
    const prev = new Map([
      ["a", { service_id: "a", last_status: "operational" as const }],
    ]);
    const events = computeTransitions(
      [fixture("a", "operational"), fixture("b", "down")],
      prev as never
    );
    expect(events).toHaveLength(0);
  });

  it("captures worsening and recovery", () => {
    const prev = new Map([
      ["a", { service_id: "a", last_status: "operational" as const }],
      ["b", { service_id: "b", last_status: "down" as const }],
    ]);
    const events = computeTransitions(
      [
        { ...fixture("a", "down"), httpStatus: 500 },
        fixture("b", "operational"),
      ],
      prev as never
    );
    expect(events).toHaveLength(2);
    expect(events[0]).toMatchObject({
      serviceId: "a",
      previousStatus: "operational",
      currentStatus: "down",
      httpStatus: 500,
    });
    expect(events[1]).toMatchObject({
      serviceId: "b",
      previousStatus: "down",
      currentStatus: "operational",
    });
  });
});

describe("persistChecks", () => {
  beforeEach(() => {
    d1Mocks.d1Batch.mockClear();
  });

  it("builds upsert statements with worst-status aggregation", async () => {
    const checkedAtMs = Date.parse("2026-09-09T12:30:00.000Z");
    const bucketMs = Math.floor(checkedAtMs / HOUR_MS) * HOUR_MS;
    await persistChecks([fixture("a", "down")], checkedAtMs, new Map());

    expect(d1BatchMock).toHaveBeenCalledTimes(1);
    const [statements] = d1BatchMock.mock.calls[0];
    // 2 per service (status_checks + service_meta) + 1 retention DELETE
    expect(statements).toHaveLength(3);

    const upsert = statements[0].sql;
    expect(upsert).toContain("ON CONFLICT(service_id, bucket_ms)");
    expect(upsert).toContain("WHEN worst_status = 'down' OR excluded.worst_status = 'down'");
    // Outcome counters ride along: [id, bucket, status, rt, checkedAt, ...6x 0/1]
    expect(statements[0].params.slice(0, 5)).toEqual([
      "a",
      bucketMs,
      "down",
      0,
      checkedAtMs,
    ]);
    expect(statements[0].params).toHaveLength(11);
    // down + no http code → network counter set
    expect(statements[0].params[10]).toBe(1);
    expect(
      statements[0].params
        .slice(5)
        .reduce((sum: number, n) => sum + (Number(n) || 0), 0)
    ).toBe(1);

    const meta = statements[1].sql;
    expect(meta).toContain("INSERT INTO service_meta");
    expect(statements[1].params[3]).toBeNull(); // no cert refresh

    expect(statements[2].sql).toBe("DELETE FROM status_checks WHERE bucket_ms < ?");
    expect(statements[2].params).toEqual([
      checkedAtMs - 90 * 24 * HOUR_MS,
    ]);
  });

  it("passes cert expiry through to service_meta when refreshed", async () => {
    const checkedAtMs = Date.now();
    const expires = Date.now() + 30 * 24 * 60 * 60 * 1000;
    await persistChecks(
      [fixture("a", "operational")],
      checkedAtMs,
      new Map([["a", expires]])
    );
    const [, meta] = d1BatchMock.mock.calls[0][0];
    expect(meta.params[3]).toBe(expires);
    expect(meta.params[4]).toBeTypeOf("number");
  });

  it("chunks batches at 60 statements", async () => {
    const many = Array.from({ length: 31 }, (_, i) => fixture(`svc-${i}`, "operational"));
    await persistChecks(many, Date.now(), new Map());
    // 31*2 + 1 = 63 statements → 60 + 3
    expect(d1BatchMock).toHaveBeenCalledTimes(2);
    expect(d1BatchMock.mock.calls[0][0]).toHaveLength(60);
    expect(d1BatchMock.mock.calls[1][0]).toHaveLength(3);
  });
});

describe("buildHealthResponse", () => {
  it("computes counts and average response time", () => {
    const svcs = [
      fixture("a", "operational", { responseTime: 100 }),
      fixture("b", "degraded", { responseTime: 4000 }),
      fixture("c", "down", { responseTime: null }),
    ];
    const res = buildHealthResponse(svcs, "2026-09-09T00:00:00.000Z", "live");
    expect(res.summary).toMatchObject({
      total: 3,
      operational: 1,
      degraded: 1,
      down: 1,
      averageResponseTime: 2050,
      overallStatus: "degraded",
    });
  });

  it("normal when everything is up", () => {
    const res = buildHealthResponse(
      [fixture("a", "operational")],
      "t",
      "live"
    );
    expect(res.summary.overallStatus).toBe("normal");
  });

  it("outage at 5+ down services", () => {
    const svcs = Array.from({ length: 5 }, (_, i) => fixture(`d${i}`, "down"));
    const res = buildHealthResponse(svcs, "t", "live");
    expect(res.summary.overallStatus).toBe("outage");
  });
});