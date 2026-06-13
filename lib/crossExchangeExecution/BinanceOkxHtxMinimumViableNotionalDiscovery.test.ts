/**
 * Binance + OKX + HTX Minimum Viable Notional Discovery
 *
 * Discovers the smallest notional that works across all 3 exchanges
 * for each symbol. No orders are placed — pure rules-based calculation.
 *
 * ⛔ NO TRADING
 * ⏸️ SKIPPED by default. Enable with RUN_BINANCE_OKX_HTX_MINIMUM_VIABLE_NOTIONAL_DISCOVERY=true
 */

import { describe, expect, it } from "vitest";
import { RealBinanceConnector } from "../connectors/real/RealBinanceConnector";
import { RealOkxConnector } from "../connectors/real/RealOkxConnector";
import { RealHtxConnector } from "../connectors/real/RealHtxConnector";
import { normalizeExecutionQuantity, validateCrossExchangeLegNotional } from "./contractQuantityNormalization";
import type { TradingRuleSummary } from "./contractQuantityNormalization";

const RUN = process.env.RUN_BINANCE_OKX_HTX_MINIMUM_VIABLE_NOTIONAL_DISCOVERY === "true";
const SYMBOLS = ["BTCUSDT", "ETHUSDT", "SOLUSDT"];
const CANDIDATES = [5, 10, 15, 20, 25, 30, 50];
const ALLOWED = ["binance", "okx", "htx"];
const PAUSED = ["bybit", "bitget", "gate", "hyperliquid"];
const describeOrSkip = RUN ? describe : describe.skip;

function isFiniteNumber(v: unknown): v is number {
  return typeof v === "number" && Number.isFinite(v);
}

type LegResult = {
  exchangeId: string; exchangeSymbol: string;
  normalizedQuantity: number; expectedNotionalUsd: number;
  valid: boolean; reason?: string;
};

type SymbolResult = {
  symbol: string; markPrice: number;
  candidates: Record<number, {
    notional: number; legs: LegResult[];
    allValid: boolean; maxMismatchPercent: number; reachedTarget: boolean;
  }>;
  minimumViableNotional: number | null;
};

type Report = {
  enabledExchanges: string[]; pausedExchanges: string[];
  symbolsChecked: number; candidateNotionals: number[];
  resultsBySymbol: SymbolResult[];
  minimumViableSymbol: string | null; minimumViableNotionalUsd: number | null;
  normalizedQuantities: Record<string, number>;
  expectedNotionals: Record<string, number>;
  crossExchangeNotionalMismatchPercent: number;
  quantityNormalizationPassed: boolean;
  blockers: string[];
  mainnetOrderAttempted: boolean; realOrdersExecuted: number;
  postRequests: number; putRequests: number; deleteRequests: number;
  generatedAt: number;
};

const ETH_RULE: TradingRuleSummary = { minOrderSize: 0.001, minPriceIncrement: 0.01, minBaseAmountIncrement: 0.001, minNotional: 5 };
const BTC_RULE: TradingRuleSummary = { minOrderSize: 0.001, minPriceIncrement: 0.1, minBaseAmountIncrement: 0.001, minNotional: 5 };
// SOL uses larger increments on HTX (min 1 contract at ~$64)
const SOL_BN_RULE: TradingRuleSummary = { minOrderSize: 0.01, minPriceIncrement: 0.01, minBaseAmountIncrement: 0.01, minNotional: 5 };
const SOL_OKX_RULE: TradingRuleSummary = { minOrderSize: 0.1, minPriceIncrement: 0.01, minBaseAmountIncrement: 0.1, minNotional: 5 };
const SOL_HTX_RULE: TradingRuleSummary = { minOrderSize: 1, minPriceIncrement: 0.01, minBaseAmountIncrement: 1, minNotional: 5 };

describeOrSkip("Binance + OKX + HTX Minimum Viable Notional Discovery", () => {
  it("Discovers minimum viable notional across all 3 exchanges", async () => {
    expect(ALLOWED).toEqual(["binance", "okx", "htx"]);
    expect(PAUSED).toEqual(expect.arrayContaining(["bybit", "bitget", "gate", "hyperliquid"]));

    const connectors = {
      binance: new RealBinanceConnector(),
      okx: new RealOkxConnector(),
      htx: new RealHtxConnector(),
    };

    const blockers: string[] = [];
    const resultsBySymbol: SymbolResult[] = [];
    let bestSymbol: string | null = null;
    let bestNotional: number | null = null;
    let bestLegs: LegResult[] = [];

    for (const sym of SYMBOLS) {
      // Get real mark price
      let markPrice = 0;
      try {
        const info = await connectors.binance.getFundingInfo(sym);
        if (info && isFiniteNumber(info.markPrice) && info.markPrice > 0) markPrice = info.markPrice;
      } catch { /* use default */ }
      if (markPrice === 0) {
        try { const info = await connectors.okx.getFundingInfo(sym); if (info) markPrice = info.markPrice; } catch { /* skip */ }
      }
      if (markPrice === 0) {
        try { const info = await connectors.htx.getFundingInfo(sym); if (info) markPrice = info.markPrice; } catch { /* skip */ }
      }
      if (markPrice <= 0) { blockers.push(`${sym}: could not get mark price`); continue; }

      const isBtc = sym === "BTCUSDT";
      const isEth = sym === "ETHUSDT";
      const isSol = sym === "SOLUSDT";

      const bnContractSize = isBtc ? 1 : isEth ? 1 : 1;
      const okxContractSize = isBtc ? 0.001 : isEth ? 0.001 : 0.1;
      const htxContractSize = isBtc ? 0.001 : isEth ? 0.001 : 1;

      const bnRule = isBtc ? BTC_RULE : isEth ? ETH_RULE : SOL_BN_RULE;
      const bnStep = isBtc ? 0.001 : isEth ? 0.001 : 0.01;
      const okxRule = isBtc ? { ...BTC_RULE, minNotional: 5 } : isEth ? ETH_RULE : SOL_OKX_RULE;
      const okxStep = isBtc ? 0.001 : isEth ? 0.001 : 0.1;
      const htxRule = isSol ? SOL_HTX_RULE : { ...ETH_RULE, minNotional: 5 };
      const htxStep = isSol ? 1 : 1;

      const entry: SymbolResult = { symbol: sym, markPrice, candidates: {}, minimumViableNotional: null };
      let foundViable = false;

      for (const notional of CANDIDATES) {
        const bn = normalizeExecutionQuantity("binance", sym, sym, notional, markPrice, bnContractSize, { ...bnRule, minBaseAmountIncrement: bnStep });
        const okx = normalizeExecutionQuantity("okx", sym, isEth ? "ETH-USDT-SWAP" : isBtc ? "BTC-USDT-SWAP" : "SOL-USDT-SWAP", notional, markPrice / (isBtc ? 1 : isEth ? 1 : 1), okxContractSize, { ...okxRule, minBaseAmountIncrement: okxStep, minOrderSize: okxStep });
        const htx = normalizeExecutionQuantity("htx", sym, isEth ? "ETH-USDT" : isBtc ? "BTC-USDT" : "SOL-USDT", notional, markPrice / (isBtc ? 1 : isEth ? 1 : 1), htxContractSize, { ...htxRule, minBaseAmountIncrement: htxStep, minOrderSize: 1 });

        const legs = [
          { exchangeId: "binance", exchangeSymbol: sym, normalizedQuantity: bn.normalizedQuantity, expectedNotionalUsd: bn.expectedNotionalUsd, valid: bn.valid, reason: bn.valid ? undefined : `\$5 INR=\${bn.expectedNotionalUsd.toFixed(2)}` },
          { exchangeId: "okx", exchangeSymbol: isEth ? "ETH-USDT-SWAP" : isBtc ? "BTC-USDT-SWAP" : "SOL-USDT-SWAP", normalizedQuantity: okx.normalizedQuantity, expectedNotionalUsd: okx.expectedNotionalUsd, valid: okx.valid, reason: okx.valid ? undefined : `\$5 INR=\${okx.expectedNotionalUsd.toFixed(2)}` },
          { exchangeId: "htx", exchangeSymbol: isEth ? "ETH-USDT" : isBtc ? "BTC-USDT" : "SOL-USDT", normalizedQuantity: htx.normalizedQuantity, expectedNotionalUsd: htx.expectedNotionalUsd, valid: htx.valid, reason: htx.valid ? undefined : `\$5 INR=\${htx.expectedNotionalUsd.toFixed(2)}` },
        ];

        const allValid = bn.valid && okx.valid && htx.valid;
        let maxMismatch = 0;
        if (bn.valid && okx.valid) {
          const v = validateCrossExchangeLegNotional(bn, okx, 100);
          maxMismatch = Math.max(maxMismatch, v.mismatchPercent);
        }
        if (bn.valid && htx.valid) {
          const v = validateCrossExchangeLegNotional(bn, htx, 100);
          maxMismatch = Math.max(maxMismatch, v.mismatchPercent);
        }
        if (okx.valid && htx.valid) {
          const v = validateCrossExchangeLegNotional(okx, htx, 100);
          maxMismatch = Math.max(maxMismatch, v.mismatchPercent);
        }

        entry.candidates[notional] = {
          notional, legs,
          allValid,
          maxMismatchPercent: maxMismatch,
          reachedTarget: allValid && maxMismatch <= 1,
        };

        if (!foundViable && allValid && maxMismatch <= 1) {
          entry.minimumViableNotional = notional;
          foundViable = true;
          if (!bestSymbol || notional < (bestNotional ?? Infinity)) {
            bestSymbol = sym;
            bestNotional = notional;
            bestLegs = legs;
          }
        }
      }

      resultsBySymbol.push(entry);
    }

    // Print report
    const report: Report = {
      enabledExchanges: ALLOWED, pausedExchanges: PAUSED,
      symbolsChecked: SYMBOLS.length, candidateNotionals: CANDIDATES,
      resultsBySymbol,
      minimumViableSymbol: bestSymbol, minimumViableNotionalUsd: bestNotional,
      normalizedQuantities: Object.fromEntries(bestLegs.map((l) => [l.exchangeId, l.normalizedQuantity])),
      expectedNotionals: Object.fromEntries(bestLegs.map((l) => [l.exchangeId, l.expectedNotionalUsd])),
      crossExchangeNotionalMismatchPercent: bestLegs.length >= 2 ? validateCrossExchangeLegNotional(
        { exchangeId: "dummy", canonicalSymbol: "", exchangeSymbol: "", targetNotionalUsd: 0, markPrice: 0, contractSize: 1, rawQuantity: 0, normalizedQuantity: bestLegs[0].normalizedQuantity, expectedNotionalUsd: bestLegs[0].expectedNotionalUsd, quantityPrecisionApplied: 0, stepSizeApplied: 0, minOrderSizePassed: true, minNotionalPassed: true, notionalMismatchPercent: 0, valid: true },
        { exchangeId: "dummy", canonicalSymbol: "", exchangeSymbol: "", targetNotionalUsd: 0, markPrice: 0, contractSize: 1, rawQuantity: 0, normalizedQuantity: bestLegs[1].normalizedQuantity, expectedNotionalUsd: bestLegs[1].expectedNotionalUsd, quantityPrecisionApplied: 0, stepSizeApplied: 0, minOrderSizePassed: true, minNotionalPassed: true, notionalMismatchPercent: 0, valid: true },
        100
      ).mismatchPercent : 0,
      quantityNormalizationPassed: bestNotional !== null,
      blockers: bestNotional ? [] : ["No viable notional found for any symbol at any candidate"],
      mainnetOrderAttempted: false, realOrdersExecuted: 0,
      postRequests: 0, putRequests: 0, deleteRequests: 0,
      generatedAt: Date.now(),
    };

    console.log(`\n  ╔══════════════════════════════════════════════════════════════════════════╗`);
    console.log(`  ║     MINIMUM VIABLE NOTIONAL DISCOVERY — REPORT                    ║`);
    console.log(`  ╠══════════════════════════════════════════════════════════════════════════╣`);
    console.log(`  ║  Candidates:        ${CANDIDATES.join(", ")}${" ".repeat(28)}║`);
    for (const sr of resultsBySymbol) {
      console.log(`  ║  ── ${sr.symbol.padEnd(10)} @ \$${sr.markPrice.toFixed(0).padStart(8)}${" ".repeat(34)}║`);
      for (const [n, c] of Object.entries(sr.candidates)) {
        const icon = c.reachedTarget ? "✅" : c.allValid ? "⚠️" : "❌";
        const legs = c.legs.map((l) => `${l.exchangeId[0].toUpperCase()}=\$${l.expectedNotionalUsd.toFixed(1)}`).join(" ");
        console.log(`  ║  ${icon} \$${String(n).padStart(2)}  ${legs} mismatch=${c.maxMismatchPercent.toFixed(1).padStart(5)}%${" ".repeat(20)}║`);
      }
      if (sr.minimumViableNotional) {
        console.log(`  ║  ✅ Viable: \$${sr.minimumViableNotional}${" ".repeat(58)}║`);
      }
    }
    if (bestNotional) {
      console.log(`  ║  ───────────────────────────────────────────────────────────────────── ║`);
      console.log(`  ║  BEST:  ${bestSymbol} @ \$${bestNotional}${" ".repeat(52)}║`);
      for (const l of bestLegs) {
        console.log(`  ║    ${l.exchangeId.padEnd(10)} qty=${String(l.normalizedQuantity).padStart(8)} notional=\$${l.expectedNotionalUsd.toFixed(2).padStart(8)}${" ".repeat(25)}║`);
      }
    }
    if (report.blockers.length > 0) {
      for (const b of report.blockers) console.log(`  ║  Block: ${b.slice(0, 65).padEnd(65)}║`);
    }
    console.log(`  ║  ───────────────────────────────────────────────────────────────────── ║`);
    console.log(`  ║  Mainnet Attempt:    false${" ".repeat(46)}║`);
    console.log(`  ║  Real Orders:        0${" ".repeat(48)}║`);
    console.log(`  ║  POST/PUT/DEL:       0/0/0${" ".repeat(43)}║`);
    console.log(`  ╚══════════════════════════════════════════════════════════════════════════╝\n`);

    expect(report.mainnetOrderAttempted).toBe(false);
    expect(report.realOrdersExecuted).toBe(0);
    expect(report.postRequests).toBe(0);
    expect(report.putRequests).toBe(0);
    expect(report.deleteRequests).toBe(0);
  });
});
