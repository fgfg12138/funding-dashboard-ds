/**
 * Net Profit Types — Alpha Phase A2
 *
 * Defines the cost configuration and net profit breakdown for
 * computing true expected net APY from an arbitrage opportunity.
 *
 * Pure types — no logic.
 */

/**
 * Cost parameters for net APY estimation.
 *
 * All rates are expressed as annualized percentage deductions.
 * When not provided, sensible defaults are used.
 */
export type CostConfig = {
  /**
   * Trading fees as annualized percentage-point deduction
   * (e.g. 2 means 2 percentage points deducted from funding APY).
   * Default 2.
   */
  feeCostPercent?: number;

  /**
   * Slippage cost as annualized percentage-point deduction
   * (e.g. 1 means 1 percentage point deducted from funding APY).
   * Default 1.
   */
  slippageCostPercent?: number;

  /**
   * Annual borrow rate as percentage (e.g. 5 means 5% of notional per year).
   * Default 5.
   */
  borrowRateAnnualPercent?: number;

  /**
   * Annual capital / opportunity cost as percentage
   * (e.g. 3 means 3% of notional per year).
   * Default 3.
   */
  capitalCostAnnualPercent?: number;

  /**
   * Position size in USD for computing netProfitUsd.
   * Default 1,000.
   */
  positionSizeUsd?: number;
};

/**
 * Net profit breakdown for a single opportunity.
 */
export type NetProfitBreakdown = {
  /** Annualized funding rate in percent (e.g. 40 = 40% APY). */
  fundingApy: number;

  /** Trading fee deduction in percentage points. */
  feeCostPercent: number;

  /** Slippage deduction in percentage points. */
  slippageCostPercent: number;

  /** Borrow cost deduction in percentage points. */
  borrowCostPercent: number;

  /** Capital / opportunity cost deduction in percentage points. */
  capitalCostPercent: number;

  /** Expected net APY (fundingApy - all costs, minimum 0). */
  netApy: number;

  /** Annual net profit in USD (netApy / 100 * positionSize). */
  netProfitUsd: number;
};
