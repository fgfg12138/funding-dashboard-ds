/**
 * Auto Entry Engine Tests — Semi Phase 2
 *
 * Acceptance criteria:
 *   OpeningRecommendation: id=rec-btc, symbol=BTCUSDT, exchange=Binance,
 *     status=recommended, allocated=20000, netApy=28, riskLevel=low
 *   UserConfirmation: recommendationId=rec-btc, confirmed=true
 *   RiskReport: overallRisk=low
 *   ExecutionConfig: dryRun=true, allowRealExecution=false, ...
 *     markPrice=100000
 *   → status=planned, spot=buy, perp=sell, quantity=0.2
 */

import { describe, expect, it } from "vitest";
import {
  buildEntryExecutionPlan,
  executeEntry,
  validateEntryExecution,
} from "./autoEntryEngine";
import type { OpeningRecommendation } from "./openingRecommendationTypes";
import type { RiskReport } from "../riskMonitoring/riskMonitoringTypes";
import type {
  EntryExecutionAdapter,
  ExecutionConfig,
  UserConfirmation,
} from "./autoEntryTypes";

// ─── Helpers ─────────────────────────────────────────────

function makeRecommendation(overrides?: Partial<OpeningRecommendation>): OpeningRecommendation {
  return {
    id: "rec-btc",
    symbol: "BTCUSDT",
    exchange: "Binance",
    status: "recommended",
    score: 80,
    expectedNetApy: 28,
    allocatedCapitalUsd: 20_000,
    expectedAnnualProfitUsd: 5_600,
    riskLevel: "low",
    reasons: ["High net APY"],
    generatedAt: Date.now(),
    ...overrides,
  };
}

function makeConfirmation(overrides?: Partial<UserConfirmation>): UserConfirmation {
  return {
    recommendationId: "rec-btc",
    confirmed: true,
    confirmedAt: Date.now(),
    ...overrides,
  };
}

function makeRiskReport(overrides?: Partial<RiskReport>): RiskReport {
  return {
    events: [],
    lowCount: 0,
    mediumCount: 0,
    highCount: 0,
    criticalCount: 0,
    overallRisk: "low",
    generatedAt: Date.now(),
    ...overrides,
  };
}

function makeConfig(overrides?: Partial<ExecutionConfig>): ExecutionConfig {
  return {
    dryRun: true,
    allowRealExecution: false,
    requireUserConfirmation: true,
    maxNotionalUsd: 50_000,
    allowedExchanges: ["Binance"],
    markPrice: 100_000,
    ...overrides,
  };
}

const defaultConfig = makeConfig();

// ─── Acceptance Criteria ─────────────────────────────────

describe("acceptance criteria", () => {
  it("recommended + confirmed + dryRun → planned", async () => {
    const rec = makeRecommendation();
    const confirm = makeConfirmation();
    const risk = makeRiskReport();

    const result = await executeEntry(rec, confirm, risk, undefined, defaultConfig);

    expect(result.status).toBe("planned");
    expect(result.plan).toBeDefined();
    expect(result.errors).toEqual([]);

    // spot: buy
    expect(result.plan!.spotLeg.side).toBe("buy");
    expect(result.plan!.spotLeg.marketType).toBe("spot");
    // perpetual: sell
    expect(result.plan!.perpetualLeg.side).toBe("sell");
    expect(result.plan!.perpetualLeg.marketType).toBe("perpetual");
    // quantity = 20000 / 100000 = 0.2
    expect(result.plan!.spotLeg.quantity).toBe(0.2);
    expect(result.plan!.perpetualLeg.quantity).toBe(0.2);
  });
});

// ─── buildEntryExecutionPlan ────────────────────────────

describe("buildEntryExecutionPlan", () => {
  it("creates standard spot-buy / perp-sell structure", () => {
    const rec = makeRecommendation();
    const plan = buildEntryExecutionPlan(rec, defaultConfig);

    expect(plan.symbol).toBe("BTCUSDT");
    expect(plan.spotLeg.marketType).toBe("spot");
    expect(plan.spotLeg.side).toBe("buy");
    expect(plan.perpetualLeg.marketType).toBe("perpetual");
    expect(plan.perpetualLeg.side).toBe("sell");
    expect(plan.totalNotionalUsd).toBe(40_000); // 20k + 20k
    expect(plan.expectedNetApy).toBe(28);
  });

  it("throws when markPrice is missing", () => {
    const rec = makeRecommendation();
    expect(() => buildEntryExecutionPlan(rec, {})).toThrow("Mark price is required");
  });

  it("throws when markPrice is zero", () => {
    const rec = makeRecommendation();
    expect(() => buildEntryExecutionPlan(rec, { markPrice: 0 })).toThrow("Mark price is required");
  });
});

// ─── validateEntryExecution ────────────────────────────

describe("validateEntryExecution", () => {
  const rec = makeRecommendation();
  const plan = buildEntryExecutionPlan(rec, defaultConfig);
  const confirm = makeConfirmation();
  const risk = makeRiskReport();

  it("passes all checks with valid inputs", () => {
    const errors = validateEntryExecution(plan, rec, confirm, risk, defaultConfig);
    expect(errors).toEqual([]);
  });

  it("blocks when recommendation is not recommended", () => {
    const badRec = makeRecommendation({ status: "blocked" });
    const errors = validateEntryExecution(plan, badRec, confirm, risk, defaultConfig);
    expect(errors.some((e) => e.includes("blocked"))).toBe(true);
  });

  it("blocks when not confirmed", () => {
    const errors = validateEntryExecution(plan, rec, undefined, risk, defaultConfig);
    expect(errors.some((e) => e.includes("confirmation"))).toBe(true);
  });

  it("blocks when confirmation.confirmed is false", () => {
    const badConfirm = makeConfirmation({ confirmed: false });
    const errors = validateEntryExecution(plan, rec, badConfirm, risk, defaultConfig);
    expect(errors.some((e) => e.includes("did not confirm"))).toBe(true);
  });

  it("blocks when recommendationId mismatches", () => {
    const badConfirm = makeConfirmation({ recommendationId: "rec-other" });
    const errors = validateEntryExecution(plan, rec, badConfirm, risk, defaultConfig);
    expect(errors.some((e) => e.includes("recommendationId"))).toBe(true);
  });

  it("blocks when risk is critical", () => {
    const criticalRisk = makeRiskReport({ overallRisk: "critical" });
    const errors = validateEntryExecution(plan, rec, confirm, criticalRisk, defaultConfig);
    expect(errors.some((e) => e.includes("critical"))).toBe(true);
  });

  it("blocks when notional exceeds max", () => {
    const smallConfig = makeConfig({ maxNotionalUsd: 10_000 });
    const errors = validateEntryExecution(plan, rec, confirm, risk, smallConfig);
    expect(errors.some((e) => e.includes("exceeds max"))).toBe(true);
  });

  it("blocks when exchange not in allowed list", () => {
    const restrictedConfig = makeConfig({ allowedExchanges: ["Bybit"] });
    const errors = validateEntryExecution(plan, rec, confirm, risk, restrictedConfig);
    expect(errors.some((e) => e.includes("not in the allowed"))).toBe(true);
  });
});

// ─── executeEntry — dryRun ─────────────────────────────

describe("executeEntry — dryRun modes", () => {
  it("dryRun=true does not call adapter", async () => {
    const rec = makeRecommendation();
    const confirm = makeConfirmation();
    const risk = makeRiskReport();
    let adapterCalled = false;

    const adapter: EntryExecutionAdapter = {
      exchangeName: "Binance",
      executeSpotLeg: async () => { adapterCalled = true; return "order-id"; },
      executePerpetualLeg: async () => { adapterCalled = true; return "order-id"; },
    };

    const result = await executeEntry(rec, confirm, risk, adapter, makeConfig({ dryRun: true }));
    expect(result.status).toBe("planned");
    expect(adapterCalled).toBe(false);
  });

  it("allowRealExecution=false returns planned even with adapter", async () => {
    const rec = makeRecommendation();
    const confirm = makeConfirmation();
    const risk = makeRiskReport();
    let adapterCalled = false;

    const adapter: EntryExecutionAdapter = {
      exchangeName: "Binance",
      executeSpotLeg: async () => { adapterCalled = true; return "order-id"; },
      executePerpetualLeg: async () => { adapterCalled = true; return "order-id"; },
    };

    const result = await executeEntry(rec, confirm, risk, adapter, makeConfig({ dryRun: false, allowRealExecution: false }));
    expect(result.status).toBe("planned");
    expect(adapterCalled).toBe(false);
  });
});

// ─── executeEntry — real execution ─────────────────────

describe("executeEntry — real execution", () => {
  it("allowRealExecution=true + confirmed calls adapter", async () => {
    const rec = makeRecommendation();
    const confirm = makeConfirmation();
    const risk = makeRiskReport();
    let spotCalled = false;
    let perpCalled = false;

    const adapter: EntryExecutionAdapter = {
      exchangeName: "Binance",
      executeSpotLeg: async (leg) => { spotCalled = true; return "spot-order"; },
      executePerpetualLeg: async (leg) => { perpCalled = true; return "perp-order"; },
    };

    const result = await executeEntry(rec, confirm, risk, adapter, makeConfig({ dryRun: false, allowRealExecution: true }));

    expect(result.status).toBe("executed");
    expect(spotCalled).toBe(true);
    expect(perpCalled).toBe(true);
  });

  it("spot fail prevents perpetual execution", async () => {
    const rec = makeRecommendation();
    const confirm = makeConfirmation();
    const risk = makeRiskReport();
    let perpCalled = false;

    const adapter: EntryExecutionAdapter = {
      exchangeName: "Binance",
      executeSpotLeg: async () => { throw new Error("Spot order failed"); },
      executePerpetualLeg: async () => { perpCalled = true; return "perp-order"; },
    };

    const result = await executeEntry(rec, confirm, risk, adapter, makeConfig({ dryRun: false, allowRealExecution: true }));

    expect(result.status).toBe("blocked");
    expect(result.errors.some((e) => e.includes("Spot leg"))).toBe(true);
    expect(perpCalled).toBe(false); // should not execute perp
  });

  it("perp fail returns partial failure", async () => {
    const rec = makeRecommendation();
    const confirm = makeConfirmation();
    const risk = makeRiskReport();

    const adapter: EntryExecutionAdapter = {
      exchangeName: "Binance",
      executeSpotLeg: async () => "spot-order",
      executePerpetualLeg: async () => { throw new Error("Perp order failed"); },
    };

    const result = await executeEntry(rec, confirm, risk, adapter, makeConfig({ dryRun: false, allowRealExecution: true }));

    expect(result.status).toBe("blocked");
    expect(result.errors.some((e) => e.includes("Perpetual leg"))).toBe(true);
  });
});

// ─── Default Security ──────────────────────────────────

describe("default security", () => {
  it("default config prevents real execution", async () => {
    const rec = makeRecommendation();
    const confirm = makeConfirmation();
    const risk = makeRiskReport();
    let adapterCalled = false;

    const adapter: EntryExecutionAdapter = {
      exchangeName: "Binance",
      executeSpotLeg: async () => { adapterCalled = true; return "order-id"; },
      executePerpetualLeg: async () => { adapterCalled = true; return "order-id"; },
    };

    // Minimal config: only markPrice, rely on safe defaults for everything else
    const result = await executeEntry(rec, confirm, risk, adapter, { markPrice: 100_000 });
    expect(result.status).toBe("planned"); // dryRun=true by default
    expect(adapterCalled).toBe(false);
  });
});

// ─── Immutability ─────────────────────────────────────

describe("immutability", () => {
  it("does not mutate recommendation", () => {
    const rec = makeRecommendation();
    const originalId = rec.id;
    buildEntryExecutionPlan(rec, defaultConfig);
    expect(rec.id).toBe(originalId);
  });
});
