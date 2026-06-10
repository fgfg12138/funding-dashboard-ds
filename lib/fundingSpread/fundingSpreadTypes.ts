/**
 * Funding Spread Types — Cross-Exchange Funding Spread Engine
 *
 * Defines the leg, opportunity, and config types for detecting
 * cross-exchange funding rate arbitrage opportunities.
 */

// ─── Funding Spread Leg ──────────────────────────────

export type FundingSpreadLeg = {
  /** Exchange identifier for this leg. */
  exchangeId: string;
  /** Canonical symbol (e.g. "BTCUSDT"). */
  canonicalSymbol: string;
  /** Exchange-specific symbol. */
  exchangeSymbol: string;
  /** Current funding rate (decimal, e.g. 0.0001 = 0.01%). */
  fundingRate: number;
  /** Funding interval in hours (e.g. 8, 1). */
  intervalHours: number;
  /** Current mark price in USD. */
  markPrice: number;
  /** Position side required on this leg. */
  side: "long" | "short";
  /** Expected funding direction. */
  expectedFundingDirection: "receive" | "pay";
};

// ─── Funding Spread Opportunity ──────────────────────

export type FundingSpreadOpportunity = {
  /** Unique opportunity identifier. */
  id: string;
  /** Canonical symbol. */
  canonicalSymbol: string;
  /** Exchange to go short on (higher funding rate). */
  shortExchangeId: string;
  /** Exchange to go long on (lower funding rate). */
  longExchangeId: string;
  /** Short leg details. */
  shortLeg: FundingSpreadLeg;
  /** Long leg details. */
  longLeg: FundingSpreadLeg;
  /** Raw spread = shortFundingRate - longFundingRate. */
  spreadRate: number;
  /** Annualized spread rate as a percentage. */
  spreadApy: number;
  /** Net annualized spread after fees and slippage. */
  netSpreadApy: number;
  /** Estimated funding income per interval in USD (for positionSizeUsd). */
  estimatedFundingUsdPerInterval: number;
  /** Opportunity score 0-100. */
  score: number;
  /** Human-readable reasons explaining the opportunity. */
  reasons: string[];
  /** Estimated capacity in USD (undefined if unknown). */
  capacityUsd?: number;
  /** Timestamp (ms) when the opportunity was created. */
  createdAt: number;
};

// ─── Config ─────────────────────────────────────────

export type FundingSpreadConfig = {
  /** Minimum spread rate to consider (e.g. 0.00005). */
  minSpreadRate: number;
  /** Minimum annualized spread APY percentage (e.g. 5). */
  minSpreadApy: number;
  /** Notional position size in USD for estimation. */
  positionSizeUsd: number;
  /** Whether to include fee/slippage in net calculation. */
  includeFees: boolean;
  /** Maker fee percentage (e.g. 0.02 = 0.02%). */
  makerFeePercent: number;
  /** Taker fee percentage (e.g. 0.04 = 0.04%). */
  takerFeePercent: number;
  /** Estimated slippage percentage (e.g. 0.01 = 0.01%). */
  slippagePercent: number;
  /** Maximum exchanges to consider (0 = unlimited). */
  maxExchanges: number;
  /** Optional list of allowed exchange IDs. */
  allowedExchanges?: string[];
};

export const DEFAULT_SPREAD_CONFIG: FundingSpreadConfig = {
  minSpreadRate: 0.00005,
  minSpreadApy: 2,
  positionSizeUsd: 100,
  includeFees: true,
  makerFeePercent: 0.02,
  takerFeePercent: 0.04,
  slippagePercent: 0.01,
  maxExchanges: 0,
};
