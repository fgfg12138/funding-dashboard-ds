/**
 * Risk Engine — Live Phase 6
 *
 * Real-time risk decision engine that evaluates entry/exit permissions,
 * portfolio/capital/reconciliation/execution risks, and aggregates
 * a single risk decision.
 *
 * Pure functions — no side effects.
 */

import type {
  LiveRiskAction,
  LiveRiskCategory,
  LiveRiskContext,
  LiveRiskDecision,
  LiveRiskEngineConfig,
  LiveRiskLevel,
} from "./riskEngineTypes";

// ─── Defaults ────────────────────────────────────────────

const DEFAULTS = {
  blockEntryOnHighRisk: true,
  blockEntryOnCriticalRisk: true,
  blockExitOnCriticalRisk: false,
  allowReduceOnlyOnHighRisk: true,
  maxPortfolioDeltaPercent: 5,
  maxCapitalUtilizationPercent: 90,
  maxOpenPositions: 10,
  maxFailedExecutions: 3,
  requireReconciliationHealthy: true,
};

function resolveConfig(c?: LiveRiskEngineConfig): Required<LiveRiskEngineConfig> {
  return {
    blockEntryOnHighRisk: c?.blockEntryOnHighRisk ?? DEFAULTS.blockEntryOnHighRisk,
    blockEntryOnCriticalRisk: c?.blockEntryOnCriticalRisk ?? DEFAULTS.blockEntryOnCriticalRisk,
    blockExitOnCriticalRisk: c?.blockExitOnCriticalRisk ?? DEFAULTS.blockExitOnCriticalRisk,
    allowReduceOnlyOnHighRisk: c?.allowReduceOnlyOnHighRisk ?? DEFAULTS.allowReduceOnlyOnHighRisk,
    maxPortfolioDeltaPercent: c?.maxPortfolioDeltaPercent ?? DEFAULTS.maxPortfolioDeltaPercent,
    maxCapitalUtilizationPercent: c?.maxCapitalUtilizationPercent ?? DEFAULTS.maxCapitalUtilizationPercent,
    maxOpenPositions: c?.maxOpenPositions ?? DEFAULTS.maxOpenPositions,
    maxFailedExecutions: c?.maxFailedExecutions ?? DEFAULTS.maxFailedExecutions,
    requireReconciliationHealthy: c?.requireReconciliationHealthy ?? DEFAULTS.requireReconciliationHealthy,
  };
}

// ─── Individual Risk Evaluators ──────────────────────────

export function evaluateEntryPermission(
  riskReport: { overallRisk: string },
  config: Required<LiveRiskEngineConfig>,
): { blocked: boolean; level: LiveRiskLevel; reasons: string[] } {
  const reasons: string[] = [];
  const overallRisk = riskReport.overallRisk;

  if (overallRisk === "critical" && config.blockEntryOnCriticalRisk) {
    reasons.push("Critical portfolio risk — entries blocked");
    return { blocked: true, level: "critical", reasons };
  }

  if (overallRisk === "high" && config.blockEntryOnHighRisk) {
    reasons.push("High portfolio risk — entries blocked");
    return { blocked: true, level: "high", reasons };
  }

  return { blocked: false, level: "low", reasons: [] };
}

export function evaluateExitPermission(
  riskReport: { overallRisk: string },
  config: Required<LiveRiskEngineConfig>,
): { blocked: boolean; level: LiveRiskLevel; reasons: string[] } {
  const reasons: string[] = [];

  // Exits are risk-reducing — only block if explicitly configured
  if (riskReport.overallRisk === "critical" && config.blockExitOnCriticalRisk) {
    reasons.push("Critical risk — exits blocked by configuration");
    return { blocked: true, level: "critical", reasons };
  }

  return { blocked: false, level: "low", reasons: [] };
}

export function evaluatePortfolioRisk(
  portfolioReport: { summary: { totalDeltaPercent: number } } | undefined,
  config: Required<LiveRiskEngineConfig>,
): { triggered: boolean; level: LiveRiskLevel; reasons: string[] } {
  const reasons: string[] = [];
  if (!portfolioReport) return { triggered: false, level: "low", reasons: [] };

  const absDelta = Math.abs(portfolioReport.summary.totalDeltaPercent);
  if (absDelta > config.maxPortfolioDeltaPercent) {
    reasons.push(`Portfolio delta ${absDelta.toFixed(1)}% exceeds max ${config.maxPortfolioDeltaPercent}%`);
    return { triggered: true, level: "high", reasons };
  }

  return { triggered: false, level: "low", reasons: [] };
}

export function evaluateCapitalRisk(
  capitalState: { utilizationPercent: number } | undefined,
  config: Required<LiveRiskEngineConfig>,
): { triggered: boolean; level: LiveRiskLevel; reasons: string[] } {
  const reasons: string[] = [];
  if (!capitalState) return { triggered: false, level: "low", reasons: [] };

  if (capitalState.utilizationPercent > config.maxCapitalUtilizationPercent) {
    reasons.push(`Capital utilisation ${capitalState.utilizationPercent.toFixed(1)}% exceeds max ${config.maxCapitalUtilizationPercent}%`);
    return { triggered: true, level: "high", reasons };
  }

  return { triggered: false, level: "low", reasons: [] };
}

export function evaluateReconciliationRisk(
  reconciliationReport: { highSeverityCount: number } | undefined,
  config: Required<LiveRiskEngineConfig>,
): { triggered: boolean; level: LiveRiskLevel; reasons: string[] } {
  const reasons: string[] = [];
  if (!config.requireReconciliationHealthy || !reconciliationReport) {
    return { triggered: false, level: "low", reasons: [] };
  }

  if (reconciliationReport.highSeverityCount > 0) {
    reasons.push(`${reconciliationReport.highSeverityCount} high-severity reconciliation issues — manual review required`);
    return { triggered: true, level: "critical", reasons };
  }

  return { triggered: false, level: "low", reasons: [] };
}

export function evaluateExecutionRisk(
  recentFailedExecutions: number | undefined,
  config: Required<LiveRiskEngineConfig>,
): { triggered: boolean; level: LiveRiskLevel; reasons: string[] } {
  const reasons: string[] = [];
  const failures = recentFailedExecutions ?? 0;

  if (failures > config.maxFailedExecutions) {
    reasons.push(`${failures} recent execution failures exceed max ${config.maxFailedExecutions}`);
    return { triggered: true, level: "high", reasons };
  }

  return { triggered: false, level: "low", reasons: [] };
}

/**
 * Aggregate multiple risk signals into a single action.
 *
 * Priority: require_manual_review > block_entry > block_exit > reduce_only > allow
 */
export function aggregateRiskAction(
  signals: Array<{ action: LiveRiskAction; level: LiveRiskLevel; category: LiveRiskCategory; reasons: string[] }>,
): { action: LiveRiskAction; level: LiveRiskLevel; categories: LiveRiskCategory[]; reasons: string[] } {
  const categories: LiveRiskCategory[] = [];
  const allReasons: string[] = [];
  let highestLevel: LiveRiskLevel = "low";
  let finalAction: LiveRiskAction = "allow";

  const levelOrder: Record<LiveRiskLevel, number> = { low: 0, medium: 1, high: 2, critical: 3 };

  for (const signal of signals) {
    if (signal.reasons.length > 0) {
      categories.push(signal.category);
      allReasons.push(...signal.reasons);
    }

    if (levelOrder[signal.level] > levelOrder[highestLevel]) {
      highestLevel = signal.level;
    }
  }

  // Determine action by priority
  // require_manual_review (critical reconciliation) > block_entry > block_exit > reduce_only > allow
  for (const signal of signals) {
    if (signal.action === "require_manual_review") {
      finalAction = "require_manual_review";
      break;
    }
    if (signal.action === "block_entry") {
      finalAction = "block_entry";
    }
    if (signal.action === "block_exit" && finalAction !== "block_entry") {
      finalAction = "block_exit";
    }
    if (signal.action === "reduce_only" && finalAction === "allow") {
      finalAction = "reduce_only";
    }
  }

  return { action: finalAction, level: highestLevel, categories, reasons: allReasons };
}

// ─── Main Evaluator ──────────────────────────────────────

/**
 * Evaluate all live risk dimensions and return a single risk decision.
 *
 * @param context - Risk evaluation context (reports, states, counters).
 * @param config  - Risk engine configuration.
 * @returns A LiveRiskDecision with action, level, categories, and reasons.
 */
export function evaluateLiveRisk(
  context: LiveRiskContext,
  config?: LiveRiskEngineConfig,
): LiveRiskDecision {
  const cfg = resolveConfig(config);
  const signals: Array<{ action: LiveRiskAction; level: LiveRiskLevel; category: LiveRiskCategory; reasons: string[] }> = [];

  // Entry permission
  const entryResult = evaluateEntryPermission(context.riskReport, cfg);
  if (entryResult.blocked) {
    signals.push({ action: "block_entry", level: entryResult.level, category: "account", reasons: entryResult.reasons });
  }

  // Exit permission
  const exitResult = evaluateExitPermission(context.riskReport, cfg);
  if (exitResult.blocked) {
    signals.push({ action: "block_exit", level: exitResult.level, category: "account", reasons: exitResult.reasons });
  }

  // Reduce-only check
  if (cfg.allowReduceOnlyOnHighRisk && (context.riskReport.overallRisk === "high" || context.riskReport.overallRisk === "critical")) {
    if (!entryResult.blocked) {
      signals.push({ action: "reduce_only", level: context.riskReport.overallRisk === "critical" ? "critical" : "high", category: "account", reasons: [`Portfolio risk is ${context.riskReport.overallRisk} — reduce only mode`] });
    }
  }

  // Portfolio risk
  if (context.portfolioReport) {
    const pr = evaluatePortfolioRisk(context.portfolioReport as any, cfg);
    if (pr.triggered) {
      signals.push({ action: "block_entry", level: pr.level, category: "portfolio", reasons: pr.reasons });
    }
  }

  // Capital risk
  if (context.capitalState) {
    const cr = evaluateCapitalRisk(context.capitalState, cfg);
    if (cr.triggered) {
      signals.push({ action: "block_entry", level: cr.level, category: "capital", reasons: cr.reasons });
    }
  }

  // Open positions
  if (context.openPositionsCount !== undefined && context.openPositionsCount > cfg.maxOpenPositions) {
    signals.push({ action: "block_entry", level: "medium", category: "portfolio", reasons: [`Open positions ${context.openPositionsCount} exceed max ${cfg.maxOpenPositions}`] });
  }

  // Reconciliation risk
  const recResult = evaluateReconciliationRisk(context.reconciliationReport, cfg);
  if (recResult.triggered) {
    signals.push({ action: "require_manual_review", level: recResult.level, category: "reconciliation", reasons: recResult.reasons });
  }

  // Execution risk
  const execResult = evaluateExecutionRisk(context.recentFailedExecutions, cfg);
  if (execResult.triggered) {
    signals.push({ action: "block_entry", level: execResult.level, category: "execution", reasons: execResult.reasons });
  }

  const aggregated = aggregateRiskAction(signals);

  return {
    action: aggregated.action,
    level: aggregated.level,
    categories: aggregated.categories,
    reasons: aggregated.reasons,
    generatedAt: Date.now(),
  };
}
