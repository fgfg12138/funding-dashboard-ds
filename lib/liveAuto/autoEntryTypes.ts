/**
 * Live Auto Entry Types — Live Phase 3
 *
 * Defines data structures for the automated entry pipeline that
 * discovers opportunities, validates risk, builds hedge plans,
 * and executes entry through the Hedge Engine.
 *
 * Pure types — no logic.
 */

import type { HedgePlan, HedgeExecutionResult } from "../hedgeEngine/hedgeEngineTypes";

// ─── Config ──────────────────────────────────────────────

export type LiveAutoEntryConfig = {
  /** Master on/off switch (default false — auto entry disabled). */
  enabled?: boolean;

  /** If true, plan only — never execute (default true). */
  dryRun?: boolean;

  /** Minimum expected net APY percent (default 10). */
  minExpectedNetApy?: number;

  /** Minimum opportunity score (default 60). */
  minOpportunityScore?: number;

  /** Maximum risk level allowed (default "high" — "critical" blocked). */
  maxRiskLevel?: string;

  /** Maximum simultaneously open positions (default 5). */
  maxOpenPositions?: number;

  /** Maximum entry notional per position in USD (default 50,000). */
  maxEntryNotionalUsd?: number;

  /** Allowed exchanges for entry. */
  allowedExchanges?: string[];

  /** Preferred hedge mode. */
  preferredHedgeMode?: "spot_perp" | "perp_perp";

  /** Whether to check risk before entry (default true). */
  requireRiskCheck?: boolean;

  /** Whether to require capital allocation (default true). */
  requireCapitalAllocation?: boolean;
};

// ─── Candidate ──────────────────────────────────────────

export type AutoEntryCandidate = {
  /** Opportunity identifier. */
  opportunityId: string;
  /** Trading pair symbol. */
  symbol: string;
  /** Primary exchange (optional, for perp-perp mode). */
  exchange?: string;
  /** Secondary exchange for perp-perp mode. */
  secondaryExchange?: string;
  /** Expected net APY percent. */
  expectedNetApy: number;
  /** Opportunity score 0–100. */
  opportunityScore: number;
  /** Allocated capital in USD. */
  allocatedCapitalUsd: number;
  /** Portfolio risk level at evaluation time. */
  riskLevel: string;
  /** Current mark price. */
  markPrice: number;
  /** Current funding rate. */
  fundingRate: number;
  /** Human-readable reason for this selection. */
  reason: string;
};

// ─── Result ─────────────────────────────────────────────

export type AutoEntryResultStatus = "blocked" | "planned" | "executed" | "partial" | "failed";

export type AutoEntryResult = {
  /** Whether the operation succeeded overall. */
  success: boolean;
  /** Final status. */
  status: AutoEntryResultStatus;
  /** The candidate that was evaluated. */
  candidate?: AutoEntryCandidate;
  /** The hedge plan that was built (if any). */
  hedgePlan?: HedgePlan;
  /** Result from Hedge Engine execution (if executed). */
  hedgeExecutionResult?: HedgeExecutionResult;
  /** Error messages (empty on success). */
  errors: string[];
  /** Timestamp (ms) when execution completed or was blocked. */
  executedAt?: number;
};

// ─── Report ─────────────────────────────────────────────

export type AutoEntryReport = {
  /** Results for each evaluated candidate. */
  results: AutoEntryResult[];
  /** Count of planned (dry-run) entries. */
  plannedCount: number;
  /** Count of successfully executed entries. */
  executedCount: number;
  /** Count of blocked entries. */
  blockedCount: number;
  /** Count of failed entries. */
  failedCount: number;
  /** Timestamp (ms) when the report was generated. */
  generatedAt: number;
};
