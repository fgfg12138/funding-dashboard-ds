/**
 * Tiny Trade Guard Types — Tiny Semi-Auto Planning
 *
 * Defines the safety gate configuration and decision types
 * for the first real-fund verification on Binance Mainnet.
 *
 * Capital limits: maxCapitalUsd=100, maxPositionUsd=50, maxOpenPositions=1.
 */

import type { LiveRiskDecision } from "./riskEngineTypes";
import type { KillSwitchDecision } from "./killSwitchTypes";

// ─── Config ─────────────────────────────────────────────

export type TinyTradeGuardConfig = {
  /** Whether real execution is allowed (default: false). */
  allowRealExecution: boolean;
  /** Whether manual user confirmation is required (default: true). */
  requireManualConfirmation: boolean;
  /** Maximum total capital in USD (hard limit: 100). */
  maxCapitalUsd: number;
  /** Maximum single position size in USD (hard limit: 50). */
  maxPositionUsd: number;
  /** Maximum number of open positions (hard limit: 1). */
  maxOpenPositions: number;
};

// ─── Decision ───────────────────────────────────────────

export type TinyTradeDecision = {
  /** Whether the trade is allowed. */
  allowed: boolean;
  /** Reasons why the trade was blocked (empty if allowed). */
  reasons: string[];
  /** Capital limit check. */
  capitalLimit: boolean;
  /** Position limit check. */
  positionLimit: boolean;
  /** Risk engine check result. */
  riskPassed: boolean;
  /** Kill switch check result. */
  killSwitchPassed: boolean;
  /** Balance sufficiency check. */
  balancePassed: boolean;
  /** API permission check result. */
  permissionPassed: boolean;
  /** Position reconciliation check result. */
  reconciliationPassed: boolean;
  /** Manual confirmation check result. */
  confirmationPassed: boolean;
  /** Account sync check result. */
  accountSyncPassed: boolean;
  /** Timestamp. */
  generatedAt: number;
};

// ─── Context ────────────────────────────────────────────

export type TinyTradeGuardContext = {
  /** Current total capital in USD. */
  currentCapitalUsd: number;
  /** Current number of open positions. */
  currentOpenPositions: number;
  /** Current available balance in USD. */
  availableBalanceUsd: number;
  /** Risk engine decision. */
  riskDecision: LiveRiskDecision;
  /** Kill switch decision. */
  killSwitchDecision: KillSwitchDecision;
  /** Whether the last account sync succeeded. */
  accountSyncSuccess: boolean;
  /** Whether position reconciliation has mismatches. */
  reconciliationHasMismatches: boolean;
  /** Whether the API key has trade permission. */
  apiHasTradePermission: boolean;
  /** Whether manual confirmation was provided. */
  hasManualConfirmation: boolean;
};

// ─── Defaults ───────────────────────────────────────────

export const DEFAULT_TINY_TRADE_GUARD_CONFIG: TinyTradeGuardConfig = {
  allowRealExecution: false,
  requireManualConfirmation: true,
  maxCapitalUsd: 100,
  maxPositionUsd: 50,
  maxOpenPositions: 1,
};
