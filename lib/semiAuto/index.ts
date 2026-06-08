/**
 * Semi-Auto Trading — Barrel export
 *
 * Re-exports all Semi-1 Opening Recommendation types and engine functions.
 */

// Types
export type {
  OpeningRecommendation,
  OpeningRecommendationReport,
  RecommendationStatus,
} from "./openingRecommendationTypes";

// Engine
export {
  buildRecommendationReasons,
  calculateRecommendationScore,
  evaluateRecommendation,
  generateOpeningRecommendations,
} from "./openingRecommendationEngine";
