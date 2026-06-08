import { describe, expect, it } from "vitest";
import type { PaperExecution } from "../execution/types";
import type { ScoreResult } from "../opportunity/scoring";
import { DEFAULT_RISK_GATE_CONFIG, evaluateRiskGate, type RiskGateInput } from "./riskGate";

// ─── Mock helpers ───────────────────────────────────────

function makeScoreResult(overrides: Partial<ScoreResult> = {}): ScoreResult {
  return {
    score: 75,
    grade: "B",
    riskLevel: "low",
    reasonCodes: [],
    warnings: [],
    components: { returnScore: 80, costScore: 70, liquidityScore: 75, riskPenalty: 5, confidenceScore: 80 },
    ...overrides,
  };
}

function makeEstimateResult(overrides: { annualizedNetRate?: number } = {}) {
  return {
    grossReturn: 2,
    fees: 0.5,
    slippage: 0.25,
    netReturn: 1.25,
    netRate: 0.00125,
    annualizedNetRate: overrides.annualizedNetRate ?? 15,
    holdingHours: 8,
  };
}

function makeOpenExecution(overrides: Partial<PaperExecution> = {}): PaperExecution {
  return {
    id: "paper-existing",
    opportunityId: "opp-existing",
    opportunityType: "cross-exchange",
    symbol: "BTC/USDT",
    base: "BTC",
    quote: "USDT",
    mode: "paper",
    status: "opened",
    legs: [{ id: "leg", venue: "Binance", marketType: "perp", side: "short", symbol: "BTC/USDT", notionalUsd: 1000, estimatedEntryPrice: 0, estimatedFee: 1, estimatedSlippage: 0.5 }],
    sideDescription: "Short Binance / Long OKX",
    exchanges: ["Binance"],
    estimatedAnnualizedRate: 20,
    estimatedFundingRate: 0.001,
    estimatedFees: 1,
    estimatedSlippage: 0.5,
    estimatedNetRate: 15,
    riskTags: [],
    createdAt: 1_700_000_000_000,
    updatedAt: 1_700_000_000_000,
    openedAt: 1_700_000_000_000,
    closedAt: null,
    closeReason: null,
    ...overrides,
  };
}

function makeInput(overrides: Partial<RiskGateInput> = {}): RiskGateInput {
  return {
    symbol: "ETH/USDT",
    riskTags: [],
    notionalUsd: 1000,
    scoringResult: makeScoreResult(),
    estimateResult: makeEstimateResult(),
    openExecutions: [],
    ...overrides,
  };
}

describe("evaluateRiskGate", () => {
  it("passes a healthy opportunity with no open executions", () => {
    const result = evaluateRiskGate(makeInput());
    expect(result.allowed).toBe(true);
    expect(result.severity).toBe("info");
    expect(result.checks).toHaveLength(7);
    expect(result.checks.every((c) => c.passed)).toBe(true);
  });

  it("blocks when score is below minScore", () => {
    const result = evaluateRiskGate(makeInput({
      scoringResult: makeScoreResult({ score: 30 }),
    }));
    expect(result.allowed).toBe(false);
    expect(result.severity).toBe("blocked");
    expect(result.checks[0].passed).toBe(false);
    expect(result.checks[0].name).toBe("scoreCheck");
  });

  it("blocks when risk level is higher than maxRiskLevel", () => {
    const result = evaluateRiskGate(makeInput({
      scoringResult: makeScoreResult({ riskLevel: "high" }),
    }));
    expect(result.allowed).toBe(false);
    expect(result.checks[1].passed).toBe(false);
    expect(result.checks[1].name).toBe("riskLevelCheck");
  });

  it("blocks when annualized net rate is below minAnnualizedNetRate", () => {
    const result = evaluateRiskGate(makeInput({
      estimateResult: makeEstimateResult({ annualizedNetRate: 2 }),
    }));
    expect(result.allowed).toBe(false);
    expect(result.checks[2].passed).toBe(false);
    expect(result.checks[2].name).toBe("netRateCheck");
  });

  it("blocks when open execution count reaches maxOpenExecutions", () => {
    const openExes = Array.from({ length: 10 }, (_, i) =>
      makeOpenExecution({ id: `paper-${i}`, symbol: `SYM${i}/USDT` }),
    );
    const result = evaluateRiskGate(makeInput({ openExecutions: openExes }));
    expect(result.allowed).toBe(false);
    expect(result.checks[3].passed).toBe(false);
    expect(result.checks[3].name).toBe("openCountCheck");
  });

  it("blocks when total notional would exceed maxOpenNotionalUsd", () => {
    const openExes = Array.from({ length: 5 }, () =>
      makeOpenExecution({ symbol: "ETH/USDT" }), // each has legs of 1000
    );
    const result = evaluateRiskGate(makeInput({
      openExecutions: openExes,
      notionalUsd: 200_000, // 5*1000 + 200000 = 205000 > 100000
    }));
    expect(result.allowed).toBe(false);
    expect(result.checks[4].passed).toBe(false);
    expect(result.checks[4].name).toBe("totalExposureCheck");
  });

  it("blocks when single-symbol exposure exceeds maxSymbolExposureUsd", () => {
    const openExes = Array.from({ length: 25 }, () =>
      makeOpenExecution({ symbol: "ETH/USDT" }), // each 1000 → 25000 > 20000
    );
    const result = evaluateRiskGate(makeInput({
      symbol: "ETH/USDT",
      openExecutions: openExes,
    }));
    expect(result.allowed).toBe(false);
    expect(result.checks[5].passed).toBe(false);
    expect(result.checks[5].name).toBe("symbolExposureCheck");
  });

  it("blocks when risk tags match blocked tags", () => {
    const result = evaluateRiskGate(makeInput({
      riskTags: ["low-liquidity"],
    }));
    expect(result.allowed).toBe(false);
    expect(result.checks[6].passed).toBe(false);
    expect(result.checks[6].name).toBe("blockedTagsCheck");
  });

  it("does not block for unknown risk tags", () => {
    const result = evaluateRiskGate(makeInput({
      riskTags: ["普通风险"],
    }));
    expect(result.allowed).toBe(true);
    expect(result.checks[6].passed).toBe(true);
  });

  it("produces warning severity when close to threshold", () => {
    // Score just above the threshold
    const result = evaluateRiskGate(makeInput({
      scoringResult: makeScoreResult({ score: 55 }), // > 50 but < 65
    }));
    expect(result.allowed).toBe(true);
    expect(result.severity).toBe("warning");
  });

  it("passes with empty open executions", () => {
    const result = evaluateRiskGate(makeInput({ openExecutions: [] }));
    expect(result.allowed).toBe(true);
  });

  it("allows open count just under maxOpenExecutions", () => {
    const openExes = Array.from({ length: 9 }, (_, i) =>
      makeOpenExecution({ id: `paper-${i}`, symbol: `SYM${i}/USDT` }),
    );
    const result = evaluateRiskGate(makeInput({ openExecutions: openExes }));
    expect(result.allowed).toBe(true);
    expect(result.checks[3].passed).toBe(true);
  });

  it("reasonCodes contains BLOCKED prefix when blocked", () => {
    const result = evaluateRiskGate(makeInput({
      scoringResult: makeScoreResult({ score: 20 }),
    }));
    expect(result.reasonCodes[0]).toContain("BLOCKED");
  });

  it("reasonCodes contains PASS prefix when all clear", () => {
    const result = evaluateRiskGate(makeInput());
    expect(result.reasonCodes[0]).toContain("PASS");
  });
});

// ─── Account Risk Context Tests ──────────────────────────

const mockAccountRiskCtx = {
  source: "mock" as const,
  totalUsdValue: 100_000,
  availableUsdBalance: 25_000,
  totalPositionExposureUsd: 30_000,
  symbolExposureUsdBySymbol: { "BTC/USDT": 15_000 },
  exchangeExposureUsd: { Binance: 30_000 },
  warnings: [],
};

describe("evaluateRiskGate with accountRiskContext", () => {
  it("passes when includeAccountSnapshotRisk=false (default)", () => {
    const result = evaluateRiskGate(makeInput({
      config: { includeAccountSnapshotRisk: true },
    }));
    // Missing context → warning, not blocked
    expect(result.allowed).toBe(true);
    expect(result.severity).toBe("warning");
  });

  it("blocks when total account exposure exceeds maxAccountExposurePercent", () => {
    // 30_000 / 100_000 = 30% ≤ 50%, so should pass
    const result = evaluateRiskGate(makeInput({
      config: { includeAccountSnapshotRisk: true, maxAccountExposurePercent: 0.2 },
      accountRiskContext: { ...mockAccountRiskCtx, totalPositionExposureUsd: 80_000 },
    }));
    expect(result.allowed).toBe(false);
    const check = result.checks.find((c) => c.name === "accountTotalExposureCheck");
    expect(check).toBeDefined();
    expect(check!.passed).toBe(false);
  });

  it("blocks when symbol exposure exceeds maxSymbolAccountExposurePercent", () => {
    // Adding $30K → 15K existing + 1K new = 16K / 100K = 16% ≤ 20%
    // Use a very low threshold to trigger block
    const result = evaluateRiskGate(makeInput({
      symbol: "BTC/USDT",
      config: { includeAccountSnapshotRisk: true, maxSymbolAccountExposurePercent: 0.1 },
      accountRiskContext: { ...mockAccountRiskCtx, symbolExposureUsdBySymbol: { "BTC/USDT": 15_000 } },
      notionalUsd: 1000,
    }));
    // 15K + 1K = 16K / 100K = 16% > 10% → blocked
    expect(result.allowed).toBe(false);
    const check = result.checks.find((c) => c.name === "accountSymbolExposureCheck");
    expect(check).toBeDefined();
    expect(check!.passed).toBe(false);
  });

  it("blocks when available USDT balance is too low", () => {
    const result = evaluateRiskGate(makeInput({
      config: { includeAccountSnapshotRisk: true, minAvailableUsdBalance: 50_000 },
      accountRiskContext: { ...mockAccountRiskCtx, availableUsdBalance: 1000 },
    }));
    expect(result.allowed).toBe(false);
    const check = result.checks.find((c) => c.name === "accountBalanceCheck");
    expect(check).toBeDefined();
    expect(check!.passed).toBe(false);
  });

  it("blocks when account source is not 'mock'", () => {
    const result = evaluateRiskGate(makeInput({
      config: { includeAccountSnapshotRisk: true },
      accountRiskContext: { ...mockAccountRiskCtx, source: "live" as any },
    }));
    expect(result.allowed).toBe(false);
    const check = result.checks.find((c) => c.name === "accountSnapshotSourceCheck");
    expect(check).toBeDefined();
    expect(check!.passed).toBe(false);
  });

  it("produces ACCOUNT_RISK reason codes when blocked", () => {
    const result = evaluateRiskGate(makeInput({
      config: { includeAccountSnapshotRisk: true, minAvailableUsdBalance: 50_000 },
      accountRiskContext: { ...mockAccountRiskCtx, availableUsdBalance: 500 },
    }));
    expect(result.reasonCodes.some((r) => r.includes("ACCOUNT_RISK"))).toBe(true);
  });

  it("produces warning when accountRiskContext is missing", () => {
    const result = evaluateRiskGate(makeInput({
      config: { includeAccountSnapshotRisk: true },
    }));
    expect(result.allowed).toBe(true);
    expect(result.severity).toBe("warning");
    const check = result.checks.find((c) => c.name === "accountSnapshotCheck");
    expect(check).toBeDefined();
    expect(check!.severity).toBe("warning");
  });
});
