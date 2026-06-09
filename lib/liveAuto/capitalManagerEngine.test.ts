/**
 * Capital Manager Engine Tests — Live Phase 5
 *
 * Acceptance criteria:
 *   totalCapital=100000, reserveRatio=0.1, deployed=40000,
 *   realizedPnl=2000, funding=1000, compoundProfits=true
 *   → reserve=10000, deployed=40000, available=53000
 */

import { describe, expect, it } from "vitest";
import {
  calculateAvailableCapital,
  calculateCapitalState,
  applyCompounding,
  generateCapitalDecisions,
  validateCapitalDecision,
  generateCapitalManagerReport,
} from "./capitalManagerEngine";
import type { ArbitrageLeg, ArbitragePosition } from "../arbitrage/arbitragePositionTypes";
import type { PortfolioReport } from "../arbitrage/portfolioTypes";

// ─── Helpers ─────────────────────────────────────────────

function makeLeg(overrides?: Partial<ArbitrageLeg>): ArbitrageLeg {
  return {
    exchange: "Binance", symbol: "BTCUSDT", marketType: "perpetual",
    side: "short", quantity: 0.4, entryPrice: 100_000, markPrice: 100_000,
    notionalUsd: 40_000, unrealizedPnlUsd: 0, ...overrides,
  };
}

function makePosition(overrides?: Partial<ArbitragePosition>): ArbitragePosition {
  return {
    id: "pos-btc", symbol: "BTCUSDT", status: "open",
    openedAt: 100_000,
    spotLeg: makeLeg({ marketType: "spot", side: "long", quantity: 0.4, notionalUsd: 40_000 }),
    perpetualLeg: makeLeg({ marketType: "perpetual", side: "short", quantity: 0.4, notionalUsd: 40_000 }),
    fundingCollectedUsd: 0, totalPnlUsd: 0,
    deltaUsd: 0, deltaPercent: 0,
    metadata: { allocatedCapitalUsd: 40_000 },
    ...overrides,
  };
}

function makePortfolioReport(overrides?: Partial<PortfolioReport>): PortfolioReport {
  return {
    summary: {
      totalAllocatedCapitalUsd: 40_000,
      totalNotionalUsd: 80_000,
      totalFundingCollectedUsd: 1_000,
      totalTradingPnlUsd: 2_000,
      totalPnlUsd: 3_000,
      portfolioApyPercent: 5,
      capitalUtilizationPercent: 40,
      totalDeltaUsd: 0,
      totalDeltaPercent: 0,
      openPositionCount: 1,
      closedPositionCount: 0,
      positionCount: 1,
      generatedAt: Date.now(),
    },
    contributions: [],
    ...overrides,
  };
}

const DEFAULT_CONFIG = {
  totalCapitalUsd: 100_000,
  reserveRatio: 0.1,
  maxUtilizationPercent: 90,
  maxPositionUsd: 50_000,
  minPositionUsd: 1_000,
  maxAllocationPercentPerOpportunity: 0.5,
  compoundProfits: true,
  minAvailableCapitalUsd: 0,
};

// ─── Acceptance Criteria ─────────────────────────────────

describe("acceptance criteria", () => {
  it("reserve=10k, deployed=40k, available=53k", () => {
    const pos = makePosition({ metadata: { allocatedCapitalUsd: 40_000 } });
    const report = makePortfolioReport({
      summary: {
        totalAllocatedCapitalUsd: 40_000,
        totalNotionalUsd: 80_000,
        totalFundingCollectedUsd: 1_000,
        totalTradingPnlUsd: 2_000,
        totalPnlUsd: 3_000,
        portfolioApyPercent: 5,
        capitalUtilizationPercent: 40,
        totalDeltaUsd: 0,
        totalDeltaPercent: 0,
        openPositionCount: 1,
        closedPositionCount: 0,
        positionCount: 1,
        generatedAt: Date.now(),
      },
      contributions: [],
    });

    const state = calculateCapitalState([pos], report, DEFAULT_CONFIG);

    expect(state.reserveUsd).toBe(10_000);
    expect(state.deployedCapitalUsd).toBe(40_000);
    // 100000 + 2000 + 1000 - 10000 - 40000 = 53000
    expect(state.availableCapitalUsd).toBe(53_000);
  });
});

// ─── calculateCapitalState ─────────────────────────────

describe("calculateCapitalState", () => {
  it("computes deployment from metadata", () => {
    const pos = makePosition({ metadata: { allocatedCapitalUsd: 40_000 } });
    const state = calculateCapitalState([pos], undefined, DEFAULT_CONFIG);
    expect(state.deployedCapitalUsd).toBe(40_000);
  });

  it("falls back to max notional when no metadata", () => {
    const pos = makePosition({
      spotLeg: makeLeg({ notionalUsd: 50_000 }),
      perpetualLeg: makeLeg({ notionalUsd: 50_000 }),
      metadata: undefined,
    });
    const state = calculateCapitalState([pos], undefined, DEFAULT_CONFIG);
    expect(state.deployedCapitalUsd).toBe(50_000); // max(50000, 50000)
  });

  it("zero positions = zero deployment", () => {
    const state = calculateCapitalState([], undefined, DEFAULT_CONFIG);
    expect(state.deployedCapitalUsd).toBe(0);
    expect(state.availableCapitalUsd).toBe(90_000); // 100k - 10k reserve
  });
});

// ─── calculateAvailableCapital ─────────────────────────

describe("calculateAvailableCapital", () => {
  it("with compounding: includes profits", () => {
    const avail = calculateAvailableCapital(100_000, 10_000, 40_000, 2_000, 1_000, true);
    // 100000 + 2000 + 1000 - 10000 - 40000 = 53000
    expect(avail).toBe(53_000);
  });

  it("without compounding: ignores profits", () => {
    const avail = calculateAvailableCapital(100_000, 10_000, 40_000, 2_000, 1_000, false);
    // 100000 - 10000 - 40000 = 50000
    expect(avail).toBe(50_000);
  });
});

// ─── applyCompounding ───────────────────────────────

describe("applyCompounding", () => {
  it("adds profits when enabled", () => {
    const result = applyCompounding(100_000, 2_000, 1_000, true);
    expect(result).toBe(103_000);
  });

  it("returns same when disabled", () => {
    const result = applyCompounding(100_000, 2_000, 1_000, false);
    expect(result).toBe(100_000);
  });
});

// ─── validateCapitalDecision ─────────────────────────

describe("validateCapitalDecision", () => {
  it("approves valid request", () => {
    const state: Parameters<typeof validateCapitalDecision>[1] = {
      totalCapitalUsd: 100_000,
      reserveUsd: 10_000,
      deployedCapitalUsd: 30_000,
      availableCapitalUsd: 50_000,
      unrealizedPnlUsd: 0,
      realizedPnlUsd: 0,
      fundingCollectedUsd: 0,
      utilizationPercent: 30,
      updatedAt: Date.now(),
    };

    const errors = validateCapitalDecision(20_000, state, DEFAULT_CONFIG);
    expect(errors).toEqual([]);
  });

  it("rejects when exceeds available", () => {
    const state = {
      totalCapitalUsd: 100_000, reserveUsd: 10_000,
      deployedCapitalUsd: 0, availableCapitalUsd: 10_000,
      unrealizedPnlUsd: 0, realizedPnlUsd: 0, fundingCollectedUsd: 0,
      utilizationPercent: 0, updatedAt: Date.now(),
    };
    const errors = validateCapitalDecision(20_000, state, DEFAULT_CONFIG);
    expect(errors.some((e) => e.includes("exceeds available"))).toBe(true);
  });

  it("rejects when exceeds max position", () => {
    const state = {
      totalCapitalUsd: 100_000, reserveUsd: 10_000,
      deployedCapitalUsd: 0, availableCapitalUsd: 90_000,
      unrealizedPnlUsd: 0, realizedPnlUsd: 0, fundingCollectedUsd: 0,
      utilizationPercent: 0, updatedAt: Date.now(),
    };
    const errors = validateCapitalDecision(60_000, state, DEFAULT_CONFIG);
    expect(errors.some((e) => e.includes("exceeds max position"))).toBe(true);
  });

  it("rejects when below min position", () => {
    const state = {
      totalCapitalUsd: 100_000, reserveUsd: 10_000,
      deployedCapitalUsd: 0, availableCapitalUsd: 90_000,
      unrealizedPnlUsd: 0, realizedPnlUsd: 0, fundingCollectedUsd: 0,
      utilizationPercent: 0, updatedAt: Date.now(),
    };
    const errors = validateCapitalDecision(500, state, DEFAULT_CONFIG);
    expect(errors.some((e) => e.includes("below min position"))).toBe(true);
  });

  it("rejects when projected utilisation exceeds max", () => {
    const state = {
      totalCapitalUsd: 100_000, reserveUsd: 10_000,
      deployedCapitalUsd: 80_000, availableCapitalUsd: 10_000,
      unrealizedPnlUsd: 0, realizedPnlUsd: 0, fundingCollectedUsd: 0,
      utilizationPercent: 80, updatedAt: Date.now(),
    };
    // 80k + 15k = 95k utilisation → 95% > 90%
    const errors = validateCapitalDecision(15_000, state, DEFAULT_CONFIG);
    expect(errors.some((e) => e.includes("utilisation"))).toBe(true);
  });
});

// ─── generateCapitalDecisions ────────────────────────

describe("generateCapitalDecisions", () => {
  it("approves and rejects correctly with sequential tracking", () => {
    const state: Parameters<typeof generateCapitalDecisions>[1] = {
      totalCapitalUsd: 100_000, reserveUsd: 10_000,
      deployedCapitalUsd: 0, availableCapitalUsd: 90_000,
      unrealizedPnlUsd: 0, realizedPnlUsd: 0, fundingCollectedUsd: 0,
      utilizationPercent: 0, updatedAt: Date.now(),
    };

    const requests = [
      { opportunityId: "a", symbol: "A", requestedUsd: 40_000 },
      { opportunityId: "b", symbol: "B", requestedUsd: 40_000 },
      { opportunityId: "c", symbol: "C", requestedUsd: 60_000 }, // exceeds max position
    ];

    const decisions = generateCapitalDecisions(requests, state, DEFAULT_CONFIG);

    expect(decisions[0].approved).toBe(true);
    expect(decisions[1].approved).toBe(true);
    expect(decisions[2].approved).toBe(false); // exceeds max position
  });

  it("tracks remaining available across requests", () => {
    const state = {
      totalCapitalUsd: 100_000, reserveUsd: 10_000,
      deployedCapitalUsd: 0, availableCapitalUsd: 90_000,
      unrealizedPnlUsd: 0, realizedPnlUsd: 0, fundingCollectedUsd: 0,
      utilizationPercent: 0, updatedAt: Date.now(),
    };

    const requests = [
      { opportunityId: "a", symbol: "A", requestedUsd: 50_000 },
      { opportunityId: "b", symbol: "B", requestedUsd: 50_000 }, // second one should fail — only 40k left
    ];

    const decisions = generateCapitalDecisions(requests, state, DEFAULT_CONFIG);

    expect(decisions[0].approved).toBe(true);
    expect(decisions[1].approved).toBe(false); // not enough remaining
  });
});

// ─── generateCapitalManagerReport ───────────────────

describe("generateCapitalManagerReport", () => {
  it("produces correct approved/rejected counts", () => {
    const pos = makePosition({ metadata: { allocatedCapitalUsd: 30_000 } });
    const report = makePortfolioReport({
      summary: {
        totalAllocatedCapitalUsd: 30_000, totalNotionalUsd: 60_000,
        totalFundingCollectedUsd: 500, totalTradingPnlUsd: 1_000,
        totalPnlUsd: 1_500, portfolioApyPercent: 2,
        capitalUtilizationPercent: 30, totalDeltaUsd: 0, totalDeltaPercent: 0,
        openPositionCount: 1, closedPositionCount: 0, positionCount: 1,
        generatedAt: Date.now(),
      },
      contributions: [],
    });

    const requests = [
      { opportunityId: "btc", symbol: "BTCUSDT", requestedUsd: 20_000 },
      { opportunityId: "eth", symbol: "ETHUSDT", requestedUsd: 500 }, // below min
    ];

    const capReport = generateCapitalManagerReport([pos], report, requests, DEFAULT_CONFIG);

    expect(capReport.approvedCount).toBe(1);
    expect(capReport.rejectedCount).toBe(1);
    expect(capReport.capitalState).toBeDefined();
    expect(capReport.capitalState.totalCapitalUsd).toBe(100_000);
  });
});

// ─── Immutability ─────────────────────────────────

describe("immutability", () => {
  it("does not mutate input objects", () => {
    const pos = makePosition();
    const originalId = pos.id;
    calculateCapitalState([pos], undefined, DEFAULT_CONFIG);
    expect(pos.id).toBe(originalId);
  });
});
