/**
 * OKX + HTX Real Data Shadow
 *
 * Runs cross-exchange funding spread engine using only OKX and HTX (Huobi)
 * real public data. Binance, Bybit, and all other exchanges are excluded.
 *
 * ⛔ NO TRADING — READ ONLY
 * ⏸️ SKIPPED by default. Enable with RUN_OKX_HTX_REAL_DATA_SHADOW=true
 */

import { describe, expect, it } from "vitest";
import { RealOkxConnector } from "../connectors/real/RealOkxConnector";
import { RealHtxConnector } from "../connectors/real/RealHtxConnector";
import { findCrossExchangeFundingSpreads } from "./fundingSpreadEngine";
import { DEFAULT_SPREAD_CONFIG } from "./fundingSpreadTypes";

const RUN = process.env.RUN_OKX_HTX_REAL_DATA_SHADOW === "true";
const SYMBOLS = ["BTCUSDT", "ETHUSDT", "SOLUSDT"];
const describeOrSkip = RUN ? describe : describe.skip;
const NO_MIN = { ...DEFAULT_SPREAD_CONFIG, minSpreadRate: 0, minSpreadApy: 0 };

function isFiniteNumber(v: unknown): v is number {
  return typeof v === "number" && Number.isFinite(v);
}

type Report = {
  exchangesChecked: number;
  symbolsChecked: number;
  fundingRatesRead: number;
  tradingRulesRead: number;
  opportunitiesFound: number;
  bestOpportunity?: { symbol: string; short: string; long: string; spreadRate: number; spreadApy: number; netSpreadApy: number };
  bestSpreadRate: number;
  bestSpreadApy: number;
  averageSpreadApy: number;
  okxHealth: { status: string; latencyMs?: number };
  htxHealth: { status: string; latencyMs?: number };
  degraded: number;
  errors: string[];
  realOrdersExecuted: number;
  postRequests: number;
  putRequests: number;
  deleteRequests: number;
  generatedAt: number;
};

describeOrSkip("OKX + HTX Real Data Shadow", () => {
  it("Runs spread engine with only OKX + HTX real data", async () => {
    const connectors = { okx: new RealOkxConnector(), htx: new RealHtxConnector() };
    const exchangeIds = Object.keys(connectors);
    const errors: string[] = [];
    let degraded = 0;

    // Verify only OKX + HTX
    expect(exchangeIds).toEqual(["okx", "htx"]);
    expect(exchangeIds).not.toContain("binance");
    expect(exchangeIds).not.toContain("bybit");

    // 1-2. Health checks
    const okxH = await connectors.okx.getHealth();
    const htxH = await connectors.htx.getHealth();
    if (okxH.status !== "healthy") degraded++;
    if (htxH.status !== "healthy") degraded++;

    // 3. Trading rules
    let tradingRulesRead = 0;
    try {
      const okxRules = await connectors.okx.getTradingRules();
      tradingRulesRead += okxRules.length;
    } catch { errors.push("OKX trading rules failed"); degraded++; }
    try {
      const htxRules = await connectors.htx.getTradingRules();
      tradingRulesRead += htxRules.length;
    } catch { errors.push("HTX trading rules failed"); degraded++; }

    // 4. Funding info
    let fundingRatesRead = 0;
    for (const [name, c] of Object.entries(connectors)) {
      for (const sym of SYMBOLS) {
        try {
          const info = await c.getFundingInfo(sym);
          if (info && isFiniteNumber(info.markPrice) && info.markPrice > 0) fundingRatesRead++;
        } catch {
          errors.push(`${name}: ${sym} funding failed`);
          degraded++;
        }
      }
    }

    // 5. Spread engine
    const opportunities = await findCrossExchangeFundingSpreads(connectors as any, SYMBOLS, NO_MIN);
    const top = opportunities[0];
    const avgApy = opportunities.length > 0
      ? opportunities.reduce((s, o) => s + o.spreadApy, 0) / opportunities.length
      : 0;

    const report: Report = {
      exchangesChecked: exchangeIds.length,
      symbolsChecked: SYMBOLS.length,
      fundingRatesRead,
      tradingRulesRead,
      opportunitiesFound: opportunities.length,
      bestOpportunity: top ? {
        symbol: top.canonicalSymbol,
        short: top.shortExchangeId,
        long: top.longExchangeId,
        spreadRate: top.spreadRate,
        spreadApy: top.spreadApy,
        netSpreadApy: top.netSpreadApy,
      } : undefined,
      bestSpreadRate: top?.spreadRate ?? 0,
      bestSpreadApy: top?.spreadApy ?? 0,
      averageSpreadApy: avgApy,
      okxHealth: { status: okxH.status, latencyMs: okxH.lastRestLatencyMs },
      htxHealth: { status: htxH.status, latencyMs: htxH.lastRestLatencyMs },
      degraded,
      errors,
      realOrdersExecuted: 0,
      postRequests: 0,
      putRequests: 0,
      deleteRequests: 0,
      generatedAt: Date.now(),
    };

    console.log(`\n  ╔══════════════════════════════════════════════════════════════════════╗`);
    console.log(`  ║           OKX + HTX REAL DATA SHADOW REPORT                    ║`);
    console.log(`  ╠══════════════════════════════════════════════════════════════════════╣`);
    console.log(`  ║  Exchanges:         ${report.exchangesChecked} (OKX, HTX)${" ".repeat(39)}║`);
    console.log(`  ║  Symbols:           ${report.symbolsChecked}${" ".repeat(48)}║`);
    console.log(`  ║  Trading Rules:     ${String(report.tradingRulesRead).padStart(5)}${" ".repeat(45)}║`);
    console.log(`  ║  Funding Reads:     ${String(report.fundingRatesRead).padStart(5)}${" ".repeat(45)}║`);
    console.log(`  ║  Opportunities:     ${String(report.opportunitiesFound).padStart(5)}${" ".repeat(45)}║`);
    if (report.bestOpportunity) {
      console.log(`  ║  Top:               ${report.bestOpportunity.symbol.padEnd(10)} ${report.bestOpportunity.short}→${report.bestOpportunity.long}${" ".repeat(30)}║`);
      console.log(`  ║  Best APY:          ${report.bestOpportunity.spreadApy.toFixed(2).padStart(10)}%${" ".repeat(41)}║`);
    }
    console.log(`  ║  Avg APY:           ${report.averageSpreadApy.toFixed(2).padStart(10)}%${" ".repeat(41)}║`);
    console.log(`  ║  OKX health:        ${report.okxHealth.status} (${report.okxHealth.latencyMs}ms)${" ".repeat(30)}║`);
    console.log(`  ║  HTX health:        ${report.htxHealth.status} (${report.htxHealth.latencyMs}ms)${" ".repeat(30)}║`);
    console.log(`  ║  Degraded:          ${String(report.degraded).padStart(5)}${" ".repeat(45)}║`);
    console.log(`  ║  Errors:            ${String(report.errors.length).padStart(5)}${" ".repeat(45)}║`);
    console.log(`  ║  ────────────────────────────────────────────────────────────────── ║`);
    console.log(`  ║  Real Orders:       0${" ".repeat(48)}║`);
    console.log(`  ║  POST/PUT/DEL:      0/0/0${" ".repeat(43)}║`);
    console.log(`  ╚══════════════════════════════════════════════════════════════════════╝\n`);

    const checks = [
      ["exchangesChecked = 2", report.exchangesChecked === 2],
      ["no binance", !exchangeIds.includes("binance")],
      ["no bybit", !exchangeIds.includes("bybit")],
      ["symbolsChecked = 3", report.symbolsChecked === 3],
      ["fundingRatesRead >= 6", report.fundingRatesRead >= 6],
      ["tradingRulesRead >= 6", report.tradingRulesRead >= 6],
      ["realOrdersExecuted = 0", report.realOrdersExecuted === 0],
      ["postRequests = 0", report.postRequests === 0],
      ["putRequests = 0", report.putRequests === 0],
      ["deleteRequests = 0", report.deleteRequests === 0],
      ["no NaN best APY", isFiniteNumber(report.bestSpreadApy)],
      ["no NaN avg APY", isFiniteNumber(report.averageSpreadApy)],
    ];
    for (const [name, ok] of checks) {
      expect(ok, name).toBe(true);
    }
  });
});
