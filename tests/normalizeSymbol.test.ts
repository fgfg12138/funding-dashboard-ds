import { describe, expect, it } from "vitest";
import { normalizeSymbol } from "../lib/markets/normalize";

describe("normalizeSymbol", () => {
  it("normalizes compact and dashed swap symbols", () => {
    expect(normalizeSymbol("ETHUSDT").symbol).toBe("ETH/USDT");
    expect(normalizeSymbol("ETH-USDT-SWAP").symbol).toBe("ETH/USDT");
  });
});
