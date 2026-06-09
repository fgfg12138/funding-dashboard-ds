/**
 * Auto Exit Engine — Live Phase 4
 *
 * Orchestrates the automated exit pipeline:
 *   evaluate positions → detect exit signals → validate → build close hedge plan → execute
 *
 * Reuses: Alpha-5 Exit Engine, Semi-4 Exit Suggestion, Live-2 Hedge Engine, Live-1 Order Router.
 * Does NOT hardcode any exchange name.
 *
 * Pure functions — Hedge Engine calls are the only async boundary.
 */

import type { ArbitragePosition } from "../arbitrage/arbitragePositionTypes";
import { generateExitSuggestions } from "../semiAuto/exitSuggestionEngine";
import type { PositionExitSuggestion } from "../semiAuto/exitSuggestionTypes";
import { executeHedgePlan } from "../hedgeEngine/hedgeEngine";
import type { HedgeLegPlan, HedgePlan, HedgePlanStatus } from "../hedgeEngine/hedgeEngineTypes";
import type { RiskReport } from "../riskMonitoring/riskMonitoringTypes";
import type {
  AutoExitCandidate,
  LiveAutoExitConfig,
  AutoExitReport,
  AutoExitResult,
  AutoExitResultStatus,
} from "./autoExitTypes";

// ─── Defaults ────────────────────────────────────────────

const DEFAULTS = {
  enabled: false,
  dryRun: true,
  maxHoldingHours: 48,
  minNetApyPercent: 10,
  maxDeltaPercent: 3,
  takeProfitUsd: 500,
  stopLossUsd: 500,
  allowUrgentExit: true,
  allowedExchanges: [] as string[],
  maxExitNotionalUsd: 100_000,
  requireRiskCheck: true,
};

function resolveConfig(c?: LiveAutoExitConfig): Required<LiveAutoExitConfig> {
  return {
    enabled: c?.enabled ?? DEFAULTS.enabled,
    dryRun: c?.dryRun ?? DEFAULTS.dryRun,
    maxHoldingHours: c?.maxHoldingHours ?? DEFAULTS.maxHoldingHours,
    minNetApyPercent: c?.minNetApyPercent ?? DEFAULTS.minNetApyPercent,
    maxDeltaPercent: c?.maxDeltaPercent ?? DEFAULTS.maxDeltaPercent,
    takeProfitUsd: c?.takeProfitUsd ?? DEFAULTS.takeProfitUsd,
    stopLossUsd: c?.stopLossUsd ?? DEFAULTS.stopLossUsd,
    allowUrgentExit: c?.allowUrgentExit ?? DEFAULTS.allowUrgentExit,
    allowedExchanges: c?.allowedExchanges ?? DEFAULTS.allowedExchanges,
    maxExitNotionalUsd: c?.maxExitNotionalUsd ?? DEFAULTS.maxExitNotionalUsd,
    requireRiskCheck: c?.requireRiskCheck ?? DEFAULTS.requireRiskCheck,
  };
}

let _seq = 0;
function nextId(): string {
  _seq += 1;
  return `exit-${String(_seq).padStart(6, "0")}`;
}

function reverseSide(side: string): "long" | "short" {
  return side === "long" ? "short" : "long";
}

// ─── Public API ──────────────────────────────────────────

/**
 * Select candidates eligible for auto exit from a list of open positions.
 *
 * Uses Semi-4 Exit Suggestion engine to determine exit signals.
 */
export function selectAutoExitCandidates(
  positions: ArbitragePosition[],
  currentTime: number,
  config: LiveAutoExitConfig,
): AutoExitCandidate[] {
  const cfg = resolveConfig(config);

  if (!cfg.enabled) return [];

  // Generate exit suggestions using Semi-4 engine
  const suggestionReport = generateExitSuggestions(
    positions,
    undefined,
    undefined,
    currentTime,
    {
      maxHoldingHours: cfg.maxHoldingHours,
      maxDeltaPercent: cfg.maxDeltaPercent,
      takeProfitUsd: cfg.takeProfitUsd,
      stopLossUsd: cfg.stopLossUsd,
    },
  );

  return suggestionReport.suggestions
    .filter((s) => s.status === "suggest_exit" || s.status === "urgent_exit")
    .map((s) => ({
      positionId: s.positionId,
      symbol: s.symbol,
      suggestionStatus: s.status,
      totalPnlUsd: s.totalPnlUsd,
      fundingCollectedUsd: s.fundingCollectedUsd,
      deltaPercent: positions.find((p) => p.id === s.positionId)?.deltaPercent ?? 0,
      currentNetApy: undefined,
      riskLevel: undefined,
      reason: s.message,
    }));
}

/**
 * Validate an auto exit candidate against the config.
 * Returns an array of error messages (empty = valid).
 */
export function validateAutoExitCandidate(
  candidate: AutoExitCandidate,
  position: ArbitragePosition | undefined,
  config: LiveAutoExitConfig,
): string[] {
  const errors: string[] = [];
  const cfg = resolveConfig(config);

  if (!cfg.enabled) {
    errors.push("Auto exit is disabled.");
  }

  if (!position || position.status !== "open") {
    errors.push("Position is not open.");
    return errors; // early return — no point checking further
  }

  // Suggestion status check
  if (candidate.suggestionStatus === "hold") {
    errors.push("Exit suggestion status is hold — no exit signal.");
  }

  // Urgent exit guard
  if (candidate.suggestionStatus === "urgent_exit" && !cfg.allowUrgentExit) {
    errors.push("Urgent exit is not allowed by configuration.");
  }

  // Exchange check — both legs must be in allowed list
  const spotEx = position.spotLeg.exchange.toLowerCase();
  const perpEx = position.perpetualLeg.exchange.toLowerCase();
  if (cfg.allowedExchanges.length > 0) {
    if (!cfg.allowedExchanges.some((e) => e.toLowerCase() === spotEx)) {
      errors.push(`Spot exchange ${spotEx} is not in allowed list.`);
    }
    if (!cfg.allowedExchanges.some((e) => e.toLowerCase() === perpEx)) {
      errors.push(`Perpetual exchange ${perpEx} is not in allowed list.`);
    }
  }

  // Notional limit
  const totalNotional = Math.abs(position.spotLeg.notionalUsd) + Math.abs(position.perpetualLeg.notionalUsd);
  if (totalNotional > cfg.maxExitNotionalUsd) {
    errors.push(`Total close notional $${totalNotional.toLocaleString()} exceeds max $${cfg.maxExitNotionalUsd.toLocaleString()}.`);
  }

  // Risk check — exit is a risk-reducing action, so warn but don't block
  if (cfg.requireRiskCheck && candidate.riskLevel === "critical") {
    errors.push("Warning: exiting during critical risk level.");
  }

  return errors;
}

/**
 * Build a close hedge plan from an open position.
 *
 * Reverses each leg:
 *   spot long → sell spot (reverse side → "short")
 *   perpetual short → buy perpetual (reverse side → "long")
 *
 * Execution order in Hedge Engine: perpetual first, then spot.
 */
export function buildAutoExitHedgePlan(
  position: ArbitragePosition,
): HedgePlan {
  const price = position.perpetualLeg.markPrice || position.spotLeg.markPrice;

  // Build reverse legs
  const legs: HedgeLegPlan[] = [];

  // Perpetual leg close (priority 1 — closes first to remove leverage risk)
  legs.push({
    exchange: position.perpetualLeg.exchange.toLowerCase(),
    symbol: position.perpetualLeg.symbol,
    legType: "perpetual",
    side: reverseSide(position.perpetualLeg.side),
    quantity: position.perpetualLeg.quantity,
    price,
    notionalUsd: position.perpetualLeg.notionalUsd,
    executionPriority: 1,
  });

  // Spot leg close (priority 2 — closes second)
  legs.push({
    exchange: position.spotLeg.exchange.toLowerCase(),
    symbol: position.spotLeg.symbol,
    legType: "spot",
    side: reverseSide(position.spotLeg.side),
    quantity: position.spotLeg.quantity,
    price,
    notionalUsd: position.spotLeg.notionalUsd,
    executionPriority: 2,
  });

  // Calculate delta
  const delta = legs.reduce((sum, leg) => sum + (leg.side === "long" ? leg.notionalUsd : -leg.notionalUsd), 0);
  const maxLeg = Math.max(...legs.map((l) => l.notionalUsd));
  const deltaPercent = maxLeg > 0 ? (delta / maxLeg) * 100 : 0;

  return {
    id: nextId(),
    symbol: position.symbol,
    legs,
    targetDeltaUsd: 0,
    expectedDeltaUsd: delta,
    expectedDeltaPercent: deltaPercent,
    status: "planned",
    createdAt: Date.now(),
  };
}

/**
 * Execute auto exit for a single position.
 *
 * Steps:
 * 1. Find the position
 * 2. Validate against config
 * 3. Build close hedge plan
 * 4. If dryRun, return planned with the plan
 * 5. Otherwise, execute through Hedge Engine
 */
export async function executeAutoExit(
  position: ArbitragePosition | undefined,
  candidate: AutoExitCandidate,
  config: LiveAutoExitConfig,
): Promise<AutoExitResult> {
  const cfg = resolveConfig(config);

  // 1. Validate
  const validationErrors = validateAutoExitCandidate(candidate, position, cfg);
  if (validationErrors.length > 0) {
    return {
      success: false,
      status: "blocked",
      candidate,
      errors: validationErrors,
    };
  }

  if (!position) {
    return {
      success: false,
      status: "failed",
      candidate,
      errors: ["Position not found."],
    };
  }

  // 2. Build close hedge plan
  const hedgePlan = buildAutoExitHedgePlan(position);

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

  const statusMap: Record<HedgePlanStatus, AutoExitResultStatus> = {
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
 * Run the full auto exit pipeline for a set of open positions.
 *
 * @param positions    - Open arbitrage positions.
 * @param currentTime  - Current simulated time (ms).
 * @param config       - Auto exit configuration.
 * @returns AutoExitReport with per-position results.
 */
export async function runAutoExit(
  positions: ArbitragePosition[],
  currentTime: number,
  config: LiveAutoExitConfig,
): Promise<AutoExitReport> {
  const cfg = resolveConfig(config);

  // Select eligible candidates
  const candidates = selectAutoExitCandidates(positions, currentTime, cfg);

  // If disabled, return empty report
  if (!cfg.enabled) {
    const results: AutoExitResult[] = positions.map((pos) => ({
      success: false,
      status: "blocked",
      candidate: {
        positionId: pos.id,
        symbol: pos.symbol,
        suggestionStatus: "hold",
        totalPnlUsd: pos.totalPnlUsd,
        fundingCollectedUsd: pos.fundingCollectedUsd,
        deltaPercent: pos.deltaPercent,
        reason: "Auto exit is disabled.",
      },
      errors: ["Auto exit is disabled."],
    }));

    return generateAutoExitReport(results);
  }

  // Execute for each eligible candidate
  const results: AutoExitResult[] = [];

  for (const candidate of candidates) {
    const position = positions.find((p) => p.id === candidate.positionId);
    const result = await executeAutoExit(position, candidate, cfg);
    results.push(result);
  }

  return generateAutoExitReport(results);
}

/**
 * Generate a report from a list of AutoExitResults.
 */
export function generateAutoExitReport(results: AutoExitResult[]): AutoExitReport {
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
