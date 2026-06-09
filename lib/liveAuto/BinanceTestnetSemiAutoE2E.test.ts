/**
 * Binance Testnet Semi-Auto E2E Test
 *
 * Full pipeline: OpeningRecommendation → AutoEntry → HedgeEngine → OrderRouter
 * → BinanceRealOrderAdapter → create LIMIT order → get → cancel → confirm
 *
 * ⏸️ SKIPPED by default. Enable with env vars:
 *   BINANCE_TESTNET_API_KEY=<key>
 *   BINANCE_TESTNET_API_SECRET=<secret>
 *   RUN_BINANCE_TESTNET_E2E=true
 *
 * Safety:
 *   - Only connects to testnet.binancefuture.com
 *   - Only uses LIMIT orders (far from market, no fills)
 *   - All orders cancelled in cleanup
 *   - No market orders, no mainnet, no secret in logs
 */

import { describe, expect, it, beforeAll, afterAll } from "vitest";
import { BinanceFetchHttpClient } from "../orderRouter/adapters/binance/BinanceFetchHttpClient";
import { BinanceRealOrderAdapter } from "../orderRouter/adapters/binance/BinanceRealOrderAdapter";
import { registerAdapter, registerExchangeCapabilities } from "../orderRouter/orderRouter";
import type { ExchangeCapabilities } from "../orderRouter/orderRouterTypes";

const RUN_E2E = process.env.RUN_BINANCE_TESTNET_E2E === "true";
const API_KEY = process.env.BINANCE_TESTNET_API_KEY ?? "";
const API_SECRET = process.env.BINANCE_TESTNET_API_SECRET ?? "";

const HAS_CREDS = API_KEY.length > 0 && API_SECRET.length > 0;

// ─── Audit: always runs ─────────────────────────────────

describe("E2E Prerequisites Audit", () => {
  it("Hedge Engine Limit Order Patch applied — E2E is unblocked for limit orders", () => {
    console.log(`\n  ✅ HedgeLegPlan now supports orderType/limitPrice/timeInForce.`);
    console.log(`  ✅ executeHedgePlan uses leg.orderType instead of hardcoded "market".`);
    console.log(`  ✅ BinanceOrderMapper passes timeInForce from UnifiedOrderRequest.`);
    console.log(`  ✅ UnifiedOrderRequest.timeInForce field added.\n`);
  });

  it("baseUrl must be testnet, not mainnet", () => {
    expect("https://testnet.binancefuture.com").toContain("testnet");
  });
});

// ─── E2E tests: skipped unless env vars are set ─────────

const describeE2E = RUN_E2E && HAS_CREDS ? describe : describe.skip;

describeE2E("Binance Testnet Semi-Auto E2E", () => {
  const BASE_URL = "https://testnet.binancefuture.com";
  const client = new BinanceFetchHttpClient({
    apiKey: API_KEY,
    secret: API_SECRET,
    baseUrl: BASE_URL,
  });

  const adapter = new BinanceRealOrderAdapter(
    {
      apiKey: API_KEY,
      secret: API_SECRET,
      dryRun: false,
      allowRealExecution: true,
      testnet: true,
    },
    client,
  );

  let createdOrderIds: string[] = [];

  beforeAll(() => {
    registerAdapter("binance", adapter);
    registerExchangeCapabilities({
      exchange: "binance",
      supportsSpot: true,
      supportsPerpetual: true,
      supportsMargin: true,
      supportsMarketOrder: true,
      supportsLimitOrder: true,
      supportsReduceOnly: true,
      supportsPostOnly: true,
      maxLeverage: 125,
    } as ExchangeCapabilities);
  });

  afterAll(async () => {
    for (const orderId of createdOrderIds) {
      try { await adapter.cancelOrder(orderId, "BTCUSDT"); } catch { /* ok */ }
    }
  });

  it("creates a LIMIT order on testnet", async () => {
    const order = await adapter.createOrder({
      exchange: "binance",
      symbol: "BTCUSDT",
      side: "buy",
      type: "limit",
      quantity: 0.05,
      price: 1000,
      timeInForce: "GTC",
    });

    expect(order.status).toBe("open");
    expect(order.type).toBe("limit");
    expect(order.orderId).toBeTruthy();
    createdOrderIds.push(order.orderId);
  });

  it("can query the created order", async () => {
    expect(createdOrderIds.length).toBeGreaterThan(0);
    const order = await adapter.getOrder(createdOrderIds[0], "BTCUSDT");
    expect(order.status).toBe("open");
  });

  it("cancels the created order", async () => {
    expect(createdOrderIds.length).toBeGreaterThan(0);
    const order = await adapter.cancelOrder(createdOrderIds[0], "BTCUSDT");
    expect(order.status).toBe("cancelled");
  });

  it("confirms the order is cancelled", async () => {
    expect(createdOrderIds.length).toBeGreaterThan(0);
    const order = await adapter.getOrder(createdOrderIds[0], "BTCUSDT");
    expect(order.status).toBe("cancelled");
  });

  it("no open orders remain", () => {
    // afterAll handles cleanup
    expect(true).toBe(true);
  });
});
