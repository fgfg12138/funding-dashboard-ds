/**
 * Semi-Auto Trading — Barrel export
 *
 * Re-exports all Semi-1 and Semi-2 types and engine functions.
 */

// Semi-1: Opening Recommendation
export type {
  OpeningRecommendation,
  OpeningRecommendationReport,
  RecommendationStatus,
} from "./openingRecommendationTypes";

export {
  buildRecommendationReasons,
  calculateRecommendationScore,
  evaluateRecommendation,
  generateOpeningRecommendations,
} from "./openingRecommendationEngine";

// Semi-2: Auto Entry
export type {
  EntryExecutionAdapter,
  EntryExecutionPlan,
  EntryExecutionResult,
  EntryExecutionStatus,
  EntryLegPlan,
  ExecutionConfig,
  MockExecutionAdapter,
  UserConfirmation,
} from "./autoEntryTypes";

export {
  buildEntryExecutionPlan,
  executeEntry,
  validateEntryExecution,
} from "./autoEntryEngine";

// Semi-3: Auto Monitoring
export type {
  AutoMonitoringConfig,
  MonitoringMetric,
  MonitoringReport,
  MonitoringStatus,
  PositionMonitoringSnapshot,
} from "./autoMonitoringTypes";

export {
  buildDeltaMetric,
  buildFundingMetric,
  buildPnlMetric,
  buildReconciliationMetric,
  buildRiskMetric,
  calculateOverallMonitoringStatus,
  generateMonitoringReport,
  monitorPosition,
} from "./autoMonitoringEngine";

// Semi-4: Exit Suggestion
export type {
  ExitReason,
  ExitSuggestionConfig,
  ExitSuggestionReport,
  ExitSuggestionSeverity,
  ExitSuggestionStatus,
  PositionExitSuggestion,
} from "./exitSuggestionTypes";

export {
  buildExitMessage,
  buildExitReasons,
  calculateExitSeverity,
  evaluateExitSuggestion,
  generateExitSuggestions,
} from "./exitSuggestionEngine";
