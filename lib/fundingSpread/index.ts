/**
 * Funding Spread — Barrel Export
 */

export type {
  FundingSpreadLeg,
  FundingSpreadOpportunity,
  FundingSpreadConfig,
} from "./fundingSpreadTypes";

export { DEFAULT_SPREAD_CONFIG } from "./fundingSpreadTypes";

export {
  getFundingRatesFromConnectors,
  calculateFundingSpread,
  scoreFundingSpreadOpportunity,
  findCrossExchangeFundingSpreads,
  rankFundingSpreadOpportunities,
} from "./fundingSpreadEngine";
