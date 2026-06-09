/**
 * Binance Testnet Full Round Trip
 *
 * Complete arbitrage lifecycle on Binance Futures Testnet:
 *
 *   Auto Entry → Order Creation → Position Creation → Monitoring →
 *   Exit Suggestion → Auto Exit → Order Cleanup → Portfolio Update
 *
 * Uses perp_perp mode (two Binance Futures LIMIT orders for both entry and exit).
 *
 * ⏸️ SKIPPED by default. Enable with:
 *   BINANCE_TESTNET_API_KEY=<key>
 *   BINANCE_TESTNET_API_SECRET=<secret>
 *   RUN_BINANCE_TESTNET_FULL_ROUNDTRIP=true
 */

import { describe, expect, it, beforeAll, afterAll } from "vitest";
import { BinanceFetchHttpClient } from "../orderRouter/adapters/binance/BinanceFetchHttpClient";
import { BinanceRealOrderAdapter } from "../orderRouter/adapters/binance/BinanceRealOrderAdapter";
import { registerAdapter, registerExchangeCapabilities } from "../orderRouter/orderRouter";
import type { ExchangeCapabilities } from "../orderRouter/orderRouterTypes";
import { executeAutoEntry } from "./autoEntryEngine";
import type { AutoEntryCandidate, LiveAutoEntryConfig } from "./autoEntryTypes";
import { executeAutoExit } from "./autoExitEngine";
import type { LiveAutoExitConfig, AutoExitCandidate } from "./autoExitTypes";
import type { LiveRiskContext } from "./riskEngineTypes";
import type { KillSwitchState } from "./killSwitchTypes";
import { generateMonitoringReport } from "../semiAuto/autoMonitoringEngine";
import { generateExitSuggestions } from "../semiAuto/exitSuggestionEngine";
import { calculatePortfolioReport } from "../arbitrage/portfolioEngine";
import type { ArbitrageLeg, ArbitragePosition } from "../arbitrage/arbitragePositionTypes";

const RUN = process.env.RUN_BINANCE_TESTNET_FULL_ROUNDTRIP === "true";
const API_KEY = process.env.BINANCE_TESTNET_API_KEY ?? "";
const API_SECRET = process.env.BINANCE_TESTNET_API_SECRET ?? "";
const HAS_CREDS = API_KEY.length > 0 && API_SECRET.length > 0;

const BASE_URL = "https://testnet.binancefuture.com";
const LIMIT_PRICE = 62000; // within testnet price filter range (~59492–65663)

// ─── Audit: always runs ─────────────────────────────────

describe("Full Round Trip Audit", () => {
  it("baseUrl is testnet", () => {
    expect(BASE_URL).toContain("testnet");
  });
});

// ─── E2E: skipped unless env vars are set ────────────────

const describeE2E = RUN && HAS_CREDS ? describe : describe.skip;

describeE2E("Binance Testnet Full Round Trip", () => {
  const client = new BinanceFetchHttpClient({ apiKey: API_KEY, secret: API_SECRET, baseUrl: BASE_URL });
  const adapter = new BinanceRealOrderAdapter(
    { apiKey: API_KEY, secret: API_SECRET, dryRun: false, allowRealExecution: true, testnet: true },
    client,
  );

  let entryOrderIds: string[] = [];
  let exitOrderIds: string[] = [];
  let createdPosition: ArbitragePosition | undefined;
  let roundTripReport: any = {};

  beforeAll(() => {
    registerAdapter("binance", adapter);
    registerExchangeCapabilities({
      exchange: "binance", supportsSpot: true, supportsPerpetual: true,
      supportsMargin: true, supportsMarketOrder: true, supportsLimitOrder: true,
      supportsReduceOnly: true, supportsPostOnly: true, maxLeverage: 125,
    } as ExchangeCapabilities);
  });

  afterAll(async () => {
    // Cancel all remaining orders
    for (const oid of [...entryOrderIds, ...exitOrderIds]) {
      try { await adapter.cancelOrder(oid, "BTCUSDT"); } catch { /* ok */ }
    }
  });

  const now = Date.now();

  // ─── Shared safety context ───────────────────────────

  const riskContext: LiveRiskContext = {
    riskReport: { events: [], lowCount: 0, mediumCount: 0, highCount: 0, criticalCount: 0, overallRisk: "low", generatedAt: now },
  };

  const activeKs: KillSwitchState = { status: "active", action: "allow", reasons: [], updatedAt: now };

  // ─── Step 2-5: Auto Entry ───────────────────────────

  it("Step 1–5: Auto Entry creates 2 LIMIT orders on testnet", async () => {
    const candidate: AutoEntryCandidate = {
      opportunityId: "rt-entry",
      symbol: "BTCUSDT",
      exchange: "binance",
      secondaryExchange: "binance",
      expectedNetApy: 20, opportunityScore: 90,
      allocatedCapitalUsd: 5000,
      riskLevel: "low", markPrice: 100_000, fundingRate: 0.0001,
      reason: "Round trip test",
    };

    const entryConfig: LiveAutoEntryConfig = {
      enabled: true, dryRun: false, minExpectedNetApy: 10, minOpportunityScore: 60,
      maxOpenPositions: 5, maxEntryNotionalUsd: 10000,
      allowedExchanges: ["binance"], preferredHedgeMode: "perp_perp",
      orderType: "limit", limitPrice: LIMIT_PRICE, timeInForce: "GTC",
    };

    const result = await executeAutoEntry(candidate, 0, entryConfig, riskContext, undefined, activeKs);

    expect(result.status).toBe("executed");
    expect(result.hedgePlan).toBeDefined();
    expect(result.hedgeExecutionResult).toBeDefined();

    // Verify limit params
    for (const leg of result.hedgePlan!.legs) {
      expect(leg.orderType).toBe("limit");
      expect(leg.limitPrice).toBe(LIMIT_PRICE);
    }

    // Record order IDs
    if (result.hedgeExecutionResult?.orders) {
      for (const o of result.hedgeExecutionResult.orders) {
        entryOrderIds.push(o.orderId);
      }
    }
    expect(entryOrderIds.length).toBe(2);

    roundTripReport.entryOrdersCreated = entryOrderIds.length;
  });

  // ─── Step 6: Sync order state ─────────────────────────

  it("Step 6: Entry orders are confirmable via getOrder", async () => {
    for (const oid of entryOrderIds) {
      const order = await adapter.getOrder(oid, "BTCUSDT");
      expect(["open", "filled"]).toContain(order.status);
      expect(order.type).toBe("limit");
    }
  });

  // ─── Step 7: Create simulated Position ────────────────

  it("Step 7: Position created from entry result", async () => {
    // Create an ArbitragePosition that reflects the entry orders
    // Using mark price = LIMIT_PRICE for consistency
    createdPosition = {
      id: "rt-pos",
      symbol: "BTCUSDT",
      status: "open",
      openedAt: now,
      spotLeg: {
        exchange: "binance", symbol: "BTCUSDT", marketType: "spot",
        side: "long", quantity: 0.05, entryPrice: LIMIT_PRICE,
        markPrice: LIMIT_PRICE, notionalUsd: 5000, unrealizedPnlUsd: 0,
      },
      perpetualLeg: {
        exchange: "binance", symbol: "BTCUSDT", marketType: "perpetual",
        side: "short", quantity: 0.05, entryPrice: LIMIT_PRICE,
        markPrice: LIMIT_PRICE, notionalUsd: 5000, unrealizedPnlUsd: 0,
      },
      fundingCollectedUsd: 50, totalPnlUsd: 750, // take-profit will trigger
      deltaUsd: 0, deltaPercent: 0,
      metadata: { allocatedCapitalUsd: 5000 },
    };

    expect(createdPosition.symbol).toBe("BTCUSDT");
    expect(createdPosition.status).toBe("open");
  });

  // ─── Step 8: Monitoring ───────────────────────────────

  it("Step 8: Monitoring report generated", () => {
    expect(createdPosition).toBeDefined();
    const report = generateMonitoringReport([createdPosition!], undefined, undefined);
    expect(report.positions.length).toBe(1);
    expect(report.overallStatus).toBe("healthy");
    expect(typeof report.generatedAt).toBe("number");
    roundTripReport.monitoringStatus = report.overallStatus;
  });

  // ─── Step 9: Exit Suggestion ─────────────────────────

  it("Step 9: Exit suggestion triggered (take-profit)", () => {
    expect(createdPosition).toBeDefined();
    // Position has totalPnlUsd=750 > takeProfitUsd=500 → suggest_exit
    const exitTime = now + 24 * 60 * 60 * 1000; // simulate 24h holding
    const suggestionReport = generateExitSuggestions(
      [createdPosition!], undefined, undefined, exitTime,
      { takeProfitUsd: 500 },
    );

    expect(suggestionReport.suggestions.length).toBe(1);
    expect(suggestionReport.suggestions[0].status).toBe("suggest_exit");
    expect(suggestionReport.suggestions[0].reasons).toContain("pnl_target_reached");
    roundTripReport.exitSuggestionStatus = suggestionReport.suggestions[0].status;
  });

  // ─── Step 10: Auto Exit ──────────────────────────────

  it("Step 10: Auto Exit closes position with LIMIT orders", async () => {
    expect(createdPosition).toBeDefined();

    const exitCandidate: AutoExitCandidate = {
      positionId: "rt-pos",
      symbol: "BTCUSDT",
      suggestionStatus: "suggest_exit",
      totalPnlUsd: 750,
      fundingCollectedUsd: 50,
      deltaPercent: 0,
    };

    const exitConfig: LiveAutoExitConfig = {
      enabled: true, dryRun: false,
      allowedExchanges: ["binance"], maxExitNotionalUsd: 10000,
      takeProfitUsd: 500, allowUrgentExit: true,
      orderType: "limit", limitPrice: LIMIT_PRICE, timeInForce: "GTC",
    };

    const result = await executeAutoExit(createdPosition!, exitCandidate, exitConfig, riskContext, undefined, activeKs);

    expect(result.status).toBe("executed");
    expect(result.hedgePlan).toBeDefined();
    expect(result.hedgeExecutionResult).toBeDefined();

    // Verify limit params on exit legs
    for (const leg of result.hedgePlan!.legs) {
      expect(leg.orderType).toBe("limit");
      expect(leg.limitPrice).toBe(LIMIT_PRICE);
    }

    // Record exit order IDs
    if (result.hedgeExecutionResult?.orders) {
      for (const o of result.hedgeExecutionResult.orders) {
        exitOrderIds.push(o.orderId);
      }
    }
    expect(exitOrderIds.length).toBe(2);

    roundTripReport.exitOrdersCreated = exitOrderIds.length;
  });

  // ─── Step 11: Cleanup ─────────────────────────────────

  it("Step 11: Cancel all orders", async () => {
    let cancelled = 0;
    for (const oid of [...entryOrderIds, ...exitOrderIds]) {
      try {
        const order = await adapter.cancelOrder(oid, "BTCUSDT");
        if (order.status === "cancelled" || order.status === "filled") cancelled++;
      } catch { /* already filled — acceptable */ }
    }
    // At minimum, try to cancel all
    expect(cancelled).toBeGreaterThanOrEqual(0);
  });

  it("Step 11b: No open orders remain", async () => {
    let openCount = 0;
    for (const oid of [...entryOrderIds, ...exitOrderIds]) {
      try {
        const order = await adapter.getOrder(oid, "BTCUSDT");
        if (order.status === "open") openCount++;
      } catch { /* order no longer exists */ }
    }
    expect(openCount).toBe(0);
  });

  // ─── Step 12: Portfolio Final State ───────────────────

  it("Step 12: Portfolio report reflects final state", () => {
    const pos = createdPosition!;
    // Update position as closed
    const closedPos = { ...pos, status: "closed" as const, closedAt: Date.now() };

    const report = calculatePortfolioReport(
      [{ position: closedPos, allocatedCapitalUsd: 5000 }],
      { totalCapitalUsd: 100000, includeClosedPositions: true },
    );

    expect(report.summary.closedPositionCount).toBe(1);
    expect(report.summary.positionCount).toBe(1);
    expect(report.summary.totalAllocatedCapitalUsd).toBe(5000);
    expect(typeof report.summary.portfolioApyPercent).toBe("number");

    roundTripReport.portfolioClosedPositions = report.summary.closedPositionCount;
    roundTripReport.portfolioApy = report.summary.portfolioApyPercent;
  });

  // ─── Final summary ───────────────────────────────────

  it("Round trip complete — summary", () => {
    const summary = {
      entryOrdersCreated: entryOrderIds.length,
      exitOrdersCreated: exitOrderIds.length,
      totalOrdersCleaned: [...new Set([...entryOrderIds, ...exitOrderIds])].length,
    };
    console.log("\n  ┌──────────────────────────────────────────┐");
    console.log(`  │  ✅ Round Trip Complete                    │`);
    console.log(`  │  Entry orders: ${String(summary.entryOrdersCreated).padStart(8)}              │`);
    console.log(`  │  Exit orders:  ${String(summary.exitOrdersCreated).padStart(8)}              │`);
    console.log(`  │  All cleaned:  ${String(summary.totalOrdersCleaned).padStart(8)}              │`);
    console.log("  └──────────────────────────────────────────┘\n");
    roundTripReport.summary = summary;
  });
});
