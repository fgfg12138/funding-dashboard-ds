/**
 * Live Auto Entry Engine — Live Phase 3
 *
 * Orchestrates the automated entry pipeline:
 *   select candidates → validate → build hedge plan → execute via Hedge Engine
 *
 * Reuses: Alpha-6 Capital Allocation, Beta-5 Risk, Live-2 Hedge Engine, Live-1 Order Router.
 * Does NOT hardcode any exchange name.
 *
 * Pure functions — Hedge Engine calls are the only async boundary.
 */

import { buildSpotPerpHedgePlan, buildPerpPerpSpreadHedgePlan, executeHedgePlan } from "../hedgeEngine/hedgeEngine";
import type { HedgePlan, HedgePlanStatus } from "../hedgeEngine/hedgeEngineTypes";
import type { RiskReport } from "../riskMonitoring/riskMonitoringTypes";
import type {
  AutoEntryCandidate,
  LiveAutoEntryConfig,
  AutoEntryReport,
  AutoEntryResult,
  AutoEntryResultStatus,
} from "./autoEntryTypes";

// ─── Defaults ────────────────────────────────────────────

const DEFAULTS = {
  enabled: false,
  dryRun: true,
  minExpectedNetApy: 10,
  minOpportunityScore: 60,
  maxRiskLevel: "high",
  maxOpenPositions: 5,
  maxEntryNotionalUsd: 50_000,
  allowedExchanges: [] as string[],
  preferredHedgeMode: "spot_perp" as const,
  requireRiskCheck: true,
  requireCapitalAllocation: true,
};

function resolveConfig(c?: LiveAutoEntryConfig): Required<LiveAutoEntryConfig> {
  return {
    enabled: c?.enabled ?? DEFAULTS.enabled,
    dryRun: c?.dryRun ?? DEFAULTS.dryRun,
    minExpectedNetApy: c?.minExpectedNetApy ?? DEFAULTS.minExpectedNetApy,
    minOpportunityScore: c?.minOpportunityScore ?? DEFAULTS.minOpportunityScore,
    maxRiskLevel: c?.maxRiskLevel ?? DEFAULTS.maxRiskLevel,
    maxOpenPositions: c?.maxOpenPositions ?? DEFAULTS.maxOpenPositions,
    maxEntryNotionalUsd: c?.maxEntryNotionalUsd ?? DEFAULTS.maxEntryNotionalUsd,
    allowedExchanges: c?.allowedExchanges ?? DEFAULTS.allowedExchanges,
    preferredHedgeMode: c?.preferredHedgeMode ?? DEFAULTS.preferredHedgeMode,
    requireRiskCheck: c?.requireRiskCheck ?? DEFAULTS.requireRiskCheck,
    requireCapitalAllocation: c?.requireCapitalAllocation ?? DEFAULTS.requireCapitalAllocation,
  };
}

// ─── Risk Level Severity Map ─────────────────────────────

const RISK_ORDER: Record<string, number> = {
  low: 0,
  medium: 1,
  high: 2,
  critical: 3,
};

/**
 * Check whether a risk level exceeds the maximum allowed.
 */
function riskExceedsMax(riskLevel: string, maxRiskLevel: string): boolean {
  const riskScore = RISK_ORDER[riskLevel] ?? 999;
  const maxScore = RISK_ORDER[maxRiskLevel] ?? 0;
  return riskScore > maxScore;
}

// ─── Public API ──────────────────────────────────────────

/**
 * Select candidates eligible for auto entry from a list of opportunities.
 *
 * Each opportunity is checked against the config. Returns only those
 * that pass all filters.
 */
export function selectAutoEntryCandidates(
  opportunities: AutoEntryCandidate[],
  currentOpenCount: number,
  config: LiveAutoEntryConfig,
): AutoEntryCandidate[] {
  const cfg = resolveConfig(config);

  return opportunities.filter((opp) => {
    // Must be enabled
    if (!cfg.enabled) return false;

    // Net APY check
    if (opp.expectedNetApy < cfg.minExpectedNetApy) return false;

    // Score check
    if (opp.opportunityScore < cfg.minOpportunityScore) return false;

    // Capital check
    if (cfg.requireCapitalAllocation && opp.allocatedCapitalUsd <= 0) return false;

    // Mark price check
    if (!opp.markPrice || opp.markPrice <= 0) return false;

    // Risk check
    if (cfg.requireRiskCheck && riskExceedsMax(opp.riskLevel, cfg.maxRiskLevel)) return false;

    // Max open positions check
    if (currentOpenCount >= cfg.maxOpenPositions) return false;

    // Max notional check
    if (opp.allocatedCapitalUsd > cfg.maxEntryNotionalUsd) return false;

    // Exchange check — depends on hedge mode
    if (cfg.preferredHedgeMode === "spot_perp") {
      if (!opp.exchange) return false;
      if (cfg.allowedExchanges.length > 0 && !cfg.allowedExchanges.includes(opp.exchange)) return false;
    } else {
      // perp_perp: both exchanges must be allowed
      if (!opp.exchange || !opp.secondaryExchange) return false;
      if (cfg.allowedExchanges.length > 0) {
        if (!cfg.allowedExchanges.includes(opp.exchange)) return false;
        if (!cfg.allowedExchanges.includes(opp.secondaryExchange)) return false;
      }
    }

    return true;
  });
}

/**
 * Validate a single candidate against the config.
 * Returns an array of error messages (empty = valid).
 */
export function validateAutoEntryCandidate(
  candidate: AutoEntryCandidate,
  currentOpenCount: number,
  config: LiveAutoEntryConfig,
): string[] {
  const errors: string[] = [];
  const cfg = resolveConfig(config);

  if (!cfg.enabled) {
    errors.push("Auto entry is disabled.");
  }
  if (candidate.expectedNetApy < cfg.minExpectedNetApy) {
    errors.push(`Expected net APY ${candidate.expectedNetApy}% < min ${cfg.minExpectedNetApy}%.`);
  }
  if (candidate.opportunityScore < cfg.minOpportunityScore) {
    errors.push(`Opportunity score ${candidate.opportunityScore} < min ${cfg.minOpportunityScore}.`);
  }
  if (cfg.requireCapitalAllocation && candidate.allocatedCapitalUsd <= 0) {
    errors.push("Capital allocation is zero.");
  }
  if (!candidate.markPrice || candidate.markPrice <= 0) {
    errors.push("Mark price is missing or invalid.");
  }
  if (cfg.requireRiskCheck && riskExceedsMax(candidate.riskLevel, cfg.maxRiskLevel)) {
    errors.push(`Risk level ${candidate.riskLevel} exceeds max ${cfg.maxRiskLevel}.`);
  }
  if (currentOpenCount >= cfg.maxOpenPositions) {
    errors.push(`Open positions ${currentOpenCount} >= max ${cfg.maxOpenPositions}.`);
  }
  if (candidate.allocatedCapitalUsd > cfg.maxEntryNotionalUsd) {
    errors.push(`Allocated capital $${candidate.allocatedCapitalUsd} exceeds max $${cfg.maxEntryNotionalUsd}.`);
  }
  if (cfg.preferredHedgeMode === "spot_perp") {
    if (!candidate.exchange) {
      errors.push("Exchange is required for spot-perp hedge mode.");
    } else if (cfg.allowedExchanges.length > 0 && !cfg.allowedExchanges.includes(candidate.exchange)) {
      errors.push(`Exchange ${candidate.exchange} is not in allowed list.`);
    }
  } else {
    if (!candidate.exchange || !candidate.secondaryExchange) {
      errors.push("Both exchanges are required for perp-perp hedge mode.");
    } else if (cfg.allowedExchanges.length > 0) {
      if (!cfg.allowedExchanges.includes(candidate.exchange)) {
        errors.push(`Exchange ${candidate.exchange} is not in allowed list.`);
      }
      if (!cfg.allowedExchanges.includes(candidate.secondaryExchange)) {
        errors.push(`Secondary exchange ${candidate.secondaryExchange} is not in allowed list.`);
      }
    }
  }

  return errors;
}

/**
 * Build a hedge plan for a validated candidate.
 */
export function buildAutoEntryHedgePlan(
  candidate: AutoEntryCandidate,
  config: LiveAutoEntryConfig,
): HedgePlan {
  const cfg = resolveConfig(config);

  if (cfg.preferredHedgeMode === "perp_perp") {
    return buildPerpPerpSpreadHedgePlan(
      candidate.symbol,
      candidate.exchange!,
      candidate.secondaryExchange!,
      candidate.allocatedCapitalUsd,
      candidate.markPrice,
    );
  }

  // Default: spot_perp
  return buildSpotPerpHedgePlan(
    candidate.symbol,
    candidate.exchange!,
    candidate.exchange!,
    candidate.allocatedCapitalUsd,
    candidate.markPrice,
  );
}

/**
 * Execute auto entry for a single candidate.
 *
 * Steps:
 * 1. Validate the candidate
 * 2. If validation fails, return blocked
 * 3. Build hedge plan
 * 4. If dryRun, return planned with the plan
 * 5. Otherwise, execute through Hedge Engine
 */
export async function executeAutoEntry(
  candidate: AutoEntryCandidate,
  currentOpenCount: number,
  config: LiveAutoEntryConfig,
): Promise<AutoEntryResult> {
  const cfg = resolveConfig(config);

  // 1. Validate
  const validationErrors = validateAutoEntryCandidate(candidate, currentOpenCount, cfg);
  if (validationErrors.length > 0) {
    return {
      success: false,
      status: "blocked",
      candidate,
      errors: validationErrors,
    };
  }

  // 2. Build hedge plan
  let hedgePlan: HedgePlan;
  try {
    hedgePlan = buildAutoEntryHedgePlan(candidate, cfg);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return {
      success: false,
      status: "failed",
      candidate,
      errors: [`Failed to build hedge plan: ${msg}`],
    };
  }

  // 3. Dry run
  if (cfg.dryRun) {
    return {
      success: true,
      status: "planned",
      candidate,
      hedgePlan,
      errors: [],
    };
  }

  // 4. Execute through Hedge Engine
  const hedgeResult = await executeHedgePlan(hedgePlan, {
    dryRun: false,
    allowPartialExecution: false,
  });

  const statusMap: Record<HedgePlanStatus, AutoEntryResultStatus> = {
    planned: "planned",
    executed: "executed",
    failed: "failed",
    partial: "partial",
  };

  return {
    success: hedgeResult.errors.length === 0,
    status: statusMap[hedgeResult.status] ?? "failed",
    candidate,
    hedgePlan,
    hedgeExecutionResult: hedgeResult,
    errors: hedgeResult.errors,
    executedAt: hedgeResult.executedAt,
  };
}

/**
 * Run the full auto entry pipeline for a set of candidates.
 *
 * @param candidates      - Candidate opportunities to evaluate.
 * @param currentOpenCount - Number of currently open positions.
 * @param config           - Auto entry configuration.
 * @returns AutoEntryReport with per-candidate results.
 */
export async function runAutoEntry(
  candidates: AutoEntryCandidate[],
  currentOpenCount: number,
  config: LiveAutoEntryConfig,
): Promise<AutoEntryReport> {
  const cfg = resolveConfig(config);

  // Select eligible candidates
  const eligible = selectAutoEntryCandidates(candidates, currentOpenCount, cfg);

  // If disabled, mark all as blocked
  if (!cfg.enabled) {
    const results: AutoEntryResult[] = candidates.map((c) => ({
      success: false,
      status: "blocked",
      candidate: c,
      errors: ["Auto entry is disabled."],
    }));

    return generateAutoEntryReport(results);
  }

  // Execute for each eligible candidate
  const results: AutoEntryResult[] = [];

  for (const candidate of eligible) {
    const result = await executeAutoEntry(candidate, currentOpenCount + results.filter((r) => r.status === "executed").length, cfg);
    results.push(result);
  }

  return generateAutoEntryReport(results);
}

/**
 * Generate a report from a list of AutoEntryResults.
 */
export function generateAutoEntryReport(results: AutoEntryResult[]): AutoEntryReport {
  let plannedCount = 0;
  let executedCount = 0;
  let blockedCount = 0;
  let failedCount = 0;

  for (const r of results) {
    switch (r.status) {
      case "planned": plannedCount++; break;
      case "executed": executedCount++; break;
      case "blocked": blockedCount++; break;
      case "partial":
      case "failed": failedCount++; break;
    }
  }

  return {
    results,
    plannedCount,
    executedCount,
    blockedCount,
    failedCount,
    generatedAt: Date.now(),
  };
}
