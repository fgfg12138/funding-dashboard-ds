/**
 * Live Auto — Barrel export
 *
 * Re-exports all Live-3 (Entry) and Live-4 (Exit) types and functions.
 */

// Live-3: Auto Entry
export type {
  AutoEntryCandidate,
  AutoEntryReport,
  AutoEntryResult,
  AutoEntryResultStatus,
  LiveAutoEntryConfig,
} from "./autoEntryTypes";

export {
  buildAutoEntryHedgePlan,
  executeAutoEntry,
  generateAutoEntryReport,
  runAutoEntry,
  selectAutoEntryCandidates,
  validateAutoEntryCandidate,
} from "./autoEntryEngine";

// Live-4: Auto Exit
export type {
  AutoExitCandidate,
  AutoExitReport,
  AutoExitResult,
  AutoExitResultStatus,
  LiveAutoExitConfig,
} from "./autoExitTypes";

export {
  buildAutoExitHedgePlan,
  executeAutoExit,
  generateAutoExitReport,
  runAutoExit,
  selectAutoExitCandidates,
  validateAutoExitCandidate,
} from "./autoExitEngine";
