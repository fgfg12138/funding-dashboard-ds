/**
 * Auto Monitoring Engine Tests — Semi Phase 3
 *
 * Acceptance criteria:
 *   BTCUSDT: funding=50, PnL=100, delta=1%, risk=low, reconcile OK
 *   → position.status=healthy, overallStatus=healthy
 *
 *   Delta=5% → delta metric=danger, position.status=danger, overallStatus=danger
 */

import { describe, expect, it } from "vitest";
import {
  buildDeltaMetric,
  buildFundingMetric,
  buildPnlMetric,
  buildReconciliationMetric,
  buildRiskMetric,
  calculateOverallMonitoringStatus,
  generateMonitoringReport,
  monitorPosition,
} from "./autoMonitoringEngine";
import type { ArbitrageLeg, ArbitragePosition } from "../arbitrage/arbitragePositionTypes";
import type { RiskReport } from "../riskMonitoring/riskMonitoringTypes";
import type { PositionReconciliationReport } from "../positionReconciliation/positionReconciliationTypes";

// ─── Helpers ─────────────────────────────────────────────

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

function makePosition(overrides?: Partial<ArbitragePosition>): ArbitragePosition {
  return {
    id: "pos-btc",
    symbol: "BTCUSDT",
    status: "open",
    openedAt: 100_000,
    spotLeg: makeLeg({ marketType: "spot", side: "long", notionalUsd: 100_000 }),
    perpetualLeg: makeLeg({ marketType: "perpetual", side: "short", notionalUsd: 100_000 }),
    fundingCollectedUsd: 50,
    totalPnlUsd: 100,
    deltaUsd: 0,
    deltaPercent: 1,
    ...overrides,
  };
}

function makeRiskReport(overrides?: Partial<RiskReport>): RiskReport {
  return {
    events: [], lowCount: 0, mediumCount: 0, highCount: 0, criticalCount: 0,
    overallRisk: "low", generatedAt: Date.now(),
    ...overrides,
  };
}

function makeReconReport(overrides?: Partial<PositionReconciliationReport>): PositionReconciliationReport {
  return {
    items: [{ symbol: "BTCUSDT", exchange: "binance", status: "matched", severity: "low", message: "ok", diff: "" }],
    matchedCount: 1,
    mismatchCount: 0,
    highSeverityCount: 0,
    generatedAt: Date.now(),
    ...overrides,
  };
}

const defaultCfg = {
  maxDeltaPercent: 3,
  minFundingCollectedUsd: 0,
  maxLossUsd: 500,
  dangerRiskLevels: ["critical", "high"],
  warningRiskLevels: ["medium"],
};

// ─── Acceptance Criteria ─────────────────────────────────

describe("acceptance criteria", () => {
  it("healthy position → status=healthy, overallStatus=healthy", () => {
    const pos = makePosition();
    const risk = makeRiskReport();
    const recon = makeReconReport();

    const report = generateMonitoringReport([pos], risk, recon);

    expect(report.positions.length).toBe(1);
    expect(report.positions[0].status).toBe("healthy");
    expect(report.overallStatus).toBe("healthy");
    expect(report.warningCount).toBe(0);
    expect(report.dangerCount).toBe(0);
  });

  it("delta=5% → danger", () => {
    const pos = makePosition({ deltaPercent: 5 });
    const risk = makeRiskReport();
    const recon = makeReconReport();

    const report = generateMonitoringReport([pos], risk, recon);

    expect(report.positions[0].status).toBe("danger");
    expect(report.overallStatus).toBe("danger");
    expect(report.dangerCount).toBe(1);
  });
});

// ─── buildFundingMetric ─────────────────────────────

describe("buildFundingMetric", () => {
  it("value=50 with no min threshold → healthy", () => {
    const pos = makePosition({ fundingCollectedUsd: 50 });
    const m = buildFundingMetric(pos, defaultCfg);
    expect(m.status).toBe("healthy");
    expect(m.value).toBe(50);
  });

  it("value=50 with min=100 → warning", () => {
    const pos = makePosition({ fundingCollectedUsd: 50 });
    const m = buildFundingMetric(pos, { ...defaultCfg, minFundingCollectedUsd: 100 });
    expect(m.status).toBe("warning");
  });
});

// ─── buildDeltaMetric ──────────────────────────────

describe("buildDeltaMetric", () => {
  it("1% with max=3 → healthy", () => {
    const pos = makePosition({ deltaPercent: 1 });
    const m = buildDeltaMetric(pos, defaultCfg);
    expect(m.status).toBe("healthy");
  });

  it("5% with max=3 → danger", () => {
    const pos = makePosition({ deltaPercent: 5 });
    const m = buildDeltaMetric(pos, defaultCfg);
    expect(m.status).toBe("danger");
  });
});

// ─── buildPnlMetric ─────────────────────────────

describe("buildPnlMetric", () => {
  it("+100 with maxLoss=500 → healthy", () => {
    const pos = makePosition({ totalPnlUsd: 100 });
    const m = buildPnlMetric(pos, defaultCfg);
    expect(m.status).toBe("healthy");
  });

  it("-600 with maxLoss=500 → danger", () => {
    const pos = makePosition({ totalPnlUsd: -600 });
    const m = buildPnlMetric(pos, defaultCfg);
    expect(m.status).toBe("danger");
  });
});

// ─── buildRiskMetric ────────────────────────────

describe("buildRiskMetric", () => {
  it("low → healthy", () => {
    const m = buildRiskMetric(makeRiskReport({ overallRisk: "low" }), defaultCfg);
    expect(m.status).toBe("healthy");
  });

  it("medium → warning", () => {
    const m = buildRiskMetric(makeRiskReport({ overallRisk: "medium" }), defaultCfg);
    expect(m.status).toBe("warning");
  });

  it("critical → danger", () => {
    const m = buildRiskMetric(makeRiskReport({ overallRisk: "critical" }), defaultCfg);
    expect(m.status).toBe("danger");
  });

  it("undefined report → healthy", () => {
    const m = buildRiskMetric(undefined, defaultCfg);
    expect(m.status).toBe("healthy");
  });
});

// ─── buildReconciliationMetric ─────────────────

describe("buildReconciliationMetric", () => {
  it("matched only → healthy", () => {
    const m = buildReconciliationMetric(makeReconReport({ highSeverityCount: 0, mismatchCount: 0 }));
    expect(m.status).toBe("healthy");
  });

  it("mismatch > 0 → warning", () => {
    const m = buildReconciliationMetric(makeReconReport({ highSeverityCount: 0, mismatchCount: 2 }));
    expect(m.status).toBe("warning");
  });

  it("highSeverity > 0 → danger", () => {
    const m = buildReconciliationMetric(makeReconReport({ highSeverityCount: 1, mismatchCount: 1 }));
    expect(m.status).toBe("danger");
  });

  it("undefined → healthy", () => {
    const m = buildReconciliationMetric(undefined);
    expect(m.status).toBe("healthy");
  });
});

// ─── calculateOverallMonitoringStatus ──────────────

describe("calculateOverallMonitoringStatus", () => {
  it("all healthy → healthy", () => {
    const status = calculateOverallMonitoringStatus([
      { positionId: "a", symbol: "A", status: "healthy", fundingCollectedUsd: 0, totalPnlUsd: 0, deltaPercent: 0, riskStatus: "healthy", reconciliationStatus: "healthy", metrics: [] },
    ]);
    expect(status).toBe("healthy");
  });

  it("any danger → danger", () => {
    const status = calculateOverallMonitoringStatus([
      { positionId: "a", symbol: "A", status: "healthy", fundingCollectedUsd: 0, totalPnlUsd: 0, deltaPercent: 0, riskStatus: "healthy", reconciliationStatus: "healthy", metrics: [] },
      { positionId: "b", symbol: "B", status: "danger", fundingCollectedUsd: 0, totalPnlUsd: 0, deltaPercent: 0, riskStatus: "healthy", reconciliationStatus: "healthy", metrics: [] },
    ]);
    expect(status).toBe("danger");
  });

  it("warning without danger → warning", () => {
    const status = calculateOverallMonitoringStatus([
      { positionId: "a", symbol: "A", status: "warning", fundingCollectedUsd: 0, totalPnlUsd: 0, deltaPercent: 0, riskStatus: "healthy", reconciliationStatus: "healthy", metrics: [] },
    ]);
    expect(status).toBe("warning");
  });
});

// ─── Full Report ─────────────────────────────────

describe("generateMonitoringReport", () => {
  it("mixed positions produce correct counts", () => {
    const healthy = makePosition({ id: "pos-a", symbol: "A", deltaPercent: 1, fundingCollectedUsd: 50, totalPnlUsd: 100 });
    const danger = makePosition({ id: "pos-b", symbol: "B", deltaPercent: 10, fundingCollectedUsd: 0, totalPnlUsd: -1000 });
    const risk = makeRiskReport();
    const recon = makeReconReport();

    const report = generateMonitoringReport([healthy, danger], risk, recon);

    expect(report.positions.length).toBe(2);
    expect(report.overallStatus).toBe("danger");
    expect(report.dangerCount).toBe(1);
    expect(report.warningCount).toBe(0);
  });

  it("generatedAt is set", () => {
    const pos = makePosition();
    const report = generateMonitoringReport([pos]);
    expect(typeof report.generatedAt).toBe("number");
    expect(report.generatedAt).toBeGreaterThan(0);
  });
});

// ─── Immutability ─────────────────────────────────

describe("immutability", () => {
  it("does not mutate input", () => {
    const pos = makePosition();
    const originalId = pos.id;
    generateMonitoringReport([pos]);
    expect(pos.id).toBe(originalId);
  });
});
