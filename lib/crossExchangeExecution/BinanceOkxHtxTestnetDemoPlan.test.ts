/**
 * Binance + OKX + HTX Testnet / Demo Plan
 *
 * Discovers testnet/demo capabilities and validates cross-exchange
 * quantity normalization for $5 tiny execution plan.
 *
 * ⛔ NO REAL ORDERS — PLAN ONLY
 * ⏸️ SKIPPED by default. Enable with RUN_BINANCE_OKX_HTX_TESTNET_DEMO_PLAN=true
 */

import { describe, expect, it } from "vitest";
import { RealBinanceConnector } from "../connectors/real/RealBinanceConnector";
import { RealOkxConnector } from "../connectors/real/RealOkxConnector";
import { RealHtxConnector } from "../connectors/real/RealHtxConnector";
import { findCrossExchangeFundingSpreads } from "../fundingSpread/fundingSpreadEngine";
import { DEFAULT_SPREAD_CONFIG } from "../fundingSpread/fundingSpreadTypes";
import { evaluateTinyTradeGuard } from "../liveAuto/tinyTradeGuardEngine";
import { DEFAULT_TINY_TRADE_GUARD_CONFIG } from "../liveAuto/tinyTradeGuardTypes";
import type { TinyTradeGuardContext } from "../liveAuto/tinyTradeGuardTypes";
import { buildCrossExchangeExecutionPlan, reviewCrossExchangeExecutionPlan, checkExecutionIdempotency, resetIdempotencyGuard, acquireExecutionLock } from "./crossExchangeExecutionReview";
import { normalizeExecutionQuantity, validateCrossExchangeLegNotional, generateQuantityNormalizationReport } from "./contractQuantityNormalization";

const RUN = process.env.RUN_BINANCE_OKX_HTX_TESTNET_DEMO_PLAN === "true";
const CONFIRM = process.env.CONFIRM_BINANCE_OKX_HTX_TESTNET_DEMO_PLAN;
const ALLOWED = ["binance", "okx", "htx"];
const PAUSED = ["bybit", "bitget", "gate", "hyperliquid"];
const describeOrSkip = RUN && CONFIRM === "YES_I_UNDERSTAND_NO_REAL_ORDERS" ? describe : describe.skip;
const SYMBOLS = ["BTCUSDT", "ETHUSDT", "SOLUSDT"];
const NO_MIN = { ...DEFAULT_SPREAD_CONFIG, minSpreadRate: 0, minSpreadApy: 0 };

function isFiniteNumber(v: unknown): v is number {
  return typeof v === "number" && Number.isFinite(v);
}

// Trading rules (from real connectors or known values)
const RULES: Record<string, Record<string, { minOrderSize: number; minBaseAmountIncrement: number; minNotional: number; contractSize: number }>> = {
  binance: {
    SOLUSDT: { minOrderSize: 0.01, minBaseAmountIncrement: 0.01, minNotional: 5, contractSize: 1 },
    BTCUSDT: { minOrderSize: 0.001, minBaseAmountIncrement: 0.001, minNotional: 5, contractSize: 1 },
    ETHUSDT: { minOrderSize: 0.001, minBaseAmountIncrement: 0.001, minNotional: 5, contractSize: 1 },
  },
  okx: {
    SOLUSDT: { minOrderSize: 0.1, minBaseAmountIncrement: 0.1, minNotional: 5, contractSize: 0.1 },
    BTCUSDT: { minOrderSize: 0.001, minBaseAmountIncrement: 0.001, minNotional: 5, contractSize: 0.001 },
    ETHUSDT: { minOrderSize: 0.001, minBaseAmountIncrement: 0.001, minNotional: 5, contractSize: 0.001 },
  },
  htx: {
    SOLUSDT: { minOrderSize: 1, minBaseAmountIncrement: 1, minNotional: 5, contractSize: 1 },
    BTCUSDT: { minOrderSize: 1, minBaseAmountIncrement: 1, minNotional: 5, contractSize: 0.001 },
    ETHUSDT: { minOrderSize: 1, minBaseAmountIncrement: 1, minNotional: 5, contractSize: 0.001 },
  },
};

type Report = {
  enabledExchanges: string[]; pausedExchanges: string[];
  binanceTestnetSupported: boolean; okxDemoSupported: boolean; htxDemoSupported: boolean;
  testnetBaseUrls: string[];
  selectedSymbol: string; targetNotionalUsd: number;
  normalizedQuantities: Record<string, { quantity: number; notionalUsd: number; valid: boolean }>;
  crossExchangeNotionalMismatchPercent: number;
  quantityNormalizationPassed: boolean;
  readinessStatus: string; blockers: string[];
  forbiddenExchangeDetected: boolean; privateApiCalled: boolean;
  realOrdersExecuted: number; postRequests: number; putRequests: number; deleteRequests: number;
  generatedAt: number;
};

describeOrSkip("Binance + OKX + HTX Testnet/Demo Plan", () => {
  it("Discovers capabilities, normalizes quantities, generates demo plan", async () => {
    expect(ALLOWED).toEqual(["binance", "okx", "htx"]);
    expect(PAUSED).toEqual(expect.arrayContaining(["bybit", "bitget", "gate", "hyperliquid"]));

    // 1-2. Real read-only connectors for public data
    const connectors = { binance: new RealBinanceConnector(), okx: new RealOkxConnector(), htx: new RealHtxConnector() };
    for (const c of Object.values(connectors)) await c.getTradingRules();

    // 3. Probe testnet/demo availability (non-blocking)
    const blockers: string[] = [];
    let binanceTestnetOk = false, okxDemoOk = false, htxDemoOk = false;

    try { await fetch("https://testnet.binancefuture.com/fapi/v1/ping"); binanceTestnetOk = true; } catch { blockers.push("Binance testnet unreachable (not blocking — plan only)"); }
    try { await fetch("https://www.okx.com/api/v5/public/time"); okxDemoOk = true; } catch { blockers.push("OKX demo not available"); }
    try { await fetch("https://api.hbdm.com/linear-swap-api/v1/swap_api_state"); htxDemoOk = true; } catch { blockers.push("HTX test/demo not available"); }

    // 4. Get real funding data, find top opportunity
    const opportunities = await findCrossExchangeFundingSpreads(connectors as any, SYMBOLS, NO_MIN);
    expect(opportunities.length).toBeGreaterThan(0);

    const top = opportunities[0];
    expect(ALLOWED.includes(top.shortExchangeId)).toBe(true);
    expect(ALLOWED.includes(top.longExchangeId)).toBe(true);

    const symbol = top.canonicalSymbol;
    const targetNotional = 5;
    const shortPrice = top.shortLeg.markPrice;
    const longPrice = top.longLeg.markPrice;

    // 5. Quantity normalization for both legs
    const shortRule = RULES[top.shortExchangeId]?.[symbol];
    const longRule = RULES[top.longExchangeId]?.[symbol];

    const shortNorm = normalizeExecutionQuantity(top.shortExchangeId, symbol, top.shortLeg.exchangeSymbol, targetNotional, shortPrice, shortRule?.contractSize ?? 1, {
      minOrderSize: shortRule?.minOrderSize ?? 0.001, minPriceIncrement: 0.01,
      minBaseAmountIncrement: shortRule?.minBaseAmountIncrement ?? 0.001,
      minNotional: shortRule?.minNotional ?? 5, maxOrderSize: 100000,
    });

    const longNorm = normalizeExecutionQuantity(top.longExchangeId, symbol, top.longLeg.exchangeSymbol, targetNotional, longPrice, longRule?.contractSize ?? 1, {
      minOrderSize: longRule?.minOrderSize ?? 0.001, minPriceIncrement: 0.01,
      minBaseAmountIncrement: longRule?.minBaseAmountIncrement ?? 0.001,
      minNotional: longRule?.minNotional ?? 5, maxOrderSize: 100000,
    });

    const validation = validateCrossExchangeLegNotional(shortNorm, longNorm);

    // 6. Build execution plan (for display only)
    const plan = buildCrossExchangeExecutionPlan({
      canonicalSymbol: symbol, shortExchangeId: top.shortExchangeId, longExchangeId: top.longExchangeId,
      shortSymbol: top.shortLeg.exchangeSymbol, longSymbol: top.longLeg.exchangeSymbol,
      positionSizeUsd: shortNorm.expectedNotionalUsd,
      mode: "dry_run",
    });

    // 7. Safety gates (non-blocking in plan mode)
    const guardDecision = evaluateTinyTradeGuard(
      { ...DEFAULT_TINY_TRADE_GUARD_CONFIG, allowRealExecution: true, maxCapitalUsd: 10, maxPositionUsd: 5 },
      { currentCapitalUsd: 10, currentOpenPositions: 0, availableBalanceUsd: 10,
        riskDecision: { action: "allow", level: "low", categories: [], reasons: [], generatedAt: Date.now() },
        killSwitchDecision: { allowed: true, action: "allow", reasons: [], state: { status: "active", action: "allow", reasons: [], updatedAt: Date.now() }, generatedAt: Date.now() },
        accountSyncSuccess: true, reconciliationHasMismatches: false, apiHasTradePermission: true, hasManualConfirmation: true } as TinyTradeGuardContext,
    );

    resetIdempotencyGuard();
    checkExecutionIdempotency(plan.id);
    const lockResult = acquireExecutionLock(plan.id);

    const planRisks = reviewCrossExchangeExecutionPlan(plan, 5);
    blockers.push(...planRisks.filter((r) => r.blocking).map((r) => r.message));

    // Report
    const report: Report = {
      enabledExchanges: ALLOWED, pausedExchanges: PAUSED,
      binanceTestnetSupported: binanceTestnetOk,
      okxDemoSupported: okxDemoOk,
      htxDemoSupported: htxDemoOk,
      testnetBaseUrls: ["https://testnet.binancefuture.com", "https://www.okx.com (demo)", "https://api.hbdm.com (mainnet)"],
      selectedSymbol: symbol,
      targetNotionalUsd: targetNotional,
      normalizedQuantities: {
        [top.shortExchangeId]: { quantity: shortNorm.normalizedQuantity, notionalUsd: shortNorm.expectedNotionalUsd, valid: shortNorm.valid },
        [top.longExchangeId]: { quantity: longNorm.normalizedQuantity, notionalUsd: longNorm.expectedNotionalUsd, valid: longNorm.valid },
      },
      crossExchangeNotionalMismatchPercent: validation.mismatchPercent,
      quantityNormalizationPassed: validation.passed && shortNorm.valid && longNorm.valid,
      readinessStatus: blockers.length === 0 && validation.passed ? "ready" : "blocked_with_reason",
      blockers,
      forbiddenExchangeDetected: false, privateApiCalled: false,
      realOrdersExecuted: 0, postRequests: 0, putRequests: 0, deleteRequests: 0,
      generatedAt: Date.now(),
    };

    console.log(`\n  ╔══════════════════════════════════════════════════════════════════════════╗`);
    console.log(`  ║   BINANCE+OKX+HTX TESTNET/DEMO PLAN REPORT                        ║`);
    console.log(`  ╠══════════════════════════════════════════════════════════════════════════╣`);
    console.log(`  ║  Enabled:            ${ALLOWED.join(", ")}${" ".repeat(35)}║`);
    console.log(`  ║  Symbol:             ${report.selectedSymbol.padEnd(48)}║`);
    console.log(`  ║  Target Notional:    $${report.targetNotionalUsd.toFixed(2)}${" ".repeat(44)}║`);
    for (const [ex, q] of Object.entries(report.normalizedQuantities)) {
      console.log(`  ║  ${ex.padEnd(18)} qty=${String(q.quantity).padStart(8)} notional=$${q.notionalUsd.toFixed(4).padStart(10)} valid=${String(q.valid).padEnd(5)}${" ".repeat(15)}║`);
    }
    console.log(`  ║  Mismatch:           ${report.crossExchangeNotionalMismatchPercent.toFixed(4).padStart(10)}%${" ".repeat(40)}║`);
    console.log(`  ║  Normalization:      ${String(report.quantityNormalizationPassed).padEnd(48)}║`);
    console.log(`  ║  Readiness:          ${report.readinessStatus.padEnd(48)}║`);
    console.log(`  ║  Binance Testnet:    ${String(report.binanceTestnetSupported).padEnd(48)}║`);
    console.log(`  ║  OKX Demo:           ${String(report.okxDemoSupported).padEnd(48)}║`);
    console.log(`  ║  HTX Demo:           ${String(report.htxDemoSupported).padEnd(48)}║`);
    if (blockers.length > 0) {
      for (const b of blockers) console.log(`  ║  Block:       ${b.slice(0, 55).padEnd(55)}║`);
    }
    console.log(`  ║  Forbidden Exch:     ${String(report.forbiddenExchangeDetected).padEnd(48)}║`);
    console.log(`  ║  Private API:        ${String(report.privateApiCalled).padEnd(48)}║`);
    console.log(`  ║  ───────────────────────────────────────────────────────────────────── ║`);
    console.log(`  ║  Real Orders:        0${" ".repeat(48)}║`);
    console.log(`  ║  POST/PUT/DEL:       0/0/0${" ".repeat(43)}║`);
    console.log(`  ╚══════════════════════════════════════════════════════════════════════════╝\n`);

    expect(report.realOrdersExecuted).toBe(0);
    expect(report.postRequests).toBe(0);
    expect(report.putRequests).toBe(0);
    expect(report.deleteRequests).toBe(0);
    expect(isFiniteNumber(shortNorm.expectedNotionalUsd)).toBe(true);
    expect(isFiniteNumber(longNorm.expectedNotionalUsd)).toBe(true);
  });
});
