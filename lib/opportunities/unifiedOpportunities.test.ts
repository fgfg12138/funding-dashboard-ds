import { describe, expect, it } from "vitest";
import {
  buildUnifiedOpportunities,
  filterUnifiedOpportunities,
  isHighRiskUnifiedOpportunity,
  isRecommendedUnifiedOpportunity
} from "./unifiedOpportunities";
import type { BasisOpportunity } from "../basis/types";
import type { CrossExchangeOpportunity, SpotPerpOpportunity } from "../exchanges/types";

const cross: CrossExchangeOpportunity = {
  symbol: "BTC/USDT",
  base: "BTC",
  quote: "USDT",
  markets: {},
  annualizedRates: {},
  fundingRates: {},
  fundingIntervalHours: {},
  annualizedSpread: 45,
  direction: "空 Bybit / 多 Binance",
  shortExchange: "Bybit",
  longExchange: "Binance",
  exchangeCount: 2,
  score: 72,
  riskTags: [],
  opportunityReason: "Bybit 年化高于 Binance",
  priceSpread: 0.4,
  priceSpreadDirection: "Bybit 标记价格高于 Binance 0.20%",
  nextFundingTime: 10_000,
  volume24h: 20_000_000,
  openInterestUsd: 50_000_000
};

const spotPerp: SpotPerpOpportunity = {
  symbol: "ETH/USDT",
  base: "ETH",
  quote: "USDT",
  spotExchange: "OKX",
  perpExchange: "OKX",
  exchangeCount: 1,
  score: 58,
  riskTags: ["持仓量缺失"],
  opportunityReason: "OKX spot / perp",
  fundingRate: 0.0002,
  annualized: 21.9,
  spotPrice: 3000,
  perpPrice: 3006,
  priceSpread: 0.2,
  priceSpreadDirection: "OKX 永续标记价格高于 OKX 现货 0.20%",
  volume24h: 3_000_000,
  nextFundingTime: 20_000
};

const basis: BasisOpportunity = {
  symbol: "SOL/USDT",
  base: "SOL",
  quote: "USDT",
  spotExchange: "Binance",
  perpExchange: "Binance",
  spotPrice: 150,
  perpPrice: 151.5,
  basisPercent: 1,
  fundingRate: 0.0005,
  annualizedFundingRate: 54.75,
  estimatedCarryAnnualized: 53.75,
  volume24h: 30_000_000,
  openInterestUsd: 60_000_000,
  nextFundingTime: 30_000,
  score: 80,
  riskTags: ["基差过大"],
  opportunityReason: "Binance spot / perp basis"
};

describe("unifiedOpportunities", () => {
  it("maps cross-exchange, spot-perp, and basis opportunities into one model", () => {
    const rows = buildUnifiedOpportunities({ cross: [cross], spotPerp: [spotPerp], basis: [basis] });

    expect(rows.map((row) => row.opportunityType)).toEqual(["Basis", "CrossExchange", "SpotPerp"]);
    expect(rows[0]).toMatchObject({
      id: "Basis:Binance:Binance:SOL/USDT",
      primaryExchange: "Binance",
      secondaryExchange: "Binance",
      annualizedRate: 54.75,
      basisPercent: 1,
      estimatedCarryAnnualized: 53.75
    });
    expect(rows[1]).toMatchObject({
      id: "CrossExchange:Bybit:Binance:BTC/USDT",
      spreadPercent: 0.4,
      annualizedRate: 45
    });
    expect(rows[2]).toMatchObject({
      id: "SpotPerp:OKX:OKX:ETH/USDT",
      fundingRate: 0.0002,
      spreadPercent: 0.2
    });
  });

  it("identifies recommended and high-risk opportunities", () => {
    const [row] = buildUnifiedOpportunities({ cross: [cross], spotPerp: [], basis: [] });
    const risky = { ...row, riskTags: ["异常费率"] };

    expect(isRecommendedUnifiedOpportunity(row)).toBe(true);
    expect(isHighRiskUnifiedOpportunity(row)).toBe(false);
    expect(isHighRiskUnifiedOpportunity(risky)).toBe(true);
    expect(isRecommendedUnifiedOpportunity({ ...row, riskTags: ["低流动性"] })).toBe(false);
  });

  it("filters and sorts unified opportunities", () => {
    const rows = buildUnifiedOpportunities({ cross: [cross], spotPerp: [spotPerp], basis: [basis] });
    const filtered = filterUnifiedOpportunities(rows, {
      exchange: "Binance",
      minScore: 60,
      minAnnualized: 40,
      recommendedOnly: true,
      sortBy: "estimatedCarryAnnualized"
    });

    expect(filtered.map((row) => row.symbol)).toEqual(["SOL/USDT", "BTC/USDT"]);
  });

  it("does not mutate source arrays while building unified opportunities", () => {
    const crossRows = [cross];
    const spotPerpRows = [spotPerp];
    const basisRows = [basis];
    const originalCross = crossRows.slice();
    const originalSpotPerp = spotPerpRows.slice();
    const originalBasis = basisRows.slice();

    buildUnifiedOpportunities({ cross: crossRows, spotPerp: spotPerpRows, basis: basisRows });

    expect(crossRows).toEqual(originalCross);
    expect(spotPerpRows).toEqual(originalSpotPerp);
    expect(basisRows).toEqual(originalBasis);
  });

  it("filters recommended opportunities and hides high risk rows", () => {
    const rows = buildUnifiedOpportunities({ cross: [cross], spotPerp: [spotPerp], basis: [basis] });
    const recommended = filterUnifiedOpportunities(rows, { recommendedOnly: true });
    const withoutHighRisk = filterUnifiedOpportunities(
      [
        ...rows,
        {
          ...rows[0],
          id: "risky",
          riskTags: ["低流动性"]
        }
      ],
      { hideHighRisk: true }
    );

    expect(recommended.map((row) => row.symbol)).toEqual(["SOL/USDT", "BTC/USDT"]);
    expect(withoutHighRisk.some((row) => row.id === "risky")).toBe(false);
  });
});
