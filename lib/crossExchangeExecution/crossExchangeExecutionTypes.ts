/**
 * Cross-Exchange Execution Types — Execution Readiness Review
 */

export type ExecutionMode = "paper" | "dry_run" | "live_disabled";

export type ExecutionLockStatus = "pending" | "executing" | "completed" | "failed" | "manual_review_required";

export type ExecutionRecoveryRecommendation =
  | "reduce_only_close_short"
  | "reduce_only_close_long"
  | "cancel_remaining_orders"
  | "manual_review_required"
  | "no_action_needed";

export type ExecutionLock = {
  planId: string;
  status: ExecutionLockStatus;
  startedAt: number;
  completedAt?: number;
  recommendation?: ExecutionRecoveryRecommendation;
};

export type ExecutionLegOrder = {
  exchangeId: string;
  canonicalSymbol: string;
  exchangeSymbol: string;
  side: "buy" | "sell";
  type: "limit" | "market";
  quantity: number;
  price?: number;
};

export type ExecutionLegResult = {
  orderId?: string;
  success: boolean;
  filledQuantity: number;
  expectedQuantity: number;
  price?: number;
  error?: string;
};

export type CrossExchangeExecutionPlan = {
  id: string;
  canonicalSymbol: string;
  shortExchangeId: string;
  longExchangeId: string;
  shortOrder: ExecutionLegOrder;
  longOrder: ExecutionLegOrder;
  positionSizeUsd: number;
  executionMode: ExecutionMode;
  createdAt: number;
};

export type ExecutionScenarioResult = {
  scenario: string;
  passed: boolean;
  singleLegExposure: boolean;
  duplicateExecution: boolean;
  symbolMismatch: boolean;
  capitalBreach: boolean;
  details: string;
};

export type CrossExchangeExecutionRisk = {
  category: string;
  severity: "low" | "medium" | "high" | "critical";
  message: string;
  blocking: boolean;
};

export type CrossExchangeExecutionReviewReport = {
  scenariosPassed: number;
  scenariosFailed: number;
  risks: CrossExchangeExecutionRisk[];
  blockers: string[];
  orphanOrders: number;
  orphanPositions: number;
  singleLegExposureDetected: boolean;
  duplicateExecutionDetected: boolean;
  symbolMismatchDetected: boolean;
  capitalLimitBreached: boolean;
  riskBypassDetected: boolean;
  killSwitchBypassDetected: boolean;
  realOrdersExecuted: number;
  postRequests: number;
  putRequests: number;
  deleteRequests: number;
  generatedAt: number;
};
