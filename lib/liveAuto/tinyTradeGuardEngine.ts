/**
 * Tiny Trade Guard Engine — Tiny Semi-Auto Planning
 *
 * Evaluates 10 safety rules before allowing any real trade on Mainnet.
 *
 * Rules:
 *   1. allowRealExecution  — default false
 *   2. requireManualConfirmation — user must confirm
 *   3. maxCapitalUsd <= 100
 *   4. maxOpenPositions <= 1
 *   5. Risk Engine — not critical
 *   6. Kill Switch — not locked / not blocked
 *   7. Account Sync — last sync succeeded
 *   8. Position Reconciliation — no mismatches
 *   9. Balance Check — sufficient funds
 *  10. API Permission Check — trade permission exists
 */

import type {
  TinyTradeDecision,
  TinyTradeGuardConfig,
  TinyTradeGuardContext,
} from "./tinyTradeGuardTypes";

export function evaluateTinyTradeGuard(
  config: TinyTradeGuardConfig,
  context: TinyTradeGuardContext,
): TinyTradeDecision {
  const reasons: string[] = [];

  // ── Rule 1: allowRealExecution ────────────────────
  const allowRealExecutionPassed = config.allowRealExecution === true;
  if (!allowRealExecutionPassed) {
    reasons.push("Real execution is not enabled (allowRealExecution=false)");
  }

  // ── Rule 2: Manual Confirmation ───────────────────
  const confirmationPassed = !config.requireManualConfirmation || context.hasManualConfirmation;
  if (!confirmationPassed) {
    reasons.push("Manual confirmation required but not provided");
  }

  // ── Rule 3: Capital Limit ─────────────────────────
  const capitalLimit = context.currentCapitalUsd <= config.maxCapitalUsd;
  if (!capitalLimit) {
    reasons.push(
      `Capital $${context.currentCapitalUsd} exceeds max $${config.maxCapitalUsd}`,
    );
  }

  // ── Rule 4: Position Limit ────────────────────────
  const positionLimit = context.currentOpenPositions <= config.maxOpenPositions;
  if (!positionLimit) {
    reasons.push(
      `Open positions ${context.currentOpenPositions} exceeds max ${config.maxOpenPositions}`,
    );
  }

  // ── Rule 5: Risk Engine ───────────────────────────
  const riskPassed = context.riskDecision.level !== "critical"
    && context.riskDecision.action !== "block_entry"
    && context.riskDecision.action !== "block_all";
  if (!riskPassed) {
    reasons.push(
      `Risk engine blocked: ${context.riskDecision.action} (level=${context.riskDecision.level})`,
    );
  }

  // ── Rule 6: Kill Switch ───────────────────────────
  const killSwitchPassed = context.killSwitchDecision.allowed === true
    && context.killSwitchDecision.action !== "block_all"
    && context.killSwitchDecision.action !== "block_entry";
  if (!killSwitchPassed) {
    reasons.push(
      `Kill switch blocked: ${context.killSwitchDecision.action}`,
    );
  }

  // ── Rule 7: Account Sync ──────────────────────────
  const accountSyncPassed = context.accountSyncSuccess === true;
  if (!accountSyncPassed) {
    reasons.push("Account sync failed or not completed");
  }

  // ── Rule 8: Position Reconciliation ───────────────
  const reconciliationPassed = !context.reconciliationHasMismatches;
  if (!reconciliationPassed) {
    reasons.push("Position reconciliation has unresolved mismatches");
  }

  // ── Rule 9: Balance Check ─────────────────────────
  const balancePassed = context.availableBalanceUsd >= config.maxPositionUsd;
  if (!balancePassed) {
    reasons.push(
      `Available balance $${context.availableBalanceUsd} is below ` +
      `minimum $${config.maxPositionUsd} for a position`,
    );
  }

  // ── Rule 10: API Permission Check ─────────────────
  const permissionPassed = context.apiHasTradePermission === true;
  if (!permissionPassed) {
    reasons.push("API key does not have trade permission");
  }

  return {
    allowed: reasons.length === 0,
    reasons,
    capitalLimit,
    positionLimit,
    riskPassed,
    killSwitchPassed,
    balancePassed,
    permissionPassed,
    reconciliationPassed,
    confirmationPassed,
    accountSyncPassed,
    generatedAt: Date.now(),
  };
}
