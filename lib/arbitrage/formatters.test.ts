import { describe, expect, it } from "vitest";
import { formatExchangeDirection } from "./formatters";

describe("formatExchangeDirection", () => {
  it("formats dynamic short and long exchange names", () => {
    expect(formatExchangeDirection({ shortExchange: "Gate", longExchange: "Bitget", spreadPercent: 2.4 })).toEqual({
      direction: "空 Gate / 多 Bitget",
      priceSpreadDirection: "Gate 标记价格高于 Bitget 2.40%"
    });
  });

  it("formats lower short-side mark price", () => {
    expect(formatExchangeDirection({ shortExchange: "Binance", longExchange: "Bybit", spreadPercent: -2.4 })).toEqual({
      direction: "空 Binance / 多 Bybit",
      priceSpreadDirection: "Binance 标记价格低于 Bybit 2.40%"
    });
  });
});
