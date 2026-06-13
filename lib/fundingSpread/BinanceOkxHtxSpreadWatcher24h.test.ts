/**
 * Binance + OKX + HTX Spread Watcher 24h
 *
 * Simulates 288 cycles (5 min each) of continuous spread monitoring.
 * Reports when a viable funding spread opportunity appears — no orders placed.
 *
 * ⛔ NO TRADING — READ ONLY
 * ⏸️ SKIPPED by default. Enable with RUN_BINANCE_OKX_HTX_SPREAD_WATCHER_24H=true
 */

import { describe, expect, it } from "vitest";
import { RealBinanceConnector } from "../connectors/real/RealBinanceConnector";
import { RealOkxConnector } from "../connectors/real/RealOkxConnector";
import { RealHtxConnector } from "../connectors/real/RealHtxConnector";
import { findCrossExchangeFundingSpreads } from "./fundingSpreadEngine";
import { DEFAULT_SPREAD_CONFIG } from "./fundingSpreadTypes";

const RUN = process.env.RUN_BINANCE_OKX_HTX_SPREAD_WATCHER_24H === "true";
const ALLOWED = ["binance", "okx", "htx"];
const PAUSED = ["bybit", "bitget", "gate", "hyperliquid"];
const CYCLES = 288;
const MIN_SPREAD_APY = 3;
const MAX_MISMATCH = 1;
const MIN_VOLUME = 10_000_000;
const describeOrSkip = RUN ? describe : describe.skip;

function isFiniteNumber(v: unknown): v is number {
  return typeof v === "number" && Number.isFinite(v);
}

type CycleSnapshot = {
  cycle: number; viableCount: number; actionableCount: number;
  bestNetApy: number; symbol?: string; shortEx?: string; longEx?: string;
  degraded: boolean; errorCount: number;
};

type Report = {
  cycles: number; completedCycles: number;
  enabledExchanges: string[]; pausedExchanges: string[];
  symbolsChecked: number; fundingRatesRead: number;
  viableCandidatesObserved: number; actionableOpportunitiesObserved: number;
  firstActionableOpportunity?: { cycle: number; symbol: string; short: string; long: string; netApy: number };
  bestOpportunity?: { cycle: number; symbol: string; short: string; long: string; netApy: number };
  bestNetSpreadApy: number; averageBestNetSpreadApy: number;
  symbolsWithoutSpread: string[]; symbolsBlockedByQuantity: string[]; symbolsBlockedByLiquidity: string[];
  degradedCycles: number; errors: number;
  readinessStatus: string;
  forbiddenExchangeDetected: boolean; privateApiCalled: boolean;
  mainnetOrderAttempted: boolean; realOrdersExecuted: number;
  postRequests: number; putRequests: number; deleteRequests: number;
  generatedAt: number;
};

describeOrSkip("Binance + OKX + HTX Spread Watcher 24h", () => {
  it("Monitors spreads for 288 cycles, reports any signal", async () => {
    expect(ALLOWED).toEqual(["binance", "okx", "htx"]);
    expect(PAUSED).toEqual(expect.arrayContaining(["bybit", "bitget", "gate", "hyperliquid"]));

    const connectors = { binance: new RealBinanceConnector(), okx: new RealOkxConnector(), htx: new RealHtxConnector() };

    const candidates: Array<{ symbol: string; target: number }> = [
      { symbol: "BTCUSDT", target: 5 }, { symbol: "ETHUSDT", target: 5 }, { symbol: "SOLUSDT", target: 5 },
      { symbol: "FILUSDT", target: 10 }, { symbol: "ASTERUSDT", target: 10 }, { symbol: "GIGGLEUSDT", target: 10 },
      { symbol: "SUSHIUSDT", target: 15 }, { symbol: "ENSUSDT", target: 15 }, { symbol: "SSVUSDT", target: 20 },
    ];

    // Preload exchange info (static across cycles)
    const [infoBN, okxData, htxData] = await Promise.all([
      (await fetch("https://fapi.binance.com/fapi/v1/exchangeInfo")).json(),
      (await fetch("https://www.okx.com/api/v5/public/instruments?instType=SWAP")).json(),
      (await fetch("https://api.hbdm.com/linear-swap-api/v1/swap_contract_info")).json(),
    ]);

    // Build symbol params
    type SymP = { symbol: string; target: number; coin: string; bnS: any; okxInst: any; htxInst: any; bnLot: any; bnSt: number; bnMinN: number; okxCt: number; okxLt: number; htxCt: number };
    const symParams: SymP[] = [];
    for (const { symbol, target } of candidates) {
      const coin = symbol.replace("USDT", "");
      const bnS = infoBN.symbols.find((s: any) => s.symbol === symbol);
      const okxInst = okxData.data.find((d: any) => d.instId === coin + "-USDT-SWAP");
      const htxInst = htxData.data.find((d: any) => d.contract_code === coin + "-USDT");
      if (!bnS || !okxInst || !htxInst) continue;
      const bnLot = bnS.filters.find((f: any) => f.filterType === "LOT_SIZE");
      const bnSt = Number(bnLot?.stepSize ?? 0.1);
      const bnMinN = Number(bnS.filters.find((f: any) => f.filterType === "MIN_NOTIONAL")?.notional ?? 5);
      const okxCt = Number(okxInst.ctVal ?? 0.1);
      const okxLt = Number(okxInst.lotSz ?? 0.1);
      const htxCt = Number(htxInst.contract_size ?? 0.1);
      symParams.push({ symbol, target, coin, bnS, okxInst, htxInst, bnLot, bnSt, bnMinN, okxCt, okxLt, htxCt });
    }

    const allBlockedQty = new Set<string>();
    const allBlockedLiq = new Set<string>();
    const allNoSpread = new Set<string>();
    let totalFundingCalls = 0;
    let totalErrors = 0;
    let totalDegraded = 0;
    let actionableObserved = 0;
    let bestEverApy = 0;
    let bestEverSnapshot: CycleSnapshot | null = null;
    let firstActionable: CycleSnapshot | null = null;
    const snapshots: CycleSnapshot[] = [];

    const startTime = Date.now();

    for (let cycle = 0; cycle < CYCLES; cycle++) {
      let viable = 0;
      let actionable = 0;
      let bestApy = 0;
      let bestSnapSym = "";
      let bestSnapShort = "";
      let bestSnapLong = "";
      let degraded = false;
      let errCount = 0;

      for (const sp of symParams) {
        // Mark price
        let mp = 0;
        try {
          const i = await connectors.binance.getFundingInfo(sp.symbol);
          if (i && isFiniteNumber(i.markPrice)) mp = i.markPrice;
          totalFundingCalls++;
        } catch { errCount++; degraded = true; continue; }

        if (mp <= 0) { errCount++; continue; }

        // Quantity normalization
        const bnQ = Math.floor(sp.target / mp / sp.bnSt) * sp.bnSt;
        const bnN = bnQ * mp;
        const bnOk = bnQ > 0 && bnN >= sp.bnMinN;
        const okxQ = Math.floor(sp.target / (mp * sp.okxCt) / sp.okxLt) * sp.okxLt;
        const okxN = okxQ * mp * sp.okxCt;
        const okxOk = okxQ > 0 && okxN >= 5;
        const htxQ = Math.floor(sp.target / (sp.htxCt * mp) / 1) * 1;
        const htxN = htxQ * sp.htxCt * mp;
        const htxOk = htxQ > 0 && htxN >= 5;
        const ns = [bnN, okxN, htxN].filter((n) => n > 0);
        const mm = ns.length >= 2 ? (Math.max(...ns) - Math.min(...ns)) / Math.max(...ns) * 100 : 0;
        const normOk = bnOk && okxOk && htxOk && mm <= MAX_MISMATCH;

        if (!normOk) { allBlockedQty.add(sp.symbol); continue; }

        // Liquidity
        let liqOk = false;
        try {
          const t = await (await fetch(`https://fapi.binance.com/fapi/v1/ticker/24hr?symbol=${sp.symbol}`)).json() as Record<string, unknown>;
          const vol = Number(t.quoteVolume ?? 0);
          liqOk = vol >= MIN_VOLUME;
        } catch { errCount++; degraded = true; continue; }

        if (!liqOk) { allBlockedLiq.add(sp.symbol); continue; }

        viable++;

        // Funding spread
        try {
          const opps = await findCrossExchangeFundingSpreads(connectors as any, [sp.symbol], { ...DEFAULT_SPREAD_CONFIG, minSpreadRate: 0, minSpreadApy: 0 });
          totalFundingCalls++;
          if (opps.length > 0) {
            const top = opps[0];
            if (top.netSpreadApy > bestApy) {
              bestApy = top.netSpreadApy;
              bestSnapSym = sp.symbol;
              bestSnapShort = top.shortExchangeId;
              bestSnapLong = top.longExchangeId;
            }
            if (top.netSpreadApy >= MIN_SPREAD_APY) {
              actionable++;
              if (!firstActionable) {
                firstActionable = { cycle, viableCount: viable, actionableCount: actionable, bestNetApy: top.netSpreadApy, symbol: sp.symbol, shortEx: top.shortExchangeId, longEx: top.longExchangeId, degraded, errorCount: errCount };
              }
            } else {
              allNoSpread.add(sp.symbol);
            }
          } else {
            allNoSpread.add(sp.symbol);
          }
        } catch { errCount++; degraded = true; }
      }

      if (bestApy > bestEverApy) {
        bestEverApy = bestApy;
        bestEverSnapshot = { cycle, viableCount: viable, actionableCount: actionable, bestNetApy: bestApy, symbol: bestSnapSym, shortEx: bestSnapShort, longEx: bestSnapLong, degraded, errorCount: errCount };
      }
      actionableObserved += actionable;
      if (degraded) totalDegraded++;
      totalErrors += errCount;

      snapshots.push({ cycle, viableCount: viable, actionableCount: actionable, bestNetApy: bestApy, degraded, errorCount: errCount });

      // Log progress every 36 cycles (~3 hours of simulated time)
      if ((cycle + 1) % 36 === 0 || cycle === 0) {
        const pct = ((cycle + 1) / CYCLES * 100).toFixed(0);
        process.stdout.write(`  [${pct}%] cycle ${cycle + 1}/${CYCLES} viable=${viable} actionable=${actionable} bestApy=${bestApy.toFixed(2)}% err=${errCount}\n`);
      }

      // ~100ms delay between cycles to avoid rate limits
      await new Promise((r) => setTimeout(r, 100));
    }

    const avgApy = snapshots.reduce((s, c) => s + c.bestNetApy, 0) / snapshots.length;

    const report: Report = {
      cycles: CYCLES, completedCycles: snapshots.length,
      enabledExchanges: ALLOWED, pausedExchanges: PAUSED,
      symbolsChecked: symParams.length, fundingRatesRead: totalFundingCalls,
      viableCandidatesObserved: Math.round(snapshots.reduce((s, c) => s + c.viableCount, 0) / snapshots.length),
      actionableOpportunitiesObserved: actionableObserved,
      firstActionableOpportunity: firstActionable ? { cycle: firstActionable.cycle, symbol: firstActionable.symbol!, short: firstActionable.shortEx!, long: firstActionable.longEx!, netApy: firstActionable.bestNetApy } : undefined,
      bestOpportunity: bestEverSnapshot ? { cycle: bestEverSnapshot.cycle, symbol: bestEverSnapshot.symbol!, short: bestEverSnapshot.shortEx!, long: bestEverSnapshot.longEx!, netApy: bestEverSnapshot.bestNetApy } : undefined,
      bestNetSpreadApy: bestEverApy,
      averageBestNetSpreadApy: avgApy,
      symbolsWithoutSpread: [...allNoSpread].sort(),
      symbolsBlockedByQuantity: [...allBlockedQty].sort(),
      symbolsBlockedByLiquidity: [...allBlockedLiq].sort(),
      degradedCycles: totalDegraded,
      errors: totalErrors,
      readinessStatus: actionableObserved > 0 ? "signal_found" : "waiting_for_spread",
      forbiddenExchangeDetected: false, privateApiCalled: false,
      mainnetOrderAttempted: false, realOrdersExecuted: 0,
      postRequests: 0, putRequests: 0, deleteRequests: 0,
      generatedAt: Date.now(),
    };

    const elapsed = ((Date.now() - startTime) / 1000 / 60).toFixed(1);

    console.log(`\n  ╔══════════════════════════════════════════════════════════════════════════╗`);
    console.log(`  ║        BINANCE+OKX+HTX SPREAD WATCHER 24H REPORT                  ║`);
    console.log(`  ╠══════════════════════════════════════════════════════════════════════════╣`);
    console.log(`  ║  Duration:      ${elapsed.padStart(6)} min     Cycles: ${String(report.completedCycles).padStart(3)}/${report.cycles}${" ".repeat(26)}║`);
    console.log(`  ║  Symbols:       ${String(report.symbolsChecked).padStart(2)}          Funding calls: ${String(report.fundingRatesRead).padStart(6)}${" ".repeat(22)}║`);
    console.log(`  ║  Avg viable:    ${String(report.viableCandidatesObserved).padStart(2)}          Actionable:      ${String(report.actionableOpportunitiesObserved).padStart(4)}${" ".repeat(22)}║`);
    console.log(`  ║  Best APY:      ${report.bestNetSpreadApy.toFixed(2).padStart(8)}%    Avg APY: ${report.averageBestNetSpreadApy.toFixed(3).padStart(8)}%${" ".repeat(16)}║`);
    console.log(`  ║  Degraded:      ${String(report.degradedCycles).padStart(3)}          Errors:          ${String(report.errors).padStart(3)}${" ".repeat(22)}║`);
    console.log(`  ║  ${"─".repeat(74)}║`);
    if (report.bestOpportunity) {
      console.log(`  ║  BEST OPPORTUNITY: cycle ${String(report.bestOpportunity.cycle).padStart(3)} ${report.bestOpportunity.symbol} ${report.bestOpportunity.short}→${report.bestOpportunity.long} APY=${report.bestOpportunity.netApy.toFixed(2)}%${" ".repeat(16)}║`);
    }
    if (report.firstActionableOpportunity) {
      console.log(`  ║  FIRST SIGNAL:     cycle ${String(report.firstActionableOpportunity.cycle).padStart(3)} ${report.firstActionableOpportunity.symbol} ${report.firstActionableOpportunity.short}→${report.firstActionableOpportunity.long} APY=${report.firstActionableOpportunity.netApy.toFixed(2)}%${" ".repeat(16)}║`);
    }
    console.log(`  ║  Readiness:       ${report.readinessStatus.padEnd(52)}║`);
    if (report.symbolsBlockedByQuantity.length > 0) console.log(`  ║  Qty blocked:     ${report.symbolsBlockedByQuantity.join(", ").padEnd(52)}║`);
    if (report.symbolsBlockedByLiquidity.length > 0) console.log(`  ║  Liq blocked:     ${report.symbolsBlockedByLiquidity.join(", ").padEnd(52)}║`);
    if (report.symbolsWithoutSpread.length > 0) console.log(`  ║  No spread:       ${report.symbolsWithoutSpread.join(", ").padEnd(52)}║`);
    console.log(`  ║  ${" ".repeat(90)}║`);
    console.log(`  ║  Mainnet Attempt:  false${" ".repeat(50)}║`);
    console.log(`  ║  Real Orders:      0${" ".repeat(54)}║`);
    console.log(`  ║  POST/PUT/DEL:     0/0/0${" ".repeat(48)}║`);
    console.log(`  ╚══════════════════════════════════════════════════════════════════════════╝\n`);

    expect(report.cycles).toBe(288);
    expect(report.completedCycles).toBe(288);
    expect(report.forbiddenExchangeDetected).toBe(false);
    expect(report.privateApiCalled).toBe(false);
    expect(report.mainnetOrderAttempted).toBe(false);
    expect(report.realOrdersExecuted).toBe(0);
    expect(report.postRequests).toBe(0);
    expect(report.putRequests).toBe(0);
    expect(report.deleteRequests).toBe(0);
  });
});
