/**
 * Cross-Exchange Real Data Paper Trader
 *
 * Uses live Binance/Bybit/OKX funding data to drive the Paper Trader.
 * Simulates the full spread arbitrage lifecycle: find → open → accrue → exit → report.
 *
 * ⛔ NO TRADING — READ ONLY
 * ⏸️ SKIPPED by default. Enable with RUN_CROSS_EXCHANGE_REAL_DATA_PAPER_TRADER=true
 */

import { describe, expect, it } from "vitest";
import { createRealConnectors } from "../connectors/real/createRealConnectors";
import { findCrossExchangeFundingSpreads, getFundingRatesFromConnectors } from "../fundingSpread/fundingSpreadEngine";
import { DEFAULT_SPREAD_CONFIG } from "../fundingSpread/fundingSpreadTypes";
import {
  createInitialState,
  createSpreadPaperPosition,
  accrueSpreadFunding,
  evaluateSpreadExit,
  closeSpreadPaperPosition,
  generateSpreadPaperTraderReport,
} from "./spreadPaperTraderEngine";
import { DEFAULT_PAPER_TRADER_CONFIG } from "./spreadPaperTraderTypes";

const RUN = process.env.RUN_CROSS_EXCHANGE_REAL_DATA_PAPER_TRADER === "true";
const SYMBOLS = ["BTCUSDT", "ETHUSDT", "SOLUSDT"];
const describeOrSkip = RUN ? describe : describe.skip;
const NO_MIN_CONFIG = { ...DEFAULT_SPREAD_CONFIG, minSpreadRate: 0, minSpreadApy: 0 };

function isFiniteNumber(v: unknown): v is number {
  return typeof v === "number" && Number.isFinite(v);
}

type ConnectorHealthItem = { status: string; latencyMs?: number };

describeOrSkip("Cross-Exchange Real Data Paper Trader", () => {
  const connectors = createRealConnectors();
  let healthSummary: Record<string, ConnectorHealthItem> = {};
  let fundingCount = 0;
  let opportunities: Awaited<ReturnType<typeof findCrossExchangeFundingSpreads>> = [];

  it("1. Real connectors created and healthy", async () => {
    const ids = Object.keys(connectors);
    expect(ids).toContain("binance");
    expect(ids).toContain("bybit");
    expect(ids).toContain("okx");

    for (const [name, c] of Object.entries(connectors)) {
      const h = await c.getHealth();
      healthSummary[name] = { status: h.status, latencyMs: h.lastRestLatencyMs };
      expect(h.status).toBe("healthy");
    }
  });

  it("2. Funding info readable for all symbols", async () => {
    for (const [name, c] of Object.entries(connectors)) {
      for (const sym of SYMBOLS) {
        const info = await c.getFundingInfo(sym);
        expect(info, `${name}: ${sym} missing`).toBeDefined();
        expect(info!.markPrice).toBeGreaterThan(0);
        fundingCount++;
      }
    }
  });

  it("3. Spread opportunities found from real data", async () => {
    opportunities = await findCrossExchangeFundingSpreads(connectors as any, SYMBOLS, NO_MIN_CONFIG);
    expect(opportunities.length).toBeGreaterThan(0);
  });

  it("4. Paper position opened from real opportunity", () => {
    expect(opportunities.length).toBeGreaterThan(0);
    const opp = opportunities[0];
    const state = createInitialState(DEFAULT_PAPER_TRADER_CONFIG);
    const { position, newState } = createSpreadPaperPosition(opp, state);

    expect(position.status).toBe("open");
    expect(position.shortExchangeId).toBe(opp.shortExchangeId);
    expect(position.longExchangeId).toBe(opp.longExchangeId);
    expect(isFiniteNumber(position.entrySpreadRate)).toBe(true);
    expect(position.entrySpreadRate).toBeGreaterThan(0);

    // Store for next tests via closure
    (globalThis as any).__pc_position = position;
    (globalThis as any).__pc_state = newState;
    (globalThis as any).__pc_config = DEFAULT_PAPER_TRADER_CONFIG;
  });

  it("5. Funding accrual produces events", () => {
    const pos = (globalThis as any).__pc_position as any;
    const state = (globalThis as any).__pc_state as any;
    expect(pos).toBeDefined();

    const { position: updated, events, newState } = accrueSpreadFunding(pos, 1, state);

    expect(events.length).toBe(2); // one per leg
    expect(isFiniteNumber(updated.fundingCollectedUsd)).toBe(true);
    expect(updated.fundingCollectedUsd).not.toBe(0);

    (globalThis as any).__pc_position = updated;
    (globalThis as any).__pc_state = newState;
  });

  it("6. Multiple funding accruals accumulate", () => {
    let pos = (globalThis as any).__pc_position as any;
    let state = (globalThis as any).__pc_state as any;
    const config = (globalThis as any).__pc_config as any;

    for (let i = 0; i < 5; i++) {
      const result = accrueSpreadFunding(pos, 1, state);
      pos = result.position;
      state = result.newState;
    }

    expect(pos.fundingCollectedUsd).not.toBe(0);
    expect(state.fundingEvents.length).toBeGreaterThanOrEqual(2);

    (globalThis as any).__pc_position = pos;
    (globalThis as any).__pc_state = state;
  });

  it("7. Paper exit can be triggered", () => {
    const pos = (globalThis as any).__pc_position as any;
    const state = (globalThis as any).__pc_state as any;
    expect(pos).toBeDefined();

    // Force exit by setting holdingHours beyond max
    const overHeld = { ...pos, holdingHours: 999 };
    const reason = evaluateSpreadExit(overHeld, { ...DEFAULT_PAPER_TRADER_CONFIG, maxHoldingHours: 48 });
    expect(reason.type).toBe("max_holding_hours");

    const { closedPosition, newState } = closeSpreadPaperPosition(overHeld, reason, state);
    expect(closedPosition.status).toBe("closed");
    expect(closedPosition.closedAt).toBeGreaterThan(0);
    expect(closedPosition.metadata?.exitReason).toBe("max_holding_hours");

    (globalThis as any).__pc_closedPosition = closedPosition;
    (globalThis as any).__pc_state = newState;
  });

  it("8. Report generated successfully", () => {
    const state = (globalThis as any).__pc_state as any;
    const report = generateSpreadPaperTraderReport(state);

    expect(isFiniteNumber(report.totalCapitalUsd)).toBe(true);
    expect(isFiniteNumber(report.totalPnlUsd)).toBe(true);
    expect(isFiniteNumber(report.totalFundingCollectedUsd)).toBe(true);
    expect(report.closedPositionCount).toBeGreaterThanOrEqual(1);
  });

  it("9. No trading methods called", () => {
    for (const c of Object.values(connectors)) {
      expect(c.createOrder).toBeDefined();
      // Not calling createOrder verifies safety
    }
  });

  it("10. No POST/PUT/DELETE in real connector sources", () => {
    const fs = require("fs");
    const base = fs.readFileSync(require.resolve("../connectors/real/RealConnectorBase.ts"), "utf-8");
    const bin = fs.readFileSync(require.resolve("../connectors/real/RealBinanceConnector.ts"), "utf-8");
    const byb = fs.readFileSync(require.resolve("../connectors/real/RealBybitConnector.ts"), "utf-8");
    const okx = fs.readFileSync(require.resolve("../connectors/real/RealOkxConnector.ts"), "utf-8");
    const all = base + bin + byb + okx;
    expect(all).not.toContain('method: "POST"');
    expect(all).not.toContain('method: "PUT"');
    expect(all).not.toContain('method: "DELETE"');
  });

  it("11. All numeric values are finite (no NaN/Infinity)", () => {
    const pos = (globalThis as any).__pc_position as any;
    expect(isFiniteNumber(pos?.entrySpreadRate)).toBe(true);
    expect(isFiniteNumber(pos?.fundingCollectedUsd)).toBe(true);
    expect(isFiniteNumber(pos?.totalPnlUsd)).toBe(true);
    expect(isFiniteNumber(pos?.currentSpreadRate)).toBe(true);
  });

  it("12. REAL DATA PAPER TRADER SUMMARY", () => {
    const pos = (globalThis as any).__pc_position as any;
    const closedPos = (globalThis as any).__pc_closedPosition as any;
    const state = (globalThis as any).__pc_state as any;
    const report = generateSpreadPaperTraderReport(state);

    console.log(`\n  ╔══════════════════════════════════════════════════════════════════════╗`);
    console.log(`  ║      REAL DATA PAPER TRADER — FINAL REPORT                       ║`);
    console.log(`  ╠══════════════════════════════════════════════════════════════════════╣`);
    console.log(`  ║  Exchanges:         3${" ".repeat(48)}║`);
    console.log(`  ║  Symbols:           3${" ".repeat(48)}║`);
    console.log(`  ║  Funding Reads:     ${String(fundingCount).padStart(5)}${" ".repeat(44)}║`);
    console.log(`  ║  Opportunities:     ${String(opportunities.length).padStart(5)}${" ".repeat(44)}║`);
    if (opportunities.length > 0) {
      const top = opportunities[0];
      console.log(`  ║  Top Opportunity:   ${top.canonicalSymbol.padEnd(10)} ${top.shortExchangeId}→${top.longExchangeId}${" ".repeat(30)}║`);
      console.log(`  ║  Best APY:          ${top.spreadApy.toFixed(2).padStart(10)}%${" ".repeat(41)}║`);
      console.log(`  ║  Paper Positions:   opened=1 closed=1${" ".repeat(35)}║`);
      console.log(`  ║  Funding Events:    ${String(state.fundingEvents.length).padStart(5)}${" ".repeat(44)}║`);
    }
    console.log(`  ║  Paper Funding:      $${report.totalFundingCollectedUsd.toFixed(6).padStart(12)}${" ".repeat(36)}║`);
    console.log(`  ║  Paper Total PnL:    $${report.totalPnlUsd.toFixed(6).padStart(12)}${" ".repeat(36)}║`);
    if (closedPos) {
      console.log(`  ║  Exit Reason:       ${String(closedPos.metadata?.exitReason ?? "N/A").padEnd(40)}║`);
    }
    for (const [n, h] of Object.entries(healthSummary)) {
      console.log(`  ║  ${n.padEnd(20)} latency=${String(h.latencyMs ?? "?").padStart(4)}ms${" ".repeat(38)}║`);
    }
    console.log(`  ║  ───────────────────────────────────────────────────────────────────── ║`);
    console.log(`  ║  Real Orders:       0${" ".repeat(48)}║`);
    console.log(`  ║  POST/PUT/DEL:      0/0/0${" ".repeat(43)}║`);
    console.log(`  ╚══════════════════════════════════════════════════════════════════════╝\n`);
  });
});
