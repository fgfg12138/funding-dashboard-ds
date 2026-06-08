import type { FundingMarket, SpotMarket } from "./types";
import { fetchJson } from "./http";
import { normalizeSymbol } from "../markets/normalize";
import { EXCHANGE_API_URLS } from "../env";

type BybitResponse<T> = {
  retCode: number;
  retMsg: string;
  result: {
    list: T[];
  };
};

type BybitLinearTicker = {
  symbol: string;
  markPrice: string;
  indexPrice: string;
  lastPrice?: string;
  fundingRate: string;
  nextFundingTime: string;
  fundingIntervalHour?: string;
  turnover24h?: string;
  openInterest?: string;
  openInterestValue?: string;
};

type BybitSpotTicker = {
  symbol: string;
  lastPrice: string;
  turnover24h?: string;
};

const BASE = EXCHANGE_API_URLS.BYBIT;

export async function fetchBybitFundingMarkets(): Promise<FundingMarket[]> {
  const fetchedAt = Date.now();
  const sourceEndpoint = `${BASE}/v5/market/tickers?category=linear`;
  const data = await fetchJson<BybitResponse<BybitLinearTicker>>(sourceEndpoint);
  assertBybit(data);

  return data.result.list
    .filter((item) => item.symbol.endsWith("USDT"))
    .map((item) => {
      const normalized = normalizeSymbol(item.symbol);
      const openInterest = Number(item.openInterest);
      const markPrice = Number(item.markPrice);
      const openInterestValue = Number(item.openInterestValue);
      return {
        exchange: "Bybit" as const,
        rawSymbol: item.symbol,
        symbol: normalized.symbol,
        base: normalized.base,
        quote: normalized.quote,
        fundingRate: Number(item.fundingRate),
        fundingIntervalHours: Number(item.fundingIntervalHour ?? 8),
        nextFundingTime: Number(item.nextFundingTime),
        markPrice,
        indexPrice: Number(item.indexPrice),
        lastPrice: Number(item.lastPrice),
        volume24h: Number(item.turnover24h),
        openInterest: Number.isFinite(openInterest) ? openInterest : undefined,
        openInterestUsd: Number.isFinite(openInterestValue)
          ? openInterestValue
          : Number.isFinite(openInterest) ? openInterest * markPrice : undefined,
        fetchedAt,
        sourceEndpoint,
        rawFields: pickFields(item, [
          "symbol",
          "markPrice",
          "indexPrice",
          "lastPrice",
          "fundingRate",
          "nextFundingTime",
          "fundingIntervalHour",
          "turnover24h",
          "openInterest",
          "openInterestValue"
        ])
      };
    })
    .filter((market) => market.quote === "USDT" && Number.isFinite(market.markPrice));
}

export async function fetchBybitSpotMarkets(): Promise<SpotMarket[]> {
  const fetchedAt = Date.now();
  const sourceEndpoint = `${BASE}/v5/market/tickers?category=spot`;
  const data = await fetchJson<BybitResponse<BybitSpotTicker>>(sourceEndpoint);
  assertBybit(data);

  return data.result.list
    .filter((item) => item.symbol.endsWith("USDT"))
    .map((item) => {
      const normalized = normalizeSymbol(item.symbol);
      return {
        exchange: "Bybit" as const,
        rawSymbol: item.symbol,
        symbol: normalized.symbol,
        base: normalized.base,
        quote: normalized.quote,
        price: Number(item.lastPrice),
        volume24h: Number(item.turnover24h),
        fetchedAt,
        sourceEndpoint,
        rawFields: pickFields(item, ["symbol", "lastPrice", "turnover24h"])
      };
    })
    .filter((market) => market.quote === "USDT" && Number.isFinite(market.price));
}

function assertBybit<T>(data: BybitResponse<T>) {
  if (data.retCode !== 0) {
    throw new Error(`Bybit error: ${data.retMsg}`);
  }
}

function pickFields(source: Record<string, unknown>, keys: string[]): Record<string, unknown> {
  return keys.reduce<Record<string, unknown>>((acc, key) => {
    acc[key] = source[key];
    return acc;
  }, {});
}
