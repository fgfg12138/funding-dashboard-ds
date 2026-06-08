import { describe, expect, it } from "vitest";
import { normalizeSymbol } from "../lib/markets/normalize";

describe("normalizeSymbol", () => {
  it("normalizes Binance style symbols", () => {
    expect(normalizeSymbol("BTCUSDT")).toEqual({
      base: "BTC",
      quote: "USDT",
      symbol: "BTC/USDT"
    });
  });

  it("normalizes OKX swap symbols", () => {
    expect(normalizeSymbol("BTC-USDT-SWAP")).toEqual({
      base: "BTC",
      quote: "USDT",
      symbol: "BTC/USDT"
    });
  });
});
