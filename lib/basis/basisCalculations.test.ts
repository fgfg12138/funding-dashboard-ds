import { describe, expect, it } from "vitest";
import {
  buildBasisOpportunities,
  calculateBasisPercent,
  calculateBasisScore,
  calculateEstimatedCarryAnnualized,
  getBasisRiskTags
} from "./basisCalculations";
import type { FundingMarket, SpotMarket } from "../exchanges/types";

function spot(exchange: SpotMarket["exchange"], price = 100, volume24h = 20_000_000): SpotMarket {
  return {
    exchange,
    symbol: "BTC/USDT",
    base: "BTC",
    quote: "USDT",
    price,
    volume24h
  };
}

function perp(exchange: FundingMarket["exchange"], fundingRate = 0.0002, markPrice = 101): FundingMarket {
  return {
    exchange,
    rawSymbol: `${exchange}-BTCUSDT`,
    symbol: "BTC/USDT",
    base: "BTC",
    quote: "USDT",
    fundingRate,
    fundingIntervalHours: 8,
    nextFundingTime: Date.now() + 2 * 60 * 60_000,
    markPrice,
    volume24h: 25_000_000,
    openInterestUsd: 50_000_000
  };
}

describe("basisCalculations", () => {
  it("calculates basis percent and estimated carry annualized", () => {
    expect(calculateBasisPercent(102, 100)).toBeCloseTo(2);
    expect(calculateEstimatedCarryAnnualized(21.9, 2)).toBeCloseTo(19.9);
  });

  it("tags low quality basis opportunities", () => {
    const tags = getBasisRiskTags({
      annualizedFundingRate: 320,
      basisPercent: 1.2,
      nextFundingTime: Date.now() + 20 * 60_000,
      volume24h: 500_000
    });

    expect(tags).toEqual(expect.arrayContaining(["低流动性", "持仓量缺失", "基差过大", "高费率", "异常费率", "结算临近"]));
  });

  it("scores stronger liquid opportunities above weak wide-basis opportunities", () => {
    const strong = calculateBasisScore({
      annualizedFundingRate: 80,
      estimatedCarryAnnualized: 79.5,
      basisPercent: 0.2,
      volume24h: 100_000_000,
      openInterestUsd: 120_000_000
    });
    const weak = calculateBasisScore({
      annualizedFundingRate: 20,
      estimatedCarryAnnualized: 17,
      basisPercent: 3,
      volume24h: 200_000,
      openInterestUsd: undefined
    });

    expect(strong).toBeGreaterThan(weak);
    expect(strong).toBeLessThanOrEqual(100);
    expect(weak).toBeGreaterThanOrEqual(0);
  });

  it("builds only same-exchange positive-funding basis opportunities", () => {
    const opportunities = buildBasisOpportunities(
      [spot("Binance"), spot("OKX")],
      [perp("Binance"), perp("Bybit"), perp("OKX", -0.0001)]
    );

    expect(opportunities).toHaveLength(1);
    expect(opportunities[0]).toMatchObject({
      symbol: "BTC/USDT",
      spotExchange: "Binance",
      perpExchange: "Binance"
    });
    expect(opportunities[0].basisPercent).toBeCloseTo(1);
    expect(opportunities[0].annualizedFundingRate).toBeCloseTo(21.9);
    expect(opportunities[0].estimatedCarryAnnualized).toBeCloseTo(20.9);
    expect(opportunities[0].opportunityReason).toContain("买现货 / 空永续");
  });
});
