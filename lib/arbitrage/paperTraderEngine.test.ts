/**
 * Paper Trader Engine Tests — Alpha Phase A8
 *
 * Acceptance criteria:
 *   Empty state + BTC opportunity (netApy=30, score=90, risk=20,
 *   capacity=50k, rate=0.0001, mark=100000)
 *   config: totalCapital=100k, reserve=0.1, minNetApy=10, maxOpen=3,
 *   maxPosition=50k, minPosition=1k
 *   → first run: 1 position opened (spot long + perp short)
 *   → 8h later: funding accrued
 *   → netApy drops below 10%: exit triggered, position closed
 */

import { describe, expect, it } from "vitest";
import {
  createPaperPositionFromAllocation,
  runPaperTraderStep,
} from "./paperTraderEngine";
import type { PaperTraderConfig, PaperTraderOpportunity, PaperTraderState } from "./paperTraderTypes";

// ─── Helpers ─────────────────────────────────────────────

const UTC = (y: number, m: number, d: number, h: number) =>
  Date.UTC(y, m - 1, d, h, 0, 0, 0);

const EMPTY_STATE: PaperTraderState = {
  openPositions: [],
  closedPositions: [],
  fundingEvents: [],
};

function sampleConfig(overrides?: Partial<PaperTraderConfig>): PaperTraderConfig {
  return {
    totalCapitalUsd: 100_000,
    reserveRatio: 0.1,
    minExpectedNetApy: 10,
    maxOpenPositions: 3,
    maxPositionUsd: 50_000,
    minPositionUsd: 1_000,
    maxAllocationPercentPerOpportunity: 0.5,
    maxDeltaPercent: 3,
    maxHoldingHours: 48,
    fundingDeclineThresholdPercent: 50,
    defaultFundingIntervalHours: 8,
    ...overrides,
  };
}

function sampleOpportunities(): PaperTraderOpportunity[] {
  return [
    {
      id: "opp-btc",
      symbol: "BTC/USDT",
      exchange: "Binance",
      expectedNetApy: 30,
      opportunityScore: 90,
      riskScore: 20,
      capacityUsd: 50_000,
      fundingRate: 0.0001,
      markPrice: 100_000,
    },
    {
      id: "opp-eth",
      symbol: "ETH/USDT",
      exchange: "Binance",
      expectedNetApy: 20,
      opportunityScore: 80,
      riskScore: 25,
      capacityUsd: 40_000,
      fundingRate: 0.00008,
      markPrice: 3_000,
    },
  ];
}

// ─── Acceptance Criteria: First run ─────────────────────

describe("acceptance — first run", () => {
  const cfg = sampleConfig();
  const opps = sampleOpportunities();
  const currentTime = UTC(2026, 1, 1, 0); // 2026-01-01 00:00 UTC

  const result = runPaperTraderStep(EMPTY_STATE, opps, cfg, currentTime);

  it("opens at least 1 position", () => {
    expect(result.openedPositions.length).toBeGreaterThanOrEqual(1);
  });

  it("openPositions in state equals opened count", () => {
    expect(result.state.openPositions.length).toBe(result.openedPositions.length);
  });

  it("position has spot long + perp short structure", () => {
    const pos = result.openedPositions[0];
    expect(pos.spotLeg.side).toBe("long");
    expect(pos.spotLeg.marketType).toBe("spot");
    expect(pos.perpetualLeg.side).toBe("short");
    expect(pos.perpetualLeg.marketType).toBe("perpetual");
  });

  it("fundingCollectedUsd = 0 at open", () => {
    for (const pos of result.openedPositions) {
      expect(pos.fundingCollectedUsd).toBe(0);
    }
  });

  it("portfolioReport exists and has summary", () => {
    expect(result.portfolioReport).toBeDefined();
    expect(result.portfolioReport.summary.totalAllocatedCapitalUsd).toBeGreaterThan(0);
  });

  it("metadata stores lastFundingSettlementAt and entryFundingRate", () => {
    const pos = result.openedPositions[0];
    expect(pos.metadata?.lastFundingSettlementAt).toBe(currentTime);
    expect(pos.metadata?.entryFundingRate).toBe(0.0001);
  });

  it("no exit triggered on first run (shouldExit = false)", () => {
    for (const d of result.exitDecisions) {
      expect(d.shouldExit).toBe(false);
    }
  });
});

// ─── No duplicate symbols ──────────────────────────────

describe("no duplicate symbols", () => {
  it("does not open a position for a symbol already open", () => {
    // First run to open BTC
    const cfg = sampleConfig();
    const opps = sampleOpportunities();
    const t0 = UTC(2026, 1, 1, 0);

    const r1 = runPaperTraderStep(EMPTY_STATE, opps, cfg, t0);
    expect(r1.openedPositions.length).toBeGreaterThan(0);

    // Second run with same opportunities — should not open BTC again
    const r2 = runPaperTraderStep(r1.state, opps, cfg, UTC(2026, 1, 1, 1));
    const openedSymbols = r2.openedPositions.map((p) => p.symbol);
    const alreadyOpen = new Set(r1.state.openPositions.map((p) => p.symbol));

    // New positions should not overlap with existing open positions
    for (const sym of openedSymbols) {
      expect(alreadyOpen.has(sym)).toBe(false);
    }
  });
});

// ─── Max open positions ───────────────────────────────

describe("max open positions", () => {
  it("respects maxOpenPositions = 1", () => {
    const cfg = sampleConfig({ maxOpenPositions: 1 });
    const opps = sampleOpportunities();
    const t0 = UTC(2026, 1, 1, 0);

    // With maxOpen=1, only one position should be opened even if allocation allows more
    const result = runPaperTraderStep(EMPTY_STATE, opps, cfg, t0);
    expect(result.openedPositions.length).toBeLessThanOrEqual(1);
  });
});

// ─── Low netApy ────────────────────────────────────────

describe("low netApy filter", () => {
  it("does not open positions with netApy below minExpectedNetApy", () => {
    const cfg = sampleConfig({ minExpectedNetApy: 50 }); // very high bar
    const opps = sampleOpportunities(); // max netApy = 30
    const t0 = UTC(2026, 1, 1, 0);

    const result = runPaperTraderStep(EMPTY_STATE, opps, cfg, t0);
    expect(result.openedPositions.length).toBe(0);
  });
});

// ─── Funding Accrual ──────────────────────────────────

describe("funding accrual", () => {
  it("accrues funding when 8 hours have passed", () => {
    const cfg = sampleConfig();
    const opps = sampleOpportunities();
    const t0 = UTC(2026, 1, 1, 0);

    // First run opens position
    const r1 = runPaperTraderStep(EMPTY_STATE, opps, cfg, t0);
    expect(r1.fundingEvents.length).toBe(0); // no accrual on open

    // Second run at t0 + 8h — funding should be due
    const t1 = UTC(2026, 1, 1, 8);
    const r2 = runPaperTraderStep(r1.state, opps, cfg, t1);

    // Should have accrued funding
    expect(r2.fundingEvents.length).toBeGreaterThan(0);

    // fundingCollectedUsd should have increased
    const totalFundingBefore = r1.state.openPositions.reduce((s, p) => s + p.fundingCollectedUsd, 0);
    const totalFundingAfter = r2.state.openPositions.reduce((s, p) => s + p.fundingCollectedUsd, 0);
    expect(totalFundingAfter).toBeGreaterThan(totalFundingBefore);
  });

  it("does not accrue funding when less than 8 hours have passed", () => {
    const cfg = sampleConfig();
    const opps = sampleOpportunities();
    const t0 = UTC(2026, 1, 1, 0);

    const r1 = runPaperTraderStep(EMPTY_STATE, opps, cfg, t0);

    // Second run at t0 + 4h — funding NOT due yet
    const t1 = UTC(2026, 1, 1, 4);
    const r2 = runPaperTraderStep(r1.state, opps, cfg, t1);

    expect(r2.fundingEvents.length).toBe(0);
  });
});

// ─── Exit and Close ────────────────────────────────────

describe("exit and close", () => {
  it("closes position when expectedNetApy drops below minExpectedNetApy", () => {
    const cfg = sampleConfig({ minExpectedNetApy: 20 });
    const t0 = UTC(2026, 1, 1, 0);

    // Open BTC (netApy=30) at t0
    const r1 = runPaperTraderStep(EMPTY_STATE, sampleOpportunities(), cfg, t0);
    expect(r1.state.openPositions.length).toBeGreaterThan(0);

    // Now supply opportunities with low netApy for BTC
    const lowNetApyOpps: PaperTraderOpportunity[] = [
      {
        id: "opp-btc",
        symbol: "BTC/USDT",
        exchange: "Binance",
        expectedNetApy: 5, // below minExpectedNetApy=20
        opportunityScore: 90,
        riskScore: 20,
        capacityUsd: 50_000,
        fundingRate: 0.0001,
        markPrice: 100_000,
      },
    ];

    const t1 = UTC(2026, 1, 1, 24);
    const r2 = runPaperTraderStep(r1.state, lowNetApyOpps, cfg, t1);

    // Should have exit decisions
    expect(r2.exitDecisions.length).toBeGreaterThan(0);
    const shouldExit = r2.exitDecisions.some((d) => d.shouldExit);
    expect(shouldExit).toBe(true);

    // Position should now be in closedPositions
    expect(r2.state.closedPositions.length).toBeGreaterThan(0);
    if (r1.state.openPositions.length > 0) {
      const closedIds = new Set(r2.state.closedPositions.map((p) => p.id));
      expect(closedIds.has(r1.state.openPositions[0].id)).toBe(true);
    }
  });

  it("closed position moves from openPositions to closedPositions", () => {
    const cfg = sampleConfig({ minExpectedNetApy: 30 });
    const t0 = UTC(2026, 1, 1, 0);

    const r1 = runPaperTraderStep(EMPTY_STATE, sampleOpportunities(), cfg, t0);
    expect(r1.state.openPositions.length).toBeGreaterThan(0);
    const openedId = r1.openedPositions[0].id;

    // Run with the same opportunities — netApy=30 still, minExpectedNetApy=30
    // netApy (30) is not < min (30), so no exit from that rule
    // But we need to trigger exit. Use low netApy.
    const lowOpps: PaperTraderOpportunity[] = [
      {
        id: "opp-btc",
        symbol: "BTC/USDT",
        exchange: "Binance",
        expectedNetApy: 5,
        opportunityScore: 90,
        riskScore: 20,
        capacityUsd: 50_000,
        fundingRate: 0.0001,
        markPrice: 100_000,
      },
    ];

    const t1 = UTC(2026, 1, 1, 24);
    const r2 = runPaperTraderStep(r1.state, lowOpps, cfg, t1);

    // The position should no longer be in openPositions
    const stillOpen = r2.state.openPositions.some((p) => p.id === openedId);
    expect(stillOpen).toBe(false);

    // It should be in closedPositions
    const isClosed = r2.state.closedPositions.some((p) => p.id === openedId);
    expect(isClosed).toBe(true);
  });
});

// ─── Portfolio Report generation ──────────────────────

describe("portfolio report generation", () => {
  it("portfolioReport is generated after each step", () => {
    const cfg = sampleConfig();
    const opps = sampleOpportunities();
    const t0 = UTC(2026, 1, 1, 0);

    const r1 = runPaperTraderStep(EMPTY_STATE, opps, cfg, t0);
    expect(r1.portfolioReport).toBeDefined();
    expect(r1.portfolioReport.summary.positionCount).toBeGreaterThan(0);
  });

  it("state stores updated portfolio report", () => {
    const cfg = sampleConfig();
    const opps = sampleOpportunities();
    const t0 = UTC(2026, 1, 1, 0);

    const r1 = runPaperTraderStep(EMPTY_STATE, opps, cfg, t0);
    expect(r1.state.portfolioReport).toBeDefined();
  });
});

// ─── Immutability ─────────────────────────────────────

describe("immutability", () => {
  it("does not mutate the original state", () => {
    const cfg = sampleConfig();
    const opps = sampleOpportunities();
    const t0 = UTC(2026, 1, 1, 0);

    const originalLen = EMPTY_STATE.openPositions.length;
    runPaperTraderStep(EMPTY_STATE, opps, cfg, t0);
    expect(EMPTY_STATE.openPositions.length).toBe(originalLen);
  });
});

// ─── Funding events accumulate ────────────────────────

describe("funding events accumulate", () => {
  it("fundingEvents persist across steps in state", () => {
    const cfg = sampleConfig();
    const opps = sampleOpportunities();
    const t0 = UTC(2026, 1, 1, 0);

    const r1 = runPaperTraderStep(EMPTY_STATE, opps, cfg, t0);
    expect(r1.state.fundingEvents.length).toBe(0);

    const t1 = UTC(2026, 1, 1, 8);
    const r2 = runPaperTraderStep(r1.state, opps, cfg, t1);
    expect(r2.state.fundingEvents.length).toBeGreaterThan(0);

    // Another run should preserve previous events
    const t2 = UTC(2026, 1, 1, 16);
    const r3 = runPaperTraderStep(r2.state, opps, cfg, t2);
    expect(r3.state.fundingEvents.length).toBeGreaterThan(r2.state.fundingEvents.length);
  });
});

// ─── createPaperPositionFromAllocation ─────────────────

describe("createPaperPositionFromAllocation", () => {
  it("creates a position with correct structure", () => {
    const opp: PaperTraderOpportunity = {
      id: "opp-test",
      symbol: "TEST/USDT",
      exchange: "Binance",
      expectedNetApy: 25,
      opportunityScore: 85,
      riskScore: 15,
      capacityUsd: 20_000,
      fundingRate: 0.0002,
      markPrice: 50,
    };

    const pos = createPaperPositionFromAllocation(
      { opportunityId: "opp-test", symbol: "TEST/USDT", allocatedUsd: 10_000 },
      opp,
      UTC(2026, 1, 1, 0),
    );

    expect(pos.symbol).toBe("TEST/USDT");
    expect(pos.spotLeg.side).toBe("long");
    expect(pos.perpetualLeg.side).toBe("short");
    // quantity = 10000 / 50 = 200
    expect(pos.spotLeg.quantity).toBe(200);
    expect(pos.perpetualLeg.quantity).toBe(200);
    expect(pos.fundingCollectedUsd).toBe(0);
    expect(pos.metadata?.lastFundingSettlementAt).toBe(UTC(2026, 1, 1, 0));
    expect(pos.metadata?.entryFundingRate).toBe(0.0002);
  });
});

// ─── Closed positions accumulate ──────────────────────

describe("closed positions accumulate", () => {
  it("closedPositions are preserved across steps", () => {
    const cfg = sampleConfig({ minExpectedNetApy: 30 });
    const t0 = UTC(2026, 1, 1, 0);

    const r1 = runPaperTraderStep(EMPTY_STATE, sampleOpportunities(), cfg, t0);
    expect(r1.state.closedPositions.length).toBe(0);

    // Force exit with low netApy
    const lowOpps: PaperTraderOpportunity[] = [
      {
        id: "opp-btc",
        symbol: "BTC/USDT",
        expectedNetApy: 5,
        opportunityScore: 90,
        riskScore: 20,
        capacityUsd: 50_000,
        fundingRate: 0.0001,
        markPrice: 100_000,
        exchange: "Binance",
      },
    ];

    const t1 = UTC(2026, 1, 1, 24);
    const r2 = runPaperTraderStep(r1.state, lowOpps, cfg, t1);
    expect(r2.state.closedPositions.length).toBeGreaterThan(0);

    // Second close session should preserve already-closed positions
    const t2 = UTC(2026, 1, 2, 24);
    const r3 = runPaperTraderStep(r2.state, lowOpps, cfg, t2);
    expect(r3.state.closedPositions.length).toBeGreaterThanOrEqual(r2.state.closedPositions.length);
  });
});

// ─── Step result fields ───────────────────────────────

describe("step result fields", () => {
  it("returns all required fields in PaperTraderStepResult", () => {
    const cfg = sampleConfig();
    const opps = sampleOpportunities();
    const t0 = UTC(2026, 1, 1, 0);

    const result = runPaperTraderStep(EMPTY_STATE, opps, cfg, t0);

    expect(result).toHaveProperty("state");
    expect(result).toHaveProperty("openedPositions");
    expect(result).toHaveProperty("closedPositions");
    expect(result).toHaveProperty("fundingEvents");
    expect(result).toHaveProperty("exitDecisions");
    expect(result).toHaveProperty("portfolioReport");
    expect(result).toHaveProperty("ranAt");
    expect(typeof result.ranAt).toBe("number");
  });
});
