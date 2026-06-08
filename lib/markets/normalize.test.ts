import { describe, expect, it } from "vitest";
import { normalizeSymbol } from "./normalize";

describe("normalizeSymbol", () => {
  it("normalizes compact exchange symbols", () => {
    expect(normalizeSymbol("BTCUSDT")).toEqual({
      base: "BTC",
      quote: "USDT",
      symbol: "BTC/USDT"
    });
  });

  it("normalizes dashed swap symbols", () => {
    expect(normalizeSymbol("ETH-USDT-SWAP")).toEqual({
      base: "ETH",
      quote: "USDT",
      symbol: "ETH/USDT"
    });
  });

  it("uppercases symbols before normalization", () => {
    expect(normalizeSymbol("solusdt").symbol).toBe("SOL/USDT");
  });
});
