/**
 * Live Auto Entry Engine Tests — Live Phase 3 + Safety Patch-1
 *
 * Acceptance criteria:
 *   BTC: netApy=28, score=90, allocated=20000, markPrice=100000, risk=low,
 *        enabled=true, dryRun=true, low risk + active kill switch
 *   → status=planned, hedgePlan exists, spot long 0.2, perp short 0.2
 *   → no real execution
 */

import { describe, expect, it } from "vitest";
import {
  buildAutoEntryHedgePlan,
  executeAutoEntry,
  generateAutoEntryReport,
  runAutoEntry,
  selectAutoEntryCandidates,
  validateAutoEntryCandidate,
} from "./autoEntryEngine";
import type { AutoEntryCandidate, LiveAutoEntryConfig } from "./autoEntryTypes";
import type { LiveRiskContext } from "./riskEngineTypes";
import type { KillSwitchState } from "./killSwitchTypes";

// ─── Helpers ─────────────────────────────────────────────

function makeCandidate(overrides?: Partial<AutoEntryCandidate>): AutoEntryCandidate {
  return {
    opportunityId: "opp-btc",
    symbol: "BTCUSDT",
    exchange: "binance",
    expectedNetApy: 28,
    opportunityScore: 90,
    allocatedCapitalUsd: 20_000,
    riskLevel: "low",
    markPrice: 100_000,
    fundingRate: 0.0001,
    reason: "High net APY",
    ...overrides,
  };
}

function makeConfig(overrides?: Partial<LiveAutoEntryConfig>): LiveAutoEntryConfig {
  return {
    enabled: true,
    dryRun: true,
    minExpectedNetApy: 10,
    minOpportunityScore: 60,
    maxRiskLevel: "high",
    maxOpenPositions: 5,
    maxEntryNotionalUsd: 50_000,
    allowedExchanges: ["binance"],
    preferredHedgeMode: "spot_perp",
    requireRiskCheck: true,
    requireCapitalAllocation: true,
    ...overrides,
  };
}

function makeRiskContext(overrides?: Partial<LiveRiskContext>): LiveRiskContext {
  return {
    riskReport: { events: [], lowCount: 0, mediumCount: 0, highCount: 0, criticalCount: 0, overallRisk: "low", generatedAt: Date.now() },
    reconciliationReport: { items: [], matchedCount: 0, mismatchCount: 0, highSeverityCount: 0, generatedAt: Date.now() },
    portfolioReport: { summary: { totalAllocatedCapitalUsd: 0, totalNotionalUsd: 0, totalFundingCollectedUsd: 0, totalTradingPnlUsd: 0, totalPnlUsd: 0, portfolioApyPercent: 0, capitalUtilizationPercent: 0, totalDeltaUsd: 0, totalDeltaPercent: 0, openPositionCount: 0, closedPositionCount: 0, positionCount: 0, generatedAt: Date.now() }, contributions: [] },
    capitalState: { totalCapitalUsd: 100000, reserveUsd: 10000, deployedCapitalUsd: 50000, availableCapitalUsd: 40000, unrealizedPnlUsd: 0, realizedPnlUsd: 0, fundingCollectedUsd: 0, utilizationPercent: 50, updatedAt: Date.now() },
    openPositionsCount: 2,
    recentFailedExecutions: 0,
    ...overrides,
  };
}

const DEFAULT_CONFIG = makeConfig();
const DEFAULT_RISK = makeRiskContext();
const ACTIVE_KILL: KillSwitchState = { status: "active", action: "allow", reasons: [], updatedAt: Date.now() };

// ─── Acceptance Criteria ─────────────────────────────────

describe("acceptance criteria", () => {
  it("low risk + active kill → planned with spot 0.2 + perp 0.2", async () => {
    const candidate = makeCandidate();
    const result = await executeAutoEntry(candidate, 0, DEFAULT_CONFIG, DEFAULT_RISK, undefined, ACTIVE_KILL);

    expect(result.status).toBe("planned");
    expect(result.hedgePlan).toBeDefined();

    const spot = result.hedgePlan!.legs.find((l) => l.legType === "spot")!;
    const perp = result.hedgePlan!.legs.find((l) => l.legType === "perpetual")!;

    expect(spot.side).toBe("long");
    expect(spot.quantity).toBeCloseTo(0.2, 4);
    expect(perp.side).toBe("short");
    expect(perp.quantity).toBeCloseTo(0.2, 4);
    expect(result.errors).toEqual([]);
  });
});

// ─── selectAutoEntryCandidates ────────────────────────

describe("selectAutoEntryCandidates", () => {
  it("filters eligible candidates correctly", () => {
    const good = makeCandidate();
    const lowNetApy = makeCandidate({ expectedNetApy: 5 });
    const lowScore = makeCandidate({ opportunityScore: 30 });
    const noAlloc = makeCandidate({ allocatedCapitalUsd: 0 });

    const eligible = selectAutoEntryCandidates([good, lowNetApy, lowScore, noAlloc], 0, DEFAULT_CONFIG);
    expect(eligible.length).toBe(1);
    expect(eligible[0].opportunityId).toBe("opp-btc");
  });

  it("returns empty when disabled", () => {
    const result = selectAutoEntryCandidates([makeCandidate()], 0, makeConfig({ enabled: false }));
    expect(result).toEqual([]);
  });

  it("respects maxOpenPositions", () => {
    const result = selectAutoEntryCandidates([makeCandidate()], 5, makeConfig({ maxOpenPositions: 5 }));
    expect(result).toEqual([]);
  });
});

// ─── validateAutoEntryCandidate ──────────────────────

describe("validateAutoEntryCandidate", () => {
  it("passes for valid candidate", () => {
    const errors = validateAutoEntryCandidate(makeCandidate(), 0, DEFAULT_CONFIG);
    expect(errors).toEqual([]);
  });

  it("blocks when disabled", () => {
    const errors = validateAutoEntryCandidate(makeCandidate(), 0, makeConfig({ enabled: false }));
    expect(errors.some((e) => e.includes("disabled"))).toBe(true);
  });

  it("blocks when netApy < min", () => {
    const errors = validateAutoEntryCandidate(makeCandidate({ expectedNetApy: 5 }), 0, DEFAULT_CONFIG);
    expect(errors.some((e) => e.includes("net APY"))).toBe(true);
  });

  it("blocks when score < min", () => {
    const errors = validateAutoEntryCandidate(makeCandidate({ opportunityScore: 30 }), 0, DEFAULT_CONFIG);
    expect(errors.some((e) => e.includes("score"))).toBe(true);
  });

  it("blocks when allocation is zero", () => {
    const errors = validateAutoEntryCandidate(makeCandidate({ allocatedCapitalUsd: 0 }), 0, DEFAULT_CONFIG);
    expect(errors.some((e) => e.includes("allocation"))).toBe(true);
  });

  it("blocks when markPrice is missing", () => {
    const errors = validateAutoEntryCandidate(makeCandidate({ markPrice: 0 }), 0, DEFAULT_CONFIG);
    expect(errors.some((e) => e.includes("Mark price"))).toBe(true);
  });

  it("blocks when risk exceeds max", () => {
    const errors = validateAutoEntryCandidate(makeCandidate({ riskLevel: "critical" }), 0, DEFAULT_CONFIG);
    expect(errors.some((e) => e.includes("Risk level"))).toBe(true);
  });

  it("blocks when maxOpenPositions reached", () => {
    const errors = validateAutoEntryCandidate(makeCandidate(), 5, makeConfig({ maxOpenPositions: 5 }));
    expect(errors.some((e) => e.includes("Open positions"))).toBe(true);
  });

  it("blocks when notional exceeds max", () => {
    const errors = validateAutoEntryCandidate(makeCandidate({ allocatedCapitalUsd: 100_000 }), 0, DEFAULT_CONFIG);
    expect(errors.some((e) => e.includes("exceeds max"))).toBe(true);
  });

  it("blocks when exchange not in allowed list", () => {
    const errors = validateAutoEntryCandidate(makeCandidate({ exchange: "unknown" }), 0, DEFAULT_CONFIG);
    expect(errors.some((e) => e.includes("not in allowed"))).toBe(true);
  });
});

// ─── buildAutoEntryHedgePlan ─────────────────────────

describe("buildAutoEntryHedgePlan", () => {
  it("spot_perp builds 2-leg plan", () => {
    const plan = buildAutoEntryHedgePlan(makeCandidate(), makeConfig({ preferredHedgeMode: "spot_perp" }));
    expect(plan.legs.length).toBe(2);
    expect(plan.legs.some((l) => l.legType === "spot")).toBe(true);
    expect(plan.legs.some((l) => l.legType === "perpetual")).toBe(true);
  });

  it("perp_perp builds 2-leg plan with both exchanges", () => {
    const candidate = makeCandidate({ exchange: "binance", secondaryExchange: "bybit" });
    const plan = buildAutoEntryHedgePlan(candidate, makeConfig({ preferredHedgeMode: "perp_perp" }));
    expect(plan.legs.length).toBe(2);
    expect(plan.legs.every((l) => l.legType === "perpetual")).toBe(true);
    const exchanges = plan.legs.map((l) => l.exchange);
    expect(exchanges).toContain("binance");
    expect(exchanges).toContain("bybit");
  });
});

// ─── Safety: Risk + Kill Switch Checks ───────────────

describe("safety — risk + kill switch", () => {
  it("critical risk → entry blocked", async () => {
    const ctx = makeRiskContext({ riskReport: { ...DEFAULT_RISK.riskReport, overallRisk: "critical" } });
    const result = await executeAutoEntry(makeCandidate(), 0, DEFAULT_CONFIG, ctx, undefined, ACTIVE_KILL);
    expect(result.status).toBe("blocked");
    expect(result.errors.some((e) => e.includes("blocked"))).toBe(true);
  });

  it("critical risk + manualUnlockRequired=false → triggered reduce_only → entry blocked", async () => {
    const ctx = makeRiskContext({ riskReport: { ...DEFAULT_RISK.riskReport, overallRisk: "critical" } });
    const result = await executeAutoEntry(makeCandidate(), 0, makeConfig({ blockEntryOnCriticalRisk: true }), ctx, undefined, undefined, { manualUnlockRequired: false });
    expect(result.status).toBe("blocked");
  });

  it("kill switch locked → entry blocked", async () => {
    const lockedState: KillSwitchState = { status: "locked", action: "manual_review_required", reasons: ["operator_lock"], triggeredAt: Date.now(), lockedAt: Date.now(), updatedAt: Date.now() };
    const result = await executeAutoEntry(makeCandidate(), 0, DEFAULT_CONFIG, DEFAULT_RISK, undefined, lockedState);
    expect(result.status).toBe("blocked");
  });

  it("requireRiskCheck=true but no riskContext → blocked", async () => {
    const result = await executeAutoEntry(makeCandidate(), 0, DEFAULT_CONFIG);
    expect(result.status).toBe("blocked");
    expect(result.errors.some((e) => e.includes("Risk context"))).toBe(true);
  });

  it("requireRiskCheck=false + no riskContext → allowed", async () => {
    const result = await executeAutoEntry(makeCandidate(), 0, makeConfig({ requireRiskCheck: false }));
    expect(result.status).toBe("planned");
  });

  it("dryRun=true still goes through safety check and fails if risk context missing", async () => {
    const result = await executeAutoEntry(makeCandidate(), 0, DEFAULT_CONFIG);
    expect(result.status).toBe("blocked");
  });
});

// ─── executeAutoEntry — dryRun ───────────────────────

describe("executeAutoEntry — dryRun", () => {
  it("dryRun=true returns planned with hedgePlan", async () => {
    const result = await executeAutoEntry(makeCandidate(), 0, DEFAULT_CONFIG, DEFAULT_RISK, undefined, ACTIVE_KILL);
    expect(result.status).toBe("planned");
    expect(result.hedgePlan).toBeDefined();
    expect(result.hedgeExecutionResult).toBeUndefined();
  });

  it("dryRun=false calls hedge engine", async () => {
    const result = await executeAutoEntry(makeCandidate(), 0, makeConfig({ dryRun: false }), DEFAULT_RISK, undefined, ACTIVE_KILL);
    expect(result.status).toBe("executed");
    expect(result.hedgeExecutionResult).toBeDefined();
    expect(result.hedgeExecutionResult!.orders.length).toBe(2);
  });
});

// ─── runAutoEntry ─────────────────────────────────

describe("runAutoEntry", () => {
  it("disabled config blocks all candidates", async () => {
    const report = await runAutoEntry(
      [makeCandidate({ opportunityId: "a" }), makeCandidate({ opportunityId: "b" })],
      0,
      makeConfig({ enabled: false }),
    );
    expect(report.results.length).toBe(2);
    expect(report.blockedCount).toBe(2);
  });

  it("mixed candidates produce correct report counts", async () => {
    const good = makeCandidate();
    const bad = makeCandidate({ expectedNetApy: 5 }); // blocked by validation

    const report = await runAutoEntry([good, bad], 0, DEFAULT_CONFIG, DEFAULT_RISK, undefined, ACTIVE_KILL);
    expect(report.plannedCount).toBe(1); // good is planned (dryRun)
  });
});

// ─── generateAutoEntryReport ────────────────────────

describe("generateAutoEntryReport", () => {
  it("counts each status correctly", () => {
    const results = [
      { success: true, status: "planned" as const, errors: [] },
      { success: true, status: "executed" as const, errors: [] },
      { success: false, status: "blocked" as const, errors: ["x"] },
      { success: false, status: "failed" as const, errors: ["x"] },
      { success: true, status: "partial" as const, errors: [] },
    ] as any;

    const report = generateAutoEntryReport(results);
    expect(report.plannedCount).toBe(1);
    expect(report.executedCount).toBe(1);
    expect(report.blockedCount).toBe(1);
    expect(report.failedCount).toBe(2);
  });

  it("report has generatedAt", () => {
    const report = generateAutoEntryReport([]);
    expect(typeof report.generatedAt).toBe("number");
  });
});

// ─── Immutability ────────────────────────────────

describe("immutability", () => {
  it("does not mutate inputs", () => {
    const candidate = makeCandidate();
    const originalId = candidate.opportunityId;
    validateAutoEntryCandidate(candidate, 0, DEFAULT_CONFIG);
    expect(candidate.opportunityId).toBe(originalId);
  });
});
