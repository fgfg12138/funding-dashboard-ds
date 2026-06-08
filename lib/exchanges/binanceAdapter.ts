import type { FundingMarket, SpotMarket } from "./types";
import { fetchJson, mapLimit } from "./http";
import { normalizeSymbol } from "../markets/normalize";
import { EXCHANGE_API_URLS } from "../env";

type BinancePremium = {
  symbol: string;
  markPrice: string;
  indexPrice: string;
  lastFundingRate: string;
  nextFundingTime: number;
};

type BinanceTicker = {
  symbol: string;
  lastPrice: string;
  quoteVolume: string;
  closeTime?: number;
};

type BinanceOpenInterest = {
  symbol: string;
  openInterest: string;
};

const FUTURES_BASE = EXCHANGE_API_URLS.BINANCE_FUTURES;
const SPOT_BASE = EXCHANGE_API_URLS.BINANCE_SPOT;
const OPEN_INTEREST_CACHE_TTL_MS = 4 * 60_000;
const openInterestCache = new Map<string, { expiresAt: number; openInterest: number }>();

export async function fetchBinanceFundingMarkets(): Promise<FundingMarket[]> {
  const fetchedAt = Date.now();
  const premiumEndpoint = `${FUTURES_BASE}/fapi/v1/premiumIndex`;
  const tickerEndpoint = `${FUTURES_BASE}/fapi/v1/ticker/24hr`;
  const [premium, tickers] = await Promise.all([
    fetchJson<BinancePremium[]>(premiumEndpoint),
    fetchJson<BinanceTicker[]>(tickerEndpoint)
  ]);
  const tickerBySymbol = new Map(tickers.map((ticker) => [ticker.symbol, ticker]));
  const volumeBySymbol = new Map(tickers.map((ticker) => [ticker.symbol, Number(ticker.quoteVolume)]));
  const usdtPremium = premium.filter((item) => item.symbol.endsWith("USDT"));
  const markPriceBySymbol = new Map(usdtPremium.map((item) => [item.symbol, Number(item.markPrice)]));
  const openInterestBySymbol = await fetchBinanceOpenInterest(Array.from(markPriceBySymbol.entries()));

  return usdtPremium
    .map((item) => {
      const normalized = normalizeSymbol(item.symbol);
      const ticker = tickerBySymbol.get(item.symbol);
      const openInterest = openInterestBySymbol.get(item.symbol);
      return {
        exchange: "Binance" as const,
        rawSymbol: item.symbol,
        symbol: normalized.symbol,
        base: normalized.base,
        quote: normalized.quote,
        fundingRate: Number(item.lastFundingRate),
        fundingIntervalHours: 8,
        nextFundingTime: item.nextFundingTime,
        markPrice: Number(item.markPrice),
        indexPrice: Number(item.indexPrice),
        lastPrice: ticker ? Number(ticker.lastPrice) : undefined,
        volume24h: volumeBySymbol.get(item.symbol),
        openInterest,
        openInterestUsd: openInterest ? openInterest * Number(item.markPrice) : undefined,
        fetchedAt,
        sourceUpdatedAt: ticker?.closeTime,
        sourceEndpoint: `${premiumEndpoint}; ${tickerEndpoint}; ${FUTURES_BASE}/fapi/v1/openInterest`,
        rawFields: {
          premiumIndex: pickFields(item, ["symbol", "markPrice", "indexPrice", "lastFundingRate", "nextFundingTime"]),
          ticker24hr: ticker ? pickFields(ticker, ["symbol", "lastPrice", "quoteVolume", "closeTime"]) : undefined,
          openInterest
        }
      };
    })
    .filter((market) => market.quote === "USDT" && Number.isFinite(market.markPrice));
}

async function fetchBinanceOpenInterest(symbolPrices: Array<[string, number]>): Promise<Map<string, number>> {
  const now = Date.now();
  const missingSymbols = symbolPrices.filter(([symbol]) => {
    const cached = openInterestCache.get(symbol);
    return !cached || cached.expiresAt <= now;
  });

  await mapLimit(missingSymbols, 12, async ([symbol]) => {
    try {
      const data = await fetchJson<BinanceOpenInterest>(
        `${FUTURES_BASE}/fapi/v1/openInterest?symbol=${encodeURIComponent(symbol)}`,
        5_000
      );
      const openInterest = Number(data.openInterest);

      if (Number.isFinite(openInterest)) {
        openInterestCache.set(symbol, {
          expiresAt: now + OPEN_INTEREST_CACHE_TTL_MS,
          openInterest
        });
      }
    } catch {
      // Keep funding data usable when Binance open interest is unavailable.
    }
  });

  return new Map(
    symbolPrices
      .map(([symbol]) => {
        const cached = openInterestCache.get(symbol);
        return cached && Number.isFinite(cached.openInterest) ? [symbol, cached.openInterest] as const : null;
      })
      .filter((row): row is readonly [string, number] => Boolean(row))
  );
}

export async function fetchBinanceSpotMarkets(): Promise<SpotMarket[]> {
  const fetchedAt = Date.now();
  const sourceEndpoint = `${SPOT_BASE}/api/v3/ticker/24hr`;
  const tickers = await fetchJson<BinanceTicker[]>(sourceEndpoint);

  return tickers
    .filter((ticker) => ticker.symbol.endsWith("USDT"))
    .map((ticker) => {
      const normalized = normalizeSymbol(ticker.symbol);
      return {
        exchange: "Binance" as const,
        rawSymbol: ticker.symbol,
        symbol: normalized.symbol,
        base: normalized.base,
        quote: normalized.quote,
        price: Number(ticker.lastPrice),
        volume24h: Number(ticker.quoteVolume),
        fetchedAt,
        sourceUpdatedAt: ticker.closeTime,
        sourceEndpoint,
        rawFields: pickFields(ticker, ["symbol", "lastPrice", "quoteVolume", "closeTime"])
      };
    })
    .filter((market) => market.quote === "USDT" && Number.isFinite(market.price));
}

function pickFields<T extends Record<string, unknown>>(source: T, keys: string[]): Record<string, unknown> {
  return keys.reduce<Record<string, unknown>>((acc, key) => {
    acc[key] = source[key];
    return acc;
  }, {});
}
