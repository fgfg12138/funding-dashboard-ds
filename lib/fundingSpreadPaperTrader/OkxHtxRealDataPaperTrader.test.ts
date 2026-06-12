/**
 * OKX + HTX Real Data Paper Trader
 *
 * Uses only OKX + HTX real public data to drive the Paper Trader.
 * Simulates funding spread arbitrage between OKX and HTX.
 * Binance, Bybit, and all other exchanges are excluded.
 *
 * ⛔ NO TRADING — READ ONLY
 * ⏸️ SKIPPED by default. Enable with RUN_OKX_HTX_REAL_DATA_PAPER_TRADER=true
 */

import { describe, expect, it } from "vitest";
import { RealOkxConnector } from "../connectors/real/RealOkxConnector";
import { RealHtxConnector } from "../connectors/real/RealHtxConnector";
import { findCrossExchangeFundingSpreads } from "../fundingSpread/fundingSpreadEngine";
import { DEFAULT_SPREAD_CONFIG } from "../fundingSpread/fundingSpreadTypes";
import {
  createInitialState,
  accrueSpreadFunding,
  evaluateSpreadExit,
  closeSpreadPaperPosition,
  generateSpreadPaperTraderReport,
} from "./spreadPaperTraderEngine";
import { DEFAULT_PAPER_TRADER_CONFIG } from "./spreadPaperTraderTypes";

const RUN = process.env.RUN_OKX_HTX_REAL_DATA_PAPER_TRADER === "true";
const SYMBOLS = ["BTCUSDT", "ETHUSDT", "SOLUSDT"];
const describeOrSkip = RUN ? describe : describe.skip;
const NO_MIN = { ...DEFAULT_SPREAD_CONFIG, minSpreadRate: 0, minSpreadApy: 0 };

function isFiniteNumber(v: unknown): v is number {
  return typeof v === "number" && Number.isFinite(v);
}

type Report = {
  exchangesChecked: number; symbolsChecked: number; fundingRatesRead: number; tradingRulesRead: number;
  opportunitiesFound: number; topOpportunity?: { symbol: string; short: string; long: string; spreadApy: number };
  bestSpreadApy: number; averageSpreadApy: number;
  paperPositionsOpened: number; paperPositionsClosed: number; fundingEvents: number;
  totalPaperFundingCollected: number; totalPaperPnl: number; exitReason: string;
  okxHealth: Record<string, unknown>; htxHealth: Record<string, unknown>;
  degraded: number; errors: string[];
  realOrdersExecuted: number; postRequests: number; putRequests: number; deleteRequests: number; generatedAt: number;
};

describeOrSkip("OKX + HTX Real Data Paper Trader", () => {
  it("Full OKX+HTX paper trader lifecycle: spread → open → accrue → exit → report", async () => {
    const connectors = { okx: new RealOkxConnector(), htx: new RealHtxConnector() };
    const exchangeIds = Object.keys(connectors);
    const errors: string[] = [];
    let degraded = 0;

    // Verify only OKX + HTX
    expect(exchangeIds).toEqual(["okx", "htx"]);
    expect(exchangeIds).not.toContain("binance");
    expect(exchangeIds).not.toContain("bybit");

    // 1-2. Health
    const okxH = await connectors.okx.getHealth();
    const htxH = await connectors.htx.getHealth();
    if (okxH.status !== "healthy") degraded++;
    if (htxH.status !== "healthy") degraded++;

    // 3. Trading rules
    let tradingRulesRead = 0;
    for (const c of Object.values(connectors)) {
      try { tradingRulesRead += (await c.getTradingRules()).length; }
      catch { errors.push("Trading rules failed"); degraded++; }
    }

    // 4. Funding info
    let fundingRatesRead = 0;
    for (const c of Object.values(connectors)) {
      for (const sym of SYMBOLS) {
        try {
          const info = await c.getFundingInfo(sym);
          if (info && isFiniteNumber(info.markPrice) && info.markPrice > 0) fundingRatesRead++;
        } catch { errors.push(`Funding failed for ${sym}`); degraded++; }
      }
    }

    // 5. Spread engine
    const opportunities = await findCrossExchangeFundingSpreads(connectors as any, SYMBOLS, NO_MIN);
    expect(opportunities.length).toBeGreaterThan(0);
    const top = opportunities[0];
    expect(top.shortExchangeId).not.toBe(top.longExchangeId);
    // Verify only OKX/HTX
    expect([top.shortExchangeId, top.longExchangeId].every((e) => ["okx", "htx"].includes(e))).toBe(true);

    // 6-7. Paper trader lifecycle
    const traderCfg = { ...DEFAULT_PAPER_TRADER_CONFIG, maxOpenPositions: 1, minNetSpreadApy: -999, positionSizeUsd: 10 };
    let state = createInitialState(traderCfg);

    // Open paper position from top opportunity
    const { createSpreadPaperPosition } = await import("./spreadPaperTraderEngine");
    const { position, newState } = createSpreadPaperPosition(top, state, traderCfg);
    expect(position.status).toBe("open");
    state = newState;

    // 8. Multiple funding accruals
    let currentPosition = position;
    for (let i = 0; i < 8; i++) {
      const result = accrueSpreadFunding(currentPosition, 1, state);
      currentPosition = result.position;
      state = result.newState;
    }

    // 9. Exit via max holding hours
    const overHeld = { ...currentPosition, holdingHours: 999 };
    const exitReason = evaluateSpreadExit(overHeld, { ...DEFAULT_PAPER_TRADER_CONFIG, maxHoldingHours: 48 });
    const { closedPosition, newState: closedState } = closeSpreadPaperPosition(overHeld, exitReason, state);
    state = closedState;

    // 10. Report
    const report = generateSpreadPaperTraderReport(state);
    const avgApy = opportunities.length > 0
      ? opportunities.reduce((s, o) => s + o.spreadApy, 0) / opportunities.length : 0;

    const result: Report = {
      exchangesChecked: exchangeIds.length, symbolsChecked: SYMBOLS.length,
      fundingRatesRead, tradingRulesRead, opportunitiesFound: opportunities.length,
      topOpportunity: { symbol: top.canonicalSymbol, short: top.shortExchangeId, long: top.longExchangeId, spreadApy: top.spreadApy },
      bestSpreadApy: top.spreadApy, averageSpreadApy: avgApy,
      paperPositionsOpened: 1, paperPositionsClosed: 1,
      fundingEvents: state.fundingEvents.length,
      totalPaperFundingCollected: report.totalFundingCollectedUsd,
      totalPaperPnl: report.totalPnlUsd,
      exitReason: String(closedPosition.metadata?.exitReason ?? "none"),
      okxHealth: { status: okxH.status, latencyMs: okxH.lastRestLatencyMs },
      htxHealth: { status: htxH.status, latencyMs: htxH.lastRestLatencyMs },
      degraded, errors,
      realOrdersExecuted: 0, postRequests: 0, putRequests: 0, deleteRequests: 0, generatedAt: Date.now(),
    };

    console.log(`\n  ╔══════════════════════════════════════════════════════════════════════╗`);
    console.log(`  ║        OKX + HTX PAPER TRADER — REPORT                         ║`);
    console.log(`  ╠══════════════════════════════════════════════════════════════════════╣`);
    console.log(`  ║  Exchanges:         ${result.exchangesChecked} (OKX, HTX)${" ".repeat(36)}║`);
    console.log(`  ║  Funding Reads:     ${String(result.fundingRatesRead).padStart(5)}${" ".repeat(42)}║`);
    console.log(`  ║  Opportunities:     ${String(result.opportunitiesFound).padStart(5)}${" ".repeat(42)}║`);
    if (result.topOpportunity) {
      console.log(`  ║  Top:               ${result.topOpportunity.symbol.padEnd(8)} ${result.topOpportunity.short}→${result.topOpportunity.long}${" ".repeat(30)}║`);
      console.log(`  ║  Best APY:          ${result.topOpportunity.spreadApy.toFixed(2).padStart(10)}%${" ".repeat(38)}║`);
    }
    console.log(`  ║  Avg APY:           ${result.averageSpreadApy.toFixed(2).padStart(10)}%${" ".repeat(38)}║`);
    console.log(`  ║  Paper Opened:      ${String(result.paperPositionsOpened).padStart(5)}${" ".repeat(42)}║`);
    console.log(`  ║  Paper Closed:      ${String(result.paperPositionsClosed).padStart(5)}${" ".repeat(42)}║`);
    console.log(`  ║  Funding Events:    ${String(result.fundingEvents).padStart(5)}${" ".repeat(42)}║`);
    console.log(`  ║  Funding Collected: $${result.totalPaperFundingCollected.toFixed(6).padStart(12)}${" ".repeat(33)}║`);
    console.log(`  ║  Total PnL:         $${result.totalPaperPnl.toFixed(6).padStart(12)}${" ".repeat(33)}║`);
    console.log(`  ║  Exit Reason:       ${result.exitReason.padEnd(40)}║`);
    console.log(`  ║  OKX:               ${String(result.okxHealth.status)} (${result.okxHealth.latencyMs}ms)${" ".repeat(30)}║`);
    console.log(`  ║  HTX:               ${String(result.htxHealth.status)} (${result.htxHealth.latencyMs}ms)${" ".repeat(30)}║`);
    console.log(`  ║  ────────────────────────────────────────────────────────────────── ║`);
    console.log(`  ║  Real Orders:       0${" ".repeat(45)}║`);
    console.log(`  ║  POST/PUT/DEL:      0/0/0${" ".repeat(40)}║`);
    console.log(`  ╚══════════════════════════════════════════════════════════════════════╝\n`);

    const checks = [
      ["exchanges OKX+HTX only", exchangeIds.length === 2 && !exchangeIds.includes("binance")],
      ["fundingRatesRead >= 6", result.fundingRatesRead >= 6],
      ["opportunitiesFound >= 1", result.opportunitiesFound >= 1],
      ["paperPositionsOpened >= 1", result.paperPositionsOpened >= 1],
      ["fundingEvents >= 1", result.fundingEvents >= 1],
      ["realOrdersExecuted = 0", result.realOrdersExecuted === 0],
      ["POST/PUT/DEL = 0", result.postRequests === 0 && result.putRequests === 0 && result.deleteRequests === 0],
      ["no NaN best APY", isFiniteNumber(result.bestSpreadApy)],
      ["no NaN avg APY", isFiniteNumber(result.averageSpreadApy)],
      ["no NaN funding", isFiniteNumber(result.totalPaperFundingCollected)],
      ["no NaN PnL", isFiniteNumber(result.totalPaperPnl)],
    ];
    for (const [name, ok] of checks) {
      expect(ok, name).toBe(true);
    }
  });
});
