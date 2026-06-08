import type { ExchangeName } from "../exchanges/types";

export type BasisOpportunity = {
  symbol: string;
  base: string;
  quote: string;
  spotExchange: ExchangeName;
  perpExchange: ExchangeName;
  spotPrice: number;
  perpPrice: number;
  basisPercent: number;
  fundingRate: number;
  annualizedFundingRate: number;
  estimatedCarryAnnualized: number;
  volume24h?: number;
  openInterestUsd?: number;
  nextFundingTime: number;
  score: number;
  riskTags: string[];
  opportunityReason: string;
};
