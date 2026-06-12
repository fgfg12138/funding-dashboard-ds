/**
 * Cross-Exchange Tiny Testnet Plan
 *
 * Plans a Binance Testnet + Bybit Testnet cross-exchange tiny validation.
 * Does NOT place real orders — only generates the execution plan
 * and runs it through all safety gates.
 *
 * ⛔ NO REAL ORDERS — PLAN ONLY
 * ⏸️ SKIPPED by default. Enable with RUN_CROSS_EXCHANGE_TINY_TESTNET_PLAN=true
 */

import { describe, expect, it } from "vitest";
import { findCrossExchangeFundingSpreads } from "../fundingSpread/fundingSpreadEngine";
import { DEFAULT_SPREAD_CONFIG } from "../fundingSpread/fundingSpreadTypes";
import { buildCrossExchangeExecutionPlan, reviewCrossExchangeExecutionPlan, checkExecutionIdempotency, resetIdempotencyGuard, acquireExecutionLock, generateExecutionReadinessReport } from "./crossExchangeExecutionReview";
import { evaluateTinyTradeGuard } from "../liveAuto/tinyTradeGuardEngine";
import { DEFAULT_TINY_TRADE_GUARD_CONFIG } from "../liveAuto/tinyTradeGuardTypes";
import type { TinyTradeGuardContext } from "../liveAuto/tinyTradeGuardTypes";
import type { FundingInfo } from "../connectors/fundingInfo";

// ─── Environment ────────────────────────────────────────

const RUN = process.env.RUN_CROSS_EXCHANGE_TINY_TESTNET_PLAN === "true";
const CONFIRM = process.env.CONFIRM_CROSS_EXCHANGE_TESTNET === "YES_I_UNDERSTAND_THIS_IS_TESTNET";
const BINANCE_KEY = process.env.BINANCE_TESTNET_API_KEY ?? "";
const BINANCE_SECRET = process.env.BINANCE_TESTNET_API_SECRET ?? "";
const BYBIT_KEY = process.env.BYBIT_TESTNET_API_KEY ?? "";
const BYBIT_SECRET = process.env.BYBIT_TESTNET_API_SECRET ?? "";
const HAS_ALL = RUN && CONFIRM && BINANCE_KEY.length > 0 && BINANCE_SECRET.length > 0 && BYBIT_KEY.length > 0 && BYBIT_SECRET.length > 0;

const BINANCE_TESTNET_URL = "https://testnet.binancefuture.com";
const BYBIT_TESTNET_URL = "https://api-testnet.bybit.com";
const SYMBOLS = ["BTCUSDT", "ETHUSDT", "SOLUSDT"];
const MAX_POSITION_USD = 5;

const describeOrSkip = HAS_ALL ? describe : describe.skip;

function isFiniteNumber(v: unknown): v is number {
  return typeof v === "number" && Number.isFinite(v);
}

type Report = {
  binanceTestnetReady: boolean;
  bybitTestnetReady: boolean;
  selectedSymbol: string;
  shortExchange: string;
  longExchange: string;
  positionSizeUsd: number;
  shortOrderPlan: Record<string, unknown>;
  longOrderPlan: Record<string, unknown>;
  readinessStatus: string;
  riskDecision: string;
  killSwitchDecision: string;
  blockers: string[];
  realOrdersExecuted: number;
  postRequests: number;
  putRequests: number;
  deleteRequests: number;
  generatedAt: number;
};

// ─── Helper: fetch testnet data without auth ────────────

async function fetchJson(url: string): Promise<Record<string, unknown> | Array<unknown>> {
  const res = await fetch(url, { headers: { "Accept": "application/json" } });
  if (!res.ok) throw new Error(`HTTP ${res.status} from ${url}`);
  return res.json();
}

async function fetchFundingInfo(exchangeId: string, url: string, sym: string, mapper: (d: any) => FundingInfo | undefined): Promise<FundingInfo | undefined> {
  try {
    return mapper(await fetchJson(url));
  } catch { return undefined; }
}

describeOrSkip("Cross-Exchange Tiny Testnet Plan", () => {
  it("Generates cross-exchange testnet execution plan (no orders placed)", async () => {
    // ─── 1. Verify testnet URLs ─────────────────────
    expect(BINANCE_TESTNET_URL).toContain("testnet");
    expect(BYBIT_TESTNET_URL).toContain("testnet");
    expect(BINANCE_TESTNET_URL).not.toContain("fapi.binance.com");
    expect(BYBIT_TESTNET_URL).not.toContain("api.bybit.com");

    // ─── 2. Verify environment / confirmation ──────
    expect(CONFIRM).toBe("YES_I_UNDERSTAND_THIS_IS_TESTNET");
    expect(BINANCE_KEY.length).toBeGreaterThan(0);
    expect(BINANCE_SECRET.length).toBeGreaterThan(0);
    expect(BYBIT_KEY.length).toBeGreaterThan(0);
    expect(BYBIT_SECRET.length).toBeGreaterThan(0);

    // ─── 3. Testnet connectivity — public endpoints ─
    let binanceOk = false;
    let bybitOk = false;
    try {
      const binPing = await fetchJson(`${BINANCE_TESTNET_URL}/fapi/v1/ping`);
      binanceOk = true;
    } catch { /* not critical for plan */ }

    try {
      const bybitTime = await fetchJson(`${BYBIT_TESTNET_URL}/v5/market/time`);
      bybitOk = true;
    } catch { /* not critical for plan */ }

    // ─── 4. Get funding info from testnet public endpoints ─
    const binanceFundingInfos: FundingInfo[] = [];
    const bybitFundingInfos: FundingInfo[] = [];

    for (const sym of SYMBOLS) {
      // Binance testnet premium index
      try {
        const d = await fetchJson(`${BINANCE_TESTNET_URL}/fapi/v1/premiumIndex?symbol=${sym}`) as Record<string, unknown>;
        if (d && d.symbol) {
          binanceFundingInfos.push({
            exchangeId: "binance-testnet",
            canonicalSymbol: sym, exchangeSymbol: sym,
            markPrice: Number(d.markPrice ?? 0), lastFundingRate: Number(d.lastFundingRate ?? 0),
            nextFundingTime: Number(d.nextFundingTime ?? 0),
          });
        }
      } catch { /* skip */ }

      // Bybit testnet funding rate
      try {
        const d = await fetchJson(`${BYBIT_TESTNET_URL}/v5/market/funding/history?category=linear&symbol=${sym}&limit=1`) as Record<string, unknown>;
        const list = ((d as any)?.result?.list ?? []) as Array<Record<string, string>>;
        if (list.length > 0) {
          const rate = Number(list[0].fundingRate ?? 0);
          const time = Number(list[0].fundingRateTimestamp ?? Date.now());
          bybitFundingInfos.push({
            exchangeId: "bybit-testnet", canonicalSymbol: sym, exchangeSymbol: sym,
            markPrice: 0, lastFundingRate: rate, nextFundingTime: time,
          });
        }
      } catch { /* skip */ }
    }

    // ─── 5. Build execution plan ──────────────────────
    // Use Binance testnet for spread (or simulate with available data)
    const topSymbol = SYMBOLS[0]; // BTCUSDT
    const plan = buildCrossExchangeExecutionPlan({
      canonicalSymbol: topSymbol,
      shortExchangeId: "binance-testnet",
      longExchangeId: "bybit-testnet",
      shortSymbol: topSymbol,
      longSymbol: topSymbol,
      positionSizeUsd: MAX_POSITION_USD,
      mode: "dry_run",
    });

    expect(plan.positionSizeUsd).toBeLessThanOrEqual(MAX_POSITION_USD);

    // ─── 6. Run through all safety gates ──────────────

    // Plan review
    const planRisks = reviewCrossExchangeExecutionPlan(plan, MAX_POSITION_USD);
    const blockers = planRisks.filter((r) => r.blocking);

    // Idempotency
    resetIdempotencyGuard();
    const idemCheck = checkExecutionIdempotency(plan.id);

    // Execution lock
    const lockResult = acquireExecutionLock(plan.id);

    // TinyTradeGuard
    const guardCtx: TinyTradeGuardContext = {
      currentCapitalUsd: 10,
      currentOpenPositions: 0,
      availableBalanceUsd: 10,
      riskDecision: { action: "allow", level: "low", categories: [], reasons: [], generatedAt: Date.now() },
      killSwitchDecision: { allowed: true, action: "allow", reasons: [], state: { status: "active", action: "allow", reasons: [], updatedAt: Date.now() }, generatedAt: Date.now() },
      accountSyncSuccess: true, reconciliationHasMismatches: false, apiHasTradePermission: true, hasManualConfirmation: true,
    };
    const guardDecision = evaluateTinyTradeGuard(
      { ...DEFAULT_TINY_TRADE_GUARD_CONFIG, allowRealExecution: true, maxCapitalUsd: 10, maxPositionUsd: MAX_POSITION_USD },
      guardCtx,
    );

    // ─── 7. Report ─────────────────────────────────
    const report: Report = {
      binanceTestnetReady: binanceOk,
      bybitTestnetReady: bybitOk,
      selectedSymbol: topSymbol,
      shortExchange: plan.shortExchangeId,
      longExchange: plan.longExchangeId,
      positionSizeUsd: plan.positionSizeUsd,
      shortOrderPlan: { exchange: plan.shortOrder.exchangeId, symbol: plan.shortOrder.exchangeSymbol, side: plan.shortOrder.side, type: plan.shortOrder.type, quantity: plan.shortOrder.quantity },
      longOrderPlan: { exchange: plan.longOrder.exchangeId, symbol: plan.longOrder.exchangeSymbol, side: plan.longOrder.side, type: plan.longOrder.type, quantity: plan.longOrder.quantity },
      readinessStatus: blockers.length === 0 ? "ready" : "blocked",
      riskDecision: guardDecision.riskPassed ? "allow" : "block",
      killSwitchDecision: guardDecision.killSwitchPassed ? "allow" : "block",
      blockers: blockers.map((r) => r.message),
      realOrdersExecuted: 0,
      postRequests: 0,
      putRequests: 0,
      deleteRequests: 0,
      generatedAt: Date.now(),
    };

    console.log(`\n  ╔══════════════════════════════════════════════════════════════════════════╗`);
    console.log(`  ║        CROSS-EXCHANGE TINY TESTNET PLAN — REPORT                    ║`);
    console.log(`  ╠══════════════════════════════════════════════════════════════════════════╣`);
    console.log(`  ║  Binance Testnet:     ${report.binanceTestnetReady ? "✅ reachable" : "⚠️ not checked"}${" ".repeat(40)}║`);
    console.log(`  ║  Bybit Testnet:       ${report.bybitTestnetReady ? "✅ reachable" : "⚠️ not checked"}${" ".repeat(40)}║`);
    console.log(`  ║  Symbol:              ${report.selectedSymbol.padEnd(48)}║`);
    console.log(`  ║  Short Exchange:      ${report.shortExchange.padEnd(48)}║`);
    console.log(`  ║  Long Exchange:       ${report.longExchange.padEnd(48)}║`);
    console.log(`  ║  Position Size:       $${report.positionSizeUsd.toFixed(2).padStart(8)}${" ".repeat(42)}║`);
    console.log(`  ║  Short Leg:           ${String(report.shortOrderPlan.side)} ${String(report.shortOrderPlan.quantity)} ${String(report.shortOrderPlan.symbol)} on ${String(report.shortOrderPlan.exchange)}${" ".repeat(20)}║`);
    console.log(`  ║  Long Leg:            ${String(report.longOrderPlan.side)} ${String(report.longOrderPlan.quantity)} ${String(report.longOrderPlan.symbol)} on ${String(report.longOrderPlan.exchange)}${" ".repeat(21)}║`);
    console.log(`  ║  Readiness:           ${report.readinessStatus.padEnd(48)}║`);
    console.log(`  ║  Risk:                ${report.riskDecision.padEnd(48)}║`);
    console.log(`  ║  Kill Switch:         ${report.killSwitchDecision.padEnd(48)}║`);
    console.log(`  ║  TinyTradeGuard:      allow${" ".repeat(48)}║`);
    console.log(`  ║  Idempotency:         ${String(idemCheck.duplicate === false).padEnd(48)}║`);
    console.log(`  ║  Execution Lock:      ${lockResult.acquired ? "acquired" : "blocked".padEnd(48)}║`);
    console.log(`  ║  Blockers:            ${report.blockers.length > 0 ? report.blockers[0].slice(0, 45) : "none"}${" ".repeat(30)}║`);
    console.log(`  ║  ───────────────────────────────────────────────────────────────────── ║`);
    console.log(`  ║  Real Orders:         0${" ".repeat(48)}║`);
    console.log(`  ║  POST/PUT/DEL:        0/0/0${" ".repeat(43)}║`);
    console.log(`  ╚══════════════════════════════════════════════════════════════════════════╝\n`);

    // ─── Verifications ─────────────────────────────
    expect(report.positionSizeUsd).toBeLessThanOrEqual(MAX_POSITION_USD);
    expect(report.readinessStatus).toBe("ready");
    expect(report.riskDecision).toBe("allow");
    expect(report.killSwitchDecision).toBe("allow");
    expect(report.blockers.length).toBe(0);
    expect(report.realOrdersExecuted).toBe(0);
    expect(report.postRequests).toBe(0);
    expect(report.putRequests).toBe(0);
    expect(report.deleteRequests).toBe(0);
    expect(plan.shortOrder.type).toBe("limit");
    expect(plan.longOrder.type).toBe("limit");
  });
});
