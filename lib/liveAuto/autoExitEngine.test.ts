/**
 * Auto Exit Engine Tests — Live Phase 4 + Safety Patch-1
 *
 * Acceptance criteria:
 *   Position: BTCUSDT, spot long, perp short, notional=20000
 *   ExitSuggestion: status=suggest_exit
 *   Config: enabled=true, dryRun=true, low risk + active kill switch
 *   → status=planned, perp close=buy, spot close=sell
 *   → no real execution
 */

import { describe, expect, it } from "vitest";
import {
  buildAutoExitHedgePlan,
  executeAutoExit,
  generateAutoExitReport,
  runAutoExit,
  selectAutoExitCandidates,
  validateAutoExitCandidate,
} from "./autoExitEngine";
import type { ArbitrageLeg, ArbitragePosition } from "../arbitrage/arbitragePositionTypes";
import type { AutoExitCandidate, LiveAutoExitConfig } from "./autoExitTypes";
import type { LiveRiskContext } from "./riskEngineTypes";
import type { KillSwitchState } from "./killSwitchTypes";

// ─── Helpers ─────────────────────────────────────────────

const UTC = (y: number, m: number, d: number, h: number) =>
  Date.UTC(y, m - 1, d, h, 0, 0, 0);

function makeLeg(overrides?: Partial<ArbitrageLeg>): ArbitrageLeg {
  return {
    exchange: "Binance", symbol: "BTCUSDT", marketType: "perpetual",
    side: "short", quantity: 0.2, entryPrice: 100_000, markPrice: 100_000,
    notionalUsd: 20_000, unrealizedPnlUsd: 0, ...overrides,
  };
}

function makePosition(overrides?: Partial<ArbitragePosition>): ArbitragePosition {
  return {
    id: "pos-btc", symbol: "BTCUSDT", status: "open",
    openedAt: UTC(2026, 1, 1, 0),
    spotLeg: makeLeg({ marketType: "spot", side: "long", quantity: 0.2, notionalUsd: 20_000 }),
    perpetualLeg: makeLeg({ marketType: "perpetual", side: "short", quantity: 0.2, notionalUsd: 20_000 }),
    fundingCollectedUsd: 80, totalPnlUsd: 600,
    deltaUsd: 0, deltaPercent: 0,
    ...overrides,
  };
}

function makeConfig(overrides?: Partial<LiveAutoExitConfig>): LiveAutoExitConfig {
  return {
    enabled: true,
    dryRun: true,
    maxHoldingHours: 48,
    minNetApyPercent: 10,
    maxDeltaPercent: 3,
    takeProfitUsd: 500,
    stopLossUsd: 500,
    allowUrgentExit: true,
    allowedExchanges: ["binance"],
    maxExitNotionalUsd: 100_000,
    requireRiskCheck: true,
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

// Currency: position opened at 2026-01-01 00:00, evaluate at 2026-01-02 00:00 (24h later)
// At 24h, take-profit (totalPnl=600 >= 500) triggers suggest_exit
const EVAL_TIME = UTC(2026, 1, 2, 0);

// ─── Acceptance Criteria ─────────────────────────────────

describe("acceptance criteria", () => {
  it("suggest_exit + dryRun + active kill → planned, perp=buy, spot=sell", async () => {
    const pos = makePosition({ totalPnlUsd: 600 });
    const candidates = selectAutoExitCandidates([pos], EVAL_TIME, DEFAULT_CONFIG);
    expect(candidates.length).toBe(1);
    expect(candidates[0].suggestionStatus).toBe("suggest_exit");

    const result = await executeAutoExit(pos, candidates[0], DEFAULT_CONFIG, DEFAULT_RISK, undefined, ACTIVE_KILL);
    expect(result.status).toBe("planned");
    expect(result.hedgePlan).toBeDefined();

    const perpLeg = result.hedgePlan!.legs.find((l) => l.legType === "perpetual")!;
    const spotLeg = result.hedgePlan!.legs.find((l) => l.legType === "spot")!;
    expect(perpLeg.side).toBe("long");
    expect(spotLeg.side).toBe("short");
    expect(result.errors).toEqual([]);
  });
});

// ─── selectAutoExitCandidates ────────────────────────

describe("selectAutoExitCandidates", () => {
  it("selects positions with exit signal", () => {
    const pos = makePosition({ totalPnlUsd: 600 });
    const candidates = selectAutoExitCandidates([pos], EVAL_TIME, DEFAULT_CONFIG);
    expect(candidates.length).toBe(1);
    expect(candidates[0].positionId).toBe("pos-btc");
  });

  it("returns empty for positions with no exit signal", () => {
    const pos = makePosition({ totalPnlUsd: 100, deltaPercent: 1 });
    const candidates = selectAutoExitCandidates([pos], EVAL_TIME, DEFAULT_CONFIG);
    expect(candidates.length).toBe(0);
  });

  it("returns empty when disabled", () => {
    const pos = makePosition({ totalPnlUsd: 600 });
    const candidates = selectAutoExitCandidates([pos], EVAL_TIME, makeConfig({ enabled: false }));
    expect(candidates).toEqual([]);
  });
});

// ─── validateAutoExitCandidate ──────────────────────

describe("validateAutoExitCandidate", () => {
  it("passes for valid candidate with open position", () => {
    const pos = makePosition();
    const candidate: AutoExitCandidate = {
      positionId: "pos-btc", symbol: "BTCUSDT", suggestionStatus: "suggest_exit",
      totalPnlUsd: 600, fundingCollectedUsd: 80, deltaPercent: 0,
    };
    const errors = validateAutoExitCandidate(candidate, pos, DEFAULT_CONFIG);
    expect(errors).toEqual([]);
  });

  it("blocks when disabled", () => {
    const pos = makePosition();
    const candidate: AutoExitCandidate = {
      positionId: "pos-btc", symbol: "BTCUSDT", suggestionStatus: "suggest_exit",
      totalPnlUsd: 600, fundingCollectedUsd: 80, deltaPercent: 0,
    };
    const errors = validateAutoExitCandidate(candidate, pos, makeConfig({ enabled: false }));
    expect(errors.some((e) => e.includes("disabled"))).toBe(true);
  });

  it("blocks when suggestion is hold", () => {
    const pos = makePosition();
    const candidate: AutoExitCandidate = {
      positionId: "pos-btc", symbol: "BTCUSDT", suggestionStatus: "hold",
      totalPnlUsd: 100, fundingCollectedUsd: 10, deltaPercent: 0,
    };
    const errors = validateAutoExitCandidate(candidate, pos, DEFAULT_CONFIG);
    expect(errors.some((e) => e.includes("hold"))).toBe(true);
  });

  it("blocks closed position", () => {
    const pos = makePosition({ status: "closed" });
    const candidate: AutoExitCandidate = {
      positionId: "pos-btc", symbol: "BTCUSDT", suggestionStatus: "suggest_exit",
      totalPnlUsd: 600, fundingCollectedUsd: 80, deltaPercent: 0,
    };
    const errors = validateAutoExitCandidate(candidate, pos, DEFAULT_CONFIG);
    expect(errors.some((e) => e.includes("not open"))).toBe(true);
  });
});

// ─── buildAutoExitHedgePlan ─────────────────────────

describe("buildAutoExitHedgePlan", () => {
  it("reverses spot long → sell, perp short → buy", () => {
    const pos = makePosition();
    const plan = buildAutoExitHedgePlan(pos);
    const perpLeg = plan.legs.find((l) => l.legType === "perpetual")!;
    const spotLeg = plan.legs.find((l) => l.legType === "spot")!;
    expect(perpLeg.side).toBe("long");
    expect(spotLeg.side).toBe("short");
  });
});

// ─── Safety: Risk + Kill Switch Checks ───────────────

describe("safety — risk + kill switch", () => {
  it("low risk + active kill → exit planned", async () => {
    const pos = makePosition({ totalPnlUsd: 600 });
    const candidates = selectAutoExitCandidates([pos], EVAL_TIME, DEFAULT_CONFIG);
    const result = await executeAutoExit(pos, candidates[0], DEFAULT_CONFIG, DEFAULT_RISK, undefined, ACTIVE_KILL);
    expect(result.status).toBe("planned");
  });

  it("critical risk + triggered reduce_only → exit allowed (reduce-only allows exit)", async () => {
    const ctx = makeRiskContext({ riskReport: { ...DEFAULT_RISK.riskReport, overallRisk: "critical" } });
    const pos = makePosition({ totalPnlUsd: 600 });
    const candidates = selectAutoExitCandidates([pos], EVAL_TIME, DEFAULT_CONFIG);
    const result = await executeAutoExit(pos, candidates[0], DEFAULT_CONFIG, ctx, undefined, undefined, { manualUnlockRequired: false });
    expect(result.status).toBe("planned"); // exits allowed in reduce_only
  });

  it("kill switch locked → exit blocked", async () => {
    const ctx = makeRiskContext({ riskReport: { ...DEFAULT_RISK.riskReport, overallRisk: "critical" } });
    const lockedState: KillSwitchState = { status: "locked", action: "manual_review_required", reasons: ["operator_lock"], triggeredAt: Date.now(), lockedAt: Date.now(), updatedAt: Date.now() };
    const pos = makePosition({ totalPnlUsd: 600 });
    const candidates = selectAutoExitCandidates([pos], EVAL_TIME, DEFAULT_CONFIG);
    const result = await executeAutoExit(pos, candidates[0], DEFAULT_CONFIG, ctx, undefined, lockedState);
    expect(result.status).toBe("blocked");
  });
});

// ─── executeAutoExit — dryRun ───────────────────────

describe("executeAutoExit — dryRun", () => {
  it("dryRun=true returns planned with hedgePlan", async () => {
    const pos = makePosition({ totalPnlUsd: 600 });
    const candidates = selectAutoExitCandidates([pos], EVAL_TIME, DEFAULT_CONFIG);
    const result = await executeAutoExit(pos, candidates[0], DEFAULT_CONFIG, DEFAULT_RISK, undefined, ACTIVE_KILL);
    expect(result.status).toBe("planned");
    expect(result.hedgePlan).toBeDefined();
  });

  it("dryRun=false calls hedge engine via order router", async () => {
    const pos = makePosition({ totalPnlUsd: 600 });
    const candidates = selectAutoExitCandidates([pos], EVAL_TIME, DEFAULT_CONFIG);
    const result = await executeAutoExit(pos, candidates[0], makeConfig({ dryRun: false }), DEFAULT_RISK, undefined, ACTIVE_KILL);
    expect(result.status).toBe("executed");
    expect(result.hedgeExecutionResult).toBeDefined();
    expect(result.hedgeExecutionResult!.orders.length).toBe(2);
  });
});

// ─── runAutoExit ─────────────────────────────────

describe("runAutoExit", () => {
  it("disabled config returns blocked for all", async () => {
    const pos = makePosition({ totalPnlUsd: 600 });
    const report = await runAutoExit([pos], EVAL_TIME, makeConfig({ enabled: false }));
    expect(report.results.length).toBe(1);
    expect(report.blockedCount).toBe(1);
  });

  it("handles empty positions", async () => {
    const report = await runAutoExit([], EVAL_TIME, DEFAULT_CONFIG);
    expect(report.results.length).toBe(0);
  });
});

// ─── generateAutoExitReport ────────────────────────

describe("generateAutoExitReport", () => {
  it("counts each status correctly", () => {
    const results = [
      { success: true, status: "planned" as const, errors: [] },
      { success: true, status: "executed" as const, errors: [] },
      { success: false, status: "blocked" as const, errors: ["x"] },
      { success: false, status: "failed" as const, errors: ["x"] },
    ] as any;

    const report = generateAutoExitReport(results);
    expect(report.plannedCount).toBe(1);
    expect(report.executedCount).toBe(1);
    expect(report.blockedCount).toBe(1);
    expect(report.failedCount).toBe(1);
  });

  it("report has generatedAt", () => {
    const report = generateAutoExitReport([]);
    expect(typeof report.generatedAt).toBe("number");
  });
});

// ─── Immutability ────────────────────────────────

describe("immutability", () => {
  it("does not mutate input candidate", () => {
    const candidate: AutoExitCandidate = {
      positionId: "pos-btc", symbol: "BTCUSDT", suggestionStatus: "suggest_exit",
      totalPnlUsd: 600, fundingCollectedUsd: 80, deltaPercent: 0,
    };
    const originalId = candidate.positionId;
    const pos = makePosition();
    validateAutoExitCandidate(candidate, pos, DEFAULT_CONFIG);
    expect(candidate.positionId).toBe(originalId);
  });
});
