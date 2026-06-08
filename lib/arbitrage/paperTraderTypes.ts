/**
 * Paper Trader Types — Alpha Phase A8
 *
 * Defines the state, config, and input types for the automated
 * paper trading simulation loop.
 *
 * Pure types — no logic.
 */

import type { ArbitragePosition } from "./arbitragePositionTypes";
import type { FundingAccrualEvent } from "./fundingAccrualTypes";
import type { ExitDecision } from "./exitEngineTypes";
import type { PortfolioReport } from "./portfolioTypes";

// ─── Config ──────────────────────────────────────────────

export type PaperTraderConfig = {
  /** Total capital available for paper trading. */
  totalCapitalUsd: number;

  /** Reserve ratio (default 0.1). */
  reserveRatio?: number;

  /** Minimum expected net APY to open a position (default 10). */
  minExpectedNetApy?: number;

  /** Maximum simultaneously open positions (default 5). */
  maxOpenPositions?: number;

  /** Hard cap per position (default 50,000). */
  maxPositionUsd?: number;

  /** Minimum allocation per position (default 1,000). */
  minPositionUsd?: number;

  /** Max % of total capital per opportunity (default 0.5). */
  maxAllocationPercentPerOpportunity?: number;

  /** Max absolute delta % (default 3). */
  maxDeltaPercent?: number;

  /** Max holding hours before exit (default 48). */
  maxHoldingHours?: number;

  /** Funding decline threshold % (default 50). */
  fundingDeclineThresholdPercent?: number;

  /** Funding interval in hours (default 8). */
  defaultFundingIntervalHours?: number;
};

// ─── State ───────────────────────────────────────────────

export type PaperTraderState = {
  /** Currently open positions. */
  openPositions: ArbitragePosition[];

  /** Positions that have been closed (historical). */
  closedPositions: ArbitragePosition[];

  /** All funding accrual events generated so far. */
  fundingEvents: FundingAccrualEvent[];

  /** Timestamp of the last step run (ms). */
  lastRunAt?: number;

  /** Latest portfolio report (updated after each step). */
  portfolioReport?: PortfolioReport;
};

// ─── Opportunity Input ──────────────────────────────────

export type PaperTraderOpportunity = {
  /** Opportunity identifier. */
  id: string;

  /** Trading pair symbol. */
  symbol: string;

  /** Primary exchange. */
  exchange?: string;

  /** Expected net APY percent (from Alpha-2). */
  expectedNetApy: number;

  /** Net profit in USD (from Alpha-2). */
  netProfitUsd?: number;

  /** Opportunity score 0-100 (from Alpha-1). */
  opportunityScore?: number;

  /** Risk score 0-100 (higher = riskier). */
  riskScore?: number;

  /** Liquidity score 0-100. */
  liquidityScore?: number;

  /** Maximum capital this opportunity can absorb. */
  capacityUsd?: number;

  /** Current single-period funding rate (decimal). */
  fundingRate: number;

  /** Current mark / oracle price. */
  markPrice: number;

  /** Opportunity timestamp. */
  timestamp?: number;
};

// ─── Step Result ─────────────────────────────────────────

export type PaperTraderStepResult = {
  /** The new state after this step. */
  state: PaperTraderState;

  /** Positions opened during this step. */
  openedPositions: ArbitragePosition[];

  /** Positions closed during this step. */
  closedPositions: ArbitragePosition[];

  /** Funding events accrued during this step. */
  fundingEvents: FundingAccrualEvent[];

  /** Exit decisions made during this step. */
  exitDecisions: ExitDecision[];

  /** Portfolio report after this step. */
  portfolioReport: PortfolioReport;

  /** Opportunities skipped during allocation. */
  skippedOpportunities: Array<{ id: string; symbol: string; reason: string }>;

  /** Timestamp when this step was run. */
  ranAt: number;
};
