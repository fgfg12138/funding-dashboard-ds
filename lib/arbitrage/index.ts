/**
 * Arbitrage — Barrel export
 *
 * Re-exports all types and functions from the arbitrage domain
 * (Alpha A3 + A4).
 */

// Position Model (Alpha A3)
export type {
  ArbitrageLeg,
  ArbitragePosition,
  ArbitragePositionStatus,
  ClosePositionInput,
  CreatePositionInput,
} from "./arbitragePositionTypes";

export {
  calculatePositionDelta,
  calculatePositionPnl,
  closeArbitragePosition,
  createArbitragePosition,
  updateArbitragePosition,
} from "./arbitragePositionEngine";

// Funding Accrual (Alpha A4)
export type {
  FundingAccrualEvent,
  FundingAccrualInput,
  FundingAccrualResult,
} from "./fundingAccrualTypes";

export {
  DEFAULT_FUNDING_INTERVAL_HOURS,
  accrueFunding,
  accrueFundingBatch,
  calculateFundingAmount,
  getNextFundingSettlementTime,
  isFundingSettlementDue,
} from "./fundingAccrualEngine";

// Exit Engine (Alpha A5)
export type {
  ExitDecision,
  ExitDecisionMetrics,
  ExitEngineConfig,
  ExitMarketContext,
  ExitReason,
  ExitSeverity,
} from "./exitEngineTypes";

export {
  evaluateDeltaExit,
  evaluateExit,
  evaluateFundingDecline,
  evaluateHoldingTimeExit,
  evaluateNetApyExit,
  evaluateStopLoss,
  evaluateTakeProfit,
} from "./exitEngine";

// Capital Allocation (Alpha A6)
export type {
  CapitalAllocation,
  CapitalAllocationConfig,
  CapitalAllocationInput,
  CapitalAllocationOpportunity,
  CapitalAllocationResult,
  SkippedAllocation,
} from "./capitalAllocationTypes";

export {
  allocateCapital,
  applyAllocationLimits,
  calculateAllocationWeight,
  calculateExpectedAnnualProfit,
  filterEligibleOpportunities,
  normalizeAllocationWeights,
} from "./capitalAllocationEngine";

// Portfolio Engine (Alpha A7)
export type {
  PortfolioEngineConfig,
  PortfolioPositionContribution,
  PortfolioPositionInput,
  PortfolioReport,
  PortfolioSummary,
} from "./portfolioTypes";

export {
  calculateCapitalUtilization,
  calculatePortfolioApy,
  calculatePortfolioReport,
  calculatePortfolioSummary,
  calculatePositionContribution,
} from "./portfolioEngine";

// Paper Trader (Alpha A8)
export type {
  PaperTraderConfig,
  PaperTraderOpportunity,
  PaperTraderState,
  PaperTraderStepResult,
} from "./paperTraderTypes";

export {
  createPaperPositionFromAllocation,
  runPaperTraderStep,
} from "./paperTraderEngine";
