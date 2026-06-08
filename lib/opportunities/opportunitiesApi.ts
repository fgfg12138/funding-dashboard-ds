import { buildBasisOpportunities } from "../basis/basisCalculations";
import { buildCrossExchangeOpportunities, buildSpotPerpOpportunities, getFundingSnapshot } from "../data/fundingService";
import type { ExchangeSourceStatus, FundingMarket, SpotMarket } from "../exchanges/types";
import { buildUnifiedOpportunities } from "./unifiedOpportunities";
import type { UnifiedOpportunity } from "./types";

export type UnifiedOpportunitySnapshot = {
  fundingMarkets: FundingMarket[];
  spotMarkets: SpotMarket[];
  errors: Array<string | undefined>;
  updatedAt?: number;
  stale?: boolean;
  sourceStatus?: ExchangeSourceStatus;
};

export type SourceSnapshotMeta = {
  fundingMarketCount: number;
  spotMarketCount: number;
  crossCount: number;
  spotPerpCount: number;
  basisCount: number;
  unifiedCount: number;
  errors: string[];
};

export type UnifiedOpportunitiesApiResponse = {
  data: UnifiedOpportunity[];
  errors: string[];
  updatedAt: number;
  stale: boolean;
  sourceStatus?: ExchangeSourceStatus;
  meta: SourceSnapshotMeta;
};

export type UnifiedOpportunitiesApiOptions = {
  snapshotLoader?: () => Promise<UnifiedOpportunitySnapshot>;
  now?: number;
};

export async function getUnifiedOpportunitiesResponse(
  options: UnifiedOpportunitiesApiOptions = {}
): Promise<UnifiedOpportunitiesApiResponse> {
  const updatedAt = options.now ?? Date.now();
  const snapshot = await (options.snapshotLoader ?? getFundingSnapshot)();
  const errors = snapshot.errors.filter((error): error is string => Boolean(error));
  const cross = buildCrossExchangeOpportunities(snapshot.fundingMarkets);
  const spotPerp = buildSpotPerpOpportunities(snapshot.spotMarkets, snapshot.fundingMarkets);
  const basis = buildBasisOpportunities(snapshot.spotMarkets, snapshot.fundingMarkets, updatedAt);
  const data = buildUnifiedOpportunities({ cross, spotPerp, basis });

  return {
    data,
    errors,
    updatedAt: snapshot.updatedAt ?? updatedAt,
    stale: snapshot.stale ?? false,
    sourceStatus: snapshot.sourceStatus,
    meta: {
      fundingMarketCount: snapshot.fundingMarkets.length,
      spotMarketCount: snapshot.spotMarkets.length,
      crossCount: cross.length,
      spotPerpCount: spotPerp.length,
      basisCount: basis.length,
      unifiedCount: data.length,
      errors
    }
  };
}
