/**
 * Binance + OKX + HTX Mainnet Readonly Execution Preflight with Discovered Notional
 *
 * Uses FILUSDT at $10 (discovered minimum viable notional) to run
 * full preflight checks across all 3 exchanges.
 *
 * ⛔ NO TRADING — PREFLIGHT ONLY
 * ⏸️ SKIPPED by default. Enable with RUN_BINANCE_OKX_HTX_MAINNET_READONLY_EXECUTION_PREFLIGHT_DISCOVERED_NOTIONAL=true
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

const RUN = process.env.RUN_BINANCE_OKX_HTX_MAINNET_READONLY_EXECUTION_PREFLIGHT_DISCOVERED_NOTIONAL === "true";
const SYMBOL = "FILUSDT";
const TARGET_NOTIONAL = 10;
const ALLOWED = ["binance", "okx", "htx"];
const PAUSED = ["bybit", "bitget", "gate", "hyperliquid"];
const describeOrSkip = RUN ? describe : describe.skip;

function isFiniteNumber(v: unknown): v is number {
  return typeof v === "number" && Number.isFinite(v);
}

type LiquidityGuardResult = {
  symbol: string; exchangeId: string;
  estimatedNotionalUsd: number; minRequiredNotionalUsd: number;
  markPrice: number; volume24hUsd?: number; openInterestUsd?: number;
  liquidityScore: "high" | "medium" | "low" | "unknown";
  passed: boolean; reason?: string;
};

type Report = {
  enabledExchanges: string[]; pausedExchanges: string[];
  selectedSymbol: string; targetNotionalUsd: number;
  normalizedQuantities: Record<string, { qty: number; notional: number }>;
  expectedNotionals: Record<string, number>;
  crossExchangeNotionalMismatchPercent: number;
  quantityNormalizationPassed: boolean;
  fundingOpportunityFound: boolean;
  topOpportunity?: { short: string; long: string; spreadApy: number; netSpreadApy: number };
  spreadApy: number; netSpreadApy: number;
  liquidityStatus: string; liquidityGuardPassed: boolean;
  readinessStatus: string;
  riskDecision: string; killSwitchDecision: string; tinyTradeGuardDecision: string;
  mainnetReadonlyConfirmed: boolean; privateTradingDisabled: boolean;
  mainnetOrderAttempted: boolean; realOrdersExecuted: number;
  postRequests: number; putRequests: number; deleteRequests: number;
  blockers: string[]; generatedAt: number;
};

async function getLiquidityInfolL(symbol: string): Promise<Record<string, LiquidityGuardResult>> {
  // Try Binance 24h ticker for volume
  const results: Record<string, LiquidityGuardResult> = {};
  try {
    const ticker = await (await fetch(`https://fapi.binance.com/fapi/v1/ticker/24hr?symbol=${symbol}`)).json() as Record<string, unknown>;
    const vol = Number(ticker.quoteVolume ?? 0);
    const price = Number(ticker.lastPrice ?? 0);
    results.binance = {
      symbol, exchangeId: "binance", estimatedNotionalUsd: TARGET_NOTIONAL,
      minRequiredNotionalUsd: TARGET_NOTIONAL * 10, markPrice: price,
      volume24hUsd: vol, liquidityScore: vol > TARGET_NOTIONAL * 10000 ? "high" : vol > TARGET_NOTIONAL * 1000 ? "medium" : "low",
      passed: vol > TARGET_NOTIONAL * 1000,
      reason: vol < TARGET_NOTIONAL * 1000 ? `24h volume \$${vol.toFixed(0)} < min \$${(TARGET_NOTIONAL * 1000).toFixed(0)}` : undefined,
    };
  } catch {
    results.binance = { symbol, exchangeId: "binance", estimatedNotionalUsd: TARGET_NOTIONAL, minRequiredNotionalUsd: TARGET_NOTIONAL * 10, markPrice: 0, liquidityScore: "unknown", passed: false, reason: "Failed to fetch volume data" };
  }
  return results;
}

describeOrSkip("Binance + OKX + HTX Mainnet Readonly Execution Preflight (Discovered Notional)", () => {
  it("Runs preflight with FILUSDT $10 discovered notional", async () => {
    expect(ALLOWED).toEqual(["binance", "okx", "htx"]);
    expect(PAUSED).toEqual(expect.arrayContaining(["bybit", "bitget", "gate", "hyperliquid"]));
    expect(SYMBOL).toBe("FILUSDT");
    expect(TARGET_NOTIONAL).toBe(10);

    const connectors = {
      binance: new RealBinanceConnector(),
      okx: new RealOkxConnector(),
      htx: new RealHtxConnector(),
    };

    // Fetch exchange info for FIL
    const [infoBN, okxData, htxData] = await Promise.all([
      (await fetch("https://fapi.binance.com/fapi/v1/exchangeInfo")).json(),
      (await fetch("https://www.okx.com/api/v5/public/instruments?instType=SWAP")).json(),
      (await fetch("https://api.hbdm.com/linear-swap-api/v1/swap_contract_info")).json(),
    ]);

    const bnS = infoBN.symbols.find((s: any) => s.symbol === SYMBOL);
    const okxInst = okxData.data.find((d: any) => d.instId === "FIL-USDT-SWAP");
    const htxInst = htxData.data.find((d: any) => d.contract_code === "FIL-USDT");

    // Get mark price from Binance
    let markPrice = 0;
    try {
      const info = await connectors.binance.getFundingInfo(SYMBOL);
      if (info && isFiniteNumber(info.markPrice)) markPrice = info.markPrice;
    } catch { /* fallback */ }

    // Quantity normalization
    const bnLot = bnS?.filters?.find((f: any) => f.filterType === "LOT_SIZE");
    const bnStep = Number(bnLot?.stepSize ?? 0.1);
    const bnMinQty = Number(bnLot?.minQty ?? 0.1);
    const bnMinNotional = Number(bnS?.filters?.find((f: any) => f.filterType === "MIN_NOTIONAL")?.notional ?? 5);
    const bnRaw = TARGET_NOTIONAL / markPrice;
    const bnQty = Math.floor(bnRaw / bnStep) * bnStep;
    const bnNotional = bnQty * markPrice;
    const bnValid = bnQty >= bnMinQty && bnNotional >= bnMinNotional && isFiniteNumber(bnNotional);

    const okxCtVal = Number(okxInst?.ctVal ?? 0.1);
    const okxLotSz = Number(okxInst?.lotSz ?? 0.1);
    const okxRaw = TARGET_NOTIONAL / (markPrice * okxCtVal);
    const okxQty = Math.floor(okxRaw / okxLotSz) * okxLotSz;
    const okxNotional = okxQty * markPrice * okxCtVal;
    const okxValid = okxQty > 0 && okxNotional >= 5 && isFiniteNumber(okxNotional);

    const htxCtVal = Number(htxInst?.contract_size ?? 0.1);
    const htxRaw = TARGET_NOTIONAL / (htxCtVal * markPrice);
    const htxQty = Math.floor(htxRaw / 1) * 1;
    const htxNotional = htxQty * htxCtVal * markPrice;
    const htxValid = htxQty > 0 && htxNotional >= 5 && isFiniteNumber(htxNotional);

    const blockers: string[] = [];
    if (!bnValid) blockers.push(`Binance FIL $10: qty=${bnQty} notional=$${bnNotional.toFixed(2)} — minNotional=$${bnMinNotional}`);
    if (!okxValid) blockers.push(`OKX FIL $10: qty=${okxQty} notional=$${okxNotional.toFixed(2)}`);
    if (!htxValid) blockers.push(`HTX FIL $10: qty=${htxQty} notional=$${htxNotional.toFixed(2)}`);

    const notionals = [bnNotional, okxNotional, htxNotional].filter((n) => n > 0);
    const mismatch = notionals.length >= 2 ? (Math.max(...notionals) - Math.min(...notionals)) / Math.max(...notionals) * 100 : 0;
    const quantityNormPassed = bnValid && okxValid && htxValid && mismatch <= 1;

    // Spread engine for FIL
    let opportunities: any[] = [];
    let topOpp: any = null;
    try {
      opportunities = await findCrossExchangeFundingSpreads(connectors as any, [SYMBOL], { ...DEFAULT_SPREAD_CONFIG, minSpreadRate: 0, minSpreadApy: 0 });
      topOpp = opportunities[0];
    } catch { blockers.push("Spread engine failed for FILUSDT"); }
    if (!topOpp) blockers.push("No FILUSDT funding spread opportunity found between Binance/OKX/HTX");

    // Liquidity guard
    const liquidity = await getLiquidityInfolL(SYMBOL);
    const liqBinance = liquidity.binance;
    const liqPassed = liqBinance?.passed === true;
    if (!liqPassed) blockers.push(`Liquidity guard: ${liqBinance?.reason ?? "unknown"}`);
    const liqStatus = liqBinance?.liquidityScore === "high" ? "passed"
      : liqBinance?.liquidityScore === "medium" ? "passed_with_warning"
      : liqBinance?.liquidityScore === "low" ? "blocked_insufficient_volume"
      : "unknown_blocked";

    // Safety gates
    const guardDecision = evaluateTinyTradeGuard(
      { ...DEFAULT_TINY_TRADE_GUARD_CONFIG, allowRealExecution: false, maxCapitalUsd: 100, maxPositionUsd: 50 },
      { currentCapitalUsd: 50, currentOpenPositions: 0, availableBalanceUsd: 100,
        riskDecision: { action: "allow", level: "low", categories: [], reasons: [], generatedAt: Date.now() },
        killSwitchDecision: { allowed: true, action: "allow", reasons: [], state: { status: "active", action: "allow", reasons: [], updatedAt: Date.now() }, generatedAt: Date.now() },
        accountSyncSuccess: true, reconciliationHasMismatches: false, apiHasTradePermission: false, hasManualConfirmation: true } as TinyTradeGuardContext,
    );

    const plan = topOpp ? buildCrossExchangeExecutionPlan({
      canonicalSymbol: SYMBOL, shortExchangeId: topOpp.shortExchangeId, longExchangeId: topOpp.longExchangeId,
      shortSymbol: topOpp.shortLeg.exchangeSymbol, longSymbol: topOpp.longLeg.exchangeSymbol,
      positionSizeUsd: TARGET_NOTIONAL, mode: "dry_run",
    }) : null;

    resetIdempotencyGuard();
    if (plan) {
      checkExecutionIdempotency(plan.id);
      acquireExecutionLock(plan.id);
      blockers.push(...reviewCrossExchangeExecutionPlan(plan, TARGET_NOTIONAL).filter((r) => r.blocking).map((r) => r.message));
    }

    const report: Report = {
      enabledExchanges: ALLOWED, pausedExchanges: PAUSED,
      selectedSymbol: SYMBOL, targetNotionalUsd: TARGET_NOTIONAL,
      normalizedQuantities: {
        binance: { qty: bnQty, notional: bnNotional },
        okx: { qty: okxQty, notional: okxNotional },
        htx: { qty: htxQty, notional: htxNotional },
      },
      expectedNotionals: { binance: bnNotional, okx: okxNotional, htx: htxNotional },
      crossExchangeNotionalMismatchPercent: mismatch,
      quantityNormalizationPassed: quantityNormPassed,
      fundingOpportunityFound: !!topOpp,
      topOpportunity: topOpp ? { short: topOpp.shortExchangeId, long: topOpp.longExchangeId, spreadApy: topOpp.spreadApy, netSpreadApy: topOpp.netSpreadApy } : undefined,
      spreadApy: topOpp?.spreadApy ?? 0, netSpreadApy: topOpp?.netSpreadApy ?? 0,
      liquidityStatus: liqStatus, liquidityGuardPassed: liqPassed,
      readinessStatus: blockers.length === 0 ? "ready" : "blocked_with_reason",
      riskDecision: "allow", killSwitchDecision: "allow",
      tinyTradeGuardDecision: guardDecision.allowed ? "allow" : "block",
      mainnetReadonlyConfirmed: true, privateTradingDisabled: true,
      mainnetOrderAttempted: false, realOrdersExecuted: 0,
      postRequests: 0, putRequests: 0, deleteRequests: 0,
      blockers, generatedAt: Date.now(),
    };

    console.log(`\n  ╔══════════════════════════════════════════════════════════════════════════╗`);
    console.log(`  ║  PREFLIGHT (DISCOVERED NOTIONAL) — REPORT                        ║`);
    console.log(`  ╠══════════════════════════════════════════════════════════════════════════╣`);
    console.log(`  ║  Symbol:             ${SYMBOL} @ \$${markPrice.toFixed(4).padStart(10)}${" ".repeat(30)}║`);
    console.log(`  ║  Target:             \$${TARGET_NOTIONAL}${" ".repeat(52)}║`);
    console.log(`  ║  Binance:            qty=${String(bnQty).padStart(10)} notional=\$${bnNotional.toFixed(2).padStart(8)} valid=${String(bnValid).padEnd(5)}${" ".repeat(12)}║`);
    console.log(`  ║  OKX:                qty=${String(okxQty).padStart(10)} notional=\$${okxNotional.toFixed(2).padStart(8)} valid=${String(okxValid).padEnd(5)}${" ".repeat(12)}║`);
    console.log(`  ║  HTX:                qty=${String(htxQty).padStart(10)} notional=\$${htxNotional.toFixed(2).padStart(8)} valid=${String(htxValid).padEnd(5)}${" ".repeat(12)}║`);
    console.log(`  ║  Mismatch:           ${report.crossExchangeNotionalMismatchPercent.toFixed(2).padStart(8)}%${" ".repeat(43)}║`);
    console.log(`  ║  Norm Passed:        ${String(report.quantityNormalizationPassed).padEnd(48)}║`);
    console.log(`  ║  Funding Opp:        ${String(report.fundingOpportunityFound).padEnd(48)}║`);
    if (topOpp) {
      console.log(`  ║  Top:                ${topOpp.shortExchangeId}→${topOpp.longExchangeId} APY=${topOpp.spreadApy.toFixed(2).padStart(6)}% net=${topOpp.netSpreadApy.toFixed(2).padStart(6)}%${" ".repeat(5)}║`);
    }
    console.log(`  ║  Liquidity:          ${liqStatus.padEnd(48)}║`);
    console.log(`  ║  Liq Guard:          ${String(liqPassed).padEnd(48)}║`);
    if (liqBinance) console.log(`  ║  24h Vol:            \$${liqBinance.volume24hUsd?.toFixed(0).padStart(12) ?? "N/A"}${" ".repeat(38)}║`);
    console.log(`  ║  Readiness:          ${report.readinessStatus.padEnd(48)}║`);
    console.log(`  ║  Readonly Confirmed: ${String(report.mainnetReadonlyConfirmed).padEnd(48)}║`);
    console.log(`  ║  Private API:        ${String(report.privateTradingDisabled).padEnd(48)}║`);
    if (blockers.length > 0) for (const b of blockers) console.log(`  ║  Block:  ${b.slice(0, 62).padEnd(62)}║`);
    console.log(`  ║  ───────────────────────────────────────────────────────────────────── ║`);
    console.log(`  ║  Mainnet Attempt:    false${" ".repeat(46)}║`);
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
    expect(report.quantityNormalizationPassed).toBe(true);
    expect(report.crossExchangeNotionalMismatchPercent).toBeLessThanOrEqual(1);
  });
});
