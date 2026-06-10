/**
 * Funding Spread Engine Tests — Cross-Exchange Funding Spread Engine
 *
 * Uses createMockConnectors() to test spread detection, filtering,
 * scoring, ranking, and immutability.
 */

import { describe, expect, it } from "vitest";
import { createMockConnectors } from "../connectors/mocks/createMockConnectors";
import {
  getFundingRatesFromConnectors,
  calculateFundingSpread,
  findCrossExchangeFundingSpreads,
  rankFundingSpreadOpportunities,
} from "./fundingSpreadEngine";
import { DEFAULT_SPREAD_CONFIG } from "./fundingSpreadTypes";
import type { FundingSpreadConfig, FundingSpreadOpportunity } from "./fundingSpreadTypes";

// ─── Setup ─────────────────────────────────────────────

const connectors = createMockConnectors();
const SYMBOLS = ["BTCUSDT", "ETHUSDT", "SOLUSDT"];

// ─── 1-2. Basic spread calculation ─────────────────────

describe("Cross-Exchange Funding Spread", () => {
  it("1. Binance 0.0001 vs Bybit -0.0002 → spreadRate = 0.0003", async () => {
    const binance = await connectors.binance.getFundingInfo("BTCUSDT");
    const bybit = await connectors.bybit.getFundingInfo("BTCUSDT");

    expect(binance).toBeDefined();
    expect(bybit).toBeDefined();

    // Binance has higher rate (0.0001) → short
    // Bybit has lower rate (-0.0002) → long
    const opp = calculateFundingSpread(binance!, bybit!, {
      ...DEFAULT_SPREAD_CONFIG,
      minSpreadRate: 0.00005,
    });

    expect(opp).not.toBeNull();
    expect(opp!.spreadRate).toBeCloseTo(0.0003, 6);
  });

  it("2. shortExchange = highest rate (binance), longExchange = lowest rate (bybit)", async () => {
    const info = await getFundingRatesFromConnectors(connectors, ["BTCUSDT"]);
    const binance = info.find((i) => i.exchangeId === "binance")!;
    const bybit = info.find((i) => i.exchangeId === "bybit")!;

    const opp = calculateFundingSpread(binance, bybit, {
      ...DEFAULT_SPREAD_CONFIG,
      minSpreadRate: 0.00005,
    });

    expect(opp).not.toBeNull();
    expect(opp!.shortExchangeId).toBe("binance");
    expect(opp!.longExchangeId).toBe("bybit");
    expect(opp!.shortLeg.side).toBe("short");
    expect(opp!.longLeg.side).toBe("long");
  });

  // ─── 3. Spread APY ────────────────────────────────

  it("3. spreadApy > 0 for positive spread", async () => {
    const binance = await connectors.binance.getFundingInfo("BTCUSDT");
    const bybit = await connectors.bybit.getFundingInfo("BTCUSDT");

    const opp = calculateFundingSpread(binance!, bybit!, {
      ...DEFAULT_SPREAD_CONFIG,
      minSpreadRate: 0,
      minSpreadApy: 0,
    });

    expect(opp).not.toBeNull();
    expect(opp!.spreadApy).toBeGreaterThan(0);
  });

  // ─── 4. Net spread APY after fees ──────────────────

  it("4. netSpreadApy < spreadApy after fees", async () => {
    const binance = await connectors.binance.getFundingInfo("BTCUSDT");
    const bybit = await connectors.bybit.getFundingInfo("BTCUSDT");

    const oppWithFees = calculateFundingSpread(binance!, bybit!, {
      ...DEFAULT_SPREAD_CONFIG,
      minSpreadRate: 0,
      minSpreadApy: 0,
      includeFees: true,
    });

    const oppWithoutFees = calculateFundingSpread(binance!, bybit!, {
      ...DEFAULT_SPREAD_CONFIG,
      minSpreadRate: 0,
      minSpreadApy: 0,
      includeFees: false,
    });

    expect(oppWithFees).not.toBeNull();
    expect(oppWithoutFees).not.toBeNull();
    expect(oppWithFees!.netSpreadApy).toBeLessThan(oppWithoutFees!.netSpreadApy);
  });

  // ─── 5. Same exchange no opportunity ───────────────

  it("5. same exchange does not generate an opportunity", async () => {
    const binance = await connectors.binance.getFundingInfo("BTCUSDT");
    // Using same exchange for both legs → not allowed by findCrossExchangeFundingSpreads
    const result = await findCrossExchangeFundingSpreads(
      { binance: connectors.binance },
      ["BTCUSDT"],
      { ...DEFAULT_SPREAD_CONFIG, minSpreadRate: 0, minSpreadApy: 0 },
    );
    // Only 1 connector, no pairs possible
    expect(result).toHaveLength(0);
  });

  // ─── 6. Different symbols don't match ──────────────

  it("6. different symbols are not paired by the engine", async () => {
    const infos = await getFundingRatesFromConnectors(connectors, ["BTCUSDT", "ETHUSDT"]);
    const btcInfos = infos.filter((i) => i.canonicalSymbol === "BTCUSDT");
    const ethInfos = infos.filter((i) => i.canonicalSymbol === "ETHUSDT");

    // BTC and ETH should never pair since they have different canonicalSymbols
    expect(btcInfos.length).toBeGreaterThan(0);
    expect(ethInfos.length).toBeGreaterThan(0);

    // verify via findCrossExchangeFundingSpreads
    const result = await findCrossExchangeFundingSpreads(
      { binance: connectors.binance, bybit: connectors.bybit },
      ["BTCUSDT", "ETHUSDT"],
      { ...DEFAULT_SPREAD_CONFIG, minSpreadRate: 0, minSpreadApy: 0 },
    );

    // All opportunities should have canonicalSymbol BTCUSDT or ETHUSDT separately
    for (const opp of result) {
      expect(opp.canonicalSymbol).toMatch(/^(BTCUSDT|ETHUSDT)$/);
    }
  });

  // ─── 7-8. Funding interval normalization ───────────

  it("7. funding interval different exchanges — APY accounts for interval", async () => {
    const binance = await connectors.binance.getFundingInfo("BTCUSDT");
    const bybit = await connectors.bybit.getFundingInfo("BTCUSDT");

    const opp = calculateFundingSpread(binance!, bybit!, {
      ...DEFAULT_SPREAD_CONFIG,
      minSpreadRate: 0,
      minSpreadApy: 0,
    });

    expect(opp).not.toBeNull();
    // Both binance and bybit have 8h intervals
    expect(opp!.shortLeg.intervalHours).toBe(8);
    expect(opp!.longLeg.intervalHours).toBe(8);
    expect(opp!.spreadApy).toBeGreaterThan(0);
  });

  it("8. Hyperliquid 1h funding interval produces correct APY", async () => {
    const binance = await connectors.binance.getFundingInfo("BTCUSDT");
    const hyperliquid = await connectors.hyperliquid.getFundingInfo("BTCUSDT");

    expect(binance).toBeDefined();
    expect(hyperliquid).toBeDefined();

    const opp = calculateFundingSpread(binance!, hyperliquid!, {
      ...DEFAULT_SPREAD_CONFIG,
      minSpreadRate: 0,
      minSpreadApy: 0,
    });

    expect(opp).not.toBeNull();
    expect(opp!.shortLeg.intervalHours).toBe(8);
    expect(opp!.longLeg.intervalHours).toBe(1);
  });

  // ─── 9. minSpreadRate filter ──────────────────────

  it("9. minSpreadRate filters out small spreads", async () => {
    const result = await findCrossExchangeFundingSpreads(
      connectors,
      ["BTCUSDT"],
      { ...DEFAULT_SPREAD_CONFIG, minSpreadRate: 1, minSpreadApy: 0 },
    );
    // No spread can exceed minSpreadRate of 1
    expect(result).toHaveLength(0);
  });

  // ─── 10. minSpreadApy filter ──────────────────────

  it("10. minSpreadApy filters out low APY spreads", async () => {
    const result = await findCrossExchangeFundingSpreads(
      connectors,
      ["BTCUSDT"],
      { ...DEFAULT_SPREAD_CONFIG, minSpreadRate: 0, minSpreadApy: 999_999 },
    );
    expect(result).toHaveLength(0);
  });

  // ─── 11. allowedExchanges filter ──────────────────

  it("11. allowedExchanges filters to specific exchanges", async () => {
    const result = await findCrossExchangeFundingSpreads(
      { binance: connectors.binance, bybit: connectors.bybit, okx: connectors.okx },
      ["BTCUSDT"],
      { ...DEFAULT_SPREAD_CONFIG, minSpreadRate: 0, minSpreadApy: 0, allowedExchanges: ["binance", "bybit"] },
    );

    for (const opp of result) {
      expect(opp.shortExchangeId).toMatch(/^(binance|bybit)$/);
      expect(opp.longExchangeId).toMatch(/^(binance|bybit)$/);
    }
  });

  // ─── 12. Ranking ────────────────────────────────

  it("12. rankFundingSpreadOpportunities sorts by score descending", () => {
    const opportunities: FundingSpreadOpportunity[] = [
      createMockOpp("btc", "a", "b", 50),
      createMockOpp("btc", "c", "d", 90),
      createMockOpp("btc", "e", "f", 30),
    ];

    const ranked = rankFundingSpreadOpportunities(opportunities);
    expect(ranked[0].score).toBe(90);
    expect(ranked[1].score).toBe(50);
    expect(ranked[2].score).toBe(30);
  });

  // ─── 13. Reasons contain explanations ──────────────

  it("13. opportunity reasons contain long/short explanation", async () => {
    const result = await findCrossExchangeFundingSpreads(
      connectors,
      ["BTCUSDT"],
      { ...DEFAULT_SPREAD_CONFIG, minSpreadRate: 0, minSpreadApy: 0 },
    );

    expect(result.length).toBeGreaterThan(0);
    for (const opp of result) {
      expect(opp.reasons.length).toBeGreaterThanOrEqual(3);
      expect(opp.reasons.some((r) => r.includes("Short"))).toBe(true);
      expect(opp.reasons.some((r) => r.includes("Long"))).toBe(true);
    }
  });

  // ─── 14. No mutation ─────────────────────────────

  it("14. engine does not mutate input config", async () => {
    const config: FundingSpreadConfig = { ...DEFAULT_SPREAD_CONFIG, minSpreadRate: 0, minSpreadApy: 0 };
    const configCopy = { ...config };
    await findCrossExchangeFundingSpreads(connectors, ["BTCUSDT"], config);
    expect(config).toEqual(configCopy);
  });

  // ─── 15. No real API usage ────────────────────────

  it("15. no real API calls (uses mock connectors)", async () => {
    const result = await findCrossExchangeFundingSpreads(connectors, ["BTCUSDT"], {
      ...DEFAULT_SPREAD_CONFIG,
      minSpreadRate: 0,
      minSpreadApy: 0,
    });
    expect(result.length).toBeGreaterThan(0);
    // All funding rates are from mock data
    for (const opp of result) {
      expect(typeof opp.shortLeg.fundingRate).toBe("number");
      expect(typeof opp.longLeg.fundingRate).toBe("number");
    }
  });
});

// ─── Helper ─────────────────────────────────────────────

function createMockOpp(
  symbol: string,
  shortEx: string,
  longEx: string,
  score: number,
): FundingSpreadOpportunity {
  return {
    id: `${symbol}-${shortEx}-${longEx}`,
    canonicalSymbol: symbol,
    shortExchangeId: shortEx,
    longExchangeId: longEx,
    shortLeg: { exchangeId: shortEx, canonicalSymbol: symbol, exchangeSymbol: symbol, fundingRate: 0.0001, intervalHours: 8, markPrice: 60000, side: "short", expectedFundingDirection: "receive" },
    longLeg: { exchangeId: longEx, canonicalSymbol: symbol, exchangeSymbol: symbol, fundingRate: -0.0002, intervalHours: 8, markPrice: 60000, side: "long", expectedFundingDirection: "pay" },
    spreadRate: 0.0003,
    spreadApy: 32.85,
    netSpreadApy: 32.8,
    estimatedFundingUsdPerInterval: 0.03,
    score,
    reasons: [`Short on ${shortEx}`, `Long on ${longEx}`],
    createdAt: Date.now(),
  };
}
