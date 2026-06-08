/**
 * Order Preview Builder — pure function module.
 *
 * Generates an OrderPreview from scoring, estimate, risk gate results.
 * No network calls, no API Key access, no order submission.
 *
 * The preview can be generated even when riskGate blocks the order —
 * in that case `submittable` will be false.
 */

import type { OrderPreview, BuildOrderPreviewInput, OrderPreviewLeg } from "./orderPreviewTypes";
import type { ExecutionLeg } from "../execution/types";

let previewIdCounter = 1;

/** Reset id counter for tests. */
export function resetPreviewIdCounter(): void {
  previewIdCounter = 1;
}

/** Generate a unique preview id. */
function generatePreviewId(): string {
  const id = `preview-${Date.now()}-${previewIdCounter++}`;
  return id;
}

/**
 * Convert an ExecutionLeg (from the engine) into an OrderPreviewLeg.
 */
export function executionLegToPreviewLeg(leg: ExecutionLeg): OrderPreviewLeg {
  return {
    venue: leg.venue,
    marketType: leg.marketType === "perp" ? "perp" : "spot",
    side: leg.side,
    symbol: leg.symbol,
    notionalUsd: leg.notionalUsd,
    estimatedEntryPrice: leg.estimatedEntryPrice,
    reduceOnly: false,
    orderType: "market",
    status: "preview-only",
  };
}

/**
 * Convert multiple ExecutionLegs into OrderPreviewLegs.
 */
export function executionLegsToPreviewLegs(legs: ExecutionLeg[]): OrderPreviewLeg[] {
  return legs.map(executionLegToPreviewLeg);
}

/**
 * Build a complete OrderPreview from all decision-layer inputs.
 *
 * @param input  BuildOrderPreviewInput containing scoring, estimate, riskGate, etc.
 * @returns OrderPreview with mode="preview" and all fields populated.
 */
export function buildOrderPreview(input: BuildOrderPreviewInput): OrderPreview {
  const warnings: string[] = [];

  // Collect warnings from scoring and risk gate
  warnings.push(...input.scoringResult.warnings);
  if (!input.riskGateResult.allowed) {
    warnings.push("风控未通过 — 此预览不可提交");
    warnings.push(...input.riskGateResult.reasonCodes);
  }

  // Note the account risk source
  if (input.accountRiskContextSource === "mock") {
    warnings.push("账户数据来源为 Mock — 不可用于真实交易");
  }

  // Add estimate warnings
  if (input.estimateResult.annualizedNetRate < 0) {
    warnings.push("预估净年化为负值 — 本次套利可能亏损");
  }

  return {
    id: generatePreviewId(),
    mode: "preview",
    sourceExecutionId: input.sourceExecutionId,
    opportunityId: input.opportunityId,
    symbol: input.symbol,
    base: input.base,
    quote: input.quote,
    opportunityType: input.opportunityType,
    strategyName: input.strategyName,
    legs: input.legs,
    estimatedFees: input.estimatedFees,
    estimatedSlippage: input.estimatedSlippage,
    estimatedNetRate: input.estimatedNetRate,
    scoringResult: input.scoringResult,
    riskGateResult: input.riskGateResult,
    estimateResult: input.estimateResult,
    accountRiskContextSource: input.accountRiskContextSource,
    submittable: input.riskGateResult.allowed,
    warnings,
    createdAt: Date.now(),
  };
}
