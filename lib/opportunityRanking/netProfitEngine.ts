/**
 * Net Profit Engine — Alpha Phase A2
 *
 * Computes the true expected net APY from an arbitrage opportunity
 * by deducting trading fees, slippage, borrow cost, and capital cost
 * from the gross funding APY.
 *
 * Formula:  netApy = fundingApy - feeCost - slippageCost - borrowCost - capitalCost
 *
 * Pure logic — no side effects.
 */

import type { UnifiedOpportunity } from "../opportunities/types";
import type { CostConfig, NetProfitBreakdown } from "./netProfitTypes";

// ─── Defaults ────────────────────────────────────────────

const DEFAULT_FEE_COST_PERCENT = 2;
const DEFAULT_SLIPPAGE_COST_PERCENT = 1;
const DEFAULT_BORROW_RATE_ANNUAL_PERCENT = 5;
const DEFAULT_CAPITAL_COST_ANNUAL_PERCENT = 3;
const DEFAULT_POSITION_SIZE_USD = 1_000;

// ─── Public API ──────────────────────────────────────────

/**
 * Compute the net profit breakdown from a funding APY and cost config.
 *
 * @param fundingApy - Gross annualized funding rate in percent (e.g. 40 = 40 %).
 * @param config     - Optional cost configuration overrides.
 * @returns A NetProfitBreakdown with each cost component and the final netApy.
 */
export function calculateNetProfit(
  fundingApy: number,
  config?: CostConfig,
): NetProfitBreakdown {
  const feeCostPercent = config?.feeCostPercent ?? DEFAULT_FEE_COST_PERCENT;
  const slippageCostPercent = config?.slippageCostPercent ?? DEFAULT_SLIPPAGE_COST_PERCENT;
  const borrowCostPercent = config?.borrowRateAnnualPercent ?? DEFAULT_BORROW_RATE_ANNUAL_PERCENT;
  const capitalCostPercent = config?.capitalCostAnnualPercent ?? DEFAULT_CAPITAL_COST_ANNUAL_PERCENT;
  const positionSizeUsd = config?.positionSizeUsd ?? DEFAULT_POSITION_SIZE_USD;

  const netApy = Math.max(0, fundingApy - feeCostPercent - slippageCostPercent - borrowCostPercent - capitalCostPercent);
  const netProfitUsd = (netApy / 100) * positionSizeUsd;

  return {
    fundingApy,
    feeCostPercent,
    slippageCostPercent,
    borrowCostPercent,
    capitalCostPercent,
    netApy,
    netProfitUsd,
  };
}

/**
 * Compute the net profit breakdown for a unified opportunity.
 *
 * Extracts the annualized funding rate from the opportunity and
 * delegates to `calculateNetProfit`.
 *
 * @param opp    - A unified arbitrage opportunity.
 * @param config - Optional cost configuration overrides.
 * @returns A NetProfitBreakdown.
 */
export function calculateOpportunityNetProfit(
  opp: UnifiedOpportunity,
  config?: CostConfig,
): NetProfitBreakdown {
  const fundingApy = opp.annualizedRate ?? 0;
  return calculateNetProfit(fundingApy, config);
}
