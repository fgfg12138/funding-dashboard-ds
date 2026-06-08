/**
 * Testnet Readiness Checklist Types — Phase 5.25
 *
 * Defines the readiness check item and result types for evaluating
 * whether the project is ready to enable real testnet trading.
 * No actual capabilities are enabled — this is a pure assessment model.
 */

// ─── Categories ──────────────────────────────────────────

export type TestnetReadinessCategory =
  | "env"
  | "middleware"
  | "secret"
  | "permission"
  | "signing"
  | "adapter"
  | "risk"
  | "audit"
  | "rollback"
  | "ops";

// ─── Item Status ─────────────────────────────────────────

export type TestnetReadinessStatus = "pass" | "fail" | "blocked" | "not-started";

// ─── Checklist Item ──────────────────────────────────────

export type TestnetReadinessCheckItem = {
  id: string;
  category: TestnetReadinessCategory;
  label: string;
  status: TestnetReadinessStatus;
  required: boolean;
  /** Free-form evidence text describing why this status was assigned. */
  evidence: string;
  /** Reason why this item is blocked (only relevant when status=blocked). */
  blockingReason?: string;
};

// ─── Result ──────────────────────────────────────────────

export type TestnetReadinessResult = {
  ready: boolean;
  total: number;
  passed: number;
  failed: number;
  blocked: number;
  notStarted: number;
  requiredBlocked: number;
  items: TestnetReadinessCheckItem[];
  source: "testnet-readiness-checklist";
};
