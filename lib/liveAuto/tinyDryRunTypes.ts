/**
 * Tiny Dry Run Types — Binance Mainnet Tiny Semi-Auto Dry Run
 *
 * Defines the report structure for the first real-fund verification dry run.
 * The pipeline runs fully but STOPS before any order execution.
 */

import type { LiveRiskDecision } from "./riskEngineTypes";
import type { KillSwitchDecision } from "./killSwitchTypes";
import type { TinyTradeDecision } from "./tinyTradeGuardTypes";
import type { AutoEntryCandidate } from "./autoEntryTypes";
import type { HedgePlan } from "../hedgeEngine/hedgeEngineTypes";

export type TinyDryRunReport = {
  /** The selected opportunity details. */
  opportunity?: {
    symbol: string;
    fundingRate: number;
    annualizedRate: number;
    netApy: number;
    score: number;
    markPrice: number;
  };
  /** Net APY of the opportunity. */
  netApy: number;
  /** Allocated capital in USD. */
  allocationUsd: number;
  /** Risk engine decision. */
  riskDecision: LiveRiskDecision;
  /** Kill switch decision. */
  killSwitchDecision: KillSwitchDecision;
  /** Tiny trade guard decision. */
  tinyTradeDecision: TinyTradeDecision;
  /** Auto entry candidate generated (if any). */
  entryCandidate?: AutoEntryCandidate;
  /** Hedge plan generated (if any). */
  hedgePlan?: HedgePlan;
  /** Whether the system would execute if allowed. */
  wouldExecute: boolean;
  /** Reasons the execution was blocked (if any). */
  blockedReasons: string[];
  /** Real orders executed (MUST be 0). */
  realOrdersExecuted: number;
  /** POST/PUT/DELETE requests (MUST be 0). */
  postRequests: number;
  /** Timestamp when the report was generated. */
  generatedAt: number;
};
