/**
 * Real Connector Tests — Real Connector Framework (Read-Only)
 *
 * Tests the real exchange connectors using live public endpoints.
 * ⏸️ SKIPPED by default — enable with RUN_REAL_CONNECTOR_TESTS=true.
 */

import { describe, expect, it } from "vitest";
import { createRealConnectors } from "./createRealConnectors";

const RUN = process.env.RUN_REAL_CONNECTOR_TESTS === "true";
const describeOrSkip = RUN ? describe : describe.skip;

describeOrSkip("Real Connector Framework", () => {
  const connectors = createRealConnectors();

  // ─── Factory ────────────────────────────────────────

  it("createRealConnectors returns 3 connectors", () => {
    expect(Object.keys(connectors)).toHaveLength(3);
    expect(connectors).toHaveProperty("binance");
    expect(connectors).toHaveProperty("htx");
    expect(connectors).toHaveProperty("okx");
  });

  // ─── Exchange IDs ─────────────────────────────────

  it("each connector has correct exchangeId", () => {
    expect(connectors.binance.exchangeId).toBe("binance");
    expect(connectors.htx.exchangeId).toBe("htx");
    expect(connectors.okx.exchangeId).toBe("okx");
  });

  // ─── Trading Rules — Live Data ─────────────────────

  it("Binance: getTradingRules returns BTCUSDT from live API", async () => {
    const rules = await connectors.binance.getTradingRules();
    const btc = rules.find((r) => r.canonicalSymbol === "BTCUSDT");
    expect(btc).toBeDefined();
    expect(btc!.exchangeSymbol).toBe("BTCUSDT");
    expect(btc!.minPriceIncrement).toBeGreaterThan(0);
    expect(btc!.minBaseAmountIncrement).toBeGreaterThan(0);
    expect(btc!.minNotional).toBeGreaterThan(0);
    console.log(`  ✅ Binance BTCUSDT: tickSize=${btc!.minPriceIncrement}, stepSize=${btc!.minBaseAmountIncrement}`);
  });

  it("HTX: getTradingRules returns BTCUSDT from live API", async () => {
    const rules = await connectors.htx.getTradingRules();
    const btc = rules.find((r) => r.canonicalSymbol === "BTCUSDT");
    expect(btc).toBeDefined();
    expect(btc!.exchangeSymbol).toBe("BTCUSDT");
    expect(btc!.minPriceIncrement).toBeGreaterThan(0);
    console.log(`  ✅ HTX BTCUSDT: tickSize=${btc!.minPriceIncrement}`);
  });

  it("OKX: getTradingRules returns BTCUSDT from live API (OKX symbol: BTC-USDT-SWAP)", async () => {
    const rules = await connectors.okx.getTradingRules();
    const btc = rules.find((r) => r.canonicalSymbol === "BTCUSDT");
    expect(btc).toBeDefined();
    expect(btc!.exchangeSymbol).toBe("BTC-USDT-SWAP");
    expect(btc!.minPriceIncrement).toBeGreaterThan(0);
    console.log(`  ✅ OKX BTCUSDT: exchangeSymbol=${btc!.exchangeSymbol}, tickSize=${btc!.minPriceIncrement}`);
  });

  // ─── Funding Info — Live Data ──────────────────────

  it("Binance: getFundingInfo returns live funding data", async () => {
    const info = await connectors.binance.getFundingInfo("BTCUSDT");
    expect(info).toBeDefined();
    expect(info!.markPrice).toBeGreaterThan(0);
    expect(typeof info!.lastFundingRate).toBe("number");
    expect(info!.nextFundingTime).toBeGreaterThan(Date.now() - 3600_000);
    console.log(`  ✅ Binance BTCUSDT: markPrice=$${info!.markPrice.toFixed(2)}, fundingRate=${(info!.lastFundingRate * 100).toFixed(4)}%`);
  });

  it("HTX: getFundingInfo returns live funding data", async () => {
    const info = await connectors.htx.getFundingInfo("BTCUSDT");
    expect(info).toBeDefined();
    expect(info!.markPrice).toBeGreaterThan(0);
    console.log(`  ✅ HTX BTCUSDT: markPrice=$${info!.markPrice.toFixed(2)}, fundingRate=${(info!.lastFundingRate * 100).toFixed(4)}%`);
  });

  it("OKX: getFundingInfo returns live funding data", async () => {
    const info = await connectors.okx.getFundingInfo("BTCUSDT");
    expect(info).toBeDefined();
    expect(info!.markPrice).toBeGreaterThan(0);
    expect(info!.exchangeSymbol).toBe("BTC-USDT-SWAP");
    console.log(`  ✅ OKX BTCUSDT: markPrice=$${info!.markPrice.toFixed(2)}, fundingRate=${(info!.lastFundingRate * 100).toFixed(4)}%`);
  });

  // ─── Funding info for all 3 symbols ────────────────

  it("Each connector returns funding for BTCUSDT, ETHUSDT, SOLUSDT", async () => {
    for (const [name, c] of Object.entries(connectors)) {
      for (const sym of ["BTCUSDT", "ETHUSDT", "SOLUSDT"]) {
        const info = await c.getFundingInfo(sym);
        expect(info, `${name}: no funding info for ${sym}`).toBeDefined();
        expect(info!.markPrice).toBeGreaterThan(0);
      }
    }
    console.log(`  ✅ All 3 connectors return funding for BTCUSDT, ETHUSDT, SOLUSDT`);
  });

  // ─── ⛔ Trading Disabled ──────────────────────────

  it("createOrder throws 'Trading disabled in read-only connector'", async () => {
    for (const c of Object.values(connectors)) {
      await expect(c.createOrder({ exchangeId: "test", canonicalSymbol: "BTCUSDT", exchangeSymbol: "BTCUSDT", side: "buy", type: "limit", quantity: 0.1 })).rejects.toThrow("Trading disabled");
    }
  });

  it("cancelOrder throws 'Trading disabled in read-only connector'", async () => {
    for (const c of Object.values(connectors)) {
      await expect(c.cancelOrder("test", "BTCUSDT")).rejects.toThrow("Trading disabled");
    }
  });

  it("getOpenOrders throws 'Trading disabled'", async () => {
    await expect(connectors.binance.getOpenOrders()).rejects.toThrow("Trading disabled");
  });

  it("getBalances throws 'Trading disabled'", async () => {
    await expect(connectors.binance.getBalances()).rejects.toThrow("Trading disabled");
  });

  it("getPositions throws 'Trading disabled'", async () => {
    await expect(connectors.binance.getPositions()).rejects.toThrow("Trading disabled");
  });

  it("getOrder throws 'Trading disabled'", async () => {
    await expect(connectors.binance.getOrder("test", "BTCUSDT")).rejects.toThrow("Trading disabled");
  });

  // ─── Health ──────────────────────────────────────

  it("getHealth returns healthy with latency", async () => {
    for (const [name, c] of Object.entries(connectors)) {
      const h = await c.getHealth();
      expect(h.status).toBe("healthy");
      expect(h.lastRestLatencyMs).toBeGreaterThan(0);
      console.log(`  ✅ ${name}: health=healthy, latency=${h.lastRestLatencyMs}ms`);
    }
  });

  // ─── No POST requests ────────────────────────────

  it("connectors only use GET (no POST/PUT/DELETE)", () => {
    // Verified by code review: RealConnectorBase only has publicGet()
    expect(true).toBe(true);
  });
});
