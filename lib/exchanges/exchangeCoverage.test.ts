import { describe, expect, it } from "vitest";
import { formatExchangeCoverage, getExchangeCoverageTitle } from "./exchangeCoverage";

describe("exchangeCoverage", () => {
  it("formats coverage count with Chinese exchange unit", () => {
    expect(formatExchangeCoverage(["Binance", "OKX"])).toBe("2家");
    expect(formatExchangeCoverage(["Binance", "OKX", "Bybit", "Gate", "Bitget"])).toBe("5家");
  });

  it("builds dynamic title text from exchange arrays", () => {
    expect(getExchangeCoverageTitle(["Binance", "OKX", "Bybit", "Gate", "Bitget", "MEXC", "KuCoin", "Hyperliquid"]))
      .toBe("Binance、OKX、Bybit、Gate、Bitget、MEXC、KuCoin、Hyperliquid");
  });
});
