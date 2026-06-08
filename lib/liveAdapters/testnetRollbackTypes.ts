/**
 * Testnet Rollback Types — Phase 6.5 Design Only
 *
 * Types for evaluating rollback readiness and planning rollback actions.
 * No real cancellation, no exchange API calls, no signing.
 */

// ─── Order Status ────────────────────────────────────────

export type TestnetRollbackOrderStatus =
  | "submitted"
  | "filled"
  | "partial"
  | "cancelled"
  | "failed"
  | "unknown";

// ─── Rollback Action ─────────────────────────────────────

export type TestnetRollbackAction =
  | "cancel-order-planned"
  | "mark-failed-planned"
  | "freeze-further-submissions"
  | "reconciliation-required"
  | "notify-operator";

// ─── Policy Input ────────────────────────────────────────

export type TestnetRollbackPolicyInput = {
  exchangeId: string;
  environment: string;
  orderStatus: TestnetRollbackOrderStatus;
  killSwitchEnabled: boolean;
  auditPersistenceReady: boolean;
  operatorConfirmed: boolean;
  phase: "6.5-rollback-design";
};

// ─── Policy Result ───────────────────────────────────────

export type TestnetRollbackPolicyResult = {
  allowedToRollback: boolean;
  severity: "blocked" | "warning" | "info";
  reasonCodes: string[];
  actions: TestnetRollbackAction[];
  messages: string[];
  source: "testnet-rollback-plan-design";
};
