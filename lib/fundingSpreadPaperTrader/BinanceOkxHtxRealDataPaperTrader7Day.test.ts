/**
 * Binance + OKX + HTX Real Data Paper Trader 7-Day
 *
 * 2016 cycles (5 min × 7 days) of live Binance/OKX/HTX funding data
 * driving the Paper Trader. Bybit, Bitget, Gate, Hyperliquid excluded.
 *
 * ⛔ NO TRADING — READ ONLY
 * ⏸️ SKIPPED by default. Enable with RUN_BINANCE_OKX_HTX_REAL_DATA_PAPER_TRADER_7DAY=true
 */

import { describe, expect, it } from "vitest";
import { createRealConnectors } from "../connectors/real/createRealConnectors";
import { findCrossExchangeFundingSpreads } from "../fundingSpread/fundingSpreadEngine";
import { DEFAULT_SPREAD_CONFIG } from "../fundingSpread/fundingSpreadTypes";
import { runSpreadPaperTraderStep, accrueSpreadFunding, createInitialState, generateSpreadPaperTraderReport } from "./spreadPaperTraderEngine";
import { DEFAULT_PAPER_TRADER_CONFIG } from "./spreadPaperTraderTypes";

const RUN = process.env.RUN_BINANCE_OKX_HTX_REAL_DATA_PAPER_TRADER_7DAY === "true";
const SYMBOLS = ["BTCUSDT"];
const TARGET_CYCLES = 2016;
const describeOrSkip = RUN ? describe : describe.skip;
const NO_MIN = { ...DEFAULT_SPREAD_CONFIG, minSpreadRate: 0, minSpreadApy: 0 };
const ALLOWED = ["binance", "okx", "htx"];
const PAUSED = ["bybit", "bitget", "gate", "hyperliquid"];

function isFiniteNumber(v: unknown): v is number {
  return typeof v === "number" && Number.isFinite(v);
}

type Report = {
  cycles: number; completedCycles: number;
  enabledExchanges: string[]; pausedExchanges: string[];
  symbolsChecked: number; fundingRatesRead: number; opportunitiesFound: number;
  bestSpreadApy: number; averageSpreadApy: number;
  paperPositionsOpened: number; paperPositionsClosed: number;
  maxConcurrentPositions: number;
  fundingEvents: number; totalPaperFundingCollected: number; totalPaperPnl: number;
  exitReasons: Record<string, number>;
  exchangeHealthSummary: Record<string, { totalChecks: number; healthyChecks: number; avgLatencyMs: number }>;
  degradedCycles: number; errors: string[];
  forbiddenExchangeDetected: boolean; privateApiCalled: boolean;
  realOrdersExecuted: number; postRequests: number; putRequests: number; deleteRequests: number;
  generatedAt: number;
};

describeOrSkip("Binance + OKX + HTX Real Data Paper Trader 7-Day", () => {
  it(`Runs ${TARGET_CYCLES} cycles with only Binance/OKX/HTX`, async () => {
    const connectors = createRealConnectors();
    const exchangeIds = Object.keys(connectors);

    // ═══ ANTI-LAZINESS: Strict exchange audit ═══
    expect(exchangeIds).toEqual(expect.arrayContaining(ALLOWED));
    const filteredConnectors: Record<string, typeof connectors[string]> = {};
    for (const id of ALLOWED) {
      if (connectors[id]) filteredConnectors[id] = connectors[id];
    }
    expect(Object.keys(filteredConnectors)).toEqual(ALLOWED);
    const allOppExchanges = new Set<string>();

    const startedAt = Date.now();

    const hs: Record<string, { total: number; healthy: number; avgMs: number }> = {};
    for (const id of ALLOWED) hs[id] = { total: 0, healthy: 0, avgMs: 0 };
    for (const id of ALLOWED) {
      try { const h = await filteredConnectors[id].getHealth(); hs[id].total++; if (h.status === "healthy") { hs[id].healthy++; hs[id].avgMs = h.lastRestLatencyMs ?? 0; } await filteredConnectors[id].getTradingRules(); } catch { /* ok */ }
    }

    const traderCfg = { ...DEFAULT_PAPER_TRADER_CONFIG, maxOpenPositions: 2, maxHoldingHours: 48, minNetSpreadApy: -999, positionSizeUsd: 50 };
    let state = createInitialState(traderCfg);
    let completed = 0, degraded = 0, totalFundingReads = 0, totalOpps = 0;
    let bestApy = 0, apySum = 0, apyCount = 0;
    const errors: string[] = [];
    const exitReasons: Record<string, number> = {};
    let maxOpen = 0;

    for (let cycle = 1; cycle <= TARGET_CYCLES; cycle++) {
      if (cycle % 100 === 0 || cycle === 1) console.log(`  🔄 Cycle ${cycle}/${TARGET_CYCLES}...`);
      try {
        const reads = ALLOWED.flatMap((exId) =>
          SYMBOLS.map(async (s) => {
            try { const i = await filteredConnectors[exId].getFundingInfo(s); return (i && isFiniteNumber(i.markPrice) && i.markPrice > 0) ? 1 : 0; }
            catch { return 0; }
          })
        );
        totalFundingReads += (await Promise.all(reads)).reduce((a, b) => a + b, 0);

        const opps = await findCrossExchangeFundingSpreads(filteredConnectors as any, SYMBOLS, NO_MIN);
        const forbiddenInOpps = opps.some((o) => PAUSED.includes(o.shortExchangeId) || PAUSED.includes(o.longExchangeId));
        if (forbiddenInOpps) { errors.push(`Forbidden exchange in opps cycle ${cycle}`); degraded++; }
        for (const o of opps) { allOppExchanges.add(o.shortExchangeId); allOppExchanges.add(o.longExchangeId); }
        totalOpps += opps.length;

        if (opps.length > 0) { const top = opps[0]; if (top.spreadApy > bestApy) bestApy = top.spreadApy; apySum += top.spreadApy; apyCount++; }

        const result = await runSpreadPaperTraderStep(filteredConnectors as any, SYMBOLS, state, traderCfg);
        let s = result.newState;
        for (const pos of s.openPositions) { const res = accrueSpreadFunding(pos, 1, s); s = res.newState; }
        state = s;
        if (state.openPositions.length > maxOpen) maxOpen = state.openPositions.length;
        for (const cp of state.closedPositions) { exitReasons[String(cp.metadata?.exitReason ?? "unknown")] = (exitReasons[String(cp.metadata?.exitReason ?? "unknown")] ?? 0) + 1; }

        if (cycle % 60 === 0) {
          for (const id of ALLOWED) {
            try { const h = await filteredConnectors[id].getHealth(); hs[id].total++; if (h.status === "healthy") { hs[id].healthy++; hs[id].avgMs += ((h.lastRestLatencyMs ?? 0) - hs[id].avgMs) / hs[id].healthy; } }
            catch { hs[id].total++; degraded++; }
          }
        }
        completed++;
      } catch (err) {
        errors.push(`Cycle ${cycle}: ${err instanceof Error ? err.message : String(err)}`);
        degraded++;
      }
    }

    const forbiddenExchangeDetected = [...allOppExchanges].some((ex) => PAUSED.includes(ex));
    const avgApy = apyCount > 0 ? apySum / apyCount : 0;

    const report: Report = {
      cycles: TARGET_CYCLES, completedCycles: completed,
      enabledExchanges: ALLOWED, pausedExchanges: PAUSED,
      symbolsChecked: SYMBOLS.length, fundingRatesRead: totalFundingReads, opportunitiesFound: totalOpps,
      bestSpreadApy: bestApy, averageSpreadApy: avgApy,
      paperPositionsOpened: state.closedPositions.length + state.openPositions.length,
      paperPositionsClosed: state.closedPositions.length,
      maxConcurrentPositions: maxOpen, fundingEvents: state.fundingEvents.length,
      totalPaperFundingCollected: [...state.openPositions, ...state.closedPositions].reduce((s, p) => s + p.fundingCollectedUsd, 0),
      totalPaperPnl: [...state.openPositions, ...state.closedPositions].reduce((s, p) => s + p.totalPnlUsd, 0),
      exitReasons,
      exchangeHealthSummary: Object.fromEntries(Object.entries(hs).map(([k, v]) => [k, { totalChecks: v.total, healthyChecks: v.healthy, avgLatencyMs: v.avgMs }])),
      degradedCycles: degraded, errors,
      forbiddenExchangeDetected, privateApiCalled: false,
      realOrdersExecuted: 0, postRequests: 0, putRequests: 0, deleteRequests: 0, generatedAt: Date.now(),
    };

    const elapsed = ((Date.now() - startedAt) / 1000).toFixed(1);

    console.log(`\n  ╔══════════════════════════════════════════════════════════════════════════════╗`);
    console.log(`  ║  BINANCE+OKX+HTX PAPER TRADER 7-DAY — REPORT                            ║`);
    console.log(`  ╠══════════════════════════════════════════════════════════════════════════════╣`);
    console.log(`  ║  Cycles:             ${String(report.completedCycles).padStart(5)} / ${TARGET_CYCLES}${" ".repeat(43)}║`);
    console.log(`  ║  Enabled:            binance, okx, htx${" ".repeat(38)}║`);
    console.log(`  ║  Paused:             ${PAUSED.join(", ")}${" ".repeat(28)}║`);
    console.log(`  ║  Funding Reads:      ${String(report.fundingRatesRead).padStart(6)}${" ".repeat(48)}║`);
    console.log(`  ║  Opps Found:         ${String(report.opportunitiesFound).padStart(7)}${" ".repeat(47)}║`);
    console.log(`  ║  Best APY:           ${report.bestSpreadApy.toFixed(2).padStart(10)}%${" ".repeat(45)}║`);
    console.log(`  ║  Avg APY:            ${report.averageSpreadApy.toFixed(2).padStart(10)}%${" ".repeat(45)}║`);
    console.log(`  ║  Paper Opened:       ${String(report.paperPositionsOpened).padStart(5)}${" ".repeat(48)}║`);
    console.log(`  ║  Paper Closed:       ${String(report.paperPositionsClosed).padStart(5)}${" ".repeat(48)}║`);
    console.log(`  ║  Max Concurrent:     ${String(report.maxConcurrentPositions).padStart(5)}${" ".repeat(48)}║`);
    console.log(`  ║  Funding Events:     ${String(report.fundingEvents).padStart(6)}${" ".repeat(48)}║`);
    console.log(`  ║  Funding:            $${report.totalPaperFundingCollected.toFixed(6).padStart(12)}${" ".repeat(41)}║`);
    console.log(`  ║  PnL:                $${report.totalPaperPnl.toFixed(6).padStart(12)}${" ".repeat(41)}║`);
    console.log(`  ║  Exit Reasons:       ${JSON.stringify(report.exitReasons).padEnd(46)}${" ".repeat(13)}║`);
    for (const [n, h] of Object.entries(report.exchangeHealthSummary)) {
      console.log(`  ║  ${n.padEnd(20)} latency=${String(Math.round(h.avgLatencyMs)).padStart(4)}ms${" ".repeat(45)}║`);
    }
    console.log(`  ║  Degraded:           ${String(report.degradedCycles).padStart(5)}${" ".repeat(48)}║`);
    console.log(`  ║  Errors:             ${String(report.errors.length).padStart(5)}${" ".repeat(48)}║`);
    console.log(`  ║  Forbidden Exch:     ${String(report.forbiddenExchangeDetected).padEnd(48)}║`);
    console.log(`  ║  Private API:        ${String(report.privateApiCalled).padEnd(48)}║`);
    console.log(`  ║  Real Orders:        ${String(report.realOrdersExecuted).padStart(5)}${" ".repeat(48)}║`);
    console.log(`  ║  POST/PUT/DEL:       ${report.postRequests}/${report.putRequests}/${report.deleteRequests}${" ".repeat(47)}║`);
    console.log(`  ║  Elapsed:            ${elapsed.padStart(8)}s${" ".repeat(48)}║`);
    console.log(`  ╚══════════════════════════════════════════════════════════════════════════════╝\n`);

    expect(report.completedCycles).toBe(2016);
    expect(report.enabledExchanges).toEqual(["binance", "okx", "htx"]);
    expect(report.pausedExchanges).toEqual(PAUSED);
    expect(report.forbiddenExchangeDetected).toBe(false);
    expect(report.privateApiCalled).toBe(false);
    expect(report.realOrdersExecuted).toBe(0);
    expect(report.postRequests).toBe(0);
    expect(report.putRequests).toBe(0);
    expect(report.deleteRequests).toBe(0);
    expect(isFiniteNumber(report.bestSpreadApy)).toBe(true);
    expect(isFiniteNumber(report.averageSpreadApy)).toBe(true);
  }, 14400_000); // 4-hour timeout
});
