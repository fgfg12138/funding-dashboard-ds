import type { ExchangeName } from "../exchanges/types";

export type UnifiedOpportunityType = "CrossExchange" | "SpotPerp" | "Basis";

export type UnifiedOpportunity = {
  id: string;
  opportunityType: UnifiedOpportunityType;
  symbol: string;
  base: string;
  quote: string;
  primaryExchange: ExchangeName;
  secondaryExchange?: ExchangeName;
  direction: string;
  fundingRate?: number;
  annualizedRate: number;
  spreadPercent?: number;
  basisPercent?: number;
  estimatedCarryAnnualized?: number;
  volume24h?: number;
  openInterestUsd?: number;
  nextFundingTime?: number;
  score: number;
  riskTags: string[];
  opportunityReason: string;
  sourceId?: string;
};

export type UnifiedOpportunitySortBy =
  | "score"
  | "annualizedRate"
  | "estimatedCarryAnnualized"
  | "volume24h"
  | "openInterestUsd"
  | "nextFundingTime"
  | "exchangeCoverage";

export type UnifiedOpportunityFilters = {
  search?: string;
  opportunityType?: "all" | UnifiedOpportunityType;
  exchange?: "all" | ExchangeName;
  minScore?: number;
  minAnnualized?: number;
  minVolume24h?: number;
  recommendedOnly?: boolean;
  hideHighRisk?: boolean;
  sortBy?: UnifiedOpportunitySortBy;
};
