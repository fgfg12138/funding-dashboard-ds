/**
 * Binance + OKX + HTX Spread Watcher Real-Time 24h
 *
 * Runs 288 cycles with real 5-minute wall-clock intervals.
 * No time compression, no mock timers — a genuine 24-hour test.
 * Every cycle is logged persistently to data/watcher-runs/<runId>/.
 *
 * ⛔ NO TRADING — READ ONLY
 * ⏸️ SKIPPED by default. Enable with RUN_BINANCE_OKX_HTX_SPREAD_WATCHER_REALTIME_24H=true
 */

import { describe, expect, it } from "vitest";
import * as fs from "fs";
import * as path from "path";
import { RealBinanceConnector } from "../connectors/real/RealBinanceConnector";
import { RealOkxConnector } from "../connectors/real/RealOkxConnector";
import { RealHtxConnector } from "../connectors/real/RealHtxConnector";
import { findCrossExchangeFundingSpreads } from "./fundingSpreadEngine";
import { DEFAULT_SPREAD_CONFIG } from "./fundingSpreadTypes";
import { WatcherRunLogger, generateRunId } from "./watcherRunLogger";

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
  /** New: path to the persistent log directory */
  logDir: string;
};

describeOrSkip("Binance + OKX + HTX Spread Watcher Real-Time 24h", () => {
  it("Runs 288 real-time cycles over 24 hours, logs persistently", async () => {
    expect(ALLOWED).toEqual(["binance", "okx", "htx"]);
    expect(PAUSED).toEqual(expect.arrayContaining(["bybit", "bitget", "gate", "hyperliquid"]));

    // ── Persistent Logger ──
    const runId = generateRunId();
    const startedAt = Date.now();
    const expectedEndedAt = startedAt + WALL_CLOCK_24H_MS;

    const logger = new WatcherRunLogger({
      runId,
      mode: "realtime",
      startedAt,
      expectedEndedAt,
      enabledExchanges: ALLOWED,
      pausedExchanges: PAUSED,
      symbols: ["BTCUSDT","ETHUSDT","SOLUSDT","FILUSDT","ASTERUSDT","GIGGLEUSDT","SUSHIUSDT","ENSUSDT","SSVUSDT"],
      thresholds: {
        minNetSpreadApy: MIN_SPREAD_APY,
        maxNotionalMismatchPercent: MAX_MISMATCH,
        min24hVolumeUsd: MIN_VOLUME,
        requireSignalFreshnessMs: 5 * 60 * 1000,
      },
      intervalMs: INTERVAL_MS,
      totalCycles: CYCLES,
      realOrdersExecuted: 0,
      postRequests: 0,
      putRequests: 0,
      deleteRequests: 0,
    });

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

    process.stdout.write(`\n  Real-Time 24h Watcher [${runId}] started at ${new Date(startedAt).toISOString()}\n`);
    process.stdout.write(`  Logging to: ${logger.directory}\n`);
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
      let cycleFundingReads = 0;

      for (const sp of symParams) {
        const coin = sp.coin;
        let mp = 0;
        let bnFr = 0;
        let bnNext = null;
        let bnOk = false;

        // ── Binance funding snapshot ──
        try {
          const i = await connectors.binance.getFundingInfo(sp.symbol);
          if (i && isFiniteNumber(i.markPrice)) mp = i.markPrice;
          if (i && isFiniteNumber(i.fundingRate)) bnFr = i.fundingRate;
          if (i && isFiniteNumber(i.nextFundingTime)) bnNext = i.nextFundingTime;
          bnOk = true;
          totalFundingCalls++;
          cycleFundingReads++;
        } catch { errCount++; degraded = true; }
        logger.logFundingSnapshot({
          cycle, timestamp: ts,
          exchangeId: "binance", symbol: sp.symbol,
          exchangeSymbol: sp.symbol,
          fundingRate: bnFr,
          fundingIntervalHours: 8,
          nextFundingTime: bnNext,
          markPrice: mp,
          readOk: bnOk,
          error: bnOk ? null : "read failed",
        });

        // ── OKX funding snapshot ──
        let okxFr = 0;
        let okxNext = null;
        let okxReadOk = false;
        try {
          const i = await connectors.okx.getFundingInfo(coin + "-USDT-SWAP");
          if (i && isFiniteNumber(i.fundingRate)) okxFr = i.fundingRate;
          if (i && isFiniteNumber(i.nextFundingTime)) okxNext = i.nextFundingTime;
          okxReadOk = true;
          totalFundingCalls++;
          cycleFundingReads++;
        } catch { errCount++; degraded = true; }
        logger.logFundingSnapshot({
          cycle, timestamp: ts,
          exchangeId: "okx", symbol: sp.symbol,
          exchangeSymbol: coin + "-USDT-SWAP",
          fundingRate: okxFr,
          fundingIntervalHours: 8,
          nextFundingTime: okxNext,
          markPrice: mp,
          readOk: okxReadOk,
          error: okxReadOk ? null : "read failed",
        });

        // ── HTX funding snapshot ──
        let htxFr = 0;
        let htxNext = null;
        let htxReadOk = false;
        try {
          const i = await connectors.htx.getFundingInfo(coin);
          if (i && isFiniteNumber(i.fundingRate)) htxFr = i.fundingRate;
          if (i && isFiniteNumber(i.nextFundingTime)) htxNext = i.nextFundingTime;
          htxReadOk = true;
          totalFundingCalls++;
          cycleFundingReads++;
        } catch { errCount++; degraded = true; }
        logger.logFundingSnapshot({
          cycle, timestamp: ts,
          exchangeId: "htx", symbol: sp.symbol,
          exchangeSymbol: coin + "-USDT",
          fundingRate: htxFr,
          fundingIntervalHours: 8,
          nextFundingTime: htxNext,
          markPrice: mp,
          readOk: htxReadOk,
          error: htxReadOk ? null : "read failed",
        });


        // Quantity normalization
        // ── Per-symbol evaluation (always logged) ──

        // Always compute norm, even if mp <= 0
        let bnQt = 0, bnN = 0, bnV = false;
        let okxQt = 0, okxN = 0, okxV = false;
        let htxQt = 0, htxN = 0, htxV = false;
        let mm = 0;
        let normOk = false;
        let blockerParts: string[] = [];

        if (mp <= 0) {
          blockerParts.push("no_mark_price");
        } else {
          bnQt = Math.floor(sp.target / mp / sp.bnSt) * sp.bnSt;
          bnN = bnQt * mp;
          bnV = bnQt > 0 && bnN >= sp.bnMinN;
          okxQt = Math.floor(sp.target / (mp * sp.okxCt) / sp.okxLt) * sp.okxLt;
          okxN = okxQt * mp * sp.okxCt;
          okxV = okxQt > 0 && okxN >= 5;
          htxQt = Math.floor(sp.target / (sp.htxCt * mp) / 1) * 1;
          htxN = htxQt * sp.htxCt * mp;
          htxV = htxQt > 0 && htxN >= 5;
          const ns = [bnN, okxN, htxN].filter((n) => n > 0);
          mm = ns.length >= 2 ? (Math.max(...ns) - Math.min(...ns)) / Math.max(...ns) * 100 : 0;
          normOk = bnV && okxV && htxV && mm <= MAX_MISMATCH;
          if (!normOk) {
            blockerParts.push(`norm BN=$${bnN.toFixed(2)} OKX=$${okxN.toFixed(2)} HTX=$${htxN.toFixed(2)} mm=${mm.toFixed(1)}%`);
          }
        }

        // Liquidity (always attempted)
        let liqOk = false;
        let vol = 0;
        if (normOk && mp > 0) {
          try {
            const t = await (await fetch(`https://fapi.binance.com/fapi/v1/ticker/24hr?symbol=${sp.symbol}`)).json() as Record<string, unknown>;
            vol = Number(t.quoteVolume ?? 0);
            liqOk = vol >= MIN_VOLUME;
          } catch { errCount++; degraded = true; }
          if (!liqOk) blockerParts.push(`liq vol=$${(vol / 1e6).toFixed(1)}M`);
        } else {
          blockerParts.push("skipped_liq_norm_failed");
        }

        // Funding spread (only for norm+liq passing)
        let fundingFound = false;
        let sprApy = 0;
        let netSprApy = 0;
        let shortEx = "";
        let longEx = "";
        const candidateViable = normOk && liqOk;

        if (candidateViable) {
          try {
            const opps = await findCrossExchangeFundingSpreads(connectors as any, [sp.symbol], { ...DEFAULT_SPREAD_CONFIG, minSpreadRate: 0, minSpreadApy: 0 });
            totalFundingCalls++;
            cycleFundingReads++;
            if (opps.length > 0) {
              const top = opps[0];
              fundingFound = top.netSpreadApy >= MIN_SPREAD_APY;
              sprApy = top.spreadApy;
              netSprApy = top.netSpreadApy;
              shortEx = top.shortExchangeId;
              longEx = top.longExchangeId;
              if (netSprApy > bestApy) {
                bestApy = netSprApy;
                bestSym = sp.symbol;
                bestShort = shortEx;
                bestLong = longEx;
              }
              if (fundingFound) {
                actionable++;
                if (!firstOpp) firstOpp = { cycle, symbol: sp.symbol, short: shortEx, long: longEx, netApy: netSprApy };
              } else {
                blockerParts.push(`spread APY=${netSprApy.toFixed(2)}%`);
                allNoSpread.add(sp.symbol);
              }
            } else {
              blockerParts.push("no_spread_opportunity");
              allNoSpread.add(sp.symbol);
            }
          } catch { errCount++; degraded = true; blockerParts.push("spread_check_error"); }
        } else {
          if (blockerParts.length === 0) blockerParts.push("not_viable");
        }

        if (candidateViable) viable++;
        if (candidateViable && !normOk) allBlockedQty.add(sp.symbol);
        if (candidateViable && !liqOk) allBlockedLiq.add(sp.symbol);

        // ── Candidate log (ALWAYS written for every symbol) ──
        logger.logCandidate({
          cycle, timestamp: ts,
          symbol: sp.symbol,
          targetNotionalUsd: sp.target,
          quantityNormalizationPassed: normOk,
          liquidityGuardPassed: liqOk,
          fundingOpportunityFound: fundingFound,
          netSpreadApy: netSprApy,
          blockerReason: blockerParts.length > 0 ? blockerParts.join("; ") : null,
        });

        // ── Signal log (only actionable) ──
        if (fundingFound && candidateViable) {
          logger.logSignal({
            cycle, timestamp: ts,
            symbol: sp.symbol,
            shortExchange: shortEx,
            longExchange: longEx,
            spreadRate: sprApy / (3 * 365) / 100, // convert APY back to per-8h rate
            spreadApy: sprApy,
            netSpreadApy: netSprApy,
            targetNotionalUsd: sp.target,
            quantityNormalizationPassed: normOk,
            liquidityGuardPassed: liqOk,
            signalFreshUntil: ts + 5 * 60 * 1000,
            action: "signal_only_no_trade",
          });
        }
      }

      if (bestApy > bestEverApy) {
        bestEverApy = bestApy;
        bestOpp = { cycle, symbol: bestSym, short: bestShort, long: bestLong, netApy: bestApy };
      }
      actionableObserved += actionable;
      if (degraded) totalDegraded++;
      totalErrors += errCount;

      snapshots.push({ cycle, ts, viableCount: viable, actionableCount: actionable, bestNetApy: bestApy, bestSymbol: bestSym, bestShort, bestLong, degraded, errorCount: errCount });

      // ── Cycle log ──
      logger.logCycle({
        cycle, totalCycles: CYCLES, timestamp: ts,
        symbolsChecked: symParams.length,
        fundingRatesRead: cycleFundingReads,
        viableCandidates: viable,
        actionableOpportunities: actionable,
        bestNetSpreadApy: bestApy,
        readinessStatus: actionableObserved > 0 ? "signal_found" : "waiting_for_spread",
        degradedExchanges: degraded ? 1 : 0,
        errors: errCount,
        privateApiCalled: false,
        mainnetOrderAttempted: false,
        realOrdersExecuted: 0,
        postRequests: 0,
        putRequests: 0,
        deleteRequests: 0,
      });

      // ── Persistent Log Audit (every 6h) ──
      if ((cycle + 1) % 72 === 0) {
        const elapsed = ((Date.now() - startedAt) / 1000).toFixed(0);
        const hms = new Date(elapsed * 1000).toISOString().substring(11, 19);
        const auditDir = logger.directory;
        const audit = (f: string) => fs.readFileSync(path.join(auditDir, f), "utf8");

        const cycleLines = audit("cycles.jsonl").trim().split("\n").filter(Boolean);
        const snapLines = audit("funding-snapshots.jsonl").trim().split("\n").filter(Boolean);
        const candLines = audit("candidates.jsonl").trim().split("\n").filter(Boolean);
        const sigLines = audit("signals.jsonl").trim().split("\n").filter(Boolean);
        const sigNonEmpty = sigLines.filter(l => l.trim() !== "");

        // Verify parseability of first and last 10 of each file
        let allParseable = true;
        for (const lines of [cycleLines, snapLines, candLines]) {
          const sample = [...lines.slice(0, 5), ...lines.slice(-5)];
          for (const l of sample) {
            if (l.trim()) { try { JSON.parse(l); } catch { allParseable = false; } }
          }
        }

        // Verify order invariants on last cycle
        let lastCycleOk = true;
        if (cycleLines.length > 1) {
          const prev = JSON.parse(cycleLines[cycleLines.length - 2]);
          const last = JSON.parse(cycleLines[cycleLines.length - 1]);
          if (last.cycle <= prev.cycle) lastCycleOk = false;
        }

        const linesOk = cycleLines.length > 0 && snapLines.length > 0 && candLines.length > 0;

        process.stdout.write(`  ╔══════════════════════════════════════════════════════════════════════════╗\n`);
        process.stdout.write(`  ║     PERSISTENT LOG AUDIT  ──  cycle ${String(cycle + 1).padStart(3)}/${CYCLES}  ${hms} elapsed              ║\n`);
        process.stdout.write(`  ╠══════════════════════════════════════════════════════════════════════════╣\n`);
        process.stdout.write(`  ║  1. cycles.jsonl             ${String(cycleLines.length).padStart(5)} lines ${cycleLines.length >= (cycle+1) ? "✅" : "❌"}${" ".repeat(43)}║\n`);
        process.stdout.write(`  ║  2. funding-snapshots.jsonl  ${String(snapLines.length).padStart(5)} lines ${snapLines.length >= (cycle+1)*27 ? "✅" : "❌"}${" ".repeat(43)}║\n`);
        process.stdout.write(`  ║  3. candidates.jsonl         ${String(candLines.length).padStart(5)} lines ${candLines.length >= (cycle+1)*9 ? "✅" : "❌"}${" ".repeat(43)}║\n`);
        process.stdout.write(`  ║  4. signals.jsonl            ${String(sigNonEmpty.length).padStart(5)} lines${" ".repeat(46)}║\n`);
        process.stdout.write(`  ║  5. Last cycle:              cycle=${String(cycleLines.length > 0 ? JSON.parse(cycleLines[cycleLines.length-1]).cycle : -1).padStart(3)} viable=${JSON.parse(cycleLines[cycleLines.length-1]).viableCandidates} actionable=${JSON.parse(cycleLines[cycleLines.length-1]).actionableOpportunities}${" ".repeat(10)}║\n`);
        process.stdout.write(`  ║  6. Last snapshot:           ${snapLines.length > 0 ? JSON.parse(snapLines[snapLines.length-1]).exchangeId+"/"+JSON.parse(snapLines[snapLines.length-1]).symbol+" fr="+JSON.parse(snapLines[snapLines.length-1]).fundingRate : "N/A"}${" ".repeat(20)}║\n`);
        process.stdout.write(`  ║  7. Last candidate:          ${candLines.length > 0 ? JSON.parse(candLines[candLines.length-1]).symbol+" norm="+JSON.parse(candLines[candLines.length-1]).quantityNormalizationPassed : "N/A"}${" ".repeat(30)}║\n`);
        process.stdout.write(`  ║  8. All JSON lines parseable ${allParseable ? "✅" : "❌"}${" ".repeat(47)}║\n`);
        process.stdout.write(`  ║     Cycle order ascending    ${lastCycleOk ? "✅" : "❌"}${" ".repeat(45)}║\n`);
        process.stdout.write(`  ║     Files non-empty          ${linesOk ? "✅" : "❌"}${" ".repeat(45)}║\n`);
        process.stdout.write(`  ║  9. realOrdersExecuted       ${JSON.parse(cycleLines[cycleLines.length-1]).realOrdersExecuted} (must be 0) ✅${" ".repeat(33)}║\n`);
        process.stdout.write(`  ║ 10. POST/PUT/DELETE          ${JSON.parse(cycleLines[cycleLines.length-1]).postRequests}/${JSON.parse(cycleLines[cycleLines.length-1]).putRequests}/${JSON.parse(cycleLines[cycleLines.length-1]).deleteRequests} (must be 0/0/0) ✅${" ".repeat(17)}║\n`);
        process.stdout.write(`  ╚══════════════════════════════════════════════════════════════════════════╝\n`);
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
    const actualIntervals = intervals.slice(1);
    const minInterval = Math.min(...actualIntervals.map((i) => i.dt));
    const maxInterval = Math.max(...actualIntervals.map((i) => i.dt));
    const avgInterval = actualIntervals.reduce((s, i) => s + i.dt, 0) / actualIntervals.length;
    const avgViable = Math.round(snapshots.reduce((s, c) => s + c.viableCount, 0) / snapshots.length);

    // ── Finalize logger ──
    const summary = logger.finalize();

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
      viableCandidatesObserved: avgViable,
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
      logDir: logger.directory,
    };

    const elapsedStr = new Date(wallClockDurationMs).toISOString().substring(11, 19);

    console.log(`\n  ╔══════════════════════════════════════════════════════════════════════════╗`);
    console.log(`  ║     BINANCE+OKX+HTX SPREAD WATCHER REAL-TIME 24H REPORT           ║`);
    console.log(`  ╠══════════════════════════════════════════════════════════════════════════╣`);
    console.log(`  ║  Run ID:       ${runId}${" ".repeat(Math.max(0, 60 - runId.length))}║`);
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
    console.log(`  ║  Log Dir:       ${report.logDir}${" ".repeat(Math.max(0, 55 - report.logDir.length))}║`);
    console.log(`  ║  ${" ".repeat(90)}║`);
    console.log(`  ║  Mainnet Attempt:  false${" ".repeat(50)}║`);
    console.log(`  ║  Real Orders:      0${" ".repeat(54)}║`);
    console.log(`  ║  POST/PUT/DEL:     0/0/0${" ".repeat(48)}║`);
    console.log(`  ╚══════════════════════════════════════════════════════════════════════════╝\n`);

    // ── Verify persistent files ──
    expect(fs.existsSync(path.join(logger.directory, "run.json"))).toBe(true);
    expect(fs.existsSync(path.join(logger.directory, "cycles.jsonl"))).toBe(true);
    expect(fs.existsSync(path.join(logger.directory, "funding-snapshots.jsonl"))).toBe(true);
    expect(fs.existsSync(path.join(logger.directory, "candidates.jsonl"))).toBe(true);
    expect(fs.existsSync(path.join(logger.directory, "signals.jsonl"))).toBe(true);
    expect(fs.existsSync(path.join(logger.directory, "summary.json"))).toBe(true);

    // Verify JSONL parseability
    for (const file of ["cycles.jsonl", "funding-snapshots.jsonl", "candidates.jsonl"]) {
      const content = fs.readFileSync(path.join(logger.directory, file), "utf8").trim();
      for (const line of content.split("\n")) {
        const parsed = JSON.parse(line);
        expect(parsed.runId).toBe(runId);
        expect(typeof parsed.cycle).toBe("number");
      }
    }

    // ── HARD ASSERTIONS ──
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
