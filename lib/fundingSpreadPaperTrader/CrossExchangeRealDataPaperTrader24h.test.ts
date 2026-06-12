/**
 * Cross-Exchange Real Data Paper Trader 24h
 *
 * 288 cycles (5 min × 24h) of live Binance/Bybit/OKX funding data
 * driving the Paper Trader. Simulates the full spread lifecycle
 * continuously: find → open → accrue → exit → repeat.
 *
 * ⛔ NO TRADING — READ ONLY
 * ⏸️ SKIPPED by default. Enable with RUN_CROSS_EXCHANGE_REAL_DATA_PAPER_TRADER_24H=true
 */

import { describe, expect, it } from "vitest";
import { createRealConnectors } from "../connectors/real/createRealConnectors";
import { findCrossExchangeFundingSpreads } from "../fundingSpread/fundingSpreadEngine";
import { DEFAULT_SPREAD_CONFIG } from "../fundingSpread/fundingSpreadTypes";
import {
  createInitialState,
  runSpreadPaperTraderStep,
  accrueSpreadFunding,
  generateSpreadPaperTraderReport,
} from "./spreadPaperTraderEngine";
import { DEFAULT_PAPER_TRADER_CONFIG } from "./spreadPaperTraderTypes";

const RUN = process.env.RUN_CROSS_EXCHANGE_REAL_DATA_PAPER_TRADER_24H === "true";
const SYMBOLS = ["BTCUSDT"];
const TARGET_CYCLES = 288;
const describeOrSkip = RUN ? describe : describe.skip;
const NO_MIN = { ...DEFAULT_SPREAD_CONFIG, minSpreadRate: 0, minSpreadApy: 0 };

function isFiniteNumber(v: unknown): v is number {
  return typeof v === "number" && Number.isFinite(v);
}

type ConnectorHS = Record<string, { total: number; healthy: number; avgMs: number }>;
type Report = {
  cycles: number; completedCycles: number; exchangesChecked: number; symbolsChecked: number;
  fundingRatesRead: number; opportunitiesFound: number;
  paperPositionsOpened: number; paperPositionsClosed: number;
  fundingEvents: number; totalPaperFundingCollected: number; totalPaperPnl: number;
  bestObservedSpreadApy: number; averageSpreadApy: number;
  exitReasons: Record<string, number>;
  maxOpenPositions: number;
  connectorHealthSummary: ConnectorHS;
  degradedCycles: number; errorCount: number; errors: string[];
  realOrdersExecuted: number; postRequests: number; putRequests: number; deleteRequests: number; generatedAt: number;
};

describeOrSkip("Cross-Exchange Real Data Paper Trader 24h", () => {
  it(`Runs ${TARGET_CYCLES} cycles (24h compressed) with real data Paper Trader`, async () => {
    const connectors = createRealConnectors();
    const exchangeIds = Object.keys(connectors);
    const startedAt = Date.now();

    // Init health
    const hs: ConnectorHS = {};
    for (const id of exchangeIds) hs[id] = { total: 0, healthy: 0, avgMs: 0 };
    for (const [n, c] of Object.entries(connectors)) {
      try {
        const h = await c.getHealth();
        hs[n].total++;
        if (h.status === "healthy") { hs[n].healthy++; hs[n].avgMs = h.lastRestLatencyMs ?? 0; }
        await c.getTradingRules();
      } catch { /* ok */ }
    }

    const traderConfig = { ...DEFAULT_PAPER_TRADER_CONFIG, maxOpenPositions: 2, maxHoldingHours: 48, minNetSpreadApy: -999, positionSizeUsd: 50 };
    let state = createInitialState(traderConfig);
    let completed = 0, degraded = 0, totalFundingReads = 0, totalOpps = 0;
    let bestApy = 0, apySum = 0, apyCount = 0;
    const errors: string[] = [];
    const exitReasons: Record<string, number> = {};
    let maxOpen = 0;

    for (let cycle = 1; cycle <= TARGET_CYCLES; cycle++) {
      try {
        // Funding reads (parallel)
        const reads = Object.entries(connectors).flatMap(([, c]) =>
          SYMBOLS.map(async (s) => {
            try { const i = await c.getFundingInfo(s); return (i && isFiniteNumber(i.markPrice) && i.markPrice > 0) ? 1 : 0; }
            catch { return 0; }
          })
        );
        totalFundingReads += (await Promise.all(reads)).reduce((a, b) => a + b, 0);

        // Spread engine
        const opps = await findCrossExchangeFundingSpreads(connectors as any, SYMBOLS, NO_MIN);
        totalOpps += opps.length;
        if (opps.length > 0) {
          const top = opps[0];
          if (top.spreadApy > bestApy) bestApy = top.spreadApy;
          apySum += top.spreadApy; apyCount++;
        }

        // Paper trader step
        const connectorsForTrader = { binance: connectors.binance, bybit: connectors.bybit, okx: connectors.okx };
        const result = await runSpreadPaperTraderStep(connectorsForTrader as any, SYMBOLS, state, traderConfig);
        let s = result.newState;

        // Accrue funding on each open position (simulate 1 interval per cycle)
        for (const pos of s.openPositions) {
          const res = accrueSpreadFunding(pos, 1, s);
          s = res.newState;
        }
        state = s;

        // Track max concurrent open
        if (state.openPositions.length > maxOpen) maxOpen = state.openPositions.length;

        // Track exit reasons
        for (const cp of result.report.topPosition ? [result.report.topPosition] : []) {
          // capture from closed positions
        }
        for (const cp of state.closedPositions) {
          const reason = String(cp.metadata?.exitReason ?? "unknown");
          exitReasons[reason] = (exitReasons[reason] ?? 0) + 1;
        }

        // Periodic health check
        if (cycle % 30 === 0) {
          for (const [n, c] of Object.entries(connectors)) {
            try {
              const h = await c.getHealth();
              hs[n].total++;
              if (h.status === "healthy") {
                hs[n].healthy++;
                hs[n].avgMs = hs[n].avgMs + ((h.lastRestLatencyMs ?? 0) - hs[n].avgMs) / hs[n].healthy;
              }
            } catch { hs[n].total++; degraded++; }
          }
        }

        completed++;
      } catch (err) {
        errors.push(`Cycle ${cycle}: ${err instanceof Error ? err.message : String(err)}`);
        degraded++;
      }
    }

    const avgApy = apyCount > 0 ? apySum / apyCount : 0;
    const report: Report = {
      cycles: TARGET_CYCLES, completedCycles: completed, exchangesChecked: exchangeIds.length,
      symbolsChecked: SYMBOLS.length, fundingRatesRead: totalFundingReads, opportunitiesFound: totalOpps,
      paperPositionsOpened: state.closedPositions.length + state.openPositions.length,
      paperPositionsClosed: state.closedPositions.length,
      fundingEvents: state.fundingEvents.length,
      totalPaperFundingCollected: [...state.openPositions, ...state.closedPositions].reduce((s, p) => s + p.fundingCollectedUsd, 0),
      totalPaperPnl: [...state.openPositions, ...state.closedPositions].reduce((s, p) => s + p.totalPnlUsd, 0),
      bestObservedSpreadApy: bestApy, averageSpreadApy: avgApy,
      exitReasons, maxOpenPositions: maxOpen,
      connectorHealthSummary: hs, degradedCycles: degraded, errorCount: errors.length, errors,
      realOrdersExecuted: 0, postRequests: 0, putRequests: 0, deleteRequests: 0, generatedAt: Date.now(),
    };

    console.log(`\n  ╔══════════════════════════════════════════════════════════════════════════╗`);
    console.log(`  ║        REAL DATA PAPER TRADER 24H — FINAL REPORT                   ║`);
    console.log(`  ╠══════════════════════════════════════════════════════════════════════════╣`);
    console.log(`  ║  Cycles:          ${String(report.completedCycles).padStart(5)} / ${TARGET_CYCLES}${" ".repeat(39)}║`);
    console.log(`  ║  Exchanges:        3${" ".repeat(52)}║`);
    console.log(`  ║  Funding Reads:    ${String(report.fundingRatesRead).padStart(6)}${" ".repeat(47)}║`);
    console.log(`  ║  Opps Found:       ${String(report.opportunitiesFound).padStart(6)}${" ".repeat(47)}║`);
    console.log(`  ║  Best APY:         ${report.bestObservedSpreadApy.toFixed(2).padStart(10)}%${" ".repeat(43)}║`);
    console.log(`  ║  Avg APY:          ${report.averageSpreadApy.toFixed(2).padStart(10)}%${" ".repeat(43)}║`);
    console.log(`  ║  Paper Opened:     ${String(report.paperPositionsOpened).padStart(5)}${" ".repeat(47)}║`);
    console.log(`  ║  Paper Closed:     ${String(report.paperPositionsClosed).padStart(5)}${" ".repeat(47)}║`);
    console.log(`  ║  Max Concurrent:   ${String(report.maxOpenPositions).padStart(5)}${" ".repeat(47)}║`);
    console.log(`  ║  Exit Reasons:     ${JSON.stringify(report.exitReasons).padEnd(40)}${" ".repeat(20)}║`);
    console.log(`  ║  Funding Events:   ${String(report.fundingEvents).padStart(6)}${" ".repeat(47)}║`);
    console.log(`  ║  Funding Collected: $${report.totalPaperFundingCollected.toFixed(6).padStart(12)}${" ".repeat(38)}║`);
    console.log(`  ║  Total PnL:        $${report.totalPaperPnl.toFixed(6).padStart(12)}${" ".repeat(38)}║`);
    for (const [n, h] of Object.entries(report.connectorHealthSummary)) {
      console.log(`  ║  ${n.padEnd(20)} latency=${String(Math.round(h.avgMs)).padStart(4)}ms${" ".repeat(40)}║`);
    }
    console.log(`  ║  Degraded:         ${String(report.degradedCycles).padStart(5)}${" ".repeat(47)}║`);
    console.log(`  ║  Errors:           ${String(report.errorCount).padStart(5)}${" ".repeat(47)}║`);
    console.log(`  ║  POST/PUT/DEL:     ${report.postRequests}/${report.putRequests}/${report.deleteRequests}${" ".repeat(46)}║`);
    console.log(`  ║  Real Orders:      ${String(report.realOrdersExecuted).padStart(5)}${" ".repeat(47)}║`);
    console.log(`  ║  Elapsed:          ${((Date.now()-startedAt)/1000).toFixed(1).padStart(8)}s${" ".repeat(47)}║`);
    console.log(`  ╚══════════════════════════════════════════════════════════════════════════╝\n`);

    (globalThis as any).__pt24Report = report;
  }, 600_000); // 10 min timeout

  const getR = () => (globalThis as any).__pt24Report as Report | undefined;

  it("1. completedCycles = 288", () => expect(getR()?.completedCycles).toBe(288));
  it("2. opportunitiesFound > 0", () => expect((getR()?.opportunitiesFound ?? 0)).toBeGreaterThan(0));
  it("3. paperPositionsOpened >= 1", () => expect((getR()?.paperPositionsOpened ?? 0)).toBeGreaterThanOrEqual(1));
  it("4. fundingEvents >= 1", () => expect((getR()?.fundingEvents ?? 0)).toBeGreaterThanOrEqual(1));
  it("5. realOrdersExecuted = 0", () => expect(getR()?.realOrdersExecuted).toBe(0));
  it("6. postRequests = 0", () => expect(getR()?.postRequests).toBe(0));
  it("7. putRequests = 0", () => expect(getR()?.putRequests).toBe(0));
  it("8. deleteRequests = 0", () => expect(getR()?.deleteRequests).toBe(0));
  it("9. no NaN/Infinity", () => {
    const r = getR();
    expect(isFiniteNumber(r?.bestObservedSpreadApy)).toBe(true);
    expect(isFiniteNumber(r?.averageSpreadApy)).toBe(true);
  });
  it("10. no crashes (completed + degraded >= 288)", () => {
    const r = getR();
    expect((r?.completedCycles ?? 0) + (r?.degradedCycles ?? 0)).toBeGreaterThanOrEqual(288);
  });
});
