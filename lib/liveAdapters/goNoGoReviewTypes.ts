/**
 * Go/No-Go Review Types — Phase 6.8
 *
 * Types for the Go/No-Go architecture review assessing readiness
 * to begin real testnet integration. No actual capabilities enabled.
 */

// ─── Decision ────────────────────────────────────────────

export type GoNoGoDecision = "GO" | "NO_GO";

// ─── Review Item ─────────────────────────────────────────

export type GoNoGoReviewItem = {
  id: string;
  domain: string;
  label: string;
  status: "pass" | "blocked" | "not-started";
  required: boolean;
  evidence: string;
  blockingReason?: string;
};

// ─── Review Result ───────────────────────────────────────

export type GoNoGoReviewResult = {
  decision: GoNoGoDecision;
  readyForRealTestnet: boolean;
  total: number;
  pass: number;
  blocked: number;
  notStarted: number;
  requiredBlocked: number;
  items: GoNoGoReviewItem[];
  source: "phase-6-8-go-no-go-review";
};
