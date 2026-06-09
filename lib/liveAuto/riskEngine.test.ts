/**
 * Risk Engine Tests — Live Phase 6
 *
 * Acceptance criteria:
 *   riskReport.overallRisk = high
 *   capitalState.utilizationPercent = 95
 *   portfolio.totalDeltaPercent = 5
 *   config: blockEntryOnHighRisk=true, maxCapitalUtil=90, maxPortfolioDelta=3
 *   → action=block_entry, level=high, categories=[account,capital,portfolio]
 */

import { describe, expect, it } from "vitest";
import {
  aggregateRiskAction,
  evaluateCapitalRisk,
  evaluateEntryPermission,
  evaluateExecutionRisk,
  evaluateExitPermission,
  evaluateLiveRisk,
  evaluatePortfolioRisk,
  evaluateReconciliationRisk,
} from "./riskEngine";
import type { LiveRiskContext, LiveRiskEngineConfig } from "./riskEngineTypes";

// ─── Helpers ─────────────────────────────────────────────

function makeContext(overrides?: Partial<LiveRiskContext>): LiveRiskContext {
  return {
    riskReport: { events: [], lowCount: 0, mediumCount: 0, highCount: 0, criticalCount: 0, overallRisk: "low", generatedAt: Date.now() },
    reconciliationReport: { items: [], matchedCount: 0, mismatchCount: 0, highSeverityCount: 0, generatedAt: Date.now() },
    portfolioReport: { summary: { totalAllocatedCapitalUsd: 0, totalNotionalUsd: 0, totalFundingCollectedUsd: 0, totalTradingPnlUsd: 0, totalPnlUsd: 0, portfolioApyPercent: 0, capitalUtilizationPercent: 0, totalDeltaUsd: 0, totalDeltaPercent: 0, openPositionCount: 0, closedPositionCount: 0, positionCount: 0, generatedAt: Date.now() }, contributions: [] },
    capitalState: { totalCapitalUsd: 100000, reserveUsd: 10000, deployedCapitalUsd: 50000, availableCapitalUsd: 40000, unrealizedPnlUsd: 0, realizedPnlUsd: 0, fundingCollectedUsd: 0, utilizationPercent: 50, updatedAt: Date.now() },
    openPositionsCount: 3,
    recentFailedExecutions: 0,
    ...overrides,
  };
}

function makeConfig(overrides?: Partial<LiveRiskEngineConfig>): LiveRiskEngineConfig {
  return {
    blockEntryOnHighRisk: true,
    blockEntryOnCriticalRisk: true,
    blockExitOnCriticalRisk: false,
    allowReduceOnlyOnHighRisk: true,
    maxPortfolioDeltaPercent: 5,
    maxCapitalUtilizationPercent: 90,
    maxOpenPositions: 10,
    maxFailedExecutions: 3,
    requireReconciliationHealthy: true,
    ...overrides,
  };
}

// ─── Acceptance Criteria ─────────────────────────────────

describe("acceptance criteria", () => {
  it("high risk + util 95% + delta 5% → block_entry, high, 3 categories", () => {
    const ctx = makeContext({
      riskReport: { ...makeContext().riskReport, overallRisk: "high" },
      capitalState: { ...makeContext().capitalState!, utilizationPercent: 95 },
      portfolioReport: { summary: { ...makeContext().portfolioReport!.summary, totalDeltaPercent: 5 }, contributions: [] },
    });

    const decision = evaluateLiveRisk(ctx, makeConfig({
      maxCapitalUtilizationPercent: 90,
      maxPortfolioDeltaPercent: 3,
    }));

    expect(decision.action).toBe("block_entry");
    expect(decision.level).toBe("high");
    expect(decision.categories).toContain("account");
    expect(decision.categories).toContain("capital");
    expect(decision.categories).toContain("portfolio");
    expect(decision.reasons.length).toBeGreaterThanOrEqual(3);
  });
});

// ─── evaluateEntryPermission ─────────────────────────

describe("evaluateEntryPermission", () => {
  it("low risk → allow", () => {
    const result = evaluateEntryPermission({ overallRisk: "low" }, makeConfig() as any);
    expect(result.blocked).toBe(false);
  });

  it("critical risk → blocked", () => {
    const result = evaluateEntryPermission({ overallRisk: "critical" }, makeConfig() as any);
    expect(result.blocked).toBe(true);
  });

  it("high risk → blocked", () => {
    const result = evaluateEntryPermission({ overallRisk: "high" }, makeConfig() as any);
    expect(result.blocked).toBe(true);
  });

  it("high risk with blockEntryOnHighRisk=false → allow", () => {
    const result = evaluateEntryPermission({ overallRisk: "high" }, makeConfig({ blockEntryOnHighRisk: false }) as any);
    expect(result.blocked).toBe(false);
  });
});

// ─── evaluateExitPermission ─────────────────────────

describe("evaluateExitPermission", () => {
  it("critical risk → allow (exits are risk-reducing)", () => {
    const result = evaluateExitPermission({ overallRisk: "critical" }, makeConfig() as any);
    expect(result.blocked).toBe(false);
  });

  it("critical risk with blockExitOnCriticalRisk=true → blocked", () => {
    const result = evaluateExitPermission({ overallRisk: "critical" }, makeConfig({ blockExitOnCriticalRisk: true }) as any);
    expect(result.blocked).toBe(true);
  });
});

// ─── evaluatePortfolioRisk ─────────────────────────

describe("evaluatePortfolioRisk", () => {
  it("delta within limit → not triggered", () => {
    const result = evaluatePortfolioRisk({ summary: { totalDeltaPercent: 3 } } as any, makeConfig({ maxPortfolioDeltaPercent: 5 }) as any);
    expect(result.triggered).toBe(false);
  });

  it("delta above limit → triggered", () => {
    const result = evaluatePortfolioRisk({ summary: { totalDeltaPercent: 6 } } as any, makeConfig({ maxPortfolioDeltaPercent: 5 }) as any);
    expect(result.triggered).toBe(true);
  });

  it("undefined report → not triggered", () => {
    const result = evaluatePortfolioRisk(undefined, makeConfig() as any);
    expect(result.triggered).toBe(false);
  });
});

// ─── evaluateCapitalRisk ──────────────────────────

describe("evaluateCapitalRisk", () => {
  it("util within limit → not triggered", () => {
    const result = evaluateCapitalRisk({ utilizationPercent: 80 }, makeConfig() as any);
    expect(result.triggered).toBe(false);
  });

  it("util above limit → triggered", () => {
    const result = evaluateCapitalRisk({ utilizationPercent: 95 }, makeConfig() as any);
    expect(result.triggered).toBe(true);
  });

  it("undefined state → not triggered", () => {
    const result = evaluateCapitalRisk(undefined, makeConfig() as any);
    expect(result.triggered).toBe(false);
  });
});

// ─── evaluateReconciliationRisk ──────────────────

describe("evaluateReconciliationRisk", () => {
  it("no high severity → not triggered", () => {
    const result = evaluateReconciliationRisk({ highSeverityCount: 0 }, makeConfig() as any);
    expect(result.triggered).toBe(false);
  });

  it("high severity > 0 → triggered, critical", () => {
    const result = evaluateReconciliationRisk({ highSeverityCount: 2 }, makeConfig() as any);
    expect(result.triggered).toBe(true);
    expect(result.level).toBe("critical");
  });
});

// ─── evaluateExecutionRisk ──────────────────────

describe("evaluateExecutionRisk", () => {
  it("failures within limit → not triggered", () => {
    const result = evaluateExecutionRisk(2, makeConfig({ maxFailedExecutions: 3 }) as any);
    expect(result.triggered).toBe(false);
  });

  it("failures above limit → triggered", () => {
    const result = evaluateExecutionRisk(5, makeConfig({ maxFailedExecutions: 3 }) as any);
    expect(result.triggered).toBe(true);
  });
});

// ─── aggregateRiskAction ────────────────────────

describe("aggregateRiskAction", () => {
  it("no signals → allow, low", () => {
    const result = aggregateRiskAction([]);
    expect(result.action).toBe("allow");
    expect(result.level).toBe("low");
  });

  it("block_entry overrides reduce_only", () => {
    const result = aggregateRiskAction([
      { action: "reduce_only", level: "high", category: "account", reasons: ["reduce"] },
      { action: "block_entry", level: "high", category: "portfolio", reasons: ["block"] },
    ]);
    expect(result.action).toBe("block_entry");
  });

  it("require_manual_review highest priority", () => {
    const result = aggregateRiskAction([
      { action: "block_entry", level: "high", category: "portfolio", reasons: ["block"] },
      { action: "require_manual_review", level: "critical", category: "reconciliation", reasons: ["recon"] },
    ]);
    expect(result.action).toBe("require_manual_review");
  });
});

// ─── evaluateLiveRisk — full scenarios ──────────

describe("evaluateLiveRisk — full scenarios", () => {
  it("low risk → allow", () => {
    const decision = evaluateLiveRisk(makeContext());
    expect(decision.action).toBe("allow");
    expect(decision.level).toBe("low");
  });

  it("critical risk → block_entry", () => {
    const ctx = makeContext({ riskReport: { ...makeContext().riskReport, overallRisk: "critical" } });
    const decision = evaluateLiveRisk(ctx);
    expect(decision.action).toBe("block_entry");
    expect(decision.level).toBe("critical");
  });

  it("reduce_only when high risk and no entry block config", () => {
    const ctx = makeContext({ riskReport: { ...makeContext().riskReport, overallRisk: "high" } });
    const decision = evaluateLiveRisk(ctx, makeConfig({ blockEntryOnHighRisk: false }));
    expect(decision.action).toBe("reduce_only");
  });

  it("reconciliation high severity → require_manual_review", () => {
    const ctx = makeContext({ reconciliationReport: { items: [], matchedCount: 0, mismatchCount: 0, highSeverityCount: 2, generatedAt: Date.now() } });
    const decision = evaluateLiveRisk(ctx);
    expect(decision.action).toBe("require_manual_review");
    expect(decision.categories).toContain("reconciliation");
  });

  it("execution failures → blocked", () => {
    const ctx = makeContext({ recentFailedExecutions: 5 });
    const decision = evaluateLiveRisk(ctx, makeConfig({ maxFailedExecutions: 3 }));
    expect(decision.action).toBe("block_entry");
    expect(decision.categories).toContain("execution");
  });

  it("too many open positions → blocked", () => {
    const ctx = makeContext({ openPositionsCount: 15 });
    const decision = evaluateLiveRisk(ctx, makeConfig({ maxOpenPositions: 10 }));
    expect(decision.categories).toContain("portfolio");
  });

  it("generatedAt is a valid timestamp", () => {
    const decision = evaluateLiveRisk(makeContext());
    expect(typeof decision.generatedAt).toBe("number");
    expect(decision.generatedAt).toBeGreaterThan(0);
  });
});

// ─── Immutability ─────────────────────────────

describe("immutability", () => {
  it("does not mutate input context", () => {
    const ctx = makeContext();
    const originalRisk = ctx.riskReport.overallRisk;
    evaluateLiveRisk(ctx);
    expect(ctx.riskReport.overallRisk).toBe(originalRisk);
  });
});
