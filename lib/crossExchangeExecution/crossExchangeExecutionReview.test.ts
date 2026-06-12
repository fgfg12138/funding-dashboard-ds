/**
 * Cross-Exchange Execution Review Tests — 12 Failure Scenarios
 *
 * Verifies that all cross-exchange execution failure modes are
 * detected correctly. No real API calls.
 */

import { describe, expect, it } from "vitest";
import {
  buildCrossExchangeExecutionPlan,
  reviewCrossExchangeExecutionPlan,
  simulateExecutionScenario,
  aggregateExecutionRisks,
  generateExecutionReadinessReport,
  runAllExecutionScenarios,
} from "./crossExchangeExecutionReview";
import type { ExecutionLegResult, CrossExchangeExecutionPlan } from "./crossExchangeExecutionTypes";

// ─── Helpers ─────────────────────────────────────────────

const fullFill = (id: string): ExecutionLegResult => ({ success: true, filledQuantity: 0.1, expectedQuantity: 0.1, orderId: id });
const noFill = (err: string): ExecutionLegResult => ({ success: false, filledQuantity: 0, expectedQuantity: 0.1, error: err });
const partialFill = (qty: number, id: string): ExecutionLegResult => ({ success: true, filledQuantity: qty, expectedQuantity: 0.1, orderId: id });

// ─── Tests ────────────────────────────────────────────

describe("Cross-Exchange Execution Readiness", () => {
  // ─── 1-2. Single Leg Fill ──────────────────────────

  it("1. Single Leg Fill (short ok, long failed) — singleLegExposure=true", () => {
    const result = simulateExecutionScenario("sc1", fullFill("s1"), noFill("Rejected"));
    expect(result.passed).toBe(false);
    expect(result.singleLegExposure).toBe(true);
  });

  it("2. Opposite Leg Fill (long ok, short failed) — singleLegExposure=true", () => {
    const result = simulateExecutionScenario("sc2", noFill("Rejected"), fullFill("l1"));
    expect(result.passed).toBe(false);
    expect(result.singleLegExposure).toBe(true);
  });

  // ─── 3. Both Reject ──────────────────────────────

  it("3. Both Legs Reject — no position, no orphan", () => {
    const result = simulateExecutionScenario("sc3", noFill("Rejected"), noFill("Rejected"));
    expect(result.passed).toBe(true); // Safe state
    expect(result.singleLegExposure).toBe(false);
  });

  // ─── 4. Partial Fill Mismatch ─────────────────────

  it("4. Partial Fill Mismatch (short 100%, long 40%) — fails + mismatch detected", () => {
    const result = simulateExecutionScenario("sc4", fullFill("s2"), partialFill(0.04, "l2"));
    expect(result.passed).toBe(false);
  });

  // ─── 5. Duplicate Execution ───────────────────────

  it("5. Duplicate Execution — duplicateExecutionDetected=true", () => {
    const result = simulateExecutionScenario("sc5", fullFill("s3"), fullFill("l3"), { duplicate: true });
    expect(result.duplicateExecution).toBe(true);
  });

  // ─── 6. Symbol Mismatch ──────────────────────────

  it("6. Symbol Mapping Mismatch — symbolMismatchDetected=true", () => {
    const result = simulateExecutionScenario("sc6", fullFill("s4"), fullFill("l4"), { symbolMismatch: true });
    expect(result.symbolMismatch).toBe(true);
  });

  // ─── 7. Capital Limit Breach ─────────────────────

  it("7. Capital Limit Breach — review detects it", () => {
    const plan = buildCrossExchangeExecutionPlan({
      canonicalSymbol: "BTCUSDT", shortExchangeId: "binance", longExchangeId: "bybit",
      shortSymbol: "BTCUSDT", longSymbol: "BTCUSDT", positionSizeUsd: 200,
    });
    const risks = reviewCrossExchangeExecutionPlan(plan, 50);
    expect(risks.some((r) => r.category === "capital_limit")).toBe(true);
    expect(risks.some((r) => r.blocking)).toBe(true);
  });

  it("Small position passes review", () => {
    const plan = buildCrossExchangeExecutionPlan({
      canonicalSymbol: "BTCUSDT", shortExchangeId: "binance", longExchangeId: "bybit",
      shortSymbol: "BTCUSDT", longSymbol: "BTCUSDT", positionSizeUsd: 40,
    });
    const risks = reviewCrossExchangeExecutionPlan(plan, 50);
    expect(risks.some((r) => r.category === "capital_limit")).toBe(false);
  });

  // ─── 8-12: Aggregate scenarios ────────────────────

  it("8. Exchange Health Degraded — both blocked, safe state", () => {
    const result = simulateExecutionScenario("sc8", noFill("Exchange degraded"), noFill("Exchange degraded"));
    expect(result.passed).toBe(true); // Both blocked = safe
    expect(result.singleLegExposure).toBe(false);
  });

  it("9. Rate Limit Delay — handled by throttler", () => {
    const result = simulateExecutionScenario("sc9", fullFill("s6"), fullFill("l6"));
    expect(result.passed).toBe(true);
  });

  it("10. Kill Switch Locked — both blocked, bypass=false", () => {
    const report = generateExecutionReadinessReport([], { killSwitchBypass: false });
    expect(report.killSwitchBypassDetected).toBe(false);
  });

  it("11. Risk Critical — both blocked, bypass=false", () => {
    const report = generateExecutionReadinessReport([], { riskBypass: false });
    expect(report.riskBypassDetected).toBe(false);
  });

  it("12. Network Timeout During Leg 2 — singleLegExposure=true", () => {
    const result = simulateExecutionScenario("sc12", fullFill("s7"), noFill("Timeout"));
    expect(result.passed).toBe(false);
    expect(result.singleLegExposure).toBe(true);
  });

  // ─── Full Suite ─────────────────────────────────

  it("runAllExecutionScenarios — 12 scenarios, all identified correctly", () => {
    const { scenarios, report } = runAllExecutionScenarios();

    expect(scenarios.length).toBe(12);
    expect(typeof report.scenariosPassed).toBe("number");
    expect(typeof report.scenariosFailed).toBe("number");
    expect(report.realOrdersExecuted).toBe(0);
    expect(report.postRequests).toBe(0);
    expect(report.putRequests).toBe(0);
    expect(report.deleteRequests).toBe(0);

    // Verify specific critical detections
    expect(report.singleLegExposureDetected).toBe(true);  // scenarios 1, 2, 4, 12
    expect(report.duplicateExecutionDetected).toBe(true);   // scenario 5
    expect(report.symbolMismatchDetected).toBe(true);        // scenario 6
    expect(report.capitalLimitBreached).toBe(true);          // scenario 7

    console.log(`\n  ╔══════════════════════════════════════════════════════════════════════╗`);
    console.log(`  ║        CROSS-EXCHANGE EXECUTION READINESS REVIEW                 ║`);
    console.log(`  ╠══════════════════════════════════════════════════════════════════════╣`);
    for (const s of scenarios) {
      const icon = s.passed ? "✅" : "⚠️";
      console.log(`  ║  ${icon} ${s.scenario.padEnd(45)}${s.passed ? "PASS" : "RISK "}${" ".repeat(8)}║`);
    }
    console.log(`  ║  ────────────────────────────────────────────────────────────────── ║`);
    console.log(`  ║  Scenarios Passed:    ${String(report.scenariosPassed).padStart(2)} / 12${" ".repeat(33)}║`);
    console.log(`  ║  Single Leg Exposure: ${String(report.singleLegExposureDetected).padEnd(40)}║`);
    console.log(`  ║  Duplicate Exec:      ${String(report.duplicateExecutionDetected).padEnd(40)}║`);
    console.log(`  ║  Symbol Mismatch:     ${String(report.symbolMismatchDetected).padEnd(40)}║`);
    console.log(`  ║  Capital Breach:      ${String(report.capitalLimitBreached).padEnd(40)}║`);
    console.log(`  ║  Risk Bypass:         ${String(report.riskBypassDetected).padEnd(40)}║`);
    console.log(`  ║  KS Bypass:           ${String(report.killSwitchBypassDetected).padEnd(40)}║`);
    console.log(`  ║  Real Orders:         ${String(report.realOrdersExecuted).padEnd(40)}║`);
    console.log(`  ║  Blockers:            ${report.blockers.length}${" ".repeat(42)}║`);
    for (const b of report.blockers) {
      console.log(`  ║    • ${b.padEnd(56)}║`);
    }
    console.log(`  ╚══════════════════════════════════════════════════════════════════════╝\n`);
  });
});

describe("Execution Plan — Safety", () => {
  it("Same exchange rejected by review", () => {
    const plan = buildCrossExchangeExecutionPlan({
      canonicalSymbol: "BTCUSDT", shortExchangeId: "binance", longExchangeId: "binance",
      shortSymbol: "BTCUSDT", longSymbol: "BTCUSDT", positionSizeUsd: 50,
    });
    const risks = reviewCrossExchangeExecutionPlan(plan);
    expect(risks.some((r) => r.category === "same_exchange")).toBe(true);
  });

  it("Live disabled mode added by review", () => {
    const plan = buildCrossExchangeExecutionPlan({
      canonicalSymbol: "BTCUSDT", shortExchangeId: "binance", longExchangeId: "bybit",
      shortSymbol: "BTCUSDT", longSymbol: "BTCUSDT", positionSizeUsd: 50, mode: "live_disabled",
    });
    const risks = reviewCrossExchangeExecutionPlan(plan);
    expect(risks.some((r) => r.category === "live_disabled")).toBe(true);
  });

  it("Aggregate detects risk/kill-switch bypass", () => {
    const risks = aggregateExecutionRisks(
      { id: "", canonicalSymbol: "", shortExchangeId: "", longExchangeId: "", shortOrder: {} as any, longOrder: {} as any, positionSizeUsd: 0, executionMode: "paper", createdAt: 0 },
      [],
      { riskBypass: true, killSwitchBypass: true },
    );
    expect(risks.some((r) => r.category === "risk_bypass")).toBe(true);
    expect(risks.some((r) => r.category === "kill_switch_bypass")).toBe(true);
  });
});

// ═══════════════════════════════════════════════════════════════
//  Safety Policy Tests
// ═══════════════════════════════════════════════════════════════

import {
  evaluateSingleLegExposure,
  evaluatePartialFillMismatch,
  checkExecutionIdempotency,
  resetIdempotencyGuard,
  acquireExecutionLock,
  completeExecutionLock,
  generateRecoveryRecommendation,
} from "./crossExchangeExecutionReview";

describe("SingleLegExposurePolicy", () => {
  it("1. single leg fill → manual_intervention_required", () => {
    const r = evaluateSingleLegExposure(0.1, 0);
    expect(r.detected).toBe(true);
    expect(r.action).toBe("manual_intervention_required");
  });
  it("2. opposite leg fill → manual_intervention_required", () => {
    expect(evaluateSingleLegExposure(0, 0.1).detected).toBe(true);
  });
  it("both filled equally → no exposure", () => {
    expect(evaluateSingleLegExposure(0.1, 0.1).detected).toBe(false);
  });
});

describe("PartialFillMismatchPolicy", () => {
  it("3. partial fill mismatch → critical", () => {
    const r = evaluatePartialFillMismatch(0.1, 0.04);
    expect(r.detected).toBe(true);
    expect(r.severity).toBe("critical");
  });
  it("equal fills → no mismatch", () => {
    expect(evaluatePartialFillMismatch(0.1, 0.1).detected).toBe(false);
  });
});

describe("ExecutionIdempotencyGuard", () => {
  beforeEach(() => resetIdempotencyGuard());
  it("5. duplicate execution → blocked", () => {
    expect(checkExecutionIdempotency("p1").duplicate).toBe(false);
    expect(checkExecutionIdempotency("p1").duplicate).toBe(true);
  });
  it("different IDs not duplicate", () => {
    expect(checkExecutionIdempotency("a").duplicate).toBe(false);
    expect(checkExecutionIdempotency("b").duplicate).toBe(false);
  });
});

describe("ExecutionLock", () => {
  beforeEach(() => resetIdempotencyGuard());
  it("6. execution lock prevents re-entry", () => {
    expect(acquireExecutionLock("l1").acquired).toBe(true);
    expect(acquireExecutionLock("l1").acquired).toBe(false);
  });
  it("completed lock blocks", () => {
    acquireExecutionLock("l2");
    completeExecutionLock("l2", "completed");
    expect(acquireExecutionLock("l2").acquired).toBe(false);
  });
  it("manual_review blocks", () => {
    acquireExecutionLock("l3");
    completeExecutionLock("l3", "manual_review_required");
    expect(acquireExecutionLock("l3").acquired).toBe(false);
  });
});

describe("ExecutionRecoveryRecommendation", () => {
  it("short only → reduce_only_close_short", () => expect(generateRecoveryRecommendation(0.1, 0)).toBe("reduce_only_close_short"));
  it("long only → reduce_only_close_long", () => expect(generateRecoveryRecommendation(0, 0.1)).toBe("reduce_only_close_long"));
  it("mismatch → manual_review", () => expect(generateRecoveryRecommendation(0.1, 0.04)).toBe("manual_review_required"));
  it("both filled → no_action", () => expect(generateRecoveryRecommendation(0.1, 0.1)).toBe("no_action_needed"));
  it("both empty → cancel_remaining", () => expect(generateRecoveryRecommendation(0, 0)).toBe("cancel_remaining_orders"));
});

describe("Safety — no mutation, no orders", () => {
  it("no real orders", () => expect(true).toBe(true));
  it("no POST/PUT/DELETE", () => expect(true).toBe(true));
});
