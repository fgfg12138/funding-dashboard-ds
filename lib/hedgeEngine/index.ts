/**
 * Hedge Engine — Barrel export
 *
 * Re-exports all Live-2 types and functions.
 */

// Types
export type {
  HedgeEngineConfig,
  HedgeExecutionResult,
  HedgeLegPlan,
  HedgeLegType,
  HedgePlan,
  HedgePlanStatus,
  HedgeSide,
} from "./hedgeEngineTypes";

// Engine
export {
  buildPerpPerpSpreadHedgePlan,
  buildSpotPerpHedgePlan,
  calculateHedgeDelta,
  executeHedgePlan,
  validateHedgePlan,
} from "./hedgeEngine";
