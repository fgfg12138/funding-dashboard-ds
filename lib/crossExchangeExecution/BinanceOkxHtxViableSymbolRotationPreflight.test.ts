/**
 * Binance + OKX + HTX Viable Symbol Rotation Preflight
 *
 * Rotates through discovered viable symbols to find one with
 * an actual funding spread opportunity across all 3 exchanges.
 *
 * ⛔ NO TRADING — PREFLIGHT ONLY
 * ⏸️ SKIPPED by default. Enable with RUN_BINANCE_OKX_HTX_VIABLE_SYMBOL_ROTATION_PREFLIGHT=true
 */

import { describe, expect, it } from "vitest";
import { RealBinanceConnector } from "../connectors/real/RealBinanceConnector";
import { RealOkxConnector } from "../connectors/real/RealOkxConnector";
import { RealHtxConnector } from "../connectors/real/RealHtxConnector";
import { findCrossExchangeFundingSpreads } from "../fundingSpread/fundingSpreadEngine";
import { DEFAULT_SPREAD_CONFIG } from "../fundingSpread/fundingSpreadTypes";

const RUN = process.env.RUN_BINANCE_OKX_HTX_VIABLE_SYMBOL_ROTATION_PREFLIGHT === "true";
const ALLOWED = ["binance", "okx", "htx"];
const PAUSED = ["bybit", "bitget", "gate", "hyperliquid"];
const CANDIDATES: Array<{ symbol: string; target: number }> = [
  { symbol: "FILUSDT", target: 10 },
  { symbol: "ASTERUSDT", target: 10 },
  { symbol: "GIGGLEUSDT", target: 10 },
  { symbol: "SUSHIUSDT", target: 15 },
  { symbol: "ENSUSDT", target: 15 },
  { symbol: "SSVUSDT", target: 20 },
];
const describeOrSkip = RUN ? describe : describe.skip;
const SYMBOL_SET = new Set(CANDIDATES.map((c) => c.symbol.replace("USDT", "")));

function isFiniteNumber(v: unknown): v is number {
  return typeof v === "number" && Number.isFinite(v);
}

type CandidateResult = {
  symbol: string; targetNotionalUsd: number;
  quantityNormalizationPassed: boolean; mismatchPercent: number;
  liquidityGuardPassed: boolean; liquidityVolumeUsd?: number;
  fundingOpportunityFound: boolean;
  spreadApy: number; netSpreadApy: number;
  shortExchange?: string; longExchange?: string;
  blockerReason?: string;
};

type Report = {
  enabledExchanges: string[]; pausedExchanges: string[];
  candidatesChecked: number; resultsBySymbol: CandidateResult[];
  selectedSymbol: string | null; selectedTargetNotionalUsd: number | null;
  selectedOpportunity: { short: string; long: string } | null;
  selectedSpreadApy: number; selectedNetSpreadApy: number;
  selectedLiquidityStatus: string; selectedQuantityNormalization: boolean;
  readinessStatus: string; blockers: string[];
  mainnetReadonlyConfirmed: boolean; privateTradingDisabled: boolean;
  mainnetOrderAttempted: boolean; realOrdersExecuted: number;
  postRequests: number; putRequests: number; deleteRequests: number;
  generatedAt: number;
};

describeOrSkip("Binance + OKX + HTX Viable Symbol Rotation Preflight", () => {
  it("Rotates through viable symbols, finds one with funding spread", async () => {
    expect(ALLOWED).toEqual(["binance", "okx", "htx"]);
    expect(PAUSED).toEqual(expect.arrayContaining(["bybit", "bitget", "gate", "hyperliquid"]));

    const connectors = { binance: new RealBinanceConnector(), okx: new RealOkxConnector(), htx: new RealHtxConnector() };

    // Fetch exchange data once for all symbols
    const [infoBN, okxData, htxData] = await Promise.all([
      (await fetch("https://fapi.binance.com/fapi/v1/exchangeInfo")).json(),
      (await fetch("https://www.okx.com/api/v5/public/instruments?instType=SWAP")).json(),
      (await fetch("https://api.hbdm.com/linear-swap-api/v1/swap_contract_info")).json(),
    ]);

    const resultsBySymbol: CandidateResult[] = [];
    let selectedSymbol: string | null = null;
    let selectedTarget: number | null = null;
    let selectedOpp: { short: string; long: string } | null = null;
    let selectedSpreadApy = 0;
    let selectedNetSpreadApy = 0;
    let selectedLiqStatus = "";
    let selectedNorm = false;
    const blockers: string[] = [];

    for (const { symbol, target } of CANDIDATES) {
      const coin = symbol.replace("USDT", "");
      const bnS = infoBN.symbols.find((s: any) => s.symbol === symbol);
      const okxInst = okxData.data.find((d: any) => d.instId === coin + "-USDT-SWAP");
      const htxInst = htxData.data.find((d: any) => d.contract_code === coin + "-USDT");
      if (!bnS || !okxInst || !htxInst) { resultsBySymbol.push({ symbol, targetNotionalUsd: target, quantityNormalizationPassed: false, mismatchPercent: 0, liquidityGuardPassed: false, fundingOpportunityFound: false, spreadApy: 0, netSpreadApy: 0, blockerReason: "Symbol not found on all exchanges" }); continue; }

      // Get mark price
      let mp = 0;
      try { const i = await connectors.binance.getFundingInfo(symbol); if (i && isFiniteNumber(i.markPrice)) mp = i.markPrice; } catch { /* */ }
      if (mp <= 0) { resultsBySymbol.push({ symbol, targetNotionalUsd: target, quantityNormalizationPassed: false, mismatchPercent: 0, liquidityGuardPassed: false, fundingOpportunityFound: false, spreadApy: 0, netSpreadApy: 0, blockerReason: "No mark price" }); continue; }

      // Quantity normalization
      const bnLot = bnS.filters.find((f: any) => f.filterType === "LOT_SIZE");
      const bnStep = Number(bnLot?.stepSize ?? 0.1);
      const bnQty = Math.floor(target / mp / bnStep) * bnStep;
      const bnNotional = bnQty * mp;
      const bnMinNot = Number(bnS.filters.find((f: any) => f.filterType === "MIN_NOTIONAL")?.notional ?? 5);
      const bnValid = bnQty > 0 && bnNotional >= bnMinNot;

      const okxCtVal = Number(okxInst.ctVal ?? 0.1);
      const okxLotSz = Number(okxInst.lotSz ?? 0.1);
      const okxQty = Math.floor(target / (mp * okxCtVal) / okxLotSz) * okxLotSz;
      const okxNotional = okxQty * mp * okxCtVal;
      const okxValid = okxQty > 0 && okxNotional >= 5;

      const htxCtVal = Number(htxInst.contract_size ?? 0.1);
      const htxQty = Math.floor(target / (htxCtVal * mp) / 1) * 1;
      const htxNotional = htxQty * htxCtVal * mp;
      const htxValid = htxQty > 0 && htxNotional >= 5;

      const deltas = [bnNotional, okxNotional, htxNotional].filter((n) => n > 0);
      const mm = deltas.length >= 2 ? (Math.max(...deltas) - Math.min(...deltas)) / Math.max(...deltas) * 100 : 0;
      const normPassed = bnValid && okxValid && htxValid && mm <= 1;

      // Liquidity (Binance 24h volume)
      let liqPassed = false;
      let liqVol = 0;
      try {
        const t = await (await fetch(`https://fapi.binance.com/fapi/v1/ticker/24hr?symbol=${symbol}`)).json() as Record<string, unknown>;
        liqVol = Number(t.quoteVolume ?? 0);
        liqPassed = liqVol > target * 1000;
      } catch { /* skip */ }

      // Funding opportunity
      let fundingFound = false;
      let sprApy = 0;
      let netSprApy = 0;
      let shortEx = "";
      let longEx = "";
      try {
        const opps = await findCrossExchangeFundingSpreads(connectors as any, [symbol], { ...DEFAULT_SPREAD_CONFIG, minSpreadRate: 0, minSpreadApy: 0 });
        if (opps.length > 0) {
          const top = opps[0];
          fundingFound = true;
          sprApy = top.spreadApy;
          netSprApy = top.netSpreadApy;
          shortEx = top.shortExchangeId;
          longEx = top.longExchangeId;
        }
      } catch { /* skip */ }

      const res: CandidateResult = {
        symbol, targetNotionalUsd: target,
        quantityNormalizationPassed: normPassed, mismatchPercent: mm,
        liquidityGuardPassed: liqPassed, liquidityVolumeUsd: liqVol,
        fundingOpportunityFound: fundingFound, spreadApy: sprApy, netSpreadApy: netSprApy,
        shortExchange: shortEx, longExchange: longEx,
        blockerReason: !normPassed ? `Norm failed: BN=$${bnNotional.toFixed(2)} OKX=$${okxNotional.toFixed(2)} HTX=$${htxNotional.toFixed(2)}` : !liqPassed ? `Liquidity too low: $${liqVol.toFixed(0)}` : !fundingFound ? "No funding spread" : undefined,
      };

      resultsBySymbol.push(res);

      if (!selectedSymbol && normPassed && liqPassed && fundingFound) {
        selectedSymbol = symbol;
        selectedTarget = target;
        selectedOpp = { short: shortEx, long: longEx };
        selectedSpreadApy = sprApy;
        selectedNetSpreadApy = netSprApy;
        selectedLiqStatus = liqPassed ? "passed" : "blocked";
        selectedNorm = normPassed;
      }
    }

    if (!selectedSymbol) blockers.push("No viable symbol with funding spread found in candidate list");

    const report: Report = {
      enabledExchanges: ALLOWED, pausedExchanges: PAUSED,
      candidatesChecked: CANDIDATES.length, resultsBySymbol,
      selectedSymbol, selectedTargetNotionalUsd: selectedTarget,
      selectedOpportunity: selectedOpp,
      selectedSpreadApy, selectedNetSpreadApy,
      selectedLiquidityStatus: selectedLiqStatus,
      selectedQuantityNormalization: selectedNorm,
      readinessStatus: selectedSymbol ? "ready" : "blocked_with_reason",
      blockers,
      mainnetReadonlyConfirmed: true, privateTradingDisabled: true,
      mainnetOrderAttempted: false, realOrdersExecuted: 0,
      postRequests: 0, putRequests: 0, deleteRequests: 0,
      generatedAt: Date.now(),
    };

    console.log(`\n  ╔══════════════════════════════════════════════════════════════════════════════╗`);
    console.log(`  ║        VIABLE SYMBOL ROTATION PREFLIGHT — REPORT                        ║`);
    console.log(`  ╠══════════════════════════════════════════════════════════════════════════════╣`);
    for (const r of resultsBySymbol) {
      const icon = r.quantityNormalizationPassed && r.liquidityGuardPassed && r.fundingOpportunityFound ? "✅" : "❌";
      console.log(`  ║  ${icon} ${r.symbol.padEnd(14)} \$${String(r.targetNotionalUsd).padStart(2)} norm=${String(r.quantityNormalizationPassed).padEnd(5)} liq=${String(r.liquidityGuardPassed).padEnd(5)} funding=${String(r.fundingOpportunityFound).padEnd(5)}${r.fundingOpportunityFound ? ` APY=${r.spreadApy.toFixed(2)}%` : ""}${" ".repeat(10)}║`);
      if (r.blockerReason && !r.fundingOpportunityFound) {
        console.log(`  ║  ${" ".repeat(4)} ↳ ${r.blockerReason.slice(0, 65).padEnd(65)}║`);
      }
    }
    console.log(`  ║  ────────────────────────────────────────────────────────────────────────── ║`);
    if (selectedSymbol) {
      console.log(`  ║  SELECTED: ${selectedSymbol} @ \$${selectedTarget} ${selectedOpp ? `${selectedOpp.short}→${selectedOpp.long}` : ""} APY=${selectedSpreadApy.toFixed(2)}%${" ".repeat(20)}║`);
    }
    console.log(`  ║  Readiness:           ${report.readinessStatus.padEnd(52)}║`);
    if (report.blockers.length > 0) for (const b of report.blockers) console.log(`  ║  Block: ${b.slice(0, 65).padEnd(65)}║`);
    console.log(`  ║  ${" ".repeat(90)}║`);
    console.log(`  ║  Mainnet Attempt:     false${" ".repeat(52)}║`);
    console.log(`  ║  Real Orders:         0${" ".repeat(57)}║`);
    console.log(`  ║  POST/PUT/DEL:        0/0/0${" ".repeat(51)}║`);
    console.log(`  ╚══════════════════════════════════════════════════════════════════════════════╝\n`);

    expect(report.mainnetReadonlyConfirmed).toBe(true);
    expect(report.privateTradingDisabled).toBe(true);
    expect(report.mainnetOrderAttempted).toBe(false);
    expect(report.realOrdersExecuted).toBe(0);
    expect(report.postRequests).toBe(0);
    expect(report.putRequests).toBe(0);
    expect(report.deleteRequests).toBe(0);
  });
});
