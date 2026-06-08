/**
 * Phase 6.0 Real Testnet Readiness Review Types
 *
 * Defines the focused review item types for evaluating readiness
 * to begin real testnet integration. No actual capabilities enabled.
 */

// ─── Review Areas ────────────────────────────────────────

export type Phase6ReviewArea =
  | "secret-storage"
  | "permission-verification"
  | "signing-architecture"
  | "middleware-strategy"
  | "kill-switch"
  | "audit-persistence"
  | "rate-limit"
  | "idempotency"
  | "rollback-plan"
  | "exchange-adapter";

// ─── Review Item Status ──────────────────────────────────

export type Phase6ReviewStatus = "pass" | "fail" | "blocked" | "not-started";

// ─── Review Item ─────────────────────────────────────────

export type Phase6ReviewItem = {
  id: string;
  area: Phase6ReviewArea;
  label: string;
  status: Phase6ReviewStatus;
  required: boolean;
  /** What needs to be done for this item to pass. */
  requirement: string;
  /** Current implementation status / evidence. */
  currentState: string;
  /** Gap analysis — what's missing. */
  gap: string;
};

// ─── Review Result ───────────────────────────────────────

export type Phase6ReviewResult = {
  ready: boolean;
  total: number;
  passed: number;
  failed: number;
  blocked: number;
  notStarted: number;
  requiredBlocked: number;
  items: Phase6ReviewItem[];
  summary: Record<Phase6ReviewArea, { total: number; passed: number; blocked: number }>;
  source: "phase-6-readiness-review";
};
