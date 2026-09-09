import { describe, expect, it } from "vitest";

import { outcomeFor } from "./outcomes";

describe("probe outcome classification", () => {
  it("classifies firewall blocks, rate limits and server errors by HTTP code", () => {
    expect(outcomeFor("degraded", 403)).toBe("blocked");
    expect(outcomeFor("degraded", 429)).toBe("rateLimited");
    expect(outcomeFor("down", 500)).toBe("http5xx");
    expect(outcomeFor("down", 503)).toBe("http5xx");
  });

  it("classifies down without an HTTP code as a network failure", () => {
    expect(outcomeFor("down", null)).toBe("network");
  });

  it("classifies degraded-but-responding as slow and operational as ok", () => {
    expect(outcomeFor("degraded", 200)).toBe("slow");
    expect(outcomeFor("operational", 200)).toBe("ok");
    expect(outcomeFor("operational", null)).toBe("ok");
  });
});
