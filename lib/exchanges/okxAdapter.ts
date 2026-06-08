import type { FundingMarket, SpotMarket } from "./types";
import { fetchJson, mapLimit } from "./http";
import { normalizeSymbol } from "../markets/normalize";
import { EXCHANGE_API_URLS } from "../env";

type OkxResponse<T> = {
  code: string;
  msg: string;
  data: T[];
};

type OkxTicker = {
  instId: string;
  last: string;
  volCcy24h?: string;
  vol24h?: string;
  ts?: string;
};

type OkxFunding = {
  instId: string;
  fundingRate: string;
  fundingTime: string;
  nextFundingTime?: string;
};

type OkxMarkPrice = {
  instId: string;
  markPx: string;
  ts?: string;
};

type OkxOpenInterest = {
  instId: string;
  oi: string;
  oiCcy?: string;
  ts?: string;
};

const BASE = EXCHANGE_API_URLS.OKX;
const MAX_OKX_FUNDING_LOOKUPS = 300;

export async function fetchOkxFundingMarkets(): Promise<FundingMarket[]> {
  const fetchedAt = Date.now();
  const tickersEndpoint = `${BASE}/api/v5/market/tickers?instType=SWAP`;
  const markPriceEndpoint = `${BASE}/api/v5/public/mark-price?instType=SWAP`;
  const [tickers, markPrices] = await Promise.all([
    fetchOkx<OkxTicker>(tickersEndpoint),
    fetchOkx<OkxMarkPrice>(markPriceEndpoint)
  ]);
  const markByInstId = new Map(markPrices.map((mark) => [mark.instId, mark]));
  const usdtSwaps = tickers
    .filter((ticker) => ticker.instId.endsWith("-USDT-SWAP"))
    .map((ticker) => ({
      ticker,
      volume24h: calculateOkxVolume24h(ticker)
    }))
    .sort((a, b) => b.volume24h - a.volume24h)
    .slice(0, MAX_OKX_FUNDING_LOOKUPS);
  const fundingRows = await mapLimit(usdtSwaps, 10, async ({ ticker, volume24h }) => {
    const fundingEndpoint = `${BASE}/api/v5/public/funding-rate?instId=${encodeURIComponent(ticker.instId)}`;
    const openInterestEndpoint = `${BASE}/api/v5/public/open-interest?instType=SWAP&instId=${encodeURIComponent(ticker.instId)}`;
    const [funding, openInterestRows] = await Promise.all([
      fetchOkx<OkxFunding>(fundingEndpoint, 8_000),
      fetchOkx<OkxOpenInterest>(openInterestEndpoint, 8_000).catch(() => [])
    ]);
    return {
      ticker,
      volume24h,
      funding: funding[0],
      fundingEndpoint,
      openInterest: openInterestRows[0],
      openInterestEndpoint
    };
  });

  return fundingRows
    .filter((row) => row.funding)
    .map(({ ticker, volume24h, funding, fundingEndpoint, openInterest, openInterestEndpoint }) => {
      const normalized = normalizeSymbol(ticker.instId);
      const mark = markByInstId.get(ticker.instId);
      const markPrice = Number(mark?.markPx);
      const openInterestContracts = Number(openInterest?.oi);
      const openInterestCoin = Number(openInterest?.oiCcy);
      const nextFundingTime = Number(funding.nextFundingTime ?? funding.fundingTime);
      const openInterestUsd = Number.isFinite(openInterestCoin)
        ? openInterestCoin * markPrice
        : Number.isFinite(openInterestContracts) ? openInterestContracts * markPrice : undefined;

      return {
        exchange: "OKX" as const,
        rawSymbol: ticker.instId,
        symbol: normalized.symbol,
        base: normalized.base,
        quote: normalized.quote,
        fundingRate: Number(funding.fundingRate),
        fundingIntervalHours: calculateOkxFundingIntervalHours(funding),
        nextFundingTime,
        markPrice,
        lastPrice: Number(ticker.last),
        volume24h,
        openInterest: Number.isFinite(openInterestCoin)
          ? openInterestCoin
          : Number.isFinite(openInterestContracts) ? openInterestContracts : undefined,
        openInterestUsd,
        fetchedAt,
        sourceUpdatedAt: Number(mark?.ts ?? openInterest?.ts ?? ticker.ts),
        sourceEndpoint: `${tickersEndpoint}; ${markPriceEndpoint}; ${fundingEndpoint}; ${openInterestEndpoint}`,
        rawFields: {
          ticker: pickFields(ticker, ["instId", "last", "volCcy24h", "vol24h", "ts"]),
          markPrice: mark ? pickFields(mark, ["instId", "markPx", "ts"]) : undefined,
          fundingRate: pickFields(funding, ["instId", "fundingRate", "fundingTime", "nextFundingTime"]),
          openInterest: openInterest ? pickFields(openInterest, ["instId", "oi", "oiCcy", "ts"]) : undefined
        }
      };
    })
    .filter((market) => market.quote === "USDT" && Number.isFinite(market.markPrice));
}

export async function fetchOkxSpotMarkets(): Promise<SpotMarket[]> {
  const fetchedAt = Date.now();
  const sourceEndpoint = `${BASE}/api/v5/market/tickers?instType=SPOT`;
  const tickers = await fetchOkx<OkxTicker>(sourceEndpoint);

  return tickers
    .filter((ticker) => ticker.instId.endsWith("-USDT"))
    .map((ticker) => {
      const normalized = normalizeSymbol(ticker.instId);
      const price = Number(ticker.last);
      const volume24h = Number(ticker.volCcy24h ?? 0) || Number(ticker.vol24h) * price;

      return {
        exchange: "OKX" as const,
        rawSymbol: ticker.instId,
        symbol: normalized.symbol,
        base: normalized.base,
        quote: normalized.quote,
        price,
        volume24h,
        fetchedAt,
        sourceUpdatedAt: Number(ticker.ts),
        sourceEndpoint,
        rawFields: pickFields(ticker, ["instId", "last", "volCcy24h", "vol24h", "ts"])
      };
    })
    .filter((market) => market.quote === "USDT" && Number.isFinite(market.price));
}

async function fetchOkx<T>(url: string, timeoutMs = 10_000): Promise<T[]> {
  const data = await fetchJson<OkxResponse<T>>(url, timeoutMs);
  if (data.code !== "0") {
    throw new Error(`OKX error: ${data.msg}`);
  }

  return data.data;
}

function calculateOkxVolume24h(ticker: OkxTicker): number {
  const markPrice = Number(ticker.last);
  const quoteVolume = Number(ticker.volCcy24h ?? 0);
  const baseVolumeUsd = Number(ticker.vol24h) * markPrice;

  return quoteVolume || baseVolumeUsd || 0;
}

function calculateOkxFundingIntervalHours(funding: OkxFunding): number {
  const current = Number(funding.fundingTime);
  const next = Number(funding.nextFundingTime);
  const interval = (next - current) / 3_600_000;

  return Number.isFinite(interval) && interval > 0 ? interval : 8;
}

function pickFields(source: Record<string, unknown>, keys: string[]): Record<string, unknown> {
  return keys.reduce<Record<string, unknown>>((acc, key) => {
    acc[key] = source[key];
    return acc;
  }, {});
}
