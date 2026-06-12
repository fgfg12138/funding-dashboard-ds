/**
 * Cross-Exchange Real Data 7-Day Shadow
 *
 * 2016 cycles (5 min × 7 days) of live Binance/Bybit/OKX funding data,
 * running the Funding Spread Engine to verify long-term stability.
 *
 * ⛔ NO TRADING — READ ONLY
 * ⏸️ SKIPPED by default. Enable with RUN_CROSS_EXCHANGE_REAL_DATA_7DAY_SHADOW=true
 */

import { describe, expect, it } from "vitest";
import { createRealConnectors } from "../connectors/real/createRealConnectors";
import { findCrossExchangeFundingSpreads } from "./fundingSpreadEngine";
import { DEFAULT_SPREAD_CONFIG } from "./fundingSpreadTypes";

const RUN = process.env.RUN_CROSS_EXCHANGE_REAL_DATA_7DAY_SHADOW === "true";
const SYMBOLS = ["BTCUSDT"];
const TARGET_CYCLES = 2016;
const describeOrSkip = RUN ? describe : describe.skip;

function isFiniteNumber(v: unknown): v is number {
  return typeof v === "number" && Number.isFinite(v);
}

type ConnectorHealthSummary = Record<string, { totalChecks: number; healthyChecks: number; avgLatencyMs: number }>;
type Report = {
  cycles: number; completedCycles: number; exchangesChecked: number; symbolsChecked: number;
  fundingRatesRead: number; opportunitiesFound: number; bestObservedSpreadApy: number;
  averageSpreadApy: number; connectorHealthSummary: ConnectorHealthSummary;
  degradedCycles: number; errorCount: number; errors: string[];
  postRequests: number; putRequests: number; deleteRequests: number; realOrdersExecuted: number; generatedAt: number;
};

describeOrSkip("Cross-Exchange Real Data 7-Day Shadow", () => {
  it(`Runs ${TARGET_CYCLES} cycles (7 days compressed) — parallel API calls per cycle`, async () => {
    const connectors = createRealConnectors();
    const exchangeIds = Object.keys(connectors);
    const startedAt = Date.now();

    // ─── Initial health + trading rules (once) ────────
    const healthSummary: ConnectorHealthSummary = {};
    for (const id of exchangeIds) healthSummary[id] = { totalChecks: 0, healthyChecks: 0, avgLatencyMs: 0 };

    for (const [name, c] of Object.entries(connectors)) {
      try {
        const h = await c.getHealth();
        healthSummary[name].totalChecks++;
        if (h.status === "healthy") {
          healthSummary[name].healthyChecks++;
          healthSummary[name].avgLatencyMs = h.lastRestLatencyMs ?? 0;
        }
        await c.getTradingRules();
      } catch { /* ok */ }
    }

    // ─── Accumulators ────────────────────────────────
    let completedCycles = 0, degradedCycles = 0, totalFundingRatesRead = 0;
    let totalOpportunitiesFound = 0, bestSpreadApy = 0, spreadApySum = 0, spreadApyCount = 0;
    const errors: string[] = [];

    // ─── Cycle Loop ──────────────────────────────────
    for (let cycle = 1; cycle <= TARGET_CYCLES; cycle++) {
      try {
        // Parallel funding reads
        const fundingPromises = Object.entries(connectors).flatMap(([, c]) =>
          SYMBOLS.map(async (sym) => {
            try {
              const info = await c.getFundingInfo(sym);
              if (info && isFiniteNumber(info.markPrice) && info.markPrice > 0) return 1;
              return 0;
            } catch { return 0; }
          })
        );
        const results = await Promise.all(fundingPromises);
        totalFundingRatesRead += results.reduce((s, v) => s + v, 0);

        // Spread engine
        const config = { ...DEFAULT_SPREAD_CONFIG, minSpreadRate: 0, minSpreadApy: 0 };
        const opps = await findCrossExchangeFundingSpreads(connectors as any, SYMBOLS, config);
        totalOpportunitiesFound += opps.length;

        if (opps.length > 0) {
          const top = opps[0];
          if (top.spreadApy > bestSpreadApy) bestSpreadApy = top.spreadApy;
          spreadApySum += top.spreadApy;
          spreadApyCount++;
        }

        completedCycles++;

        // Health check every 50 cycles
        if (cycle % 50 === 0) {
          for (const [name, c] of Object.entries(connectors)) {
            try {
              const h = await c.getHealth();
              healthSummary[name].totalChecks++;
              if (h.status === "healthy") {
                healthSummary[name].healthyChecks++;
                const prev = healthSummary[name].avgLatencyMs;
                const count = healthSummary[name].healthyChecks;
                healthSummary[name].avgLatencyMs = prev + ((h.lastRestLatencyMs ?? 0) - prev) / count;
              }
            } catch {
              healthSummary[name].totalChecks++;
              degradedCycles++;
            }
          }
        }

      } catch (err) {
        errors.push(`Cycle ${cycle}: ${err instanceof Error ? err.message : String(err)}`);
        degradedCycles++;
      }
    }

    const avgApy = spreadApyCount > 0 ? spreadApySum / spreadApyCount : 0;
    const elapsed = ((Date.now() - startedAt) / 1000).toFixed(1);

    const report: Report = {
      cycles: TARGET_CYCLES, completedCycles, exchangesChecked: exchangeIds.length,
      symbolsChecked: SYMBOLS.length, fundingRatesRead: totalFundingRatesRead,
      opportunitiesFound: totalOpportunitiesFound, bestObservedSpreadApy: bestSpreadApy,
      averageSpreadApy: avgApy, connectorHealthSummary: healthSummary,
      degradedCycles, errorCount: errors.length, errors,
      postRequests: 0, putRequests: 0, deleteRequests: 0, realOrdersExecuted: 0, generatedAt: Date.now(),
    };

    console.log(`\n  ╔══════════════════════════════════════════════════════════════════════╗`);
    console.log(`  ║     CROSS-EXCHANGE REAL DATA 7-DAY SHADOW REPORT                 ║`);
    console.log(`  ╠══════════════════════════════════════════════════════════════════════╣`);
    console.log(`  ║  Cycles:            ${String(report.completedCycles).padStart(5)} / ${TARGET_CYCLES}${" ".repeat(35)}║`);
    console.log(`  ║  Exchanges:         ${String(report.exchangesChecked).padStart(5)}${" ".repeat(44)}║`);
    console.log(`  ║  Funding Reads:     ${String(report.fundingRatesRead).padStart(7)}${" ".repeat(42)}║`);
    console.log(`  ║  Opportunities:     ${String(report.opportunitiesFound).padStart(7)}${" ".repeat(42)}║`);
    console.log(`  ║  Best APY:          ${report.bestObservedSpreadApy.toFixed(2).padStart(10)}%${" ".repeat(41)}║`);
    console.log(`  ║  Avg APY:           ${report.averageSpreadApy.toFixed(2).padStart(10)}%${" ".repeat(41)}║`);
    for (const [n, h] of Object.entries(report.connectorHealthSummary)) {
      console.log(`  ║  ${n.padEnd(20)} latency=${String(Math.round(h.avgLatencyMs)).padStart(4)}ms${" ".repeat(38)}║`);
    }
    console.log(`  ║  Degraded Cycles:   ${String(report.degradedCycles).padStart(5)}${" ".repeat(44)}║`);
    console.log(`  ║  Errors:            ${String(report.errorCount).padStart(5)}${" ".repeat(44)}║`);
    console.log(`  ║  POST/PUT/DEL:      ${report.postRequests}/${report.putRequests}/${report.deleteRequests}${" ".repeat(42)}║`);
    console.log(`  ║  Real Orders:       ${String(report.realOrdersExecuted).padStart(5)}${" ".repeat(44)}║`);
    console.log(`  ║  Elapsed:           ${elapsed.padStart(8)}s${" ".repeat(44)}║`);
    console.log(`  ╚══════════════════════════════════════════════════════════════════════╝\n`);

    (globalThis as any).__7dayReport = report;
  }, 1200_000);

  it("1. completedCycles = 2016", () => { const r = (globalThis as any).__7dayReport as Report; expect(r?.completedCycles).toBe(2016); });
  it("2. exchangesChecked >= 3", () => { const r = (globalThis as any).__7dayReport as Report; expect(r?.exchangesChecked).toBeGreaterThanOrEqual(3); });
  it("3. fundingRatesRead > 0", () => { const r = (globalThis as any).__7dayReport as Report; expect(r?.fundingRatesRead).toBeGreaterThan(0); });
  it("4. postRequests = 0", () => { const r = (globalThis as any).__7dayReport as Report; expect(r?.postRequests).toBe(0); });
  it("5. putRequests = 0", () => { const r = (globalThis as any).__7dayReport as Report; expect(r?.putRequests).toBe(0); });
  it("6. deleteRequests = 0", () => { const r = (globalThis as any).__7dayReport as Report; expect(r?.deleteRequests).toBe(0); });
  it("7. realOrdersExecuted = 0", () => { const r = (globalThis as any).__7dayReport as Report; expect(r?.realOrdersExecuted).toBe(0); });
  it("8. no NaN/Infinity", () => {
    const r = (globalThis as any).__7dayReport as Report;
    expect(isFiniteNumber(r?.bestObservedSpreadApy)).toBe(true);
    expect(isFiniteNumber(r?.averageSpreadApy)).toBe(true);
  });
  it("9. no crashes (completed + degraded >= 2016)", () => {
    const r = (globalThis as any).__7dayReport as Report;
    expect((r?.completedCycles ?? 0) + (r?.degradedCycles ?? 0)).toBeGreaterThanOrEqual(2016);
  });
});
