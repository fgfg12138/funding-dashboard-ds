/**
 * NO-GO Remediation Types — Phase 6.9
 *
 * Types for the NO-GO remediation plan — a roadmap of what needs
 * to be done before a GO decision can be reconsidered.
 * No actual capabilities are enabled.
 */

// ─── Priority ────────────────────────────────────────────

export type NoGoPriority = "critical" | "high" | "medium";

// ─── Status ──────────────────────────────────────────────

export type NoGoItemStatus = "planned" | "blocked" | "not-started";

// ─── Remediation Item ────────────────────────────────────

export type NoGoRemediationItem = {
  id: string;
  domain: string;
  blockerId: string;
  title: string;
  status: NoGoItemStatus;
  priority: NoGoPriority;
  dependsOn: string[];
  allowedPhase: string;
  forbiddenActions: string[];
  acceptanceCriteria: string[];
  riskLevel: "high" | "critical";
};

// ─── Remediation Plan ────────────────────────────────────

export type NoGoRemediationPlan = {
  decision: "NO_GO";
  readyAfterPlan: false;
  total: number;
  critical: number;
  high: number;
  medium: number;
  items: NoGoRemediationItem[];
  source: "phase-6-9-no-go-remediation-plan";
};
