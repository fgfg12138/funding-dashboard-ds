/**
 * Risk Monitoring Engine Tests — Beta Phase 5
 *
 * Acceptance criteria:
 *   BTCUSDT: leverage=10, deltaPercent=5, notional=100000,
 *            liquidationDistance=5%
 *   Config: maxLeverage=5, maxDelta=3, maxNotional=50000,
 *           minLiquidationDistance=10
 *   → Events: leverage, delta, position, liquidation
 *   → overallRisk = critical
 */

import { describe, expect, it } from "vitest";
import {
  calculateOverallRisk,
  checkDeltaRisk,
  checkLeverageRisk,
  checkLiquidationRisk,
  checkMarginRisk,
  checkPositionRisk,
  checkReconciliationRisk,
  generateRiskReport,
} from "./riskMonitoringEngine";
import type { AccountPosition } from "../accountSync/accountSyncTypes";
import type { ArbitrageLeg, ArbitragePosition } from "../arbitrage/arbitragePositionTypes";
import type { PositionReconciliationReport } from "../positionReconciliation/positionReconciliationTypes";

// ─── Helpers ─────────────────────────────────────────────

function makeAccountPos(overrides?: Partial<AccountPosition>): AccountPosition {
  return {
    exchange: "binance",
    symbol: "BTCUSDT",
    side: "short",
    quantity: 1,
    entryPrice: 100_000,
    markPrice: 100_000,
    leverage: 10,
    unrealizedPnl: -500,
    updatedAt: Date.now(),
    ...overrides,
  };
}

function makeLeg(overrides?: Partial<ArbitrageLeg>): ArbitrageLeg {
  return {
    exchange: "Binance",
    symbol: "BTCUSDT",
    marketType: "perpetual",
    side: "short",
    quantity: 1,
    entryPrice: 100_000,
    markPrice: 100_000,
    notionalUsd: 100_000,
    unrealizedPnlUsd: 0,
    ...overrides,
  };
}

function makeLocalPosition(overrides?: Partial<ArbitragePosition>): ArbitragePosition {
  return {
    id: "pos-btc",
    symbol: "BTCUSDT",
    status: "open",
    openedAt: 100_000,
    spotLeg: makeLeg({ marketType: "spot", side: "long", notionalUsd: 100_000 }),
    perpetualLeg: makeLeg({ marketType: "perpetual", side: "short", notionalUsd: 100_000 }),
    fundingCollectedUsd: 0,
    totalPnlUsd: 0,
    deltaUsd: -100_000,
    deltaPercent: 5,
    ...overrides,
  };
}

const defaultCfg = {
  maxLeverage: 5,
  minMarginRatioPercent: 20,
  minLiquidationDistancePercent: 10,
  maxDeltaPercent: 3,
  maxPositionNotionalUsd: 50_000,
  allowOpenReconciliationIssues: false,
};

// ─── Acceptance Criteria ─────────────────────────────────

describe("acceptance criteria", () => {
  it("leverage=10, delta=5%, notional=100k, liquidation=5% → critical", () => {
    const accountPos = makeAccountPos({
      leverage: 10,
      quantity: 1,
      markPrice: 100_000,
      entryPrice: 100_000,
      unrealizedPnl: -500,
    });
    const localPos = makeLocalPosition({
      deltaPercent: 5,
      perpetualLeg: makeLeg({ notionalUsd: 100_000 }),
      spotLeg: makeLeg({ notionalUsd: 100_000 }),
    });

    const report = generateRiskReport([accountPos], [localPos], undefined, {
      maxLeverage: 5,
      maxDeltaPercent: 3,
      maxPositionNotionalUsd: 50_000,
      minLiquidationDistancePercent: 10,
    });

    // Check that all expected categories are present
    const categories = report.events.map((e) => e.category);
    expect(categories).toContain("leverage");
    expect(categories).toContain("delta");
    expect(categories).toContain("position");
    expect(categories).toContain("liquidation");

    expect(report.overallRisk).toBe("critical");
  });
});

// ─── Leverage Risk ─────────────────────────────────────

describe("checkLeverageRisk", () => {
  it("triggers when leverage > max", () => {
    const events = checkLeverageRisk(
      [makeAccountPos({ leverage: 10 })],
      defaultCfg,
    );
    expect(events.length).toBe(1);
    expect(events[0].category).toBe("leverage");
    expect(events[0].severity).toBe("high");
  });

  it("no event when leverage <= max", () => {
    const events = checkLeverageRisk(
      [makeAccountPos({ leverage: 5 })],
      defaultCfg,
    );
    expect(events.length).toBe(0);
  });

  it("no event when leverage is undefined", () => {
    const events = checkLeverageRisk(
      [makeAccountPos({ leverage: undefined })],
      defaultCfg,
    );
    expect(events.length).toBe(0);
  });
});

// ─── Margin Risk ─────────────────────────────────────

describe("checkMarginRisk", () => {
  it("triggers when margin ratio is below minimum", () => {
    // leverage=50, small unrealizedPnl → low margin ratio
    const events = checkMarginRisk(
      [makeAccountPos({ leverage: 50, unrealizedPnl: -100 })],
      defaultCfg,
    );
    expect(events.length).toBe(1);
    expect(events[0].category).toBe("margin");
    expect(events[0].severity).toBe("high");
  });

  it("no event when margin is sufficient", () => {
    // leverage=2, no PnL loss → healthy margin
    const events = checkMarginRisk(
      [makeAccountPos({ leverage: 2, unrealizedPnl: 0 })],
      defaultCfg,
    );
    expect(events.length).toBe(0);
  });
});

// ─── Liquidation Risk ─────────────────────────────────

describe("checkLiquidationRisk", () => {
  it("triggers when liquidation distance is too low", () => {
    // high leverage + negative PnL → close to liquidation
    const events = checkLiquidationRisk(
      [makeAccountPos({ leverage: 50, unrealizedPnl: -1800, quantity: 1, entryPrice: 100_000, markPrice: 99_000 })],
      defaultCfg,
    );
    expect(events.length).toBe(1);
    expect(events[0].category).toBe("liquidation");
    expect(events[0].severity).toBe("critical");
  });

  it("no event when distance is safe", () => {
    const events = checkLiquidationRisk(
      [makeAccountPos({ leverage: 2, unrealizedPnl: 0 })],
      defaultCfg,
    );
    expect(events.length).toBe(0);
  });
});

// ─── Delta Risk ──────────────────────────────────────

describe("checkDeltaRisk", () => {
  it("triggers when |deltaPercent| > max", () => {
    const events = checkDeltaRisk(
      [makeLocalPosition({ deltaPercent: 5 })],
      defaultCfg,
    );
    expect(events.length).toBe(1);
    expect(events[0].category).toBe("delta");
    expect(events[0].severity).toBe("medium");
  });

  it("no event when delta within limit", () => {
    const events = checkDeltaRisk(
      [makeLocalPosition({ deltaPercent: 2 })],
      defaultCfg,
    );
    expect(events.length).toBe(0);
  });
});

// ─── Position Risk ───────────────────────────────────

describe("checkPositionRisk", () => {
  it("triggers when notional > max", () => {
    const events = checkPositionRisk(
      [makeLocalPosition({
        spotLeg: makeLeg({ notionalUsd: 100_000 }),
        perpetualLeg: makeLeg({ notionalUsd: 100_000 }),
      })],
      defaultCfg,
    );
    expect(events.length).toBe(1);
    expect(events[0].category).toBe("position");
    expect(events[0].severity).toBe("medium");
  });

  it("no event when notional within limit", () => {
    const events = checkPositionRisk(
      [makeLocalPosition({
        spotLeg: makeLeg({ notionalUsd: 30_000 }),
        perpetualLeg: makeLeg({ notionalUsd: 30_000 }),
      })],
      defaultCfg,
    );
    expect(events.length).toBe(0);
  });
});

// ─── Reconciliation Risk ─────────────────────────────

describe("checkReconciliationRisk", () => {
  it("triggers for missing_on_exchange items", () => {
    const report: PositionReconciliationReport = {
      items: [{
        symbol: "BTCUSDT",
        exchange: "binance",
        status: "missing_on_exchange",
        severity: "high",
        message: "本地仓位在交易所未找到",
        diff: "缺失",
      }],
      matchedCount: 0,
      mismatchCount: 1,
      highSeverityCount: 1,
      generatedAt: Date.now(),
    };

    const events = checkReconciliationRisk(report, defaultCfg);
    expect(events.length).toBe(1);
    expect(events[0].category).toBe("reconciliation");
    expect(events[0].severity).toBe("high");
  });

  it("no events for matched items", () => {
    const report: PositionReconciliationReport = {
      items: [{
        symbol: "BTCUSDT",
        exchange: "binance",
        status: "matched",
        severity: "low",
        message: "一致",
        diff: "无差异",
      }],
      matchedCount: 1,
      mismatchCount: 0,
      highSeverityCount: 0,
      generatedAt: Date.now(),
    };

    const events = checkReconciliationRisk(report, defaultCfg);
    expect(events.length).toBe(0);
  });

  it("returns empty when report is undefined", () => {
    const events = checkReconciliationRisk(undefined, defaultCfg);
    expect(events.length).toBe(0);
  });
});

// ─── Overall Risk ────────────────────────────────────

describe("calculateOverallRisk", () => {
  it("critical when any critical event exists", () => {
    const events = [
      { id: "1", category: "liquidation" as const, severity: "critical" as const, title: "x", message: "x", createdAt: 0 },
    ];
    expect(calculateOverallRisk(events)).toBe("critical");
  });

  it("high when no critical but high exists", () => {
    const events = [
      { id: "1", category: "leverage" as const, severity: "high" as const, title: "x", message: "x", createdAt: 0 },
    ];
    expect(calculateOverallRisk(events)).toBe("high");
  });

  it("medium when no critical/high but medium exists", () => {
    const events = [
      { id: "1", category: "delta" as const, severity: "medium" as const, title: "x", message: "x", createdAt: 0 },
    ];
    expect(calculateOverallRisk(events)).toBe("medium");
  });

  it("low when no events", () => {
    expect(calculateOverallRisk([])).toBe("low");
  });

  it("critical overrides high", () => {
    const events = [
      { id: "1", category: "leverage" as const, severity: "high" as const, title: "x", message: "x", createdAt: 0 },
      { id: "2", category: "liquidation" as const, severity: "critical" as const, title: "x", message: "x", createdAt: 0 },
    ];
    expect(calculateOverallRisk(events)).toBe("critical");
  });
});

// ─── Full Report ────────────────────────────────────

describe("generateRiskReport", () => {
  it("counts severities correctly", () => {
    // 1 high (leverage) + 1 medium (delta) + 1 medium (position) + 1 critical (liquidation)
    const accountPos = makeAccountPos({ leverage: 10, unrealizedPnl: -1900 });
    const localPos = makeLocalPosition({ deltaPercent: 5, perpetualLeg: makeLeg({ notionalUsd: 100_000 }) });

    const report = generateRiskReport([accountPos], [localPos], undefined, {
      maxLeverage: 5,
      maxDeltaPercent: 3,
      maxPositionNotionalUsd: 50_000,
      minLiquidationDistancePercent: 10,
    });

    expect(report.criticalCount).toBeGreaterThanOrEqual(1);
    expect(report.highCount).toBeGreaterThanOrEqual(1);
    expect(report.mediumCount).toBeGreaterThanOrEqual(2);
    expect(report.overallRisk).toBe("critical");
    expect(typeof report.generatedAt).toBe("number");
  });

  it("multiple identical checks produce multiple events", () => {
    const accountPos1 = makeAccountPos({ symbol: "BTCUSDT", leverage: 10 });
    const accountPos2 = makeAccountPos({ symbol: "ETHUSDT", leverage: 8 });

    const events = checkLeverageRisk([accountPos1, accountPos2], defaultCfg);
    expect(events.length).toBe(2);
  });
});

// ─── Immutability ────────────────────────────────────

describe("immutability", () => {
  it("does not mutate input arrays", () => {
    const accountPositions = [makeAccountPos()];
    const localPositions = [makeLocalPosition()];
    const originalLen = accountPositions.length;

    generateRiskReport(accountPositions, localPositions);
    expect(accountPositions.length).toBe(originalLen);
  });
});
