import { describe, expect, it, beforeEach } from "vitest";
import type { ExecutionLeg } from "../execution/types";
import type { ScoreResult } from "../opportunity/scoring";
import type { RiskGateResult } from "../risk/riskGate";
import type { ExecutionEstimateResult } from "../execution/types";
import type { BuildOrderPreviewInput } from "./orderPreviewTypes";
import {
  buildOrderPreview,
  executionLegToPreviewLeg,
  executionLegsToPreviewLegs,
  resetPreviewIdCounter,
} from "./orderPreviewBuilder";

function makeScoreResult(overrides: Partial<ScoreResult> = {}): ScoreResult {
  return {
    score: 82,
    grade: "B",
    riskLevel: "low",
    reasonCodes: [],
    warnings: [],
    components: { returnScore: 85, costScore: 70, liquidityScore: 80, riskPenalty: 5, confidenceScore: 85 },
    ...overrides,
  };
}

function makeRiskGateResult(overrides: Partial<RiskGateResult> = {}): RiskGateResult {
  return {
    allowed: true,
    severity: "info",
    reasonCodes: ["PASS: 所有风控检查通过"],
    messages: [],
    checks: [],
    ...overrides,
  };
}

function makeEstimateResult(overrides: Partial<ExecutionEstimateResult> = {}): ExecutionEstimateResult {
  return {
    grossReturn: 2.5,
    fees: 1.0,
    slippage: 0.5,
    netReturn: 1.0,
    netRate: 0.001,
    annualizedNetRate: 12.5,
    holdingHours: 8,
    ...overrides,
  };
}

const sampleLegs: ExecutionLeg[] = [
  { id: "leg-1", venue: "Binance", marketType: "perp", side: "short", symbol: "BTC/USDT", notionalUsd: 500, estimatedEntryPrice: 68_000, estimatedFee: 0.5, estimatedSlippage: 0.25 },
  { id: "leg-2", venue: "OKX", marketType: "perp", side: "long", symbol: "BTC/USDT", notionalUsd: 500, estimatedEntryPrice: 67_900, estimatedFee: 0.5, estimatedSlippage: 0.25 },
];

function makeInput(overrides: Partial<BuildOrderPreviewInput> = {}): BuildOrderPreviewInput {
  return {
    opportunityId: "opp-1",
    symbol: "BTC/USDT",
    base: "BTC",
    quote: "USDT",
    opportunityType: "cross-exchange",
    strategyName: "Balanced Funding",
    legs: executionLegsToPreviewLegs(sampleLegs),
    estimatedFees: 1.0,
    estimatedSlippage: 0.5,
    estimatedNetRate: 18.0,
    scoringResult: makeScoreResult(),
    riskGateResult: makeRiskGateResult(),
    estimateResult: makeEstimateResult(),
    accountRiskContextSource: "mock",
    ...overrides,
  };
}

beforeEach(() => {
  resetPreviewIdCounter();
});

describe("buildOrderPreview", () => {
  it("creates a preview with correct basic fields", () => {
    const preview = buildOrderPreview(makeInput());

    expect(preview.mode).toBe("preview");
    expect(preview.id).toMatch(/^preview-/);
    expect(preview.symbol).toBe("BTC/USDT");
    expect(preview.opportunityType).toBe("cross-exchange");
    expect(preview.strategyName).toBe("Balanced Funding");
    expect(preview.submittable).toBe(true);
    expect(preview.createdAt).toBeGreaterThan(0);
  });

  it("sets submittable=false when riskGate blocks", () => {
    const blockedGate = makeRiskGateResult({
      allowed: false,
      severity: "blocked",
      reasonCodes: ["BLOCKED: 评分过低"],
    });

    const preview = buildOrderPreview(makeInput({ riskGateResult: blockedGate }));
    expect(preview.submittable).toBe(false);
  });

  it("includes warnings from scoring", () => {
    const scoringWithWarnings = makeScoreResult({
      warnings: ["异常高收益 (150.0%)，请核实数据源"],
    });

    const preview = buildOrderPreview(makeInput({ scoringResult: scoringWithWarnings }));
    expect(preview.warnings.some((w) => w.includes("异常高收益"))).toBe(true);
  });

  it("includes blocked risk gate warnings", () => {
    const blockedGate = makeRiskGateResult({
      allowed: false,
      severity: "blocked",
      reasonCodes: ["BLOCKED: 开仓数已达上限"],
    });

    const preview = buildOrderPreview(makeInput({ riskGateResult: blockedGate }));
    expect(preview.warnings.some((w) => w.includes("风控未通过"))).toBe(true);
  });

  it("warns about mock account source", () => {
    const preview = buildOrderPreview(makeInput({ accountRiskContextSource: "mock" }));
    expect(preview.warnings.some((w) => w.includes("Mock"))).toBe(true);
  });

  it("warns about negative net rate", () => {
    const estimate = makeEstimateResult({ annualizedNetRate: -5.2 });
    const preview = buildOrderPreview(makeInput({ estimateResult: estimate }));
    expect(preview.warnings.some((w) => w.includes("亏损"))).toBe(true);
  });

  it("builds preview legs with correct fields", () => {
    const preview = buildOrderPreview(makeInput());
    expect(preview.legs).toHaveLength(2);
    for (const leg of preview.legs) {
      expect(leg.status).toBe("preview-only");
      expect(leg.orderType).toBe("market");
      expect(typeof leg.reduceOnly).toBe("boolean");
      expect(leg.venue).toBeTruthy();
    }
  });

  it("does not create a preview with live order fields", () => {
    const preview = buildOrderPreview(makeInput());
    // Ensure no live-order-specific fields exist
    expect(preview).not.toHaveProperty("exchangeOrderId");
    expect(preview).not.toHaveProperty("submittedAt");
    expect(preview).not.toHaveProperty("filledAt");
    expect(preview).not.toHaveProperty("status");
  });
});

describe("executionLegToPreviewLeg", () => {
  it("converts a short perp leg with reduceOnly=false (preview only)", () => {
    const leg: ExecutionLeg = {
      id: "leg-x", venue: "Binance", marketType: "perp", side: "short",
      symbol: "BTC/USDT", notionalUsd: 1000, estimatedEntryPrice: 68_000,
      estimatedFee: 1, estimatedSlippage: 0.5,
    };
    const previewLeg = executionLegToPreviewLeg(leg);
    expect(previewLeg.venue).toBe("Binance");
    expect(previewLeg.side).toBe("short");
    expect(previewLeg.reduceOnly).toBe(false); // preview opening legs are not reduce-only
    expect(previewLeg.orderType).toBe("market");
    expect(previewLeg.status).toBe("preview-only");
  });

  it("converts a buy spot leg with reduceOnly=false", () => {
    const leg: ExecutionLeg = {
      id: "leg-y", venue: "Bybit", marketType: "spot", side: "buy",
      symbol: "ETH/USDT", notionalUsd: 500, estimatedEntryPrice: 3_200,
      estimatedFee: 0.5, estimatedSlippage: 0.25,
    };
    const previewLeg = executionLegToPreviewLeg(leg);
    expect(previewLeg.reduceOnly).toBe(false);
    expect(previewLeg.marketType).toBe("spot");
  });
});

describe("executionLegsToPreviewLegs", () => {
  it("converts multiple legs", () => {
    const previewLegs = executionLegsToPreviewLegs(sampleLegs);
    expect(previewLegs).toHaveLength(2);
    expect(previewLegs[0].venue).toBe("Binance");
    expect(previewLegs[1].venue).toBe("OKX");
  });
});
