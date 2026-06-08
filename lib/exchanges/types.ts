export type ExchangeName = "Binance" | "OKX" | "Bybit";
export type ExchangeSourceState = "ok" | "failed" | "stale";
export type ExchangeSourceStatus = Record<ExchangeName, ExchangeSourceState>;

export type NormalizedSymbol = {
  symbol: string;
  base: string;
  quote: string;
};

export type FundingMarket = {
  exchange: ExchangeName;
  rawSymbol: string;
  symbol: string;
  base: string;
  quote: string;
  fundingRate: number;
  fundingIntervalHours: number;
  nextFundingTime: number;
  markPrice: number;
  indexPrice?: number;
  lastPrice?: number;
  volume24h?: number;
  openInterest?: number;
  openInterestUsd?: number;
  fetchedAt?: number;
  sourceUpdatedAt?: number;
  sourceEndpoint?: string;
  rawFields?: Record<string, unknown>;
};

export type SpotMarket = {
  exchange: ExchangeName;
  rawSymbol?: string;
  symbol: string;
  base: string;
  quote: string;
  price: number;
  volume24h?: number;
  fetchedAt?: number;
  sourceUpdatedAt?: number;
  sourceEndpoint?: string;
  rawFields?: Record<string, unknown>;
};

export type ExchangeFundingRates = {
  Binance?: FundingMarket;
  OKX?: FundingMarket;
  Bybit?: FundingMarket;
};

export type CrossExchangeOpportunity = {
  symbol: string;
  base: string;
  quote: string;
  markets: ExchangeFundingRates;
  annualizedRates: Partial<Record<ExchangeName, number>>;
  fundingRates: Partial<Record<ExchangeName, number>>;
  fundingIntervalHours: Partial<Record<ExchangeName, number>>;
  annualizedSpread: number;
  direction: string;
  shortExchange: ExchangeName;
  longExchange: ExchangeName;
  exchangeCount: number;
  score: number;
  riskTags: string[];
  opportunityReason: string;
  priceSpread: number;
  priceSpreadDirection: string;
  nextFundingTime: number;
  volume24h?: number;
  openInterestUsd?: number;
};

export type DebugMarketRow = {
  exchange: ExchangeName;
  rawSymbol: string;
  normalizedSymbol: string;
  fundingRate: number;
  annualizedRate: number;
  markPrice: number;
  nextFundingTime: number;
  volume24h?: number;
  openInterestUsd?: number;
  fetchedAt?: number;
  sourceUpdatedAt?: number;
  sourceEndpoint?: string;
};

export type SpotPerpOpportunity = {
  symbol: string;
  base: string;
  quote: string;
  spotExchange: ExchangeName;
  perpExchange: ExchangeName;
  exchangeCount: number;
  score: number;
  riskTags: string[];
  opportunityReason: string;
  fundingRate: number;
  annualized: number;
  spotPrice: number;
  perpPrice: number;
  priceSpread: number;
  priceSpreadDirection: string;
  volume24h?: number;
  nextFundingTime: number;
};

export type DashboardSummary = {
  totalPairs: number;
  maxAnnualizedSpread: number;
  bestDirection: string;
  spreadAbove10Count: number;
  highestSingleAnnualized: number;
};
