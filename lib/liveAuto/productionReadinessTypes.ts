/**
 * Production Readiness Types — Production Readiness Review
 *
 * Defines the report and scenario types for the 10-scenario
 * failure/recovery production readiness test suite.
 */

// ─── Failure Scenario Result ───────────────────────────

export type FailureScenario = {
  /** Human-readable scenario name. */
  name: string;
  /** Whether the system handled the failure correctly. */
  passed: boolean;
  /** Explanation of what was verified. */
  detail: string;
};

// ─── Recovery Result ───────────────────────────────────

export type RecoveryResult = {
  /** Whether recovery was successful. */
  recovered: boolean;
  /** What action was taken to recover. */
  recoveryAction: string;
  /** How long recovery took in ms. */
  durationMs: number;
};

// ─── System Invariant ──────────────────────────────────

export type SystemInvariant = {
  /** Invariant name (e.g. no-orphan-orders). */
  name: string;
  /** Whether the invariant was maintained. */
  maintained: boolean;
  /** Details about the check. */
  detail: string;
};

// ─── Production Readiness Report ───────────────────────

export type ProductionReadinessReport = {
  /** Number of scenarios that passed. */
  scenariosPassed: number;
  /** Number of scenarios that failed. */
  scenariosFailed: number;
  /** Detailed scenario results. */
  scenarioResults: FailureScenario[];
  /** Number of invariants maintained. */
  invariantsMaintained: number;
  /** Orphan orders detected (MUST be 0). */
  orphanOrders: number;
  /** Orphan positions detected (MUST be 0). */
  orphanPositions: number;
  /** Duplicate executions detected (MUST be 0). */
  duplicateExecutions: number;
  /** Whether a risk bypass was detected (MUST be false). */
  riskBypassDetected: boolean;
  /** Whether a kill switch bypass was detected (MUST be false). */
  killSwitchBypassDetected: boolean;
  /** Timestamp when the report was generated. */
  generatedAt: number;
};
