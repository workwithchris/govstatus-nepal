import { describe, expect, it } from "vitest";

import {
  cycleIndex,
  isProbeDue,
  isStressful,
  probePhase,
  updateCadence,
  type ProbeResult,
} from "./health-probe";

const CYCLE = cycleIndex(0);

describe("adaptive probe cadence", () => {
  it("probes every cycle at shift 0 regardless of phase", () => {
    for (let phase = 0; phase < 8; phase++) {
      expect(isProbeDue({ shift: 0, stress: 0, healthy: 0 }, CYCLE, phase)).toBe(
        true
      );
    }
  });

  it("spreads services across cycles once backed off (phase jitter)", () => {
    // Two backed-off services with different phases never collide on every cycle.
    const phA = probePhase("e-passport");
    const phB = probePhase("nepse");
    const stride = 2;
    const a = { shift: 1, stress: 0, healthy: 0 };
    const b = { shift: 1, stress: 0, healthy: 0 };
    const dueA = [0, 1, 2, 3, 4, 5].map((c) => isProbeDue(a, c, phA % stride));
    const dueB = [0, 1, 2, 3, 4, 5].map((c) => isProbeDue(b, c, phB % stride));
    // Both still probe ~half the cycles…
    expect(dueA.filter(Boolean).length).toBe(3);
    expect(dueB.filter(Boolean).length).toBe(3);
    // …and phases differ so they don't probe in lockstep.
    expect(dueA.join()).not.toBe(dueB.join());
  });

  it("escalates shift after repeated stress, then backs off", () => {
    let state = { shift: 0, stress: 0, healthy: 0 };

    // One stress: not enough to back off (single flaky 403 ≠ throttle).
    state = updateCadence(state, true);
    expect(state.shift).toBe(0);

    // Second consecutive stress: back off to every 2nd cycle.
    state = updateCadence(state, true);
    expect(state.shift).toBe(1);

    // Two more stresses per level: every 4th, then every 8th (max).
    state = updateCadence(state, true);
    state = updateCadence(state, true);
    expect(state.shift).toBe(2);
    state = updateCadence(state, true);
    state = updateCadence(state, true);
    expect(state.shift).toBe(3);

    // Further stress stays at max.
    state = updateCadence(state, true);
    state = updateCadence(state, true);
    expect(state.shift).toBe(3);
  });

  it("recovers: shift drops after consecutive healthy responses", () => {
    let state = { shift: 3, stress: 0, healthy: 0 };

    // One healthy response: not enough to drop.
    state = updateCadence(state, false);
    expect(state.shift).toBe(3);

    // Two consecutive healthy: back to every 4th cycle.
    state = updateCadence(state, false);
    expect(state.shift).toBe(2);

    // Interrupt the run with a stress and the drop stalls.
    state = updateCadence(state, true);
    state = updateCadence(state, false);
    expect(state.shift).toBe(2);
  });

  it("classifies throttle signals as stressful and slow-but-up as not", () => {
    const probe = (partial: Partial<ProbeResult>): ProbeResult => ({
      status: "operational",
      responseTime: 100,
      httpStatus: 200,
      ...partial,
    });

    expect(isStressful(probe({ status: "down" }))).toBe(true);
    expect(isStressful(probe({ httpStatus: 429 }))).toBe(true);
    expect(isStressful(probe({ httpStatus: 403 }))).toBe(true);
    // Latency-degraded (200 but slow) is not a throttle signal.
    expect(isStressful(probe({ status: "degraded", httpStatus: 200 }))).toBe(
      false
    );
  });
});