import { describe, expect, it } from "vitest";
import { calculateAnnualizedRate } from "../lib/arbitrage/calculations";

describe("calculateAnnualizedRate", () => {
  it("annualizes positive and negative funding rates", () => {
    expect(calculateAnnualizedRate(0.0001, 8)).toBeCloseTo(10.95, 4);
    expect(calculateAnnualizedRate(-0.0002, 8)).toBeCloseTo(-21.9, 4);
  });
});
