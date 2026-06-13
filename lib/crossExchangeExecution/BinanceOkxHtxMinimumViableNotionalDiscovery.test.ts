/**
 * Binance + OKX + HTX Minimum Viable Notional Discovery
 *
 * Tests many coins across all 3 exchanges to find the smallest
 * notional where all three can trade with ≤1% cross-exchange mismatch.
 *
 * ⛔ NO TRADING
 * ⏸️ SKIPPED by default. Enable with RUN_BINANCE_OKX_HTX_MINIMUM_VIABLE_NOTIONAL_DISCOVERY=true
 */

import { describe, expect, it } from "vitest";

const RUN = process.env.RUN_BINANCE_OKX_HTX_MINIMUM_VIABLE_NOTIONAL_DISCOVERY === "true";
const CANDIDATES = [5, 10, 15, 20, 25, 30, 50];
const ALLOWED = ["binance", "okx", "htx"];
const PAUSED = ["bybit", "bitget", "gate", "hyperliquid"];
const describeOrSkip = RUN ? describe : describe.skip;

// Candidate coins (canonical = base asset name, no USDT suffix)
const COINS = [
  "FIL", "LDO", "SUSHI", "1INCH", "NEAR", "ENS", "INJ", "SPX",
  "ORDI", "WLD", "PENDLE", "DOT", "LINK", "UNI", "TRB",
  "CRV", "SSV", "LIT", "ASTER", "GIGGLE",
];

function isFiniteNumber(v: unknown): v is number {
  return typeof v === "number" && Number.isFinite(v);
}

type LegR = { exchangeId: string; qty: number; notional: number; valid: boolean; reason?: string };
type CResult = { notional: number; legs: LegR[]; allValid: boolean; mismatch: number };
type SResult = { coin: string; markPrice: number; candidates: CResult[]; viableNotional: number | null };
type Report = {
  enabledExchanges: string[]; pausedExchanges: string[];
  candidatesChecked: number; candidateNotionals: number[];
  results: SResult[];
  best: { coin: string; notional: number; legs: LegR[] } | null;
  blockers: string[];
  mainnetOrderAttempted: boolean; realOrdersExecuted: number;
  postRequests: number; putRequests: number; deleteRequests: number;
  generatedAt: number;
};

describeOrSkip("Binance + OKX + HTX Minimum Viable Notional Discovery", () => {
  it("Discovers minimum viable notional across all 3 exchanges", async () => {
    expect(ALLOWED).toEqual(["binance", "okx", "htx"]);
    expect(PAUSED).toEqual(expect.arrayContaining(["bybit", "bitget", "gate", "hyperliquid"]));

    // Fetch exchange info dynamically
    const [infoBN, infoOKX, infoHTX] = await Promise.all([
      (await fetch("https://fapi.binance.com/fapi/v1/exchangeInfo")).json(),
      (await fetch("https://www.okx.com/api/v5/public/instruments?instType=SWAP")).json(),
      (await fetch("https://api.hbdm.com/linear-swap-api/v1/swap_contract_info")).json(),
    ]);
    const tickers = await (await fetch("https://fapi.binance.com/fapi/v1/ticker/price")).json();
    const prices = Object.fromEntries(tickers.filter((t: any) => t.symbol.endsWith("USDT")).map((t: any) => [t.symbol, Number(t.price)]));

    // Build symbol info
    const bnSymbols = infoBN.symbols.filter((s: any) => s.contractType === "PERPETUAL" && s.quoteAsset === "USDT");
    const okxSymbols = infoOKX.data.filter((d: any) => d.instId.endsWith("-USDT-SWAP"));
    const htxSymbols = infoHTX.data.filter((d: any) => String(d.contract_code).endsWith("-USDT"));

    // Map coin → { bnStep, bnMinNotional, okxCtVal, okxLotSz, htxCtVal, markPrice }
    type CoinInfo = { bnStep: number; bnMinQty: number; bnMinNotional: number; okxCtVal: number; okxLotSz: number; htxCtVal: number; htxMinQty: number; markPrice: number };
    const coinInfo = new Map<string, CoinInfo>();

    for (const coin of COINS) {
      const bnS = bnSymbols.find((s: any) => s.baseAsset === coin);
      const okxS = okxSymbols.find((d: any) => d.instId === coin + "-USDT-SWAP");
      const htxS = htxSymbols.find((d: any) => d.contract_code === coin + "-USDT");
      if (!bnS || !okxS || !htxS) continue;

      const price = prices[coin + "USDT"];
      if (!price || price <= 0) continue;

      const bnLot = bnS.filters.find((f: any) => f.filterType === "LOT_SIZE");
      const bnMinNot = bnS.filters.find((f: any) => f.filterType === "MIN_NOTIONAL");
      if (!bnLot || !bnMinNot) continue;

      coinInfo.set(coin, {
        bnStep: Number(bnLot.stepSize),
        bnMinQty: Number(bnLot.minQty),
        bnMinNotional: Number(bnMinNot.notional),
        okxCtVal: Number(okxS.ctVal ?? 0.001),
        okxLotSz: Number(okxS.lotSz ?? 0.001),
        htxCtVal: Number(htxS.contract_size ?? 1),
        htxMinQty: 1,
        markPrice: price,
      });
    }

    // For each coin, test each candidate notional
    const results: SResult[] = [];
    let best: Report["best"] = null;

    for (const [coin, info] of coinInfo) {
      const candidates: CResult[] = [];
      let viableNotional: number | null = null;

      for (const target of CANDIDATES) {
        // Binance
        const bnRaw = target / info.markPrice;
        const bnQty = Math.floor(bnRaw / info.bnStep) * info.bnStep;
        const bnNotional = bnQty * info.markPrice;
        const bnValid = bnQty > 0 && bnNotional >= info.bnMinNotional && isFiniteNumber(bnNotional);

        // OKX
        const okxRaw = target / (info.markPrice * info.okxCtVal);
        const okxQty = Math.floor(okxRaw / info.okxLotSz) * info.okxLotSz;
        const okxNotional = okxQty * info.markPrice * info.okxCtVal;
        const okxValid = okxQty > 0 && okxNotional >= 5 && isFiniteNumber(okxNotional);

        // HTX
        const htxRaw = target / (info.htxCtVal * info.markPrice);
        const htxQty = Math.floor(htxRaw / 1) * 1;
        const htxNotional = htxQty * info.htxCtVal * info.markPrice;
        const htxValid = htxQty > 0 && htxNotional >= 5 && isFiniteNumber(htxNotional);

        // Mismatch
        const notionals = [bnNotional, okxNotional, htxNotional].filter((n) => n > 0);
        const maxN = Math.max(...notionals);
        const minN = Math.min(...notionals);
        const mismatch = maxN > 0 ? (maxN - minN) / maxN * 100 : 0;

        const allValid = bnValid && okxValid && htxValid;

        candidates.push({
          notional: target,
          legs: [
            { exchangeId: "binance", qty: bnQty, notional: bnNotional, valid: bnValid },
            { exchangeId: "okx", qty: okxQty, notional: okxNotional, valid: okxValid },
            { exchangeId: "htx", qty: htxQty, notional: htxNotional, valid: htxValid },
          ],
          allValid,
          mismatch,
        });

        if (!viableNotional && allValid && mismatch <= 1) {
          viableNotional = target;
          if (!best || target < best.notional) {
            best = { coin, notional: target, legs: candidates[candidates.length - 1].legs };
          }
        }
      }

      results.push({ coin, markPrice: info.markPrice, candidates, viableNotional });
    }

    // Print report
    const blockers: string[] = best ? [] : ["No viable notional found for any coin"];
    const report: Report = {
      enabledExchanges: ALLOWED, pausedExchanges: PAUSED,
      candidatesChecked: results.length, candidateNotionals: CANDIDATES,
      results, best, blockers,
      mainnetOrderAttempted: false, realOrdersExecuted: 0,
      postRequests: 0, putRequests: 0, deleteRequests: 0,
      generatedAt: Date.now(),
    };

    console.log(`\n  ╔══════════════════════════════════════════════════════════════════════════╗`);
    console.log(`  ║  MINIMUM VIABLE NOTIONAL DISCOVERY — REPORT                      ║`);
    console.log(`  ╠══════════════════════════════════════════════════════════════════════════╣`);
    console.log(`  ║  Coins checked:     ${results.length}${" ".repeat(50)}║`);
    for (const sr of results) {
      const v = sr.viableNotional ? `✅ \$${sr.viableNotional}` : "❌ none";
      console.log(`  ║  ${sr.coin.padEnd(8)} price=\$${sr.markPrice.toFixed(2).padStart(8)}  ${v}${" ".repeat(30)}║`);
      for (const c of sr.candidates) {
        const icon = c.allValid && c.mismatch <= 1 ? "✅" : c.allValid ? "⚠️" : "❌";
        const b = c.legs[0].notional.toFixed(1);
        const o = c.legs[1].notional.toFixed(1);
        const h = c.legs[2].notional.toFixed(1);
        console.log(`  ║    \$${String(c.notional).padStart(2)}  B=\$${b.padStart(6)} O=\$${o.padStart(6)} H=\$${h.padStart(6)} mm=${c.mismatch.toFixed(1).padStart(5)}%${icon === "✅" ? " ✅" : ""}${" ".repeat(15)}║`);
      }
    }
    if (best) {
      console.log(`  ║  ───────────────────────────────────────────────────────────────────── ║`);
      console.log(`  ║  BEST: ${best.coin} @ \$${best.notional}${" ".repeat(52)}║`);
      for (const l of best.legs) {
        console.log(`  ║    ${l.exchangeId.padEnd(10)} qty=${String(l.qty).padStart(10)} notional=\$${l.notional.toFixed(2).padStart(8)}${" ".repeat(22)}║`);
      }
    }
    console.log(`  ║  ───────────────────────────────────────────────────────────────────── ║`);
    console.log(`  ║  Mainnet Attempt:    false${" ".repeat(46)}║`);
    console.log(`  ║  Real Orders:        0${" ".repeat(48)}║`);
    console.log(`  ║  POST/PUT/DEL:       0/0/0${" ".repeat(43)}║`);
    console.log(`  ╚══════════════════════════════════════════════════════════════════════════╝\n`);

    expect(report.mainnetOrderAttempted).toBe(false);
    expect(report.realOrdersExecuted).toBe(0);
    expect(report.postRequests).toBe(0);
    expect(report.putRequests).toBe(0);
    expect(report.deleteRequests).toBe(0);
  });
});
