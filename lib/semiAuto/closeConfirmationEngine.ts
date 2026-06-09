/**
 * Close Confirmation Engine — Semi Phase 5
 *
 * Plans and executes position close after user confirmation.
 * Execution order: perpetual leg first (remove leverage risk) → spot leg.
 * Defaults to dry-run mode — real execution requires explicit opt-in.
 *
 * Pure functions — adapter calls are the only async boundary.
 */

import type { ArbitragePosition } from "../arbitrage/arbitragePositionTypes";
import type { PositionExitSuggestion } from "./exitSuggestionTypes";
import type {
  CloseExecutionAdapter,
  CloseExecutionConfig,
  CloseExecutionPlan,
  CloseExecutionResult,
  CloseLegPlan,
  UserCloseConfirmation,
} from "./closeConfirmationTypes";

// ─── Defaults ────────────────────────────────────────────

const DEFAULTS = {
  requireUserConfirmation: true,
  allowRealExecution: false,
  dryRun: true,
  allowedExchanges: ["Binance"],
  maxCloseNotionalUsd: 100_000,
};

function resolveConfig(c?: CloseExecutionConfig): Required<CloseExecutionConfig> {
  return {
    requireUserConfirmation: c?.requireUserConfirmation ?? DEFAULTS.requireUserConfirmation,
    allowRealExecution: c?.allowRealExecution ?? DEFAULTS.allowRealExecution,
    dryRun: c?.dryRun ?? DEFAULTS.dryRun,
    allowedExchanges: c?.allowedExchanges ?? DEFAULTS.allowedExchanges,
    maxCloseNotionalUsd: c?.maxCloseNotionalUsd ?? DEFAULTS.maxCloseNotionalUsd,
    markPrice: c?.markPrice ?? 0,
  };
}

// ─── Helpers ─────────────────────────────────────────────

/**
 * Reverse a leg side for closing.
 * long → sell, short → buy.
 */
function reverseSide(side: string): "buy" | "sell" {
  if (side === "long" || side === "buy") return "sell";
  return "buy";
}

// ─── Public API ──────────────────────────────────────────

/**
 * Build a close execution plan from a position and its exit suggestion.
 *
 * Generates close plans that reverse each leg:
 *   spot long → sell spot
 *   perpetual short → buy perpetual
 *
 * @param position   - The arbitrage position to close.
 * @param suggestion - The exit suggestion (provides reason).
 * @param config     - Execution config (must include markPrice or legs have prices).
 * @returns A CloseExecutionPlan.
 */
export function buildCloseExecutionPlan(
  position: ArbitragePosition,
  suggestion: PositionExitSuggestion,
  config: CloseExecutionConfig,
): CloseExecutionPlan {
  const cfg = resolveConfig(config);

  // Use markPrice from config or from leg mark prices
  const spotPrice = cfg.markPrice || position.spotLeg.markPrice;
  const perpPrice = cfg.markPrice || position.perpetualLeg.markPrice;

  if (!spotPrice || spotPrice <= 0) {
    throw new Error("Spot mark price is required and must be > 0.");
  }
  if (!perpPrice || perpPrice <= 0) {
    throw new Error("Perpetual mark price is required and must be > 0.");
  }

  const spotClose: CloseLegPlan = {
    exchange: position.spotLeg.exchange,
    symbol: position.spotLeg.symbol,
    marketType: "spot",
    side: reverseSide(position.spotLeg.side),
    quantity: position.spotLeg.quantity,
    estimatedPrice: spotPrice,
    notionalUsd: position.spotLeg.quantity * spotPrice,
  };

  const perpClose: CloseLegPlan = {
    exchange: position.perpetualLeg.exchange,
    symbol: position.perpetualLeg.symbol,
    marketType: "perpetual",
    side: reverseSide(position.perpetualLeg.side),
    quantity: position.perpetualLeg.quantity,
    estimatedPrice: perpPrice,
    notionalUsd: position.perpetualLeg.quantity * perpPrice,
  };

  // Generate close reason from suggestion
  const reasonLabels: Record<string, string> = {
    pnl_target_reached: "Take-profit target reached",
    stop_loss_triggered: "Stop-loss triggered",
    delta_too_high: "Delta exposure exceeded threshold",
    risk_too_high: "Portfolio risk level too high",
    reconciliation_issue: "Position reconciliation issue detected",
    max_holding_time_exceeded: "Maximum holding time exceeded",
    funding_declined: "Funding yield declined",
  };

  const primaryReason = suggestion.reasons[0];
  const reason = primaryReason ? (reasonLabels[primaryReason] ?? `Exit suggested: ${primaryReason}`) : "User requested close";

  return {
    positionId: position.id,
    symbol: position.symbol,
    spotLegClose: spotClose,
    perpetualLegClose: perpClose,
    totalNotionalUsd: spotClose.notionalUsd + perpClose.notionalUsd,
    reason,
    createdAt: Date.now(),
  };
}

/**
 * Validate a close execution plan against all safety checks.
 *
 * Returns an array of error messages. An empty array means the plan is valid.
 */
export function validateCloseExecution(
  plan: CloseExecutionPlan,
  suggestion: PositionExitSuggestion,
  confirmation: UserCloseConfirmation | undefined,
  config: CloseExecutionConfig,
): string[] {
  const errors: string[] = [];
  const cfg = resolveConfig(config);

  // 1. Exit suggestion status must be suggest_exit or urgent_exit
  if (suggestion.status === "hold") {
    errors.push(`Exit suggestion status is "hold", expected "suggest_exit" or "urgent_exit".`);
  }

  // 2. User confirmation
  if (cfg.requireUserConfirmation) {
    if (!confirmation) {
      errors.push("User close confirmation is required but none was provided.");
    } else if (!confirmation.confirmed) {
      errors.push("User did not confirm this close.");
    } else if (confirmation.positionId !== plan.positionId) {
      errors.push("User confirmation positionId does not match the plan.");
    }
  }

  // 3. Notional limit
  if (plan.totalNotionalUsd > cfg.maxCloseNotionalUsd) {
    errors.push(`Total close notional $${plan.totalNotionalUsd.toLocaleString()} exceeds max $${cfg.maxCloseNotionalUsd.toLocaleString()}.`);
  }

  // 4. Allowed exchanges (check both legs)
  const exchanges = [plan.spotLegClose.exchange, plan.perpetualLegClose.exchange];
  for (const exchange of exchanges) {
    if (!cfg.allowedExchanges.some((e) => e.toLowerCase() === exchange.toLowerCase())) {
      errors.push(`Exchange "${exchange}" is not in the allowed exchanges list.`);
    }
  }

  return errors;
}

/**
 * Execute a close after validation.
 *
 * Flow:
 * 1. Build plan from position + suggestion
 * 2. Validate the plan
 * 3. If validation fails, return blocked
 * 4. If dryRun or !allowRealExecution, return planned
 * 5. Otherwise, execute perpetual leg first, then spot leg
 *
 * @param position     - The position to close.
 * @param suggestion   - The exit suggestion.
 * @param confirmation - User close confirmation.
 * @param adapter      - Exchange adapter (only called when !dryRun && allowRealExecution).
 * @param config       - Execution configuration.
 * @returns CloseExecutionResult.
 */
export async function executeClose(
  position: ArbitragePosition,
  suggestion: PositionExitSuggestion,
  confirmation: UserCloseConfirmation | undefined,
  adapter: CloseExecutionAdapter | undefined,
  config?: CloseExecutionConfig,
): Promise<CloseExecutionResult> {
  const cfg = resolveConfig(config);
  const errors: string[] = [];

  // ── 1. Build plan ───────────────────────────────────
  let plan: CloseExecutionPlan;
  try {
    plan = buildCloseExecutionPlan(position, suggestion, cfg);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return {
      positionId: position.id,
      status: "blocked",
      errors: [msg],
    };
  }

  // ── 2. Validate ─────────────────────────────────────
  const validationErrors = validateCloseExecution(plan, suggestion, confirmation, cfg);
  if (validationErrors.length > 0) {
    return {
      positionId: position.id,
      status: "blocked",
      plan,
      errors: validationErrors,
    };
  }

  // ── 3. Dry run / planned mode ──────────────────────
  if (cfg.dryRun || !cfg.allowRealExecution) {
    return {
      positionId: position.id,
      status: "planned",
      plan,
      errors: [],
    };
  }

  // ── 4. Real execution ──────────────────────────────
  if (!adapter) {
    return {
      positionId: position.id,
      status: "blocked",
      plan,
      errors: ["No close execution adapter provided for real execution."],
    };
  }

  const execErrors: string[] = [];

  // Execute perpetual first (remove leverage risk)
  try {
    await adapter.executePerpetualClose(plan.perpetualLegClose);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    execErrors.push(`Perpetual close failed: ${msg}`);
    return {
      positionId: position.id,
      status: "blocked",
      plan,
      errors: execErrors,
    };
  }

  // Then spot
  try {
    await adapter.executeSpotClose(plan.spotLegClose);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    execErrors.push(`Spot close failed (perpetual closed): ${msg}`);
    return {
      positionId: position.id,
      status: "blocked",
      plan,
      errors: execErrors,
    };
  }

  return {
    positionId: position.id,
    status: "executed",
    plan,
    errors: [],
    executedAt: Date.now(),
  };
}
