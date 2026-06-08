import { describe, expect, it } from "vitest";
import type { ExecutionQueueItem } from "../orders/executionQueueTypes";
import type { SafetyState } from "../safety/safetyTypes";
import { evaluateSandboxSafetyGate, DEFAULT_SAFE_ENVIRONMENT } from "./sandboxSafetyGate";

const NOW = 2_000_000_000;

function makeQueueItem(overrides: Partial<ExecutionQueueItem> = {}): ExecutionQueueItem {
  return {
    id: "q-test-1",
    confirmationId: "cf-test-1",
    previewId: "pv-test-1",
    opportunityId: "opp-test-1",
    symbol: "BTC/USDT",
    strategyName: "Balanced",
    status: "queued-preview-only",
    priority: "normal",
    createdAt: NOW - 3600_000,
    updatedAt: NOW - 3600_000,
    expiresAt: NOW + 3600_000,
    warningFlags: [],
    source: "local",
    previewSnapshot: {
      id: "pv-test-1",
      mode: "preview",
      opportunityId: "opp-test-1",
      symbol: "BTC/USDT",
      base: "BTC",
      quote: "USDT",
      opportunityType: "cross-exchange",
      strategyName: "Balanced",
      legs: [],
      estimatedFees: 1,
      estimatedSlippage: 0.5,
      estimatedNetRate: 18,
      scoringResult: { score: 82, grade: "B", riskLevel: "low", reasonCodes: [], warnings: [], components: { returnScore: 85, costScore: 70, liquidityScore: 80, riskPenalty: 5, confidenceScore: 85 } },
      riskGateResult: { allowed: true, severity: "info", reasonCodes: ["PASS"], messages: [], checks: [] },
      estimateResult: { grossReturn: 2.5, fees: 1, slippage: 0.5, netReturn: 1, netRate: 0.001, annualizedNetRate: 12.5, holdingHours: 8 },
      accountRiskContextSource: "mock",
      submittable: true,
      warnings: [],
      createdAt: NOW - 3600_000,
    },
    confirmationSnapshot: {
      id: "cf-test-1",
      previewId: "pv-test-1",
      opportunityId: "opp-test-1",
      symbol: "BTC/USDT",
      strategyName: "Balanced",
      confirmedAt: NOW - 3500_000,
      confirmedBy: "local-user",
      status: "confirmed-preview-only",
      riskAccepted: true,
      riskMessages: [],
      disclaimerAccepted: true,
      previewSnapshot: {} as any,
    },
    ...overrides,
  };
}

const safeSafety: SafetyState = {
  killSwitchEnabled: false,
  reason: null,
  enabledBy: "local-user",
  enabledAt: null,
  disabledAt: null,
  updatedAt: 0,
  source: "local",
};

describe("evaluateSandboxSafetyGate", () => {
  it("happy path — all checks pass", () => {
    const result = evaluateSandboxSafetyGate({
      queueItem: makeQueueItem(),
      safetyState: safeSafety,
      now: NOW,
    });
    expect(result.allowed).toBe(true);
    expect(result.severity).toBe("info");
    expect(result.reasonCodes[0]).toContain("MOCK_SANDBOX_ONLY");
    expect(result.checks).toHaveLength(10);
  });

  it("kill switch enabled — blocked", () => {
    const result = evaluateSandboxSafetyGate({
      queueItem: makeQueueItem(),
      safetyState: { ...safeSafety, killSwitchEnabled: true },
      now: NOW,
    });
    expect(result.allowed).toBe(false);
    expect(result.severity).toBe("blocked");
    expect(result.checks[0].passed).toBe(false);
  });

  it("cancelled queue — blocked", () => {
    const result = evaluateSandboxSafetyGate({
      queueItem: makeQueueItem({ status: "cancelled" }),
      safetyState: safeSafety,
      now: NOW,
    });
    expect(result.allowed).toBe(false);
    expect(result.checks[1].passed).toBe(false);
    expect(result.checks[1].name).toBe("queueStatusCheck");
  });

  it("expired queue — blocked", () => {
    const result = evaluateSandboxSafetyGate({
      queueItem: makeQueueItem({ status: "expired" }),
      safetyState: safeSafety,
      now: NOW,
    });
    expect(result.allowed).toBe(false);
  });

  it("expired timestamp — blocked", () => {
    const result = evaluateSandboxSafetyGate({
      queueItem: makeQueueItem({ expiresAt: NOW - 1 }),
      safetyState: safeSafety,
      now: NOW,
    });
    expect(result.allowed).toBe(false);
    expect(result.checks[2].passed).toBe(false);
    expect(result.checks[2].name).toBe("queueExpirationCheck");
  });

  it("missing confirmation — blocked", () => {
    const result = evaluateSandboxSafetyGate({
      queueItem: makeQueueItem({ confirmationSnapshot: undefined as any }),
      safetyState: safeSafety,
      now: NOW,
    });
    expect(result.allowed).toBe(false);
    expect(result.checks[3].passed).toBe(false);
  });

  it("preview not submittable — blocked", () => {
    const qi = makeQueueItem();
    qi.previewSnapshot.submittable = false;
    const result = evaluateSandboxSafetyGate({ queueItem: qi, safetyState: safeSafety, now: NOW });
    expect(result.allowed).toBe(false);
    expect(result.checks[4].passed).toBe(false);
  });

  it("riskGate not allowed — blocked", () => {
    const qi = makeQueueItem();
    qi.previewSnapshot.riskGateResult.allowed = false;
    const result = evaluateSandboxSafetyGate({ queueItem: qi, safetyState: safeSafety, now: NOW });
    expect(result.allowed).toBe(false);
    expect(result.checks[5].passed).toBe(false);
  });

  it("non-local source — blocked", () => {
    const result = evaluateSandboxSafetyGate({
      queueItem: makeQueueItem({ source: "external" as any }),
      safetyState: safeSafety,
      now: NOW,
    });
    expect(result.allowed).toBe(false);
    expect(result.checks[6].passed).toBe(false);
  });

  it("liveTradingEnabled=true — blocked", () => {
    const result = evaluateSandboxSafetyGate({
      queueItem: makeQueueItem(),
      safetyState: safeSafety,
      now: NOW,
      environment: { liveTradingEnabled: true },
    });
    expect(result.allowed).toBe(false);
    expect(result.checks[8].passed).toBe(false);
  });

  it("allowMainnetTrading=true — blocked", () => {
    const result = evaluateSandboxSafetyGate({
      queueItem: makeQueueItem(),
      safetyState: safeSafety,
      now: NOW,
      environment: { allowMainnetTrading: true },
    });
    expect(result.allowed).toBe(false);
    expect(result.checks[9].passed).toBe(false);
  });

  it("exchangeEnv=sandbox — warning, not blocked", () => {
    const result = evaluateSandboxSafetyGate({
      queueItem: makeQueueItem(),
      safetyState: safeSafety,
      now: NOW,
      environment: { exchangeEnv: "sandbox" },
    });
    expect(result.allowed).toBe(true);
    expect(result.severity).toBe("warning");
  });

  it("reasonCodes includes MOCK_SANDBOX_ONLY on happy path", () => {
    const result = evaluateSandboxSafetyGate({
      queueItem: makeQueueItem(),
      safetyState: safeSafety,
      now: NOW,
    });
    expect(result.reasonCodes.some((r) => r.includes("MOCK_SANDBOX_ONLY"))).toBe(true);
  });
});
