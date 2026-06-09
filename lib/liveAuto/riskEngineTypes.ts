/**
 * Risk Engine Types — Live Phase 6
 *
 * Defines data structures for real-time risk decisions: entry/exit
 * permissions, portfolio/capital/reconciliation/execution risk checks.
 *
 * Pure types — no logic.
 */

import type { RiskReport } from "../riskMonitoring/riskMonitoringTypes";
import type { PositionReconciliationReport } from "../positionReconciliation/positionReconciliationTypes";
import type { PortfolioReport } from "../arbitrage/portfolioTypes";
import type { CapitalState } from "./capitalManagerTypes";

// ─── Basic enums ─────────────────────────────────────────

export type LiveRiskLevel = "low" | "medium" | "high" | "critical";

export type LiveRiskAction = "allow" | "block_entry" | "block_exit" | "reduce_only" | "require_manual_review";

export type LiveRiskCategory = "account" | "portfolio" | "capital" | "reconciliation" | "execution" | "market" | "system";

// ─── Decision ────────────────────────────────────────────

export type LiveRiskDecision = {
  /** Recommended action. */
  action: LiveRiskAction;
  /** Aggregated risk level. */
  level: LiveRiskLevel;
  /** Risk categories that were triggered. */
  categories: LiveRiskCategory[];
  /** Human-readable reasons. */
  reasons: string[];
  /** Timestamp (ms) when the decision was made. */
  generatedAt: number;
};

// ─── Config ──────────────────────────────────────────────

export type LiveRiskEngineConfig = {
  /** Block new entries when overallRisk is "high" (default true). */
  blockEntryOnHighRisk?: boolean;
  /** Block new entries when overallRisk is "critical" (default true). */
  blockEntryOnCriticalRisk?: boolean;
  /** Block exits when overallRisk is "critical" (default false — exits are risk-reducing). */
  blockExitOnCriticalRisk?: boolean;
  /** Allow reduce-only mode on high/critical risk (default true). */
  allowReduceOnlyOnHighRisk?: boolean;
  /** Maximum absolute portfolio delta percent (default 5). */
  maxPortfolioDeltaPercent?: number;
  /** Maximum capital utilisation percent (default 90). */
  maxCapitalUtilizationPercent?: number;
  /** Maximum number of open positions (default 10). */
  maxOpenPositions?: number;
  /** Maximum failed executions before blocking (default 3). */
  maxFailedExecutions?: number;
  /** Require reconciliation health check (default true). */
  requireReconciliationHealthy?: boolean;
};

// ─── Context ─────────────────────────────────────────────

export type LiveRiskContext = {
  /** Beta-5 risk report (required). */
  riskReport: RiskReport;
  /** Beta-4 reconciliation report (optional). */
  reconciliationReport?: PositionReconciliationReport;
  /** Alpha-7 portfolio report (optional). */
  portfolioReport?: PortfolioReport;
  /** Live-5 capital state (optional). */
  capitalState?: CapitalState;
  /** Number of currently open positions. */
  openPositionsCount?: number;
  /** Number of recent execution failures. */
  recentFailedExecutions?: number;
};
