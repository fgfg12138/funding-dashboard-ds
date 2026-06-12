/**
 * Real HTX Connector Tests — Non-Bybit Exchange Expansion Plan
 *
 * ⏸️ SKIPPED by default. Enable with RUN_HTX_READONLY_CONNECTOR=true
 */

import { describe, expect, it } from "vitest";
import { RealHtxConnector } from "./RealHtxConnector";
import type { ExchangeConnector } from "../connectorTypes";
import type { TradingRule } from "../tradingRule";
import type { FundingInfo } from "../fundingInfo";

const RUN = process.env.RUN_HTX_READONLY_CONNECTOR === "true";
const SYMBOLS = ["BTCUSDT", "ETHUSDT", "SOLUSDT"];
const describeOrSkip = RUN ? describe : describe.skip;

function isFiniteNumber(v: unknown): v is number {
  return typeof v === "number" && Number.isFinite(v);
}

describeOrSkip("HTX ReadOnly Connector", () => {
  let connector: ExchangeConnector;

  it("1. HTX connector can be created", () => {
    const htx = new RealHtxConnector();
    expect(htx.exchangeId).toBe("htx");
    expect(htx.baseUrl).toBe("https://api.hbdm.com");
    connector = htx;
  });

  it("2. health is healthy or degraded", async () => {
    const h = await connector.getHealth();
    expect(["healthy", "degraded"]).toContain(h.status);
    console.log(`  ✅ HTX health: ${h.status}${h.lastRestLatencyMs ? ` (${h.lastRestLatencyMs}ms)` : ""}`);
  });

  it("3. trading rules readable for BTCUSDT, ETHUSDT, SOLUSDT", async () => {
    const rules = await connector.getTradingRules() as TradingRule[];
    expect(rules.length).toBeGreaterThanOrEqual(3);

    for (const sym of SYMBOLS) {
      const rule = rules.find((r) => r.canonicalSymbol === sym);
      expect(rule, `Trading rule missing for ${sym}`).toBeDefined();
      expect(rule!.exchangeSymbol).toBe(HTX_EXPECTED[sym]);
      expect(rule!.minPriceIncrement).toBeGreaterThan(0);
      expect(rule!.minBaseAmountIncrement).toBeGreaterThan(0);
    }
    console.log(`  ✅ HTX trading rules: ${rules.length} total`);
  });

  it("4. funding info readable for BTCUSDT, ETHUSDT, SOLUSDT", async () => {
    for (const sym of SYMBOLS) {
      const info = await connector.getFundingInfo(sym) as FundingInfo | undefined;
      expect(info, `Funding info missing for ${sym}`).toBeDefined();
      expect(info!.exchangeSymbol).toBe(HTX_EXPECTED[sym]);
    }
    console.log(`  ✅ HTX funding info: all ${SYMBOLS.length} symbols readable`);
  });

  it("5. funding rate is a finite number", async () => {
    for (const sym of SYMBOLS) {
      const info = await connector.getFundingInfo(sym) as FundingInfo | undefined;
      expect(isFiniteNumber(info!.lastFundingRate)).toBe(true);
    }
    console.log(`  ✅ HTX funding rates: all finite`);
  });

  it("6. mark price > 0 and finite", async () => {
    for (const sym of SYMBOLS) {
      const info = await connector.getFundingInfo(sym) as FundingInfo | undefined;
      expect(info!.markPrice).toBeGreaterThan(0);
      expect(isFiniteNumber(info!.markPrice)).toBe(true);
    }
    console.log(`  ✅ HTX mark prices: all > 0`);
  });

  it("7. symbol mapping correct: BTCUSDT → BTC-USDT", async () => {
    const rules = await connector.getTradingRules() as TradingRule[];
    expect(rules.find((r) => r.canonicalSymbol === "BTCUSDT")!.exchangeSymbol).toBe("BTC-USDT");
    expect(rules.find((r) => r.canonicalSymbol === "ETHUSDT")!.exchangeSymbol).toBe("ETH-USDT");
    expect(rules.find((r) => r.canonicalSymbol === "SOLUSDT")!.exchangeSymbol).toBe("SOL-USDT");
    console.log(`  ✅ HTX symbol mapping: BTCUSDT→BTC-USDT, ETHUSDT→ETH-USDT, SOLUSDT→SOL-USDT`);
  });

  it("8. all trading methods throw 'Trading disabled'", async () => {
    for (const method of [
      connector.createOrder({ exchangeId: "htx", canonicalSymbol: "BTCUSDT", exchangeSymbol: "BTC-USDT", side: "buy", type: "limit", quantity: 1 }),
      connector.cancelOrder("test", "BTCUSDT"),
      connector.getOpenOrders(),
      connector.getBalances(),
      connector.getPositions(),
      connector.getOrder("test", "BTCUSDT"),
    ]) {
      await expect(method).rejects.toThrow("Trading disabled");
    }
    console.log(`  ✅ HTX: all 6 trading methods blocked`);
  });

  it("9. no POST/PUT/DELETE in source", () => {
    const fs = require("fs");
    const source = fs.readFileSync(require.resolve("./RealHtxConnector.ts"), "utf-8");
    expect(source).not.toContain('method: "POST"');
    expect(source).not.toContain('method: "PUT"');
    expect(source).not.toContain('method: "DELETE"');
    console.log(`  ✅ HTX: no POST/PUT/DELETE in source`);
  });

  it("10. no NaN / Infinity", async () => {
    for (const sym of SYMBOLS) {
      const info = await connector.getFundingInfo(sym) as FundingInfo | undefined;
      expect(isFiniteNumber(info!.markPrice)).toBe(true);
      expect(isFiniteNumber(info!.lastFundingRate)).toBe(true);
      expect(isFiniteNumber(info!.nextFundingTime)).toBe(true);
    }
    console.log(`  ✅ HTX: all funding data finite`);
  });
});

const HTX_EXPECTED: Record<string, string> = {
  BTCUSDT: "BTC-USDT",
  ETHUSDT: "ETH-USDT",
  SOLUSDT: "SOL-USDT",
};
