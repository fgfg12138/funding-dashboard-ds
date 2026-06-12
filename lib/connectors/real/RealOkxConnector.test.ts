/**
 * Real OKX Connector Hardening Tests — Non-Bybit Exchange Expansion Plan
 *
 * Verifies OKX read-only connector can be used long-term for spread engine.
 * ⏸️ SKIPPED by default. Enable with RUN_OKX_READONLY_HARDENING=true
 */

import { describe, expect, it } from "vitest";
import { RealOkxConnector } from "./RealOkxConnector";
import type { ExchangeConnector } from "../connectorTypes";
import type { TradingRule } from "../tradingRule";
import type { FundingInfo } from "../fundingInfo";

const RUN = process.env.RUN_OKX_READONLY_HARDENING === "true";
const SYMBOLS = ["BTCUSDT", "ETHUSDT", "SOLUSDT"];
const describeOrSkip = RUN ? describe : describe.skip;

function isFiniteNumber(v: unknown): v is number {
  return typeof v === "number" && Number.isFinite(v);
}

describeOrSkip("OKX ReadOnly Connector Hardening", () => {
  let connector: ExchangeConnector;

  it("1. OKX baseUrl is correct (not mainnet, not testnet)", () => {
    const okx = new RealOkxConnector();
    expect(okx.baseUrl).toBe("https://www.okx.com");
    expect(okx.exchangeId).toBe("okx");
  });

  it("2. health is healthy or degraded (not down)", async () => {
    connector = new RealOkxConnector();
    const h = await connector.getHealth();
    expect(["healthy", "degraded"]).toContain(h.status);
    console.log(`  ✅ OKX health: ${h.status}${h.lastRestLatencyMs ? ` (${h.lastRestLatencyMs}ms)` : ""}`);
  });

  it("3. trading rules readable for BTCUSDT, ETHUSDT, SOLUSDT", async () => {
    const rules = await connector.getTradingRules() as TradingRule[];
    expect(rules.length).toBeGreaterThanOrEqual(3);

    for (const sym of SYMBOLS) {
      const rule = rules.find((r) => r.canonicalSymbol === sym);
      expect(rule, `Trading rule missing for ${sym}`).toBeDefined();
      expect(rule!.exchangeSymbol).toBe(OKX_SYMBOL_MAP[sym]);
      expect(rule!.minPriceIncrement).toBeGreaterThan(0);
      expect(rule!.minBaseAmountIncrement).toBeGreaterThan(0);
      expect(rule!.minNotional).toBeGreaterThan(0);
    }

    console.log(`  ✅ OKX trading rules: ${rules.length} total, ${SYMBOLS.join(", ")} present`);
  });

  it("4. funding info readable for BTCUSDT, ETHUSDT, SOLUSDT", async () => {
    for (const sym of SYMBOLS) {
      const info = await connector.getFundingInfo(sym) as FundingInfo | undefined;
      expect(info, `Funding info missing for ${sym}`).toBeDefined();
      expect(info!.exchangeSymbol).toBe(OKX_SYMBOL_MAP[sym]);
    }
    console.log(`  ✅ OKX funding info: ${SYMBOLS.join(", ")} all readable`);
  });

  it("5. funding rate is a finite number", async () => {
    for (const sym of SYMBOLS) {
      const info = await connector.getFundingInfo(sym) as FundingInfo | undefined;
      expect(isFiniteNumber(info!.lastFundingRate)).toBe(true);
    }
    console.log(`  ✅ OKX funding rates: all finite`);
  });

  it("6. mark price is a finite number > 0", async () => {
    for (const sym of SYMBOLS) {
      const info = await connector.getFundingInfo(sym) as FundingInfo | undefined;
      expect(isFiniteNumber(info!.markPrice)).toBe(true);
      expect(info!.markPrice).toBeGreaterThan(0);
    }
    console.log(`  ✅ OKX mark prices: all > 0`);
  });

  it("7. symbol mapping correct: BTCUSDT → BTC-USDT-SWAP", async () => {
    const okx = connector as RealOkxConnector;
    const rules = await okx.getTradingRules() as TradingRule[];
    const btc = rules.find((r) => r.canonicalSymbol === "BTCUSDT")!;
    expect(btc.exchangeSymbol).toBe("BTC-USDT-SWAP");

    const eth = rules.find((r) => r.canonicalSymbol === "ETHUSDT")!;
    expect(eth.exchangeSymbol).toBe("ETH-USDT-SWAP");

    const sol = rules.find((r) => r.canonicalSymbol === "SOLUSDT")!;
    expect(sol.exchangeSymbol).toBe("SOL-USDT-SWAP");

    console.log(`  ✅ OKX symbol mapping: BTCUSDT→${btc.exchangeSymbol}, ETHUSDT→${eth.exchangeSymbol}, SOLUSDT→${sol.exchangeSymbol}`);
  });

  it("8. createOrder/cancelOrder throw 'Trading disabled'", async () => {
    await expect(connector.createOrder({ exchangeId: "okx", canonicalSymbol: "BTCUSDT", exchangeSymbol: "BTC-USDT-SWAP", side: "buy", type: "limit", quantity: 0.1 }))
      .rejects.toThrow("Trading disabled");
    await expect(connector.cancelOrder("test", "BTCUSDT"))
      .rejects.toThrow("Trading disabled");
    await expect(connector.getOpenOrders()).rejects.toThrow("Trading disabled");
    await expect(connector.getBalances()).rejects.toThrow("Trading disabled");
    await expect(connector.getPositions()).rejects.toThrow("Trading disabled");
    await expect(connector.getOrder("test", "BTCUSDT")).rejects.toThrow("Trading disabled");
    console.log(`  ✅ OKX: all 6 trading methods blocked`);
  });

  it("9. no POST/PUT/DELETE in source code", () => {
    const fs = require("fs");
    const source = fs.readFileSync(__filename.replace(".test.", "."), "utf-8");
    // Also check the base class and this connector
    const baseSource = fs.readFileSync(require.resolve("./RealConnectorBase.ts"), "utf-8");
    const all = source + baseSource;
    expect(all).not.toContain('method: "POST"');
    expect(all).not.toContain('method: "PUT"');
    expect(all).not.toContain('method: "DELETE"');
    console.log(`  ✅ OKX: no POST/PUT/DELETE in source`);
  });

  it("10. no NaN / Infinity in funding data", async () => {
    for (const sym of SYMBOLS) {
      const info = await connector.getFundingInfo(sym) as FundingInfo | undefined;
      expect(isFiniteNumber(info!.markPrice)).toBe(true);
      expect(isFiniteNumber(info!.lastFundingRate)).toBe(true);
      expect(isFiniteNumber(info!.nextFundingTime)).toBe(true);
    }
    console.log(`  ✅ OKX: all funding data finite (no NaN/Infinity)`);
  });
});

// ─── Symbol map for tests ───────────────────────────────

const OKX_SYMBOL_MAP: Record<string, string> = {
  BTCUSDT: "BTC-USDT-SWAP",
  ETHUSDT: "ETH-USDT-SWAP",
  SOLUSDT: "SOL-USDT-SWAP",
};
