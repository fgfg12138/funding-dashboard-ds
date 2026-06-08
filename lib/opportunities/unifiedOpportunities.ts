import type { BasisOpportunity } from "../basis/types";
import type { CrossExchangeOpportunity, SpotPerpOpportunity } from "../exchanges/types";
import type { UnifiedOpportunity, UnifiedOpportunityFilters } from "./types";

const HIGH_RISK_TAGS = new Set(["低流动性", "持仓量缺失", "价差过大", "基差过大", "异常费率"]);

export type UnifiedOpportunitySources = {
  cross: CrossExchangeOpportunity[];
  spotPerp: SpotPerpOpportunity[];
  basis: BasisOpportunity[];
};

export function buildUnifiedOpportunities(sources: UnifiedOpportunitySources): UnifiedOpportunity[] {
  return [
    ...sources.cross.map(mapCrossExchangeOpportunity),
    ...sources.spotPerp.map(mapSpotPerpOpportunity),
    ...sources.basis.map(mapBasisOpportunity)
  ].sort((a, b) => b.score - a.score || b.annualizedRate - a.annualizedRate);
}

export function filterUnifiedOpportunities(
  opportunities: UnifiedOpportunity[],
  filters: UnifiedOpportunityFilters = {}
): UnifiedOpportunity[] {
  const query = filters.search?.trim().toUpperCase() ?? "";

  return opportunities
    .filter((row) => (query ? row.symbol.includes(query) || row.base.includes(query) : true))
    .filter((row) => !filters.opportunityType || filters.opportunityType === "all" || row.opportunityType === filters.opportunityType)
    .filter((row) =>
      !filters.exchange || filters.exchange === "all"
        ? true
        : row.primaryExchange === filters.exchange || row.secondaryExchange === filters.exchange
    )
    .filter((row) => row.score >= (filters.minScore ?? 0))
    .filter((row) => row.annualizedRate >= (filters.minAnnualized ?? 0))
    .filter((row) => (row.volume24h ?? 0) >= (filters.minVolume24h ?? 0))
    .filter((row) => (filters.recommendedOnly ? isRecommendedUnifiedOpportunity(row) : true))
    .filter((row) => (filters.hideHighRisk ? !isHighRiskUnifiedOpportunity(row) : true))
    .sort((a, b) => compareUnifiedOpportunity(a, b, filters.sortBy ?? "score"));
}

export function isRecommendedUnifiedOpportunity(opportunity: UnifiedOpportunity): boolean {
  return (
    opportunity.score >= 60 &&
    (opportunity.volume24h ?? 0) >= 1_000_000 &&
    Math.abs(getSpreadOrBasis(opportunity)) <= 1.5 &&
    !opportunity.riskTags.includes("低流动性")
  );
}

export function isHighRiskUnifiedOpportunity(opportunity: UnifiedOpportunity): boolean {
  return opportunity.riskTags.some((tag) => HIGH_RISK_TAGS.has(tag));
}

function mapCrossExchangeOpportunity(source: CrossExchangeOpportunity): UnifiedOpportunity {
  const id = buildId("CrossExchange", source.shortExchange, source.longExchange, source.symbol);

  return {
    id,
    opportunityType: "CrossExchange",
    symbol: source.symbol,
    base: source.base,
    quote: source.quote,
    primaryExchange: source.shortExchange,
    secondaryExchange: source.longExchange,
    direction: source.direction,
    annualizedRate: source.annualizedSpread,
    spreadPercent: source.priceSpread,
    volume24h: source.volume24h,
    openInterestUsd: source.openInterestUsd,
    nextFundingTime: source.nextFundingTime,
    score: source.score,
    riskTags: source.riskTags,
    opportunityReason: source.opportunityReason,
    sourceId: id
  };
}

function mapSpotPerpOpportunity(source: SpotPerpOpportunity): UnifiedOpportunity {
  const id = buildId("SpotPerp", source.perpExchange, source.spotExchange, source.symbol);

  return {
    id,
    opportunityType: "SpotPerp",
    symbol: source.symbol,
    base: source.base,
    quote: source.quote,
    primaryExchange: source.perpExchange,
    secondaryExchange: source.spotExchange,
    direction: `${source.spotExchange} 买现货 / ${source.perpExchange} 空永续`,
    fundingRate: source.fundingRate,
    annualizedRate: source.annualized,
    spreadPercent: source.priceSpread,
    volume24h: source.volume24h,
    nextFundingTime: source.nextFundingTime,
    score: source.score,
    riskTags: source.riskTags,
    opportunityReason: source.opportunityReason,
    sourceId: id
  };
}

function mapBasisOpportunity(source: BasisOpportunity): UnifiedOpportunity {
  const id = buildId("Basis", source.perpExchange, source.spotExchange, source.symbol);

  return {
    id,
    opportunityType: "Basis",
    symbol: source.symbol,
    base: source.base,
    quote: source.quote,
    primaryExchange: source.perpExchange,
    secondaryExchange: source.spotExchange,
    direction: `${source.spotExchange} 买现货 / ${source.perpExchange} 空永续`,
    fundingRate: source.fundingRate,
    annualizedRate: source.annualizedFundingRate,
    basisPercent: source.basisPercent,
    estimatedCarryAnnualized: source.estimatedCarryAnnualized,
    volume24h: source.volume24h,
    openInterestUsd: source.openInterestUsd,
    nextFundingTime: source.nextFundingTime,
    score: source.score,
    riskTags: source.riskTags,
    opportunityReason: source.opportunityReason,
    sourceId: id
  };
}

function compareUnifiedOpportunity(a: UnifiedOpportunity, b: UnifiedOpportunity, sortBy: UnifiedOpportunityFilters["sortBy"]): number {
  if (sortBy === "annualizedRate") return b.annualizedRate - a.annualizedRate;
  if (sortBy === "estimatedCarryAnnualized") return (b.estimatedCarryAnnualized ?? -Infinity) - (a.estimatedCarryAnnualized ?? -Infinity);
  if (sortBy === "volume24h") return (b.volume24h ?? 0) - (a.volume24h ?? 0);
  if (sortBy === "openInterestUsd") return (b.openInterestUsd ?? 0) - (a.openInterestUsd ?? 0);
  if (sortBy === "exchangeCoverage") return getExchangeCoverage(b) - getExchangeCoverage(a);
  if (sortBy === "nextFundingTime") return (a.nextFundingTime ?? Infinity) - (b.nextFundingTime ?? Infinity);
  return b.score - a.score || b.annualizedRate - a.annualizedRate;
}

function getExchangeCoverage(opportunity: UnifiedOpportunity): number {
  return new Set([opportunity.primaryExchange, opportunity.secondaryExchange].filter(Boolean)).size;
}

function getSpreadOrBasis(opportunity: UnifiedOpportunity): number {
  return opportunity.basisPercent ?? opportunity.spreadPercent ?? 0;
}

function buildId(type: string, primary: string, secondary: string, symbol: string): string {
  return `${type}:${primary}:${secondary}:${symbol}`;
}
