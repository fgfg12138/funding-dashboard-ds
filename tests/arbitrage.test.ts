import { describe, expect, it } from "vitest";
import {
  calculateAnnualizedRate,
  calculateCrossExchangeFundingSpread,
  calculateDirectionalPriceSpread,
  calculateSpotPerpOpportunity
} from "../lib/arbitrage/calculations";
import type { FundingMarket, SpotMarket } from "../lib/exchanges/types";
import { buildSpotPerpOpportunities } from "../lib/data/fundingService";

const market = (
  exchange: FundingMarket["exchange"],
  fundingRate: number,
  markPrice: number,
  extra: Partial<FundingMarket> = {}
): FundingMarket => ({
  exchange,
  symbol: "BTC/USDT",
  base: "BTC",
  quote: "USDT",
  fundingRate,
  fundingIntervalHours: 8,
  nextFundingTime: 1_735_689_600_000,
  markPrice,
  volume24h: 12_000_000,
  openInterestUsd: 80_000_000,
  rawSymbol: "BTCUSDT",
  ...extra
});

describe("arbitrage calculations", () => {
  it("annualizes funding by settlement frequency", () => {
    expect(calculateAnnualizedRate(0.0001, 8)).toBeCloseTo(10.95, 4);
    expect(calculateAnnualizedRate(-0.0001, 8)).toBeCloseTo(-10.95, 4);
  });

  it("calculates cross-exchange spread and short-high/long-low direction", () => {
    const opportunity = calculateCrossExchangeFundingSpread("BTC/USDT", [
      market("Binance", 0.0001, 100_000),
      market("Bybit", 0.0003, 100_080),
      market("OKX", -0.00005, 99_980)
    ]);

    expect(opportunity).toMatchObject({
      symbol: "BTC/USDT",
      shortExchange: "Bybit",
      longExchange: "OKX"
    });
    expect(opportunity?.annualizedSpread).toBeCloseTo(38.325, 3);
    expect(opportunity?.priceSpread).toBeCloseTo(0.1, 3);
  });

  it("calculates directional price spread from short price to long price", () => {
    expect(calculateDirectionalPriceSpread(99_000, 100_000)).toBeCloseTo(-1, 4);

    const opportunity = calculateCrossExchangeFundingSpread("BTC/USDT", [
      market("Binance", -0.0001, 100_000),
      market("Bybit", 0.0003, 99_000),
      market("OKX", 0.00005, 101_000)
    ]);

    expect(opportunity).toMatchObject({
      shortExchange: "Bybit",
      longExchange: "Binance"
    });
    expect(opportunity?.priceSpread).toBeCloseTo(-1, 4);
  });

  it("returns spot-perp opportunity only for positive funding", () => {
    const spot: SpotMarket = {
      exchange: "Binance",
      symbol: "BTC/USDT",
      base: "BTC",
      quote: "USDT",
      price: 99_900,
      volume24h: 15_000_000
    };

    const opportunity = calculateSpotPerpOpportunity(spot, market("Bybit", 0.0002, 100_000));

    expect(opportunity).toMatchObject({
      symbol: "BTC/USDT",
      spotExchange: "Binance",
      perpExchange: "Bybit"
    });
    expect(opportunity?.annualized).toBeCloseTo(21.9, 2);
    expect(opportunity?.priceSpread).toBeCloseTo(0.1001, 4);
  });

  it("builds only same-exchange spot-perp opportunities", () => {
    const spots: SpotMarket[] = [
      {
        exchange: "Binance",
        symbol: "BTC/USDT",
        base: "BTC",
        quote: "USDT",
        price: 99_900,
        volume24h: 15_000_000
      },
      {
        exchange: "OKX",
        symbol: "BTC/USDT",
        base: "BTC",
        quote: "USDT",
        price: 99_950,
        volume24h: 40_000_000
      }
    ];

    const opportunities = buildSpotPerpOpportunities(spots, [
      market("Binance", 0.0002, 100_000),
      market("Bybit", 0.0003, 100_050),
      market("OKX", 0.0001, 100_010)
    ]);

    expect(opportunities.map((item) => `${item.spotExchange}-${item.perpExchange}`).sort()).toEqual([
      "Binance-Binance",
      "OKX-OKX"
    ]);
  });
});
