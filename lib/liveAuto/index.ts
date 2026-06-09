/**
 * Live Auto Entry — Barrel export
 *
 * Re-exports all Live-3 types and engine functions.
 */

// Types
export type {
  AutoEntryCandidate,
  AutoEntryReport,
  AutoEntryResult,
  AutoEntryResultStatus,
  LiveAutoEntryConfig,
} from "./autoEntryTypes";

// Engine
export {
  buildAutoEntryHedgePlan,
  executeAutoEntry,
  generateAutoEntryReport,
  runAutoEntry,
  selectAutoEntryCandidates,
  validateAutoEntryCandidate,
} from "./autoEntryEngine";
