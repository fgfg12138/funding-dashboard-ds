import { getFundingSnapshot } from "../data/fundingService";
import type { ExchangeSourceStatus, FundingMarket, SpotMarket } from "../exchanges/types";
import { buildBasisOpportunities } from "./basisCalculations";
import type { BasisOpportunity } from "./types";

export type BasisSnapshot = {
  fundingMarkets: FundingMarket[];
  spotMarkets: SpotMarket[];
  errors: string[];
  updatedAt?: number;
  stale?: boolean;
  sourceStatus?: ExchangeSourceStatus;
};

export type BasisApiResponse = {
  data: BasisOpportunity[];
  errors: string[];
  updatedAt: number;
  stale: boolean;
  sourceStatus?: ExchangeSourceStatus;
};

export type BasisApiOptions = {
  snapshotLoader?: () => Promise<BasisSnapshot>;
  now?: number;
};

export async function getBasisOpportunitiesResponse(options: BasisApiOptions = {}): Promise<BasisApiResponse> {
  const now = options.now ?? Date.now();
  const snapshot = await (options.snapshotLoader ?? getFundingSnapshot)();

  return {
    data: buildBasisOpportunities(snapshot.spotMarkets, snapshot.fundingMarkets, now),
    errors: snapshot.errors.filter((error): error is string => Boolean(error)),
    updatedAt: snapshot.updatedAt ?? now,
    stale: snapshot.stale ?? false,
    sourceStatus: snapshot.sourceStatus
  };
}
