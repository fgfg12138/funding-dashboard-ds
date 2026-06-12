/**
 * Cross-Exchange Execution Review — Execution Readiness Review
 *
 * Simulates 12 cross-exchange execution failure scenarios
 * without calling real APIs or placing real orders.
 */

import type {
  CrossExchangeExecutionPlan,
  CrossExchangeExecutionRisk,
  CrossExchangeExecutionReviewReport,
  ExecutionLegResult,
  ExecutionScenarioResult,
  ExecutionMode,
} from "./crossExchangeExecutionTypes";

// ─── Helpers ───────────────────────────────────────────

let _seq = 0;
function nextId(): string { return `exec-${String(++_seq).padStart(4, "0")}`; }

// ─── 1. Build Plan ─────────────────────────────────────

export function buildCrossExchangeExecutionPlan(params: {
  canonicalSymbol: string;
  shortExchangeId: string;
  longExchangeId: string;
  shortSymbol: string;
  longSymbol: string;
  positionSizeUsd: number;
  mode?: ExecutionMode;
}): CrossExchangeExecutionPlan {
  return {
    id: nextId(),
    canonicalSymbol: params.canonicalSymbol,
    shortExchangeId: params.shortExchangeId,
    longExchangeId: params.longExchangeId,
    shortOrder: {
      exchangeId: params.shortExchangeId,
      canonicalSymbol: params.canonicalSymbol,
      exchangeSymbol: params.shortSymbol,
      side: "sell",
      type: "limit",
      quantity: params.positionSizeUsd / 60000,
      price: 60000,
    },
    longOrder: {
      exchangeId: params.longExchangeId,
      canonicalSymbol: params.canonicalSymbol,
      exchangeSymbol: params.longSymbol,
      side: "buy",
      type: "limit",
      quantity: params.positionSizeUsd / 60000,
      price: 60000,
    },
    positionSizeUsd: params.positionSizeUsd,
    executionMode: params.mode ?? "paper",
    createdAt: Date.now(),
  };
}

// ─── 2. Review Plan ────────────────────────────────────

export function reviewCrossExchangeExecutionPlan(
  plan: CrossExchangeExecutionPlan,
  maxPositionUsd = 50,
): CrossExchangeExecutionRisk[] {
  const risks: CrossExchangeExecutionRisk[] = [];

  if (plan.shortExchangeId === plan.longExchangeId) {
    risks.push({ category: "same_exchange", severity: "high", message: "Short and long are on the same exchange — this is not a cross-exchange spread", blocking: true });
  }

  if (plan.positionSizeUsd > maxPositionUsd) {
    risks.push({ category: "capital_limit", severity: "high", message: `Position $${plan.positionSizeUsd} exceeds max $${maxPositionUsd}`, blocking: true });
  }

  if (plan.executionMode === "live_disabled") {
    risks.push({ category: "live_disabled", severity: "high", message: "Live execution is disabled for this plan", blocking: true });
  }

  return risks;
}

// ─── 3. Simulate Execution Scenario ────────────────────

export function simulateExecutionScenario(
  scenario: string,
  shortResult: ExecutionLegResult,
  longResult: ExecutionLegResult,
  options?: { duplicate?: boolean; symbolMismatch?: boolean; capitalBreach?: boolean },
): ExecutionScenarioResult {
  const shortFilled = shortResult.filledQuantity;
  const longFilled = longResult.filledQuantity;

  const singleLeg = (shortFilled > 0 && longFilled === 0) || (longFilled > 0 && shortFilled === 0);
  const bothFilled = shortFilled > 0 && longFilled > 0;
  const bothEmpty = shortFilled === 0 && longFilled === 0;
  const partialMismatch = shortFilled > 0 && longFilled > 0 && shortFilled !== longFilled;

  const passed = bothFilled && !partialMismatch
    ? true
    : singleLeg || partialMismatch
      ? false
      : bothEmpty
        ? true
        : false;

  const details = singleLeg
    ? `Single leg exposure: short=${shortFilled}, long=${longFilled}`
    : partialMismatch
      ? `Partial fill mismatch: short=${shortFilled}, long=${longFilled}`
      : bothEmpty
        ? "Both legs rejected — no position"
        : bothFilled
          ? "Both legs filled successfully"
          : "Unknown state";

  return {
    scenario,
    passed,
    singleLegExposure: singleLeg,
    duplicateExecution: options?.duplicate ?? false,
    symbolMismatch: options?.symbolMismatch ?? false,
    capitalBreach: options?.capitalBreach ?? false,
    details,
  };
}

// ─── 4. Aggregate Execution Risks ──────────────────────

export function aggregateExecutionRisks(
  plan: CrossExchangeExecutionPlan,
  results: ExecutionScenarioResult[],
  options?: { riskBypass?: boolean; killSwitchBypass?: boolean },
): CrossExchangeExecutionRisk[] {
  const risks: CrossExchangeExecutionRisk[] = [];

  if (results.some((r) => r.singleLegExposure)) {
    risks.push({ category: "single_leg_exposure", severity: "critical", message: "Single leg exposure detected — manual intervention required", blocking: true });
  }
  if (results.some((r) => r.duplicateExecution)) {
    risks.push({ category: "duplicate_execution", severity: "high", message: "Duplicate execution detected — idempotency check required", blocking: true });
  }
  if (results.some((r) => r.symbolMismatch)) {
    risks.push({ category: "symbol_mismatch", severity: "high", message: "Symbol mapping mismatch detected", blocking: true });
  }
  if (results.some((r) => r.capitalBreach)) {
    risks.push({ category: "capital_breach", severity: "critical", message: "Capital limit breached", blocking: true });
  }
  if (options?.riskBypass) {
    risks.push({ category: "risk_bypass", severity: "critical", message: "Risk engine bypass detected", blocking: true });
  }
  if (options?.killSwitchBypass) {
    risks.push({ category: "kill_switch_bypass", severity: "critical", message: "Kill switch bypass detected", blocking: true });
  }

  return risks;
}

// ─── 5. Generate Report ───────────────────────────────

export function generateExecutionReadinessReport(
  scenarios: ExecutionScenarioResult[],
  options?: {
    riskBypass?: boolean;
    killSwitchBypass?: boolean;
    extraRisks?: CrossExchangeExecutionRisk[];
  },
): CrossExchangeExecutionReviewReport {
  const passed = scenarios.filter((s) => s.passed).length;
  const failed = scenarios.filter((s) => !s.passed).length;

  const allRisks = options?.extraRisks ?? [];
  const aggregated = aggregateExecutionRisks(
    { id: "", canonicalSymbol: "", shortExchangeId: "", longExchangeId: "", shortOrder: {} as any, longOrder: {} as any, positionSizeUsd: 0, executionMode: "paper", createdAt: 0 },
    scenarios,
    options,
  );
  const risks = [...aggregated, ...allRisks];

  return {
    scenariosPassed: passed,
    scenariosFailed: failed,
    risks,
    blockers: risks.filter((r) => r.blocking).map((r) => r.message),
    orphanOrders: 0,
    orphanPositions: 0,
    singleLegExposureDetected: scenarios.some((s) => s.singleLegExposure),
    duplicateExecutionDetected: scenarios.some((s) => s.duplicateExecution),
    symbolMismatchDetected: scenarios.some((s) => s.symbolMismatch),
    capitalLimitBreached: scenarios.some((s) => s.capitalBreach),
    riskBypassDetected: options?.riskBypass ?? false,
    killSwitchBypassDetected: options?.killSwitchBypass ?? false,
    realOrdersExecuted: 0,
    postRequests: 0,
    putRequests: 0,
    deleteRequests: 0,
    generatedAt: Date.now(),
  };
}

// ─── 6. Run All 12 Scenarios ──────────────────────────

export function runAllExecutionScenarios(): {
  scenarios: ExecutionScenarioResult[];
  report: CrossExchangeExecutionReviewReport;
} {
  const scenarios: ExecutionScenarioResult[] = [];

  // 1. Single Leg Fill — short okay, long failed
  scenarios.push(simulateExecutionScenario(
    "1. Single Leg Fill (short ok, long failed)",
    { success: true, filledQuantity: 0.1, expectedQuantity: 0.1, orderId: "s1" },
    { success: false, filledQuantity: 0, expectedQuantity: 0.1, error: "Rejected" },
  ));

  // 2. Opposite Leg Fill — long ok, short failed
  scenarios.push(simulateExecutionScenario(
    "2. Opposite Leg Fill (long ok, short failed)",
    { success: false, filledQuantity: 0, expectedQuantity: 0.1, error: "Rejected" },
    { success: true, filledQuantity: 0.1, expectedQuantity: 0.1, orderId: "l1" },
  ));

  // 3. Both Legs Reject
  scenarios.push(simulateExecutionScenario(
    "3. Both Legs Reject",
    { success: false, filledQuantity: 0, expectedQuantity: 0.1, error: "Rejected" },
    { success: false, filledQuantity: 0, expectedQuantity: 0.1, error: "Rejected" },
  ));

  // 4. Partial Fill Mismatch
  scenarios.push(simulateExecutionScenario(
    "4. Partial Fill Mismatch (short 100%, long 40%)",
    { success: true, filledQuantity: 0.1, expectedQuantity: 0.1, orderId: "s2" },
    { success: true, filledQuantity: 0.04, expectedQuantity: 0.1, orderId: "l2" },
  ));

  // 5. Duplicate Execution
  scenarios.push(simulateExecutionScenario(
    "5. Duplicate Execution",
    { success: true, filledQuantity: 0.1, expectedQuantity: 0.1, orderId: "s3" },
    { success: true, filledQuantity: 0.1, expectedQuantity: 0.1, orderId: "l3" },
    { duplicate: true },
  ));

  // 6. Symbol Mapping Mismatch
  scenarios.push(simulateExecutionScenario(
    "6. Symbol Mapping Mismatch",
    { success: true, filledQuantity: 0.1, expectedQuantity: 0.1, orderId: "s4" },
    { success: true, filledQuantity: 0.1, expectedQuantity: 0.1, orderId: "l4" },
    { symbolMismatch: true },
  ));

  // 7. Capital Limit Breach
  scenarios.push(simulateExecutionScenario(
    "7. Capital Limit Breach",
    { success: true, filledQuantity: 0.1, expectedQuantity: 0.1, orderId: "s5" },
    { success: true, filledQuantity: 0.1, expectedQuantity: 0.1, orderId: "l5" },
    { capitalBreach: true },
  ));

  // 8. Exchange Health Degraded
  scenarios.push(simulateExecutionScenario(
    "8. Exchange Health Degraded — both legs blocked",
    { success: false, filledQuantity: 0, expectedQuantity: 0.1, error: "Exchange degraded" },
    { success: false, filledQuantity: 0, expectedQuantity: 0.1, error: "Exchange degraded" },
  ));

  // 9. Rate Limit Delay
  scenarios.push(simulateExecutionScenario(
    "9. Rate Limit Delay — second leg delayed",
    { success: true, filledQuantity: 0.1, expectedQuantity: 0.1, orderId: "s6" },
    { success: true, filledQuantity: 0.1, expectedQuantity: 0.1, orderId: "l6" },
  ));

  // 10. Kill Switch Locked — both blocked
  scenarios.push(simulateExecutionScenario(
    "10. Kill Switch Locked — both legs blocked",
    { success: false, filledQuantity: 0, expectedQuantity: 0.1, error: "Kill switch locked" },
    { success: false, filledQuantity: 0, expectedQuantity: 0.1, error: "Kill switch locked" },
  ));

  // 11. Risk Critical — both blocked
  scenarios.push(simulateExecutionScenario(
    "11. Risk Critical — both legs blocked",
    { success: false, filledQuantity: 0, expectedQuantity: 0.1, error: "Risk critical" },
    { success: false, filledQuantity: 0, expectedQuantity: 0.1, error: "Risk critical" },
  ));

  // 12. Network Timeout During Leg 2
  scenarios.push(simulateExecutionScenario(
    "12. Network Timeout During Leg 2",
    { success: true, filledQuantity: 0.1, expectedQuantity: 0.1, orderId: "s7" },
    { success: false, filledQuantity: 0, expectedQuantity: 0.1, error: "Timeout" },
  ));

  const report = generateExecutionReadinessReport(scenarios);
  return { scenarios, report };
}
