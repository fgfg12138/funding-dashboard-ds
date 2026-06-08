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
