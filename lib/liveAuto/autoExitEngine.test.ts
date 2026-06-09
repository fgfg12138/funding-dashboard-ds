/**
 * Auto Exit Engine Tests — Live Phase 4
 *
 * Acceptance criteria:
 *   Position: BTCUSDT, spot long, perp short, notional=20000
 *   ExitSuggestion: status=suggest_exit
 *   Config: enabled=true, dryRun=true, allowedExchanges=["binance"],
 *           maxExitNotionalUsd=50000
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

const DEFAULT_CONFIG = makeConfig();

// Currency: position opened at 2026-01-01 00:00, evaluate at 2026-01-02 00:00 (24h later)
// At 24h, take-profit (totalPnl=600 >= 500) triggers suggest_exit
const EVAL_TIME = UTC(2026, 1, 2, 0);

// ─── Acceptance Criteria ─────────────────────────────────

describe("acceptance criteria", () => {
  it("suggest_exit + dryRun → planned, perp=buy, spot=sell", async () => {
    const pos = makePosition({ totalPnlUsd: 600 });
    const candidates = selectAutoExitCandidates([pos], EVAL_TIME, DEFAULT_CONFIG);

    expect(candidates.length).toBe(1);
    expect(candidates[0].suggestionStatus).toBe("suggest_exit");

    const result = await executeAutoExit(pos, candidates[0], DEFAULT_CONFIG);

    expect(result.status).toBe("planned");
    expect(result.hedgePlan).toBeDefined();

    const perpLeg = result.hedgePlan!.legs.find((l) => l.legType === "perpetual")!;
    const spotLeg = result.hedgePlan!.legs.find((l) => l.legType === "spot")!;

    expect(perpLeg.side).toBe("long");   // close short → buy
    expect(spotLeg.side).toBe("short");   // close long → sell

    expect(result.errors).toEqual([]);
  });
});

// ─── selectAutoExitCandidates ────────────────────────

describe("selectAutoExitCandidates", () => {
  it("selects positions with exit signal", () => {
    const pos = makePosition({ totalPnlUsd: 600 }); // take-profit hit
    const candidates = selectAutoExitCandidates([pos], EVAL_TIME, DEFAULT_CONFIG);
    expect(candidates.length).toBe(1);
    expect(candidates[0].positionId).toBe("pos-btc");
  });

  it("returns empty for positions with no exit signal", () => {
    const pos = makePosition({ totalPnlUsd: 100, deltaPercent: 1 }); // no exit signal
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

  it("blocks when exchange not in allowed list", () => {
    const pos = makePosition({ spotLeg: makeLeg({ exchange: "Unknown" }), perpetualLeg: makeLeg({ exchange: "Unknown" }) });
    const candidate: AutoExitCandidate = {
      positionId: "pos-btc", symbol: "BTCUSDT", suggestionStatus: "suggest_exit",
      totalPnlUsd: 600, fundingCollectedUsd: 80, deltaPercent: 0,
    };
    const errors = validateAutoExitCandidate(candidate, pos, DEFAULT_CONFIG);
    expect(errors.some((e) => e.includes("not in allowed"))).toBe(true);
  });

  it("blocks urgent_exit when allowUrgentExit=false", () => {
    const pos = makePosition();
    const candidate: AutoExitCandidate = {
      positionId: "pos-btc", symbol: "BTCUSDT", suggestionStatus: "urgent_exit",
      totalPnlUsd: -600, fundingCollectedUsd: 10, deltaPercent: 0,
    };
    const errors = validateAutoExitCandidate(candidate, pos, makeConfig({ allowUrgentExit: false }));
    expect(errors.some((e) => e.includes("Urgent exit"))).toBe(true);
  });

  it("notional exceeding max returns error", () => {
    const bigPos = makePosition({
      spotLeg: makeLeg({ notionalUsd: 80_000 }),
      perpetualLeg: makeLeg({ notionalUsd: 80_000 }),
    });
    const candidate: AutoExitCandidate = {
      positionId: "pos-btc", symbol: "BTCUSDT", suggestionStatus: "suggest_exit",
      totalPnlUsd: 600, fundingCollectedUsd: 80, deltaPercent: 0,
    };
    const errors = validateAutoExitCandidate(candidate, bigPos, makeConfig({ maxExitNotionalUsd: 50_000 }));
    expect(errors.some((e) => e.includes("exceeds max"))).toBe(true);
  });
});

// ─── buildAutoExitHedgePlan ─────────────────────────

describe("buildAutoExitHedgePlan", () => {
  it("reverses spot long → sell, perp short → buy", () => {
    const pos = makePosition();
    const plan = buildAutoExitHedgePlan(pos);

    const perpLeg = plan.legs.find((l) => l.legType === "perpetual")!;
    const spotLeg = plan.legs.find((l) => l.legType === "spot")!;

    expect(perpLeg.side).toBe("long");  // close short
    expect(spotLeg.side).toBe("short");  // close long
  });

  it("has 2 legs", () => {
    const plan = buildAutoExitHedgePlan(makePosition());
    expect(plan.legs.length).toBe(2);
  });
});

// ─── executeAutoExit — dryRun ───────────────────────

describe("executeAutoExit — dryRun", () => {
  it("dryRun=true returns planned with hedgePlan", async () => {
    const pos = makePosition({ totalPnlUsd: 600 });
    const candidates = selectAutoExitCandidates([pos], EVAL_TIME, DEFAULT_CONFIG);
    const result = await executeAutoExit(pos, candidates[0], makeConfig({ dryRun: true }));

    expect(result.status).toBe("planned");
    expect(result.hedgePlan).toBeDefined();
  });

  it("dryRun=false calls hedge engine via order router", async () => {
    const pos = makePosition({ totalPnlUsd: 600 });
    const candidates = selectAutoExitCandidates([pos], EVAL_TIME, DEFAULT_CONFIG);
    const result = await executeAutoExit(pos, candidates[0], makeConfig({ dryRun: false }));

    expect(result.status).toBe("executed");
    expect(result.hedgeExecutionResult).toBeDefined();
    expect(result.hedgeExecutionResult!.orders.length).toBe(2);
  });
});

// ─── executeAutoExit — perp-first order ────────────

describe("executeAutoExit — perp-first order", () => {
  it("perpetual is executed before spot in hedge plan legs", () => {
    const pos = makePosition();
    const plan = buildAutoExitHedgePlan(pos);

    // Hedge engine sorts: perp (short side) before spot
    // perp short → reverse to long → but in sort order short before long
    // Actually the plan legs array order determines priority
    // Our builder puts perp first, spot second
    expect(plan.legs[0].legType).toBe("perpetual");
    expect(plan.legs[1].legType).toBe("spot");
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
