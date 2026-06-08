/**
 * Portfolio Engine Tests — Alpha Phase A7
 *
 * Acceptance criteria:
 *   totalCapitalUsd = 100000
 *   Position A: allocatedCapital=40000, funding=100, spotPnl=50, perpPnl=-20
 *               totalPnl=130, deltaUsd=100
 *   Position B: allocatedCapital=30000, funding=80, spotPnl=-10, perpPnl=20
 *               totalPnl=90, deltaUsd=-50
 *   → totalAllocated=70000, totalFunding=180, totalTradingPnl=40,
 *     totalPnlUsd=220, util=70%, totalDeltaUsd=50
 */

import { describe, expect, it } from "vitest";
import {
  calculateCapitalUtilization,
  calculatePortfolioApy,
  calculatePortfolioReport,
  calculatePortfolioSummary,
} from "./portfolioEngine";
import type { ArbitrageLeg, ArbitragePosition } from "./arbitragePositionTypes";
import type { PortfolioPositionInput } from "./portfolioTypes";

// ─── Helpers ─────────────────────────────────────────────

const UTC = (y: number, m: number, d: number, h: number) =>
  Date.UTC(y, m - 1, d, h, 0, 0, 0);

function makeLeg(overrides?: Partial<ArbitrageLeg>): ArbitrageLeg {
  return {
    exchange: "Binance",
    symbol: "BTC/USDT",
    marketType: "perpetual",
    side: "short",
    quantity: 1,
    entryPrice: 10000,
    markPrice: 10000,
    notionalUsd: 10000,
    unrealizedPnlUsd: 0,
    ...overrides,
  };
}

function makePosition(overrides?: Partial<ArbitragePosition>): ArbitragePosition {
  return {
    id: "pos-test",
    symbol: "BTC/USDT",
    status: "open",
    openedAt: UTC(2026, 1, 1, 0),
    spotLeg: makeLeg({ marketType: "spot", side: "long", notionalUsd: 10000, unrealizedPnlUsd: 0 }),
    perpetualLeg: makeLeg({ marketType: "perpetual", side: "short", notionalUsd: 10000, unrealizedPnlUsd: 0 }),
    fundingCollectedUsd: 0,
    totalPnlUsd: 0,
    deltaUsd: 0,
    deltaPercent: 0,
    ...overrides,
  };
}

// ─── Acceptance Criteria ─────────────────────────────────

describe("acceptance criteria", () => {
  const posA = makePosition({
    id: "pos-a",
    symbol: "BTC/USDT",
    openedAt: UTC(2026, 1, 1, 0),
    spotLeg: makeLeg({ marketType: "spot", side: "long", notionalUsd: 40000, unrealizedPnlUsd: 50 }),
    perpetualLeg: makeLeg({ marketType: "perpetual", side: "short", notionalUsd: 40000, unrealizedPnlUsd: -20 }),
    fundingCollectedUsd: 100,
    totalPnlUsd: 130,
    deltaUsd: 100,
    deltaPercent: 0.25,
  });

  const posB = makePosition({
    id: "pos-b",
    symbol: "ETH/USDT",
    openedAt: UTC(2026, 1, 1, 0),
    spotLeg: makeLeg({ marketType: "spot", side: "long", notionalUsd: 30000, unrealizedPnlUsd: -10 }),
    perpetualLeg: makeLeg({ marketType: "perpetual", side: "short", notionalUsd: 30000, unrealizedPnlUsd: 20 }),
    fundingCollectedUsd: 80,
    totalPnlUsd: 90,
    deltaUsd: -50,
    deltaPercent: -0.17,
  });

  const inputs: PortfolioPositionInput[] = [
    { position: posA, allocatedCapitalUsd: 40_000 },
    { position: posB, allocatedCapitalUsd: 30_000 },
  ];

  const report = calculatePortfolioReport(inputs, { totalCapitalUsd: 100_000 });
  const summary = report.summary;

  it("totalAllocatedCapitalUsd = 40000 + 30000 = 70000", () => {
    expect(summary.totalAllocatedCapitalUsd).toBe(70_000);
  });

  it("totalFundingCollectedUsd = 100 + 80 = 180", () => {
    expect(summary.totalFundingCollectedUsd).toBe(180);
  });

  it("totalTradingPnlUsd = (50+-20) + (-10+20) = 30 + 10 = 40", () => {
    expect(summary.totalTradingPnlUsd).toBe(40);
  });

  it("totalPnlUsd = 130 + 90 = 220", () => {
    expect(summary.totalPnlUsd).toBe(220);
  });

  it("capitalUtilizationPercent = 70000 / 100000 * 100 = 70", () => {
    expect(summary.capitalUtilizationPercent).toBe(70);
  });

  it("totalDeltaUsd = 100 + (-50) = 50", () => {
    expect(summary.totalDeltaUsd).toBe(50);
  });

  it("openPositionCount = 2", () => {
    expect(summary.openPositionCount).toBe(2);
  });
});

// ─── Summary: Funding + Trading + Total ─────────────────

describe("totalFundingCollectedUsd / totalTradingPnlUsd / totalPnlUsd", () => {
  it("correctly sums funding, trading, and total PnL", () => {
    const pos = makePosition({
      fundingCollectedUsd: 200,
      spotLeg: makeLeg({ marketType: "spot", side: "long", unrealizedPnlUsd: 100, notionalUsd: 10000 }),
      perpetualLeg: makeLeg({ marketType: "perpetual", side: "short", unrealizedPnlUsd: -50, notionalUsd: 10000 }),
      totalPnlUsd: 250,
    });
    const inputs: PortfolioPositionInput[] = [{ position: pos }];
    const summary = calculatePortfolioSummary(inputs, { totalCapitalUsd: 100_000 });
    expect(summary.totalFundingCollectedUsd).toBe(200);
    expect(summary.totalTradingPnlUsd).toBe(50); // 100 + (-50)
    expect(summary.totalPnlUsd).toBe(250);
  });
});

// ─── Open / Closed Counts ───────────────────────────────

describe("position counts", () => {
  it("counts open and closed positions", () => {
    const open = makePosition({ id: "open", status: "open" });
    const closed = makePosition({ id: "closed", status: "closed" });
    const inputs: PortfolioPositionInput[] = [
      { position: open },
      { position: closed },
    ];
    const summary = calculatePortfolioSummary(inputs, { totalCapitalUsd: 100_000 });
    expect(summary.openPositionCount).toBe(1);
    expect(summary.closedPositionCount).toBe(1);
    expect(summary.positionCount).toBe(2);
  });
});

// ─── includeClosedPositions = false ─────────────────────

describe("includeClosedPositions = false", () => {
  it("excludes closed positions", () => {
    const open = makePosition({ id: "open", status: "open" });
    const closed = makePosition({ id: "closed", status: "closed" });
    const inputs: PortfolioPositionInput[] = [
      { position: open, allocatedCapitalUsd: 10_000 },
      { position: closed, allocatedCapitalUsd: 20_000 },
    ];
    const summary = calculatePortfolioSummary(inputs, {
      totalCapitalUsd: 100_000,
      includeClosedPositions: false,
    });
    expect(summary.positionCount).toBe(1);
    expect(summary.totalAllocatedCapitalUsd).toBe(10_000);
  });
});

// ─── allocatedCapitalUsd fallback ───────────────────────

describe("allocatedCapitalUsd fallback", () => {
  it("uses max(spotNotional, perpNotional) when allocatedCapitalUsd is not set", () => {
    const pos = makePosition({
      spotLeg: makeLeg({ marketType: "spot", side: "long", notionalUsd: 15000 }),
      perpetualLeg: makeLeg({ marketType: "perpetual", side: "short", notionalUsd: 20000 }),
    });
    const inputs: PortfolioPositionInput[] = [{ position: pos }]; // no allocatedCapitalUsd
    const summary = calculatePortfolioSummary(inputs, { totalCapitalUsd: 100_000 });
    expect(summary.totalAllocatedCapitalUsd).toBe(20_000); // max(15000, 20000)
  });

  it("prefers allocatedCapitalUsd when provided", () => {
    const pos = makePosition({
      spotLeg: makeLeg({ marketType: "spot", side: "long", notionalUsd: 50000 }),
      perpetualLeg: makeLeg({ marketType: "perpetual", side: "short", notionalUsd: 50000 }),
    });
    const inputs: PortfolioPositionInput[] = [
      { position: pos, allocatedCapitalUsd: 30_000 },
    ];
    const summary = calculatePortfolioSummary(inputs, { totalCapitalUsd: 100_000 });
    expect(summary.totalAllocatedCapitalUsd).toBe(30_000);
  });
});

// ─── capitalUtilizationPercent ──────────────────────────

describe("calculateCapitalUtilization", () => {
  it("70000 / 100000 = 70%", () => {
    expect(calculateCapitalUtilization(70_000, 100_000)).toBe(70);
  });

  it("0 capital → 0%", () => {
    expect(calculateCapitalUtilization(0, 100_000)).toBe(0);
  });

  it("0 total → 0%", () => {
    expect(calculateCapitalUtilization(50_000, 0)).toBe(0);
  });
});

// ─── totalDeltaUsd / totalDeltaPercent ──────────────────

describe("total delta", () => {
  it("sums deltas correctly", () => {
    const posA = makePosition({ id: "a", deltaUsd: 200, deltaPercent: 1 });
    const posB = makePosition({ id: "b", deltaUsd: -80, deltaPercent: -0.4 });
    const inputs: PortfolioPositionInput[] = [
      { position: posA, allocatedCapitalUsd: 20_000 },
      { position: posB, allocatedCapitalUsd: 20_000 },
    ];
    const summary = calculatePortfolioSummary(inputs, { totalCapitalUsd: 100_000 });
    // totalAllocated = 40000, totalDelta = 120
    // totalDeltaPercent = 120 / 40000 * 100 = 0.3
    expect(summary.totalDeltaUsd).toBe(120);
    expect(summary.totalDeltaPercent).toBeCloseTo(0.3, 2);
  });
});

// ─── portfolioApyPercent ────────────────────────────────

describe("calculatePortfolioApy", () => {
  it("$220 profit on $70k over 24h → ~27.46% APY", () => {
    const apy = calculatePortfolioApy(220, 70_000, 24, 8760);
    // 220/70000 * (8760/24) * 100 = 0.0031428 * 365 * 100 = 114.7...
    // Actually: (220/70000) * (8760/24) * 100 = 0.003142857 * 365 * 100 = 114.71...
    expect(apy).toBeCloseTo(114.71, 1);
  });

  it("returns 0 when capital is 0", () => {
    expect(calculatePortfolioApy(100, 0, 24)).toBe(0);
  });

  it("returns 0 when holding hours is 0", () => {
    expect(calculatePortfolioApy(100, 10000, 0)).toBe(0);
  });
});

// ─── contributionPercent ────────────────────────────────

describe("contributionPercent", () => {
  it("each position's contributionPercent sums to ~100", () => {
    const posA = makePosition({
      id: "a",
      totalPnlUsd: 130,
      fundingCollectedUsd: 100,
      spotLeg: makeLeg({ marketType: "spot", side: "long", unrealizedPnlUsd: 50, notionalUsd: 40000 }),
      perpetualLeg: makeLeg({ marketType: "perpetual", side: "short", unrealizedPnlUsd: -20, notionalUsd: 40000 }),
      deltaUsd: 100,
    });
    const posB = makePosition({
      id: "b",
      totalPnlUsd: 90,
      fundingCollectedUsd: 80,
      spotLeg: makeLeg({ marketType: "spot", side: "long", unrealizedPnlUsd: -10, notionalUsd: 30000 }),
      perpetualLeg: makeLeg({ marketType: "perpetual", side: "short", unrealizedPnlUsd: 20, notionalUsd: 30000 }),
      deltaUsd: -50,
    });
    const inputs: PortfolioPositionInput[] = [
      { position: posA, allocatedCapitalUsd: 40_000 },
      { position: posB, allocatedCapitalUsd: 30_000 },
    ];
    const report = calculatePortfolioReport(inputs, { totalCapitalUsd: 100_000 });
    const total = report.contributions.reduce((s, c) => s + c.contributionPercent, 0);
    expect(total).toBeCloseTo(100, 1);
  });
});

// ─── Empty Portfolio ────────────────────────────────────

describe("empty portfolio", () => {
  it("returns zeros when no positions", () => {
    const summary = calculatePortfolioSummary([], { totalCapitalUsd: 100_000 });
    expect(summary.totalAllocatedCapitalUsd).toBe(0);
    expect(summary.totalPnlUsd).toBe(0);
    expect(summary.positionCount).toBe(0);
    expect(summary.portfolioApyPercent).toBe(0);
    expect(summary.capitalUtilizationPercent).toBe(0);
  });
});

// ─── Immutability ───────────────────────────────────────

describe("immutability", () => {
  it("does not mutate input arrays", () => {
    const inputs: PortfolioPositionInput[] = [
      { position: makePosition() },
    ];
    const originalLen = inputs.length;
    calculatePortfolioSummary(inputs, { totalCapitalUsd: 100_000 });
    expect(inputs.length).toBe(originalLen);
  });
});

// ─── Report includes contributions ──────────────────────

describe("PortfolioReport shape", () => {
  it("report contains summary and contributions", () => {
    const pos = makePosition();
    const inputs: PortfolioPositionInput[] = [{ position: pos, allocatedCapitalUsd: 10_000 }];
    const report = calculatePortfolioReport(inputs, { totalCapitalUsd: 100_000 });
    expect(report.summary).toBeDefined();
    expect(report.contributions).toBeDefined();
    expect(report.contributions.length).toBe(1);
    expect(report.contributions[0].positionId).toBe(pos.id);
  });
});
