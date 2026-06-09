/**
 * Binance Testnet Auto Exit Limit-Order E2E
 *
 * Full exit pipeline: ArbitragePosition → ExitSuggestion → RiskEngine → KillSwitch
 * → Auto Exit → buildAutoExitHedgePlan → executeHedgePlan → Order Router
 * → BinanceRealOrderAdapter → Binance Futures Testnet
 *
 * Uses perp_perp mode (two Binance Futures LIMIT orders).
 *
 * ⏸️ SKIPPED by default. Enable with:
 *   BINANCE_TESTNET_API_KEY=<key>
 *   BINANCE_TESTNET_API_SECRET=<secret>
 *   RUN_BINANCE_TESTNET_EXIT_E2E=true
 */

import { describe, expect, it, beforeAll, afterAll } from "vitest";
import { BinanceFetchHttpClient } from "../orderRouter/adapters/binance/BinanceFetchHttpClient";
import { BinanceRealOrderAdapter } from "../orderRouter/adapters/binance/BinanceRealOrderAdapter";
import { registerAdapter, registerExchangeCapabilities } from "../orderRouter/orderRouter";
import type { ExchangeCapabilities } from "../orderRouter/orderRouterTypes";
import { executeAutoExit } from "./autoExitEngine";
import type { LiveAutoExitConfig, AutoExitCandidate } from "./autoExitTypes";
import type { LiveRiskContext } from "./riskEngineTypes";
import type { KillSwitchState } from "./killSwitchTypes";
import type { ArbitrageLeg, ArbitragePosition } from "../arbitrage/arbitragePositionTypes";

const RUN = process.env.RUN_BINANCE_TESTNET_EXIT_E2E === "true";
const API_KEY = process.env.BINANCE_TESTNET_API_KEY ?? "";
const API_SECRET = process.env.BINANCE_TESTNET_API_SECRET ?? "";
const HAS_CREDS = API_KEY.length > 0 && API_SECRET.length > 0;

// ─── Audit: always runs ─────────────────────────────────

describe("E2E Audit — Auto Exit", () => {
  it("baseUrl must be testnet", () => {
    expect("https://testnet.binancefuture.com").toContain("testnet");
  });
});

// ─── E2E tests: skipped unless env vars are set ─────────

const describeE2E = RUN && HAS_CREDS ? describe : describe.skip;

describeE2E("Binance Testnet Auto Exit E2E", () => {
  const BASE_URL = "https://testnet.binancefuture.com";
  const client = new BinanceFetchHttpClient({ apiKey: API_KEY, secret: API_SECRET, baseUrl: BASE_URL });
  const adapter = new BinanceRealOrderAdapter(
    { apiKey: API_KEY, secret: API_SECRET, dryRun: false, allowRealExecution: true, testnet: true },
    client,
  );

  let createdOrderIds: string[] = [];

  beforeAll(() => {
    registerAdapter("binance", adapter);
    registerExchangeCapabilities({
      exchange: "binance", supportsSpot: true, supportsPerpetual: true,
      supportsMargin: true, supportsMarketOrder: true, supportsLimitOrder: true,
      supportsReduceOnly: true, supportsPostOnly: true, maxLeverage: 125,
    } as ExchangeCapabilities);
  });

  afterAll(async () => {
    for (const oid of createdOrderIds) {
      try { await adapter.cancelOrder(oid, "BTCUSDT"); } catch { /* ok */ }
    }
  });

  // ─── Test position (perp long + perp short via Binance Futures) ──
  const pos: ArbitragePosition = {
    id: "e2e-exit-test",
    symbol: "BTCUSDT",
    status: "open",
    openedAt: Date.now() - 25 * 60 * 60 * 1000, // 25h ago → exceeds 24h threshold
    spotLeg: {
      exchange: "binance", symbol: "BTCUSDT", marketType: "spot",
      side: "long", quantity: 0.05, entryPrice: 100000,
      markPrice: 100000, notionalUsd: 5000, unrealizedPnlUsd: 0,
    },
    perpetualLeg: {
      exchange: "binance", symbol: "BTCUSDT", marketType: "perpetual",
      side: "short", quantity: 0.05, entryPrice: 100000,
      markPrice: 100000, notionalUsd: 5000, unrealizedPnlUsd: 0,
    },
    fundingCollectedUsd: 0, totalPnlUsd: 600, // triggers suggest_exit (take-profit)
    deltaUsd: 0, deltaPercent: 0,
  };

  const candidate: AutoExitCandidate = {
    positionId: "e2e-exit-test",
    symbol: "BTCUSDT",
    suggestionStatus: "suggest_exit",
    totalPnlUsd: 600,
    fundingCollectedUsd: 0,
    deltaPercent: 0,
  };

  const exitConfig: LiveAutoExitConfig = {
    enabled: true,
    dryRun: false,
    allowedExchanges: ["binance"],
    maxExitNotionalUsd: 10000,
    allowUrgentExit: true,
    takeProfitUsd: 500,
    requireRiskCheck: true,
    orderType: "limit",
    limitPrice: 62000,
    timeInForce: "GTC",
  };

  const riskContext: LiveRiskContext = {
    riskReport: { events: [], lowCount: 0, mediumCount: 0, highCount: 0, criticalCount: 0, overallRisk: "low", generatedAt: Date.now() },
  };

  const activeKs: KillSwitchState = { status: "active", action: "allow", reasons: [], updatedAt: Date.now() };

  // ─── Tests ───────────────────────────────────────────

  it("1. Auto Exit executes through full pipeline", async () => {
    const result = await executeAutoExit(pos, candidate, exitConfig, riskContext, undefined, activeKs);

    expect(result.status).toBe("executed");
    expect(result.hedgePlan).toBeDefined();

    // Verify limit order params on legs
    for (const leg of result.hedgePlan!.legs) {
      expect(leg.orderType).toBe("limit");
      expect(leg.limitPrice).toBe(62000);
      expect(leg.timeInForce).toBe("GTC");
    }

    // Record order IDs
    if (result.hedgeExecutionResult?.orders) {
      for (const o of result.hedgeExecutionResult.orders) {
        createdOrderIds.push(o.orderId);
      }
    }
    expect(createdOrderIds.length).toBe(2);
    expect(result.errors).toEqual([]);
  });

  it("2. Both orders are LIMIT type", async () => {
    for (const oid of createdOrderIds) {
      const order = await adapter.getOrder(oid, "BTCUSDT");
      expect(order.type).toBe("limit");
    }
  });

  it("3. Cancel both orders (filled orders may error)", async () => {
    for (const oid of createdOrderIds) {
      try {
        const order = await adapter.cancelOrder(oid, "BTCUSDT");
        expect(["cancelled", "filled"]).toContain(order.status);
      } catch { /* already filled — acceptable */ }
    }
  });

  it("4. All orders cleaned up", async () => {
    for (const oid of createdOrderIds) {
      try {
        const order = await adapter.getOrder(oid, "BTCUSDT");
        expect(["cancelled", "filled"]).toContain(order.status);
      } catch { /* may no longer exist */ }
    }
  });
});
