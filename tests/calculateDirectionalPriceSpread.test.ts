import { describe, expect, it } from "vitest";
import { calculateDirectionalPriceSpread } from "../lib/arbitrage/calculations";

describe("calculateDirectionalPriceSpread", () => {
  it("keeps the sign from short price versus long price", () => {
    expect(calculateDirectionalPriceSpread(99_000, 100_000)).toBeCloseTo(-1, 4);
    expect(calculateDirectionalPriceSpread(101_000, 100_000)).toBeCloseTo(1, 4);
  });
});
