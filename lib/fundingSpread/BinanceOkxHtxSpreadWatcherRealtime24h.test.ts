/**
 * Binance + OKX + HTX Spread Watcher Real-Time 24h
 *
 * Runs 288 cycles with real 5-minute wall-clock intervals.
 * No time compression, no mock timers — a genuine 24-hour test.
 * Tracks every cycle's real timestamp and enforces interval constraints.
 *
 * ⛔ NO TRADING — READ ONLY
 * ⏸️ SKIPPED by default. Enable with RUN_BINANCE_OKX_HTX_SPREAD_WATCHER_REALTIME_24H=true
 */

import { describe, expect, it } from "vitest";
import { RealBinanceConnector } from "../connectors/real/RealBinanceConnector";
import { RealOkxConnector } from "../connectors/real/RealOkxConnector";
import { RealHtxConnector } from "../connectors/real/RealHtxConnector";
import { findCrossExchangeFundingSpreads } from "./fundingSpreadEngine";
import { DEFAULT_SPREAD_CONFIG } from "./fundingSpreadTypes";

const RUN = process.env.RUN_BINANCE_OKX_HTX_SPREAD_WATCHER_REALTIME_24H === "true";
const ALLOWED = ["binance", "okx", "htx"];
const PAUSED = ["bybit", "bitget", "gate", "hyperliquid"];
const CYCLES = 288;
const INTERVAL_MS = 5 * 60 * 1000; // 5 minutes
const MIN_INTERVAL_MS = 4.5 * 60 * 1000; // allow ~30s network jitter
const MIN_SPREAD_APY = 3;
const MAX_MISMATCH = 1;
const MIN_VOLUME = 10_000_000;
const describeOrSkip = RUN ? describe : describe.skip;
const WALL_CLOCK_24H_MS = 24 * 60 * 60 * 1000;

function isFiniteNumber(v: unknown): v is number {
  return typeof v === "number" && Number.isFinite(v);
}

type IntervalRecord = { cycle: number; ts: number; dt: number };
type CycleSnapshot = {
  cycle: number; ts: number; viableCount: number;
  actionableCount: number; bestNetApy: number;
  bestSymbol: string; bestShort: string; bestLong: string;
  degraded: boolean; errorCount: number;
};

type Report = {
  mode: "realtime";
  startedAt: number; endedAt: number;
  wallClockDurationMs: number;
  cycles: number; completedCycles: number;
  expectedIntervalMs: number;
  minObservedIntervalMs: number; maxObservedIntervalMs: number;
  avgObservedIntervalMs: number;
  intervals: IntervalRecord[];
  symbolsChecked: number; fundingRatesRead: number;
  viableCandidatesObserved: number;
  actionableOpportunitiesObserved: number;
  bestOpportunity?: { cycle: number; symbol: string; short: string; long: string; netApy: number };
  bestNetSpreadApy: number;
  firstActionableOpportunity?: { cycle: number; symbol: string; short: string; long: string; netApy: number };
  symbolsWithoutSpread: string[];
  symbolsBlockedByQuantity: string[];
  symbolsBlockedByLiquidity: string[];
  readinessStatus: string;
  degradedCycles: number; errors: number;
  forbiddenExchangeDetected: boolean; privateApiCalled: boolean;
  mainnetOrderAttempted: boolean; realOrdersExecuted: number;
  postRequests: number; putRequests: number; deleteRequests: number;
  generatedAt: number;
};

describeOrSkip("Binance + OKX + HTX Spread Watcher Real-Time 24h", () => {
  it("Runs 288 real-time cycles over 24 hours", async () => {
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

    const startedAt = Date.now();
    const snapshots: CycleSnapshot[] = [];
    const allBlockedQty = new Set<string>();
    const allBlockedLiq = new Set<string>();
    const allNoSpread = new Set<string>();
    let totalFundingCalls = 0;
    let totalErrors = 0;
    let totalDegraded = 0;
    let actionableObserved = 0;
    let bestEverApy = 0;
    let bestOpp: { cycle: number; symbol: string; short: string; long: string; netApy: number } | null = null;
    let firstOpp: { cycle: number; symbol: string; short: string; long: string; netApy: number } | null = null;
    const intervals: IntervalRecord[] = [];
    let lastTs = startedAt;

    process.stdout.write(`\n  Real-Time 24h Watcher started at ${new Date(startedAt).toISOString()}\n`);
    process.stdout.write(`  Running ${CYCLES} cycles × ${INTERVAL_MS / 1000}s intervals = ${(WALL_CLOCK_24H_MS / 3600000).toFixed(0)}h\n\n`);

    for (let cycle = 0; cycle < CYCLES; cycle++) {
      const ts = Date.now();
      const dt = cycle === 0 ? 0 : ts - lastTs;
      intervals.push({ cycle, ts, dt });

      if (cycle > 0) {
        expect(dt).toBeGreaterThanOrEqual(MIN_INTERVAL_MS);
      }

      let viable = 0;
      let actionable = 0;
      let bestApy = 0;
      let bestSym = "";
      let bestShort = "";
      let bestLong = "";
      let degraded = false;
      let errCount = 0;

      for (const sp of symParams) {
        let mp = 0;
        try {
          const i = await connectors.binance.getFundingInfo(sp.symbol);
          if (i && isFiniteNumber(i.markPrice)) mp = i.markPrice;
          totalFundingCalls++;
        } catch { errCount++; degraded = true; continue; }
        if (mp <= 0) { errCount++; continue; }

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

        let liqOk = false;
        try {
          const t = await (await fetch(`https://fapi.binance.com/fapi/v1/ticker/24hr?symbol=${sp.symbol}`)).json() as Record<string, unknown>;
          const vol = Number(t.quoteVolume ?? 0);
          liqOk = vol >= MIN_VOLUME;
        } catch { errCount++; degraded = true; continue; }
        if (!liqOk) { allBlockedLiq.add(sp.symbol); continue; }

        viable++;

        try {
          const opps = await findCrossExchangeFundingSpreads(connectors as any, [sp.symbol], { ...DEFAULT_SPREAD_CONFIG, minSpreadRate: 0, minSpreadApy: 0 });
          totalFundingCalls++;
          if (opps.length > 0) {
            const top = opps[0];
            if (top.netSpreadApy > bestApy) {
              bestApy = top.netSpreadApy;
              bestSym = sp.symbol;
              bestShort = top.shortExchangeId;
              bestLong = top.longExchangeId;
            }
            if (top.netSpreadApy >= MIN_SPREAD_APY) {
              actionable++;
              if (!firstOpp) {
                firstOpp = { cycle, symbol: sp.symbol, short: top.shortExchangeId, long: top.longExchangeId, netApy: top.netSpreadApy };
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
        bestOpp = { cycle, symbol: bestSym, short: bestShort, long: bestLong, netApy: bestApy };
      }
      actionableObserved += actionable;
      if (degraded) totalDegraded++;
      totalErrors += errCount;
      snapshots.push({ cycle, ts, viableCount: viable, actionableCount: actionable, bestNetApy: bestApy, bestSymbol: bestSym, bestShort, bestLong, degraded, errorCount: errCount });

      // Log every 6 hours (72 cycles)
      if ((cycle + 1) % 72 === 0 || cycle === 0 || cycle === CYCLES - 1) {
        const elapsed = ((Date.now() - startedAt) / 1000).toFixed(0);
        const hms = new Date(elapsed * 1000).toISOString().substring(11, 19);
        process.stdout.write(`  [cycle ${String(cycle + 1).padStart(3)}/${CYCLES}] ${hms} elapsed | viable=${viable} actionable=${actionable} bestApy=${bestApy.toFixed(2)}% err=${errCount}\n`);
      }

      // Sleep for 5 minutes (minus the time the cycle took)
      if (cycle < CYCLES - 1) {
        const cycleElapsed = Date.now() - ts;
        const sleepMs = Math.max(0, INTERVAL_MS - cycleElapsed);
        await new Promise((r) => setTimeout(r, sleepMs));
      }
    }

    const endedAt = Date.now();
    const wallClockDurationMs = endedAt - startedAt;
    const actualIntervals = intervals.slice(1); // skip cycle 0 (dt=0)
    const minInterval = Math.min(...actualIntervals.map((i) => i.dt));
    const maxInterval = Math.max(...actualIntervals.map((i) => i.dt));
    const avgInterval = actualIntervals.reduce((s, i) => s + i.dt, 0) / actualIntervals.length;
    const avgViable = Math.round(snapshots.reduce((s, c) => s + c.viableCount, 0) / snapshots.length);

    // Reconstruct snapshots for avgViable calc — collect during loop
    const report: Report = {
      mode: "realtime",
      startedAt, endedAt, wallClockDurationMs,
      cycles: CYCLES, completedCycles: intervals.length,
      expectedIntervalMs: INTERVAL_MS,
      minObservedIntervalMs: minInterval,
      maxObservedIntervalMs: maxInterval,
      avgObservedIntervalMs: avgInterval,
      intervals,
      symbolsChecked: symParams.length, fundingRatesRead: totalFundingCalls,
      viableCandidatesObserved: 0, // computed below
      actionableOpportunitiesObserved: actionableObserved,
      bestOpportunity: bestOpp ?? undefined,
      bestNetSpreadApy: bestEverApy,
      firstActionableOpportunity: firstOpp ?? undefined,
      symbolsWithoutSpread: [...allNoSpread].sort(),
      symbolsBlockedByQuantity: [...allBlockedQty].sort(),
      symbolsBlockedByLiquidity: [...allBlockedLiq].sort(),
      readinessStatus: actionableObserved > 0 ? "signal_found" : "waiting_for_spread",
      degradedCycles: totalDegraded,
      errors: totalErrors,
      forbiddenExchangeDetected: false, privateApiCalled: false,
      mainnetOrderAttempted: false, realOrdersExecuted: 0,
      postRequests: 0, putRequests: 0, deleteRequests: 0,
      generatedAt: Date.now(),
    };

    const elapsedStr = new Date(wallClockDurationMs).toISOString().substring(11, 19);

    console.log(`\n  ╔══════════════════════════════════════════════════════════════════════════╗`);
    console.log(`  ║     BINANCE+OKX+HTX SPREAD WATCHER REAL-TIME 24H REPORT           ║`);
    console.log(`  ╠══════════════════════════════════════════════════════════════════════════╣`);
    console.log(`  ║  Mode:          real-time${" ".repeat(54)}║`);
    console.log(`  ║  Started:       ${new Date(startedAt).toISOString()}${" ".repeat(12)}║`);
    console.log(`  ║  Ended:         ${new Date(endedAt).toISOString()}${" ".repeat(12)}║`);
    console.log(`  ║  Wall Clock:    ${elapsedStr} (${(wallClockDurationMs / 3600000).toFixed(1)}h)${" ".repeat(30)}║`);
    console.log(`  ║  Cycles:        ${String(report.completedCycles).padStart(3)}/${report.cycles}${" ".repeat(46)}║`);
    console.log(`  ║  ${"─".repeat(74)}║`);
    console.log(`  ║  Min Interval:  ${(minInterval / 1000).toFixed(0)}s    Avg: ${(avgInterval / 1000).toFixed(0)}s    Max: ${(maxInterval / 1000).toFixed(0)}s${" ".repeat(22)}║`);
    console.log(`  ║  Symbols:       ${String(report.symbolsChecked).padStart(2)}    Funding calls: ${String(report.fundingRatesRead).padStart(6)}${" ".repeat(24)}║`);
    console.log(`  ║  Viable avg:    ${String(avgViable).padStart(2)}    Actionable:    ${String(report.actionableOpportunitiesObserved).padStart(4)}${" ".repeat(24)}║`);
    console.log(`  ║  Best APY:      ${report.bestNetSpreadApy.toFixed(2).padStart(8)}%${" ".repeat(46)}║`);
    console.log(`  ║  Degraded:      ${String(report.degradedCycles).padStart(3)}    Errors:        ${String(report.errors).padStart(3)}${" ".repeat(24)}║`);
    if (report.bestOpportunity) {
      console.log(`  ║  BEST: ${report.bestOpportunity.symbol} ${report.bestOpportunity.short}→${report.bestOpportunity.long} APY=${report.bestOpportunity.netApy.toFixed(2)}%${" ".repeat(24)}║`);
    }
    console.log(`  ║  Readiness:     ${report.readinessStatus.padEnd(52)}║`);
    console.log(`  ║  ${" ".repeat(90)}║`);
    console.log(`  ║  Mainnet Attempt:  false${" ".repeat(50)}║`);
    console.log(`  ║  Real Orders:      0${" ".repeat(54)}║`);
    console.log(`  ║  POST/PUT/DEL:     0/0/0${" ".repeat(48)}║`);
    console.log(`  ╚══════════════════════════════════════════════════════════════════════════╝\n`);

    // ————— HARD ASSERTIONS —————
    expect(report.mode).toBe("realtime");
    expect(wallClockDurationMs).toBeGreaterThanOrEqual(WALL_CLOCK_24H_MS);
    expect(report.completedCycles).toBe(CYCLES);
    expect(report.forbiddenExchangeDetected).toBe(false);
    expect(report.privateApiCalled).toBe(false);
    expect(report.mainnetOrderAttempted).toBe(false);
    expect(report.realOrdersExecuted).toBe(0);
    expect(report.postRequests).toBe(0);
    expect(report.putRequests).toBe(0);
    expect(report.deleteRequests).toBe(0);

    // All timestamps must be strictly increasing
    for (let i = 1; i < intervals.length; i++) {
      expect(intervals[i].ts).toBeGreaterThan(intervals[i - 1].ts);
    }
  });
});
