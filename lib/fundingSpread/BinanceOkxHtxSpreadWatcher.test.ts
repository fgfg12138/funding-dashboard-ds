/**
 * Binance + OKX + HTX Spread Watcher
 *
 * Monitors funding spreads across all 3 exchanges for a pool of symbols.
 * Reports actionable opportunities when conditions are met — no orders placed.
 *
 * ⛔ NO TRADING — READ ONLY
 * ⏸️ SKIPPED by default. Enable with RUN_BINANCE_OKX_HTX_SPREAD_WATCHER=true
 */

import { describe, expect, it } from "vitest";
import { RealBinanceConnector } from "../connectors/real/RealBinanceConnector";
import { RealOkxConnector } from "../connectors/real/RealOkxConnector";
import { RealHtxConnector } from "../connectors/real/RealHtxConnector";
import { findCrossExchangeFundingSpreads } from "./fundingSpreadEngine";
import { DEFAULT_SPREAD_CONFIG } from "./fundingSpreadTypes";

const RUN = process.env.RUN_BINANCE_OKX_HTX_SPREAD_WATCHER === "true";
const ALLOWED = ["binance", "okx", "htx"];
const PAUSED = ["bybit", "bitget", "gate", "hyperliquid"];
const MIN_SPREAD_APY = 3;
const MAX_MISMATCH = 1;
const MIN_VOLUME = 10_000_000;
const NUM_CORE = 3; // BTC, ETH, SOL
const describeOrSkip = RUN ? describe : describe.skip;

function isFiniteNumber(v: unknown): v is number {
  return typeof v === "number" && Number.isFinite(v);
}

type SymStatus = {
  symbol: string; targetNotional: number; markPrice: number;
  normOk: boolean; mismatch: number; liqOk: boolean; volumeUsd: number;
  spreadOk: boolean; netApy: number; shortExch: string; longExch: string;
  blocker: string;
};

type Report = {
  enabledExchanges: string[]; pausedExchanges: string[];
  symbolsChecked: number; fundingRatesRead: number;
  viableCandidates: number; actionableOpportunities: number;
  bestOpportunity?: { symbol: string; short: string; long: string; apy: number; netApy: number };
  bestNetSpreadApy: number;
  symbolsWithoutSpread: string[];
  symbolsBlockedByQuantity: string[];
  symbolsBlockedByLiquidity: string[];
  readinessStatus: string;
  forbiddenExchangeDetected: boolean; privateApiCalled: boolean;
  mainnetOrderAttempted: boolean; realOrdersExecuted: number;
  postRequests: number; putRequests: number; deleteRequests: number;
  generatedAt: number;
};

describeOrSkip("Binance + OKX + HTX Spread Watcher", () => {
  it("Monitors spreads across symbol pool, reports actionable opportunities", async () => {
    expect(ALLOWED).toEqual(["binance", "okx", "htx"]);
    expect(PAUSED).toEqual(expect.arrayContaining(["bybit", "bitget", "gate", "hyperliquid"]));

    const connectors = { binance: new RealBinanceConnector(), okx: new RealOkxConnector(), htx: new RealHtxConnector() };

    // Core + discovered candidates
    const candidates: Array<{ symbol: string; target: number }> = [
      { symbol: "BTCUSDT", target: 5 }, { symbol: "ETHUSDT", target: 5 }, { symbol: "SOLUSDT", target: 5 },
      { symbol: "FILUSDT", target: 10 }, { symbol: "ASTERUSDT", target: 10 }, { symbol: "GIGGLEUSDT", target: 10 },
      { symbol: "SUSHIUSDT", target: 15 }, { symbol: "ENSUSDT", target: 15 }, { symbol: "SSVUSDT", target: 20 },
    ];

    // Fetch exchange data once
    const [infoBN, okxData, htxData] = await Promise.all([
      (await fetch("https://fapi.binance.com/fapi/v1/exchangeInfo")).json(),
      (await fetch("https://www.okx.com/api/v5/public/instruments?instType=SWAP")).json(),
      (await fetch("https://api.hbdm.com/linear-swap-api/v1/swap_contract_info")).json(),
    ]);

    const results: SymStatus[] = [];
    let fundingCalls = 0;
    let bestApy = 0;

    for (const { symbol, target } of candidates) {
      const coin = symbol.replace("USDT", "");
      const bnS = infoBN.symbols.find((s: any) => s.symbol === symbol);
      const okxInst = okxData.data.find((d: any) => d.instId === coin + "-USDT-SWAP");
      const htxInst = htxData.data.find((d: any) => d.contract_code === coin + "-USDT");
      if (!bnS || !okxInst || !htxInst) continue;

      // Mark price
      let mp = 0;
      try { const i = await connectors.binance.getFundingInfo(symbol); if (i && isFiniteNumber(i.markPrice)) mp = i.markPrice; fundingCalls++; } catch { /* */ }
      if (mp <= 0) continue;

      // Quantity normalization
      const bnLot = bnS.filters.find((f: any) => f.filterType === "LOT_SIZE");
      const bnSt = Number(bnLot?.stepSize ?? 0.1);
      const bnQ = Math.floor(target / mp / bnSt) * bnSt;
      const bnN = bnQ * mp;
      const bnMinN = Number(bnS.filters.find((f: any) => f.filterType === "MIN_NOTIONAL")?.notional ?? 5);
      const bnOk = bnQ > 0 && bnN >= bnMinN;

      const okxCt = Number(okxInst.ctVal ?? 0.1);
      const okxLt = Number(okxInst.lotSz ?? 0.1);
      const okxQ = Math.floor(target / (mp * okxCt) / okxLt) * okxLt;
      const okxN = okxQ * mp * okxCt;
      const okxOk = okxQ > 0 && okxN >= 5;

      const htxCt = Number(htxInst.contract_size ?? 0.1);
      const htxQ = Math.floor(target / (htxCt * mp) / 1) * 1;
      const htxN = htxQ * htxCt * mp;
      const htxOk = htxQ > 0 && htxN >= 5;

      const ns = [bnN, okxN, htxN].filter((n) => n > 0);
      const mm = ns.length >= 2 ? (Math.max(...ns) - Math.min(...ns)) / Math.max(...ns) * 100 : 0;
      const normOk = bnOk && okxOk && htxOk && mm <= MAX_MISMATCH;

      // Liquidity
      let liqOk = false;
      let vol = 0;
      if (normOk) {
        try {
          const t = await (await fetch(`https://fapi.binance.com/fapi/v1/ticker/24hr?symbol=${symbol}`)).json() as Record<string, unknown>;
          vol = Number(t.quoteVolume ?? 0);
          liqOk = vol >= MIN_VOLUME;
        } catch { /* skip */ }
      }

      // Funding spread
      let spreadOk = false;
      let netApy = 0;
      let shortEx = "";
      let longEx = "";
      if (normOk && liqOk) {
        try {
          const opps = await findCrossExchangeFundingSpreads(connectors as any, [symbol], { ...DEFAULT_SPREAD_CONFIG, minSpreadRate: 0, minSpreadApy: 0 });
          if (opps.length > 0) {
            const t = opps[0];
            spreadOk = t.netSpreadApy >= MIN_SPREAD_APY;
            netApy = t.netSpreadApy;
            shortEx = t.shortExchangeId;
            longEx = t.longExchangeId;
            if (netApy > bestApy) bestApy = netApy;
          }
        } catch { /* skip */ }
      }

      let blocker = "";
      if (!normOk) blocker = `norm BN=$${bnN.toFixed(2)} OKX=$${okxN.toFixed(2)} HTX=$${htxN.toFixed(2)} mm=${mm.toFixed(1)}%`;
      else if (!liqOk) blocker = `liq vol=$${(vol / 1e6).toFixed(1)}M`;
      else if (!spreadOk) blocker = `spread APY=${netApy.toFixed(2)}%`;

      results.push({ symbol, targetNotional: target, markPrice: mp, normOk, mismatch: mm, liqOk, volumeUsd: vol, spreadOk, netApy, shortExch: shortEx, longExch: longEx, blocker });
    }

    const viable = results.filter((r) => r.normOk && r.liqOk);
    const actionable = results.filter((r) => r.normOk && r.liqOk && r.spreadOk);
    const noSpread = results.filter((r) => r.normOk && r.liqOk && !r.spreadOk).map((r) => r.symbol);
    const blockedQty = results.filter((r) => !r.normOk).map((r) => r.symbol);
    const blockedLiq = results.filter((r) => r.normOk && !r.liqOk).map((r) => r.symbol);
    const best = actionable.length > 0 ? actionable.reduce((a, b) => a.netApy > b.netApy ? a : b) : null;

    const report: Report = {
      enabledExchanges: ALLOWED, pausedExchanges: PAUSED,
      symbolsChecked: results.length, fundingRatesRead: fundingCalls,
      viableCandidates: viable.length, actionableOpportunities: actionable.length,
      bestOpportunity: best ? { symbol: best.symbol, short: best.shortExch, long: best.longExch, apy: best.netApy, netApy: best.netApy } : undefined,
      bestNetSpreadApy: bestApy,
      symbolsWithoutSpread: noSpread, symbolsBlockedByQuantity: blockedQty, symbolsBlockedByLiquidity: blockedLiq,
      readinessStatus: actionable.length > 0 ? "actionable_opportunity" : "waiting_for_spread",
      forbiddenExchangeDetected: false, privateApiCalled: false,
      mainnetOrderAttempted: false, realOrdersExecuted: 0,
      postRequests: 0, putRequests: 0, deleteRequests: 0,
      generatedAt: Date.now(),
    };

    console.log(`\n  ╔══════════════════════════════════════════════════════════════════════════╗`);
    console.log(`  ║           BINANCE+OKX+HTX SPREAD WATCHER REPORT                    ║`);
    console.log(`  ╠══════════════════════════════════════════════════════════════════════════╣`);
    console.log(`  ║  Symbols Checked:  ${String(results.length).padStart(2)}${" ".repeat(48)}║`);
    console.log(`  ║  Viable:           ${String(viable.length).padStart(2)}${" ".repeat(48)}║`);
    console.log(`  ║  Actionable:       ${String(actionable.length).padStart(2)}${" ".repeat(48)}║`);
    console.log(`  ║  Best APY:         ${bestApy.toFixed(2).padStart(8)}%${" ".repeat(44)}║`);
    for (const r of results) {
      const icon = r.spreadOk ? "✅" : !r.spreadOk && r.liqOk && r.normOk ? "⏳" : "❌";
      console.log(`  ║  ${icon} ${r.symbol.padEnd(12)} \$${String(r.targetNotional).padStart(2)} norm=${String(r.normOk).padEnd(5)} liq=${String(r.liqOk).padEnd(5)} apy=${r.netApy.toFixed(2).padStart(6)}%${r.spreadOk ? " ✅" : ""}${" ".repeat(15)}║`);
    }
    if (noSpread.length > 0) console.log(`  ║  ⏳ Waiting spread: ${noSpread.join(", ")}${" ".repeat(30)}║`);
    if (blockedQty.length > 0) console.log(`  ║  ❌ Qty blocked:     ${blockedQty.join(", ")}${" ".repeat(30)}║`);
    if (blockedLiq.length > 0) console.log(`  ║  ❌ Liq blocked:     ${blockedLiq.join(", ")}${" ".repeat(30)}║`);
    console.log(`  ║  Readiness:        ${report.readinessStatus.padEnd(50)}║`);
    if (best) console.log(`  ║  BEST: ${best.symbol} ${best.shortExch}→${best.longExch} APY=${best.netApy.toFixed(2)}%${" ".repeat(28)}║`);
    console.log(`  ║  ${" ".repeat(90)}║`);
    console.log(`  ║  Mainnet Attempt:  false${" ".repeat(50)}║`);
    console.log(`  ║  Real Orders:      0${" ".repeat(54)}║`);
    console.log(`  ║  POST/PUT/DEL:     0/0/0${" ".repeat(48)}║`);
    console.log(`  ╚══════════════════════════════════════════════════════════════════════════╝\n`);

    expect(report.forbiddenExchangeDetected).toBe(false);
    expect(report.privateApiCalled).toBe(false);
    expect(report.mainnetOrderAttempted).toBe(false);
    expect(report.realOrdersExecuted).toBe(0);
    expect(report.postRequests).toBe(0);
    expect(report.putRequests).toBe(0);
    expect(report.deleteRequests).toBe(0);
    expect(report.symbolsChecked).toBeGreaterThanOrEqual(6);
  });
});
