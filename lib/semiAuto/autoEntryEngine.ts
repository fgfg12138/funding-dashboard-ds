/**
 * Auto Entry Engine — Semi Phase 2
 *
 * Plans and executes spot + perpetual entry orders after user confirmation.
 * Defaults to dry-run mode — real execution requires explicit opt-in.
 *
 * Pure functions — adapter calls are the only async boundary.
 */

import type { OpeningRecommendation } from "./openingRecommendationTypes";
import type { RiskReport } from "../riskMonitoring/riskMonitoringTypes";
import type {
  EntryExecutionAdapter,
  EntryExecutionPlan,
  EntryExecutionResult,
  ExecutionConfig,
  UserConfirmation,
} from "./autoEntryTypes";

// ─── Defaults ────────────────────────────────────────────

const DEFAULTS = {
  allowRealExecution: false,
  requireUserConfirmation: true,
  maxNotionalUsd: 50_000,
  allowedExchanges: ["Binance"],
  dryRun: true,
};

function resolveConfig(c?: ExecutionConfig): Required<ExecutionConfig> {
  return {
    allowRealExecution: c?.allowRealExecution ?? DEFAULTS.allowRealExecution,
    requireUserConfirmation: c?.requireUserConfirmation ?? DEFAULTS.requireUserConfirmation,
    maxNotionalUsd: c?.maxNotionalUsd ?? DEFAULTS.maxNotionalUsd,
    allowedExchanges: c?.allowedExchanges ?? DEFAULTS.allowedExchanges,
    dryRun: c?.dryRun ?? DEFAULTS.dryRun,
    markPrice: c?.markPrice ?? 0,
  };
}

// ─── Public API ──────────────────────────────────────────

/**
 * Build an entry execution plan from a recommendation and current mark price.
 *
 * spotLeg: buy spot at market price
 * perpetualLeg: sell perpetual at market price
 * quantity = allocatedCapitalUsd / markPrice
 *
 * @param recommendation - A recommended opening opportunity.
 * @param config         - Execution config (must include markPrice).
 * @returns An EntryExecutionPlan.
 * @throws If markPrice is missing or <= 0.
 */
export function buildEntryExecutionPlan(
  recommendation: OpeningRecommendation,
  config: ExecutionConfig,
): EntryExecutionPlan {
  const cfg = resolveConfig(config);

  if (!cfg.markPrice || cfg.markPrice <= 0) {
    throw new Error("Mark price is required and must be > 0 to build execution plan.");
  }

  const quantity = recommendation.allocatedCapitalUsd / cfg.markPrice;
  const spotNotional = quantity * cfg.markPrice;
  const perpNotional = quantity * cfg.markPrice;

  return {
    recommendationId: recommendation.id,
    symbol: recommendation.symbol,
    spotLeg: {
      exchange: recommendation.exchange,
      symbol: recommendation.symbol,
      marketType: "spot",
      side: "buy",
      quantity,
      estimatedPrice: cfg.markPrice,
      notionalUsd: spotNotional,
    },
    perpetualLeg: {
      exchange: recommendation.exchange,
      symbol: recommendation.symbol,
      marketType: "perpetual",
      side: "sell",
      quantity,
      estimatedPrice: cfg.markPrice,
      notionalUsd: perpNotional,
    },
    totalNotionalUsd: spotNotional + perpNotional,
    expectedNetApy: recommendation.expectedNetApy,
    riskLevel: recommendation.riskLevel,
    createdAt: Date.now(),
  };
}

/**
 * Validate an execution plan against all safety checks.
 *
 * Returns an array of error messages. An empty array means the plan is valid.
 */
export function validateEntryExecution(
  plan: EntryExecutionPlan,
  recommendation: OpeningRecommendation,
  confirmation: UserConfirmation | undefined,
  riskReport: RiskReport,
  config: ExecutionConfig,
): string[] {
  const errors: string[] = [];
  const cfg = resolveConfig(config);

  // 1. Recommendation status must be recommended
  if (recommendation.status !== "recommended") {
    errors.push(`Recommendation status is "${recommendation.status}", expected "recommended".`);
  }

  // 2. User confirmation check
  if (cfg.requireUserConfirmation) {
    if (!confirmation) {
      errors.push("User confirmation is required but none was provided.");
    } else if (!confirmation.confirmed) {
      errors.push("User did not confirm this recommendation.");
    } else if (confirmation.recommendationId !== plan.recommendationId) {
      errors.push("User confirmation recommendationId does not match the plan.");
    }
  }

  // 3. Risk check
  if (riskReport.overallRisk === "critical") {
    errors.push("Cannot execute: portfolio risk is critical.");
  }

  // 4. Notional limit
  if (plan.totalNotionalUsd > cfg.maxNotionalUsd) {
    errors.push(`Total notional $${plan.totalNotionalUsd.toLocaleString()} exceeds max $${cfg.maxNotionalUsd.toLocaleString()}.`);
  }

  // 5. Allowed exchanges
  const exchange = plan.spotLeg.exchange;
  if (!cfg.allowedExchanges.some((e) => e.toLowerCase() === exchange.toLowerCase())) {
    errors.push(`Exchange "${exchange}" is not in the allowed exchanges list.`);
  }

  return errors;
}

/**
 * Execute an entry after validation.
 *
 * Flow:
 * 1. Build plan from recommendation
 * 2. Validate the plan
 * 3. If validation fails, return blocked
 * 4. If dryRun or !allowRealExecution, return planned
 * 5. Otherwise, execute spot leg first, then perpetual leg
 *
 * @param recommendation - The opening recommendation.
 * @param confirmation   - User confirmation (required when requireUserConfirmation=true).
 * @param riskReport     - Current risk report.
 * @param adapter        - Exchange adapter (only called when !dryRun && allowRealExecution).
 * @param config         - Execution configuration.
 * @returns EntryExecutionResult.
 */
export async function executeEntry(
  recommendation: OpeningRecommendation,
  confirmation: UserConfirmation | undefined,
  riskReport: RiskReport,
  adapter: EntryExecutionAdapter | undefined,
  config?: ExecutionConfig,
): Promise<EntryExecutionResult> {
  const cfg = resolveConfig(config);
  const errors: string[] = [];

  // ── 1. Build plan ───────────────────────────────────
  let plan: EntryExecutionPlan;
  try {
    plan = buildEntryExecutionPlan(recommendation, cfg);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return {
      recommendationId: recommendation.id,
      status: "blocked",
      errors: [msg],
    };
  }

  // ── 2. Validate ─────────────────────────────────────
  const validationErrors = validateEntryExecution(plan, recommendation, confirmation, riskReport, cfg);
  if (validationErrors.length > 0) {
    return {
      recommendationId: recommendation.id,
      status: "blocked",
      plan,
      errors: validationErrors,
    };
  }

  // ── 3. Dry run / planned mode ──────────────────────
  if (cfg.dryRun || !cfg.allowRealExecution) {
    return {
      recommendationId: recommendation.id,
      status: "planned",
      plan,
      errors: [],
    };
  }

  // ── 4. Real execution ──────────────────────────────
  if (!adapter) {
    return {
      recommendationId: recommendation.id,
      status: "blocked",
      plan,
      errors: ["No execution adapter provided for real execution."],
    };
  }

  const execErrors: string[] = [];

  // Execute spot first
  try {
    await adapter.executeSpotLeg(plan.spotLeg);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    execErrors.push(`Spot leg execution failed: ${msg}`);
    return {
      recommendationId: recommendation.id,
      status: "blocked",
      plan,
      errors: execErrors,
    };
  }

  // Then perpetual
  try {
    await adapter.executePerpetualLeg(plan.perpetualLeg);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    execErrors.push(`Perpetual leg execution failed (spot succeeded): ${msg}`);
    return {
      recommendationId: recommendation.id,
      status: "blocked",
      plan,
      errors: execErrors,
    };
  }

  return {
    recommendationId: recommendation.id,
    status: "executed",
    plan,
    errors: [],
    executedAt: Date.now(),
  };
}
