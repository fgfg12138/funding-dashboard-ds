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

// Stability Run (7-Day Long-Term)
export type {
  StabilityCycleResult,
  StabilityRunConfig,
  StabilityRunReport,
  StressScenario,
} from "./stabilityRunTypes";

export {
  runStabilityRun,
} from "./stabilityRunEngine";

// Mainnet Read-Only Shadow Types
export type {
  MainnetShadowReport,
} from "./mainnetReadOnlyShadowTypes";

// Mainnet 24h Shadow Types
export type {
  Mainnet24hShadowReport,
} from "./mainnet24hShadowTypes";

// Mainnet 7-Day Read-Only Shadow Types
export type {
  Mainnet7DayReadOnlyShadowReport,
} from "./mainnet7DayReadOnlyShadowTypes";

// Tiny Trade Guard — Semi-Auto Safety Gate
export type {
  TinyTradeDecision,
  TinyTradeGuardConfig,
  TinyTradeGuardContext,
} from "./tinyTradeGuardTypes";

export {
  evaluateTinyTradeGuard,
} from "./tinyTradeGuardEngine";

// Tiny Dry Run — Semi-Auto Dry Run Planning
export type {
  TinyDryRunReport,
} from "./tinyDryRunTypes";
