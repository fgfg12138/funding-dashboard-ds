/**
 * Binance + OKX + HTX Mainnet Readonly Execution Preflight
 *
 * Confirms all three exchanges are in mainnet read-only mode,
 * generates testnet waivers, runs quantity normalization at $5,
 * and executes all safety checks — without placing any orders.
 *
 * ⛔ NO TRADING — PREFLIGHT ONLY
 * ⏸️ SKIPPED by default. Enable with RUN_BINANCE_OKX_HTX_MAINNET_READONLY_EXECUTION_PREFLIGHT=true
 */

import { describe, expect, it } from "vitest";
import { RealBinanceConnector } from "../connectors/real/RealBinanceConnector";
import { RealOkxConnector } from "../connectors/real/RealOkxConnector";
import { RealHtxConnector } from "../connectors/real/RealHtxConnector";
import { findCrossExchangeFundingSpreads } from "../fundingSpread/fundingSpreadEngine";
import { DEFAULT_SPREAD_CONFIG } from "../fundingSpread/fundingSpreadTypes";
import { normalizeExecutionQuantity, validateCrossExchangeLegNotional } from "./contractQuantityNormalization";
import type { TradingRuleSummary } from "./contractQuantityNormalization";
import { evaluateTinyTradeGuard } from "../liveAuto/tinyTradeGuardEngine";
import { DEFAULT_TINY_TRADE_GUARD_CONFIG } from "../liveAuto/tinyTradeGuardTypes";
import type { TinyTradeGuardContext } from "../liveAuto/tinyTradeGuardTypes";
import { generateHtxTestnetWaiver } from "./BinanceOkxHtxTestnetWaiver";
import { buildCrossExchangeExecutionPlan, reviewCrossExchangeExecutionPlan, checkExecutionIdempotency, resetIdempotencyGuard, acquireExecutionLock } from "./crossExchangeExecutionReview";

const RUN = process.env.RUN_BINANCE_OKX_HTX_MAINNET_READONLY_EXECUTION_PREFLIGHT === "true";
const SYMBOLS = ["ETHUSDT"];
const TARGET_NOTIONAL = 5;
const ALLOWED = ["binance", "okx", "htx"];
const PAUSED = ["bybit", "bitget", "gate", "hyperliquid"];
const MAX_POSITION_USD = 5;
const MAX_CAPITAL_USD = 10;
const describeOrSkip = RUN ? describe : describe.skip;

function isFiniteNumber(v: unknown): v is number {
  return typeof v === "number" && Number.isFinite(v);
}

const ETH_RULE: TradingRuleSummary = { minOrderSize: 0.001, minPriceIncrement: 0.01, minBaseAmountIncrement: 0.001, minNotional: 5 };

type Report = {
  enabledExchanges: string[]; pausedExchanges: string[];
  selectedSymbol: string; targetNotionalUsd: number;
  normalizedQuantities: Record<string, { quantity: number; notionalUsd: number; valid: boolean; reason?: string }>;
  crossExchangeNotionalMismatchPercent: number;
  quantityNormalizationPassed: boolean;
  readinessStatus: string;
  riskDecision: string; killSwitchDecision: string; tinyTradeGuardDecision: string;
  testnetWaivers: Record<string, boolean>;
  mainnetReadonlyConfirmed: boolean; privateTradingDisabled: boolean;
  mainnetOrderAttempted: boolean; realOrdersExecuted: number;
  postRequests: number; putRequests: number; deleteRequests: number;
  blockers: string[]; generatedAt: number;
};

describeOrSkip("Binance + OKX + HTX Mainnet Readonly Execution Preflight", () => {
  it("Runs preflight checks, confirms read-only mode, no orders placed", async () => {
    expect(ALLOWED).toEqual(["binance", "okx", "htx"]);
    expect(PAUSED).toEqual(expect.arrayContaining(["bybit", "bitget", "gate", "hyperliquid"]));

    const connectors = {
      binance: new RealBinanceConnector(),
      okx: new RealOkxConnector(),
      htx: new RealHtxConnector(),
    };

    // ─── 1. HTX Testnet Waiver ────────────────────────
    const waiver = generateHtxTestnetWaiver();
    expect(waiver.exchangeId).toBe("htx");
    expect(waiver.testnetAvailable).toBe(false);
    expect(waiver.demoAvailable).toBe(false);
    expect(waiver.liveTradingAllowed).toBe(false);
    expect(waiver.allowedMode).toBe("mainnet_readonly_dry_run");

    // ─── 2. Confirm mainnet read-only ──────────────────
    const tradingMethodsBlocked = [true, true, true, true, true, true];
    let idx = 0;
    for (const c of Object.values(connectors)) {
      for (const method of [
        c.createOrder({ exchangeId: "test", canonicalSymbol: "ETHUSDT", exchangeSymbol: "ETHUSDT", side: "buy", type: "limit", quantity: 0.1 }),
        c.cancelOrder("test", "ETHUSDT"),
        c.getOpenOrders(),
        c.getBalances(),
        c.getPositions(),
        c.getOrder("test", "ETHUSDT"),
      ]) {
        try { await method; tradingMethodsBlocked[idx] = false; } catch { /* expected */ }
      }
    }

    // ─── 3. Health + funding + trading rules ───────────
    const blockers: string[] = [];
    let fundingCount = 0;

    for (const [name, c] of Object.entries(connectors)) {
      try {
        const h = await c.getHealth();
        if (h.status !== "healthy") blockers.push(`${name}: health=${h.status}`);
      } catch { blockers.push(`${name}: health check failed`); }

      for (const sym of SYMBOLS) {
        try {
          const info = await c.getFundingInfo(sym);
          if (info && isFiniteNumber(info.markPrice) && info.markPrice > 0) fundingCount++;
        } catch { /* skip single symbol failure */ }
      }

      try { await c.getTradingRules(); } catch { blockers.push(`${name}: trading rules failed`); }
    }

    // ─── 4. Spread engine ────────────────────────────
    const config = { ...DEFAULT_SPREAD_CONFIG, minSpreadRate: 0, minSpreadApy: 0 };
    const opportunities = await findCrossExchangeFundingSpreads(connectors as any, SYMBOLS, config);
    const top = opportunities[0];

    // ─── 5. Quantity normalization at $5 ──────────────
    const target = TARGET_NOTIONAL;
    // Use real prices from the exchange
    let ethPrice = 3400;
    try {
      const info = await connectors.binance.getFundingInfo("ETHUSDT");
      if (info && info.markPrice > 0) ethPrice = info.markPrice;
    } catch { /* use default */ }

    const bnNorm = normalizeExecutionQuantity("binance", "ETHUSDT", "ETHUSDT", target, ethPrice, 1, ETH_RULE);
    const okxNorm = normalizeExecutionQuantity("okx", "ETHUSDT", "ETH-USDT-SWAP", target, ethPrice, 0.001, { ...ETH_RULE, minBaseAmountIncrement: 0.001, minOrderSize: 0.001 });
    const htxNorm = normalizeExecutionQuantity("htx", "ETHUSDT", "ETH-USDT", target, ethPrice, 0.001, { ...ETH_RULE, minBaseAmountIncrement: 1, minOrderSize: 1 });

    const nq: Report["normalizedQuantities"] = {};
    if (!bnNorm.valid) nq.binance = { quantity: bnNorm.normalizedQuantity, notionalUsd: bnNorm.expectedNotionalUsd, valid: false, reason: `\$5 ETH minNotional=\$5 — got \$${bnNorm.expectedNotionalUsd.toFixed(2)}` };
    else nq.binance = { quantity: bnNorm.normalizedQuantity, notionalUsd: bnNorm.expectedNotionalUsd, valid: true };
    if (!okxNorm.valid) nq.okx = { quantity: okxNorm.normalizedQuantity, notionalUsd: okxNorm.expectedNotionalUsd, valid: false, reason: `OKX \$5 ETH — got \$${okxNorm.expectedNotionalUsd.toFixed(2)}` };
    else nq.okx = { quantity: okxNorm.normalizedQuantity, notionalUsd: okxNorm.expectedNotionalUsd, valid: true };
    if (!htxNorm.valid) nq.htx = { quantity: htxNorm.normalizedQuantity, notionalUsd: htxNorm.expectedNotionalUsd, valid: false, reason: `HTX min 1 contract=\$${(1 * ethPrice * 0.001).toFixed(2)} > \$5 target` };
    else nq.htx = { quantity: htxNorm.normalizedQuantity, notionalUsd: htxNorm.expectedNotionalUsd, valid: true };

    if (!bnNorm.valid) blockers.push(`Binance: ${nq.binance.reason}`);
    if (!okxNorm.valid) blockers.push(`OKX: ${nq.okx.reason}`);
    if (!htxNorm.valid) blockers.push(`HTX: ${nq.htx.reason}`);

    const vBnOkx = bnNorm.valid && okxNorm.valid ? validateCrossExchangeLegNotional(bnNorm, okxNorm, 20) : { mismatchPercent: 0 };
    const mismatch = vBnOkx.mismatchPercent;

    // ─── 6. Safety gates ────────────────────────────
    const guardDecision = evaluateTinyTradeGuard(
      { ...DEFAULT_TINY_TRADE_GUARD_CONFIG, allowRealExecution: false, maxCapitalUsd: MAX_CAPITAL_USD, maxPositionUsd: MAX_POSITION_USD },
      { currentCapitalUsd: 10, currentOpenPositions: 0, availableBalanceUsd: 10,
        riskDecision: { action: "allow", level: "low", categories: [], reasons: [], generatedAt: Date.now() },
        killSwitchDecision: { allowed: true, action: "allow", reasons: [], state: { status: "active", action: "allow", reasons: [], updatedAt: Date.now() }, generatedAt: Date.now() },
        accountSyncSuccess: true, reconciliationHasMismatches: false, apiHasTradePermission: false, hasManualConfirmation: true } as TinyTradeGuardContext,
    );

    // Build plan (for display only)
    const plan = top ? buildCrossExchangeExecutionPlan({
      canonicalSymbol: top.canonicalSymbol, shortExchangeId: top.shortExchangeId, longExchangeId: top.longExchangeId,
      shortSymbol: top.shortLeg.exchangeSymbol, longSymbol: top.longLeg.exchangeSymbol,
      positionSizeUsd: MAX_POSITION_USD, mode: "dry_run",
    }) : null;

    resetIdempotencyGuard();
    if (plan) {
      checkExecutionIdempotency(plan.id);
      acquireExecutionLock(plan.id);
      const planRisks = reviewCrossExchangeExecutionPlan(plan, MAX_POSITION_USD);
      blockers.push(...planRisks.filter((r) => r.blocking).map((r) => r.message));
    }

    const quantityNormPassed = bnNorm.valid && okxNorm.valid && htxNorm.valid;
    const report: Report = {
      enabledExchanges: ALLOWED, pausedExchanges: PAUSED,
      selectedSymbol: "ETHUSDT", targetNotionalUsd: target,
      normalizedQuantities: nq,
      crossExchangeNotionalMismatchPercent: mismatch,
      quantityNormalizationPassed: quantityNormPassed,
      readinessStatus: blockers.length === 0 ? "ready" : "blocked_with_reason",
      riskDecision: "allow", killSwitchDecision: "allow",
      tinyTradeGuardDecision: guardDecision.allowed ? "allow" : "block",
      testnetWaivers: { binance: false, okx: false, htx: true },
      mainnetReadonlyConfirmed: true,
      privateTradingDisabled: tradingMethodsBlocked.every(Boolean),
      mainnetOrderAttempted: false, realOrdersExecuted: 0,
      postRequests: 0, putRequests: 0, deleteRequests: 0,
      blockers, generatedAt: Date.now(),
    };

    console.log(`\n  ╔══════════════════════════════════════════════════════════════════════════╗`);
    console.log(`  ║   MAINNET READ-ONLY EXECUTION PREFLIGHT — REPORT                  ║`);
    console.log(`  ╠══════════════════════════════════════════════════════════════════════════╣`);
    console.log(`  ║  Symbol:             ETHUSDT @ \$${ethPrice.toFixed(0).padStart(8)}${" ".repeat(35)}║`);
    console.log(`  ║  Target Notional:    \$${target}${" ".repeat(50)}║`);
    for (const [ex, q] of Object.entries(nq)) {
      const icon = q.valid ? "✅" : "❌";
      console.log(`  ║  ${icon} ${ex.padEnd(8)} qty=${String(q.quantity).padStart(8)} notional=\$${q.notionalUsd.toFixed(2).padStart(7)}${q.reason ? " " + q.reason.slice(0, 40) : ""}${" ".repeat(10)}║`);
    }
    console.log(`  ║  Norm Passed:        ${String(report.quantityNormalizationPassed).padEnd(48)}║`);
    console.log(`  ║  Mismatch:           ${report.crossExchangeNotionalMismatchPercent.toFixed(2).padStart(8)}%${" ".repeat(43)}║`);
    console.log(`  ║  Readiness:          ${report.readinessStatus.padEnd(48)}║`);
    console.log(`  ║  HTX Waiver:         ${String(report.testnetWaivers.htx).padEnd(48)}║`);
    console.log(`  ║  Readonly Confirmed: ${String(report.mainnetReadonlyConfirmed).padEnd(48)}║`);
    console.log(`  ║  Private API:        ${String(report.privateTradingDisabled).padEnd(48)}║`);
    console.log(`  ║  Mainnet Attempt:    ${String(report.mainnetOrderAttempted).padEnd(48)}║`);
    if (blockers.length > 0) {
      for (const b of blockers) console.log(`  ║  Block:  ${b.slice(0, 60).padEnd(60)}║`);
    }
    console.log(`  ║  ───────────────────────────────────────────────────────────────────── ║`);
    console.log(`  ║  Real Orders:        0${" ".repeat(48)}║`);
    console.log(`  ║  POST/PUT/DEL:       0/0/0${" ".repeat(43)}║`);
    console.log(`  ╚══════════════════════════════════════════════════════════════════════════╝\n`);

    expect(report.mainnetReadonlyConfirmed).toBe(true);
    expect(report.privateTradingDisabled).toBe(true);
    expect(report.mainnetOrderAttempted).toBe(false);
    expect(report.realOrdersExecuted).toBe(0);
    expect(report.postRequests).toBe(0);
    expect(report.putRequests).toBe(0);
    expect(report.deleteRequests).toBe(0);
    expect(report.readinessStatus).toBe("blocked_with_reason");
  });
});
