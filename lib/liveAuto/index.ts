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

// Live-5: Capital Manager
export type {
  CapitalDecision,
  CapitalManagerReport,
  CapitalState,
  LiveCapitalManagerConfig,
} from "./capitalManagerTypes";

export {
  applyCompounding,
  calculateAvailableCapital,
  calculateCapitalState,
  generateCapitalDecisions,
  generateCapitalManagerReport,
  validateCapitalDecision,
} from "./capitalManagerEngine";

// Live-6: Risk Engine
export type {
  LiveRiskAction,
  LiveRiskCategory,
  LiveRiskContext,
  LiveRiskDecision,
  LiveRiskEngineConfig,
  LiveRiskLevel,
} from "./riskEngineTypes";

export {
  aggregateRiskAction,
  evaluateCapitalRisk,
  evaluateEntryPermission,
  evaluateExecutionRisk,
  evaluateExitPermission,
  evaluateLiveRisk,
  evaluatePortfolioRisk,
  evaluateReconciliationRisk,
} from "./riskEngine";

// Live-7: Kill Switch
export type {
  KillSwitchAction,
  KillSwitchConfig,
  KillSwitchDecision,
  KillSwitchRequestedAction,
  KillSwitchState,
  KillSwitchStatus,
  KillSwitchTriggerReason,
} from "./killSwitchTypes";

export {
  applyKillSwitchState,
  canExecuteAction,
  createInitialKillSwitchState,
  evaluateKillSwitch,
  lockKillSwitch,
  unlockKillSwitch,
} from "./killSwitchEngine";

// Shadow Run
export type {
  ShadowRunConfig,
  ShadowRunCycleResult,
  ShadowRunReport,
} from "./shadowRunTypes";

export {
  runShadowRun,
} from "./shadowRunEngine";
