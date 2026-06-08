import { calculateAnnualizedRate } from "../arbitrage/calculations";
import type { ExchangeName, FundingMarket, SpotMarket } from "../exchanges/types";
import { normalizeSymbol } from "../markets/normalize";

export type ExchangeCompareRow = {
  exchange: ExchangeName;
  rawSymbol?: string;
  normalizedSymbol: string;
  fundingRate?: number;
  fundingRatePercent?: number;
  annualizedRate?: number;
  fundingIntervalHours?: number;
  nextFundingTime?: number;
  markPrice?: number;
  indexPrice?: number;
  lastPrice?: number;
  spotPrice?: number;
  perpVolume24h?: number;
  spotVolume24h?: number;
  openInterest?: number;
  openInterestUsd?: number;
  fetchedAt?: number;
  sourceUpdatedAt?: number;
  latencyMs?: number;
  sourceEndpoint?: string;
  rawFields?: Record<string, unknown>;
};

export type ExchangeCompareResponse = {
  data: ExchangeCompareRow[];
  errors: string[];
  updatedAt: number;
  stale: boolean;
  symbol: string;
};

const EXCHANGES: ExchangeName[] = ["Binance", "OKX", "Bybit"];

export function buildExchangeCompareRows({
  fundingMarkets,
  now,
  spotMarkets,
  symbol
}: {
  fundingMarkets: FundingMarket[];
  now: number;
  spotMarkets: SpotMarket[];
  symbol: string;
}): ExchangeCompareRow[] {
  const normalized = normalizeCompareSymbol(symbol);

  return EXCHANGES.map((exchange) => {
    const funding = fundingMarkets.find((market) => market.exchange === exchange && market.symbol === normalized);
    const spot = spotMarkets.find((market) => market.exchange === exchange && market.symbol === normalized);
    const sourceUpdatedAt = funding?.sourceUpdatedAt ?? spot?.sourceUpdatedAt;

    return {
      exchange,
      rawSymbol: funding?.rawSymbol ?? spot?.rawSymbol,
      normalizedSymbol: normalized,
      fundingRate: funding?.fundingRate,
      fundingRatePercent: funding ? funding.fundingRate * 100 : undefined,
      annualizedRate: funding ? calculateAnnualizedRate(funding.fundingRate, funding.fundingIntervalHours) : undefined,
      fundingIntervalHours: funding?.fundingIntervalHours,
      nextFundingTime: funding?.nextFundingTime,
      markPrice: funding?.markPrice,
      indexPrice: funding?.indexPrice,
      lastPrice: funding?.lastPrice,
      spotPrice: spot?.price,
      perpVolume24h: funding?.volume24h,
      spotVolume24h: spot?.volume24h,
      openInterest: funding?.openInterest,
      openInterestUsd: funding?.openInterestUsd,
      fetchedAt: funding?.fetchedAt ?? spot?.fetchedAt,
      sourceUpdatedAt,
      latencyMs: sourceUpdatedAt ? now - sourceUpdatedAt : undefined,
      sourceEndpoint: funding?.sourceEndpoint ?? spot?.sourceEndpoint,
      rawFields: {
        funding: funding?.rawFields,
        spot: spot?.rawFields
      }
    };
  });
}

function normalizeCompareSymbol(symbol: string): string {
  const trimmed = symbol.trim().toUpperCase();
  if (trimmed.includes("/")) {
    const [base, quote = "USDT"] = trimmed.split("/");
    return `${base}/${quote}`;
  }

  return normalizeSymbol(trimmed).symbol;
}
