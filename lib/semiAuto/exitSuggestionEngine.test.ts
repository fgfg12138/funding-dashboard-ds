/**
 * Exit Suggestion Engine Tests — Semi Phase 4
 *
 * Acceptance criteria:
 *   BTCUSDT: totalPnl=600, funding=80, delta=1%, risk=low,
 *            recon OK, 24h, takeProfit=500
 *   → pnl_target_reached, suggest_exit
 *
 *   Risk=critical → risk_too_high, urgent_exit, severity=high
 */

import { describe, expect, it } from "vitest";
import {
  buildExitMessage,
  buildExitReasons,
  calculateExitSeverity,
  evaluateExitSuggestion,
  generateExitSuggestions,
} from "./exitSuggestionEngine";
import type { ArbitrageLeg, ArbitragePosition } from "../arbitrage/arbitragePositionTypes";
import type { RiskReport } from "../riskMonitoring/riskMonitoringTypes";
import type { PositionReconciliationReport } from "../positionReconciliation/positionReconciliationTypes";

// ─── Helpers ─────────────────────────────────────────────

const UTC = (y: number, m: number, d: number, h: number) =>
  Date.UTC(y, m - 1, d, h, 0, 0, 0);

function makeLeg(overrides?: Partial<ArbitrageLeg>): ArbitrageLeg {
  return {
    exchange: "Binance", symbol: "BTCUSDT", marketType: "perpetual",
    side: "short", quantity: 1, entryPrice: 100_000, markPrice: 100_000,
    notionalUsd: 100_000, unrealizedPnlUsd: 0, ...overrides,
  };
}

function makePosition(overrides?: Partial<ArbitragePosition>): ArbitragePosition {
  return {
    id: "pos-btc", symbol: "BTCUSDT", status: "open",
    openedAt: UTC(2026, 1, 1, 0),
    spotLeg: makeLeg({ marketType: "spot", side: "long" }),
    perpetualLeg: makeLeg({ marketType: "perpetual", side: "short" }),
    fundingCollectedUsd: 80, totalPnlUsd: 600,
    deltaUsd: 0, deltaPercent: 1,
    ...overrides,
  };
}

function makeRiskReport(overrides?: Partial<RiskReport>): RiskReport {
  return {
    events: [], lowCount: 0, mediumCount: 0, highCount: 0, criticalCount: 0,
    overallRisk: "low", generatedAt: Date.now(), ...overrides,
  };
}

function makeReconReport(overrides?: Partial<PositionReconciliationReport>): PositionReconciliationReport {
  return {
    items: [], matchedCount: 1, mismatchCount: 0, highSeverityCount: 0,
    generatedAt: Date.now(), ...overrides,
  };
}

const ACCEPTANCE_TIME = UTC(2026, 1, 2, 0); // 24h after open
const DEFAULT_CONFIG = {
  minNetApyPercent: 10,
  maxDeltaPercent: 3,
  maxHoldingHours: 48,
  takeProfitUsd: 500,
  stopLossUsd: 500,
  urgentRiskLevels: ["critical"],
  warningRiskLevels: ["high", "medium"],
};

// ─── Acceptance Criteria ─────────────────────────────────

describe("acceptance criteria", () => {
  it("totalPnl=600, takeProfit=500 → pnl_target_reached, suggest_exit", () => {
    const pos = makePosition({ totalPnlUsd: 600 });
    const risk = makeRiskReport();
    const recon = makeReconReport();

    const suggestion = evaluateExitSuggestion(pos, risk, recon, ACCEPTANCE_TIME, DEFAULT_CONFIG);

    expect(suggestion.reasons).toContain("pnl_target_reached");
    expect(suggestion.status).toBe("suggest_exit");
  });

  it("risk=critical → risk_too_high, urgent_exit, severity=high", () => {
    const pos = makePosition({ totalPnlUsd: 600 });
    const risk = makeRiskReport({ overallRisk: "critical" });
    const recon = makeReconReport();

    const suggestion = evaluateExitSuggestion(pos, risk, recon, ACCEPTANCE_TIME, DEFAULT_CONFIG);

    expect(suggestion.reasons).toContain("risk_too_high");
    expect(suggestion.status).toBe("urgent_exit");
    expect(suggestion.severity).toBe("high");
  });
});

// ─── buildExitReasons ────────────────────────────────

describe("buildExitReasons", () => {
  it("no issues → empty reasons", () => {
    const pos = makePosition({ totalPnlUsd: 100, deltaPercent: 1 });
    const reasons = buildExitReasons(
      pos, makeRiskReport(), makeReconReport(), ACCEPTANCE_TIME, DEFAULT_CONFIG,
    );
    expect(reasons).toEqual([]);
  });

  it("delta too high → delta_too_high", () => {
    const pos = makePosition({ deltaPercent: 10 });
    const reasons = buildExitReasons(
      pos, makeRiskReport(), makeReconReport(), ACCEPTANCE_TIME, DEFAULT_CONFIG,
    );
    expect(reasons).toContain("delta_too_high");
  });

  it("risk critical → risk_too_high", () => {
    const pos = makePosition();
    const reasons = buildExitReasons(
      pos, makeRiskReport({ overallRisk: "critical" }), makeReconReport(), ACCEPTANCE_TIME, DEFAULT_CONFIG,
    );
    expect(reasons).toContain("risk_too_high");
  });

  it("recon high severity → reconciliation_issue", () => {
    const pos = makePosition();
    const reasons = buildExitReasons(
      pos, makeRiskReport(), makeReconReport({ highSeverityCount: 2 }), ACCEPTANCE_TIME, DEFAULT_CONFIG,
    );
    expect(reasons).toContain("reconciliation_issue");
  });

  it("holding 49h > 48h → max_holding_time_exceeded", () => {
    const pos = makePosition({ openedAt: UTC(2026, 1, 1, 0) });
    const future = UTC(2026, 1, 3, 1); // 49h later
    const reasons = buildExitReasons(
      pos, makeRiskReport(), makeReconReport(), future, DEFAULT_CONFIG,
    );
    expect(reasons).toContain("max_holding_time_exceeded");
  });

  it("totalPnl=600 >= takeProfit=500 → pnl_target_reached", () => {
    const pos = makePosition({ totalPnlUsd: 600 });
    const reasons = buildExitReasons(
      pos, makeRiskReport(), makeReconReport(), ACCEPTANCE_TIME, DEFAULT_CONFIG,
    );
    expect(reasons).toContain("pnl_target_reached");
  });

  it("totalPnl=-600 <= -stopLoss → stop_loss_triggered", () => {
    const pos = makePosition({ totalPnlUsd: -600 });
    const reasons = buildExitReasons(
      pos, makeRiskReport(), makeReconReport(), ACCEPTANCE_TIME, DEFAULT_CONFIG,
    );
    expect(reasons).toContain("stop_loss_triggered");
  });
});

// ─── calculateExitSeverity ──────────────────────────

describe("calculateExitSeverity", () => {
  it("no reasons → low", () => {
    expect(calculateExitSeverity([])).toBe("low");
  });

  it("delta_too_high → medium", () => {
    expect(calculateExitSeverity(["delta_too_high"])).toBe("medium");
  });

  it("stop_loss_triggered → high", () => {
    expect(calculateExitSeverity(["stop_loss_triggered"])).toBe("high");
  });

  it("risk_too_high → high", () => {
    expect(calculateExitSeverity(["risk_too_high"])).toBe("high");
  });

  it("mixed: high overrides medium", () => {
    expect(calculateExitSeverity(["delta_too_high", "stop_loss_triggered"])).toBe("high");
  });
});

// ─── buildExitMessage ───────────────────────────────

describe("buildExitMessage", () => {
  it("empty reasons → hold message", () => {
    const msg = buildExitMessage([], 100, 10);
    expect(msg).toContain("继续持有");
  });

  it("take-profit → includes target", () => {
    const msg = buildExitMessage(["pnl_target_reached"], 600, 24);
    expect(msg).toContain("止盈");
    expect(msg).toContain("600");
  });

  it("stop-loss → includes stop loss", () => {
    const msg = buildExitMessage(["stop_loss_triggered"], -600, 24);
    expect(msg).toContain("止损");
  });
});

// ─── evaluateExitSuggestion ─────────────────────────

describe("evaluateExitSuggestion", () => {
  it("hold when no reasons", () => {
    const pos = makePosition({ totalPnlUsd: 100, deltaPercent: 1 });
    const suggestion = evaluateExitSuggestion(pos, makeRiskReport(), makeReconReport(), ACCEPTANCE_TIME, DEFAULT_CONFIG);
    expect(suggestion.status).toBe("hold");
    expect(suggestion.reasons).toEqual([]);
  });

  it("urgent_exit when stop_loss_triggered", () => {
    const pos = makePosition({ totalPnlUsd: -600 });
    const suggestion = evaluateExitSuggestion(pos, makeRiskReport(), makeReconReport(), ACCEPTANCE_TIME, DEFAULT_CONFIG);
    expect(suggestion.status).toBe("urgent_exit");
  });
});

// ─── generateExitSuggestions ────────────────────────

describe("generateExitSuggestions", () => {
  it("mixed positions produce correct counts", () => {
    const hold = makePosition({ id: "a", symbol: "A", totalPnlUsd: 100, deltaPercent: 1 });
    const suggest = makePosition({ id: "b", symbol: "B", totalPnlUsd: 600, deltaPercent: 1 }); // take-profit
    const urgent = makePosition({ id: "c", symbol: "C", totalPnlUsd: -600, deltaPercent: 1 }); // stop-loss

    const report = generateExitSuggestions(
      [hold, suggest, urgent],
      makeRiskReport(),
      makeReconReport(),
      ACCEPTANCE_TIME,
    );

    expect(report.suggestions.length).toBe(3);
    expect(report.holdCount).toBe(1);
    expect(report.suggestExitCount).toBe(1);
    expect(report.urgentExitCount).toBe(1);
  });

  it("report has generatedAt", () => {
    const pos = makePosition();
    const report = generateExitSuggestions([pos]);
    expect(typeof report.generatedAt).toBe("number");
  });
});

// ─── Immutability ─────────────────────────────────

describe("immutability", () => {
  it("does not mutate input", () => {
    const pos = makePosition();
    const originalId = pos.id;
    evaluateExitSuggestion(pos, makeRiskReport(), makeReconReport(), ACCEPTANCE_TIME, DEFAULT_CONFIG);
    expect(pos.id).toBe(originalId);
  });
});
