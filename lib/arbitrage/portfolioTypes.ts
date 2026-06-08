/**
 * Portfolio Types — Alpha Phase A7
 *
 * Defines data structures for aggregating the performance of
 * multiple arbitrage positions into a single portfolio view.
 *
 * Pure types — no logic.
 */

import type { ArbitragePosition } from "./arbitragePositionTypes";

// ─── Position Input ─────────────────────────────────────

export type PortfolioPositionInput = {
  /** The arbitrage position. */
  position: ArbitragePosition;

  /**
   * Capital allocated to this position in USD.
   * When provided, used for APY / utilisation calculations.
   * Falls back to max(spotLeg.notionalUsd, perpetualLeg.notionalUsd).
   */
  allocatedCapitalUsd?: number;
};

// ─── Config ──────────────────────────────────────────────

export type PortfolioEngineConfig = {
  /** Total capital available to the portfolio (used for utilisation %). */
  totalCapitalUsd: number;

  /**
   * Annualization basis in hours (default 8760 = 365 days).
   */
  annualizationHours?: number;

  /**
   * Whether to include closed positions in the summary (default true).
   */
  includeClosedPositions?: boolean;
};

// ─── Summary ─────────────────────────────────────────────

export type PortfolioSummary = {
  /** Sum of allocated capital across all positions. */
  totalAllocatedCapitalUsd: number;

  /** Sum of spotLeg + perpetualLeg notional across all positions. */
  totalNotionalUsd: number;

  /** Sum of fundingCollectedUsd across all positions. */
  totalFundingCollectedUsd: number;

  /** Sum of (spotPnl + perpPnl) across all positions (excludes funding). */
  totalTradingPnlUsd: number;

  /** Sum of totalPnlUsd across all positions (trading + funding). */
  totalPnlUsd: number;

  /** Annualised portfolio return percentage. */
  portfolioApyPercent: number;

  /** Percentage of totalCapitalUsd that is allocated. */
  capitalUtilizationPercent: number;

  /** Sum of deltaUsd across all positions. */
  totalDeltaUsd: number;

  /** Total delta as a percentage of totalAllocatedCapitalUsd. */
  totalDeltaPercent: number;

  /** Number of positions currently open (status === "open"). */
  openPositionCount: number;

  /** Number of positions that have been closed (status === "closed"). */
  closedPositionCount: number;

  /** Total positions (open + closed) included in this report. */
  positionCount: number;

  /** Timestamp (ms) when this summary was generated. */
  generatedAt: number;
};

// ─── Per-Position Contribution ──────────────────────────

export type PortfolioPositionContribution = {
  /** Position identifier. */
  positionId: string;

  /** Trading pair symbol. */
  symbol: string;

  /** Current position status. */
  status: "open" | "closed";

  /** Capital allocated to this position (or fallback max notional). */
  allocatedCapitalUsd: number;

  /** Sum of spotLeg + perpetualLeg notional. */
  notionalUsd: number;

  /** Funding collected from this position. */
  fundingCollectedUsd: number;

  /** Trading PnL (spot + perp PnL only, excludes funding). */
  tradingPnlUsd: number;

  /** Total PnL (trading + funding). */
  totalPnlUsd: number;

  /** Dollar delta for this position. */
  deltaUsd: number;

  /** Delta as a percentage of allocated capital. */
  deltaPercent: number;

  /** This position's share of total portfolio PnL (%). */
  contributionPercent: number;
};

// ─── Full Report ─────────────────────────────────────────

export type PortfolioReport = {
  /** Aggregated portfolio summary. */
  summary: PortfolioSummary;

  /** Per-position breakdown. */
  contributions: PortfolioPositionContribution[];
};
