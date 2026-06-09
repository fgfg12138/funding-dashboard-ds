/**
 * Close Confirmation Engine Tests — Semi Phase 5
 *
 * Acceptance criteria:
 *   Position: BTCUSDT, spot long, perp short, notional=20000 each
 *   ExitSuggestion: status=suggest_exit
 *   UserCloseConfirmation: confirmed=true
 *   Config: dryRun=true, allowRealExecution=false
 *   → status=planned
 *   → spot: sell BTC
 *   → perpetual: buy BTC perpetual
 *   → no real API calls
 */

import { describe, expect, it } from "vitest";
import {
  buildCloseExecutionPlan,
  executeClose,
  validateCloseExecution,
} from "./closeConfirmationEngine";
import type { ArbitrageLeg, ArbitragePosition } from "../arbitrage/arbitragePositionTypes";
import type { PositionExitSuggestion } from "./exitSuggestionTypes";
import type {
  CloseExecutionAdapter,
  CloseExecutionConfig,
  UserCloseConfirmation,
} from "./closeConfirmationTypes";

// ─── Helpers ─────────────────────────────────────────────

function makeLeg(overrides?: Partial<ArbitrageLeg>): ArbitrageLeg {
  return {
    exchange: "Binance", symbol: "BTCUSDT", marketType: "perpetual",
    side: "short", quantity: 0.2, entryPrice: 100_000, markPrice: 100_000,
    notionalUsd: 20_000, unrealizedPnlUsd: 0, ...overrides,
  };
}

function makePosition(overrides?: Partial<ArbitragePosition>): ArbitragePosition {
  return {
    id: "pos-btc", symbol: "BTCUSDT", status: "open",
    openedAt: 1_000_000,
    spotLeg: makeLeg({ marketType: "spot", side: "long", quantity: 0.2, notionalUsd: 20_000 }),
    perpetualLeg: makeLeg({ marketType: "perpetual", side: "short", quantity: 0.2, notionalUsd: 20_000 }),
    fundingCollectedUsd: 80, totalPnlUsd: 600,
    deltaUsd: 0, deltaPercent: 1,
    ...overrides,
  };
}

function makeSuggestion(overrides?: Partial<PositionExitSuggestion>): PositionExitSuggestion {
  return {
    positionId: "pos-btc",
    symbol: "BTCUSDT",
    status: "suggest_exit",
    reasons: ["pnl_target_reached"],
    severity: "medium",
    message: "Take-profit target reached",
    totalPnlUsd: 600,
    fundingCollectedUsd: 80,
    generatedAt: Date.now(),
    ...overrides,
  };
}

function makeConfirmation(overrides?: Partial<UserCloseConfirmation>): UserCloseConfirmation {
  return {
    positionId: "pos-btc",
    confirmed: true,
    confirmedAt: Date.now(),
    ...overrides,
  };
}

function makeConfig(overrides?: Partial<CloseExecutionConfig>): CloseExecutionConfig {
  return {
    dryRun: true,
    allowRealExecution: false,
    requireUserConfirmation: true,
    allowedExchanges: ["Binance"],
    maxCloseNotionalUsd: 100_000,
    markPrice: 100_000,
    ...overrides,
  };
}

const DEFAULT_CONFIG = makeConfig();

// ─── Acceptance Criteria ─────────────────────────────────

describe("acceptance criteria", () => {
  it("suggest_exit + confirmed + dryRun → planned, sell spot, buy perp", async () => {
    const pos = makePosition();
    const suggestion = makeSuggestion();
    const confirm = makeConfirmation();

    const result = await executeClose(pos, suggestion, confirm, undefined, DEFAULT_CONFIG);

    expect(result.status).toBe("planned");
    expect(result.plan).toBeDefined();

    // Spot leg close: sell
    expect(result.plan!.spotLegClose.side).toBe("sell");
    expect(result.plan!.spotLegClose.marketType).toBe("spot");

    // Perpetual leg close: buy
    expect(result.plan!.perpetualLegClose.side).toBe("buy");
    expect(result.plan!.perpetualLegClose.marketType).toBe("perpetual");

    // Quantity = 0.2
    expect(result.plan!.spotLegClose.quantity).toBe(0.2);
    expect(result.plan!.perpetualLegClose.quantity).toBe(0.2);

    expect(result.errors).toEqual([]);
  });
});

// ─── buildCloseExecutionPlan ───────────────────────────

describe("buildCloseExecutionPlan", () => {
  it("reverses spot long → sell, perp short → buy", () => {
    const pos = makePosition();
    const suggestion = makeSuggestion();
    const plan = buildCloseExecutionPlan(pos, suggestion, DEFAULT_CONFIG);

    expect(plan.spotLegClose.side).toBe("sell");
    expect(plan.perpetualLegClose.side).toBe("buy");
    expect(plan.reason).toBe("Take-profit target reached");
  });

  it("throws when markPrice is missing", () => {
    const pos = makePosition();
    const suggestion = makeSuggestion();
    // legs with markPrice=0
    const zeroPricePos = {
      ...pos,
      spotLeg: { ...pos.spotLeg, markPrice: 0 },
      perpetualLeg: { ...pos.perpetualLeg, markPrice: 0 },
    };
    expect(() => buildCloseExecutionPlan(zeroPricePos, suggestion, {})).toThrow("mark price is required");
  });
});

// ─── validateCloseExecution ───────────────────────────

describe("validateCloseExecution", () => {
  const pos = makePosition();
  const suggestion = makeSuggestion();
  const plan = buildCloseExecutionPlan(pos, suggestion, DEFAULT_CONFIG);
  const confirm = makeConfirmation();

  it("passes all checks with valid inputs", () => {
    const errors = validateCloseExecution(plan, suggestion, confirm, DEFAULT_CONFIG);
    expect(errors).toEqual([]);
  });

  it("blocks when suggestion status is hold", () => {
    const holdSuggestion = makeSuggestion({ status: "hold" });
    const errors = validateCloseExecution(plan, holdSuggestion, confirm, DEFAULT_CONFIG);
    expect(errors.some((e) => e.includes("hold"))).toBe(true);
  });

  it("blocks when not confirmed", () => {
    const errors = validateCloseExecution(plan, suggestion, undefined, DEFAULT_CONFIG);
    expect(errors.some((e) => e.includes("confirmation"))).toBe(true);
  });

  it("blocks when confirmation.confirmed is false", () => {
    const badConfirm = makeConfirmation({ confirmed: false });
    const errors = validateCloseExecution(plan, suggestion, badConfirm, DEFAULT_CONFIG);
    expect(errors.some((e) => e.includes("did not confirm"))).toBe(true);
  });

  it("blocks when positionId mismatches", () => {
    const badConfirm = makeConfirmation({ positionId: "pos-other" });
    const errors = validateCloseExecution(plan, suggestion, badConfirm, DEFAULT_CONFIG);
    expect(errors.some((e) => e.includes("positionId"))).toBe(true);
  });

  it("blocks when notional exceeds max", () => {
    const smallConfig = makeConfig({ maxCloseNotionalUsd: 10_000 });
    const errors = validateCloseExecution(plan, suggestion, confirm, smallConfig);
    expect(errors.some((e) => e.includes("exceeds max"))).toBe(true);
  });

  it("blocks when exchange not in allowed list", () => {
    const restrictedConfig = makeConfig({ allowedExchanges: ["Bybit"] });
    const errors = validateCloseExecution(plan, suggestion, confirm, restrictedConfig);
    expect(errors.some((e) => e.includes("not in the allowed"))).toBe(true);
  });
});

// ─── executeClose — dryRun ────────────────────────────

describe("executeClose — dryRun modes", () => {
  it("dryRun=true does not call adapter", async () => {
    const pos = makePosition();
    const suggestion = makeSuggestion();
    const confirm = makeConfirmation();
    let adapterCalled = false;

    const adapter: CloseExecutionAdapter = {
      exchangeName: "Binance",
      executeSpotClose: async () => { adapterCalled = true; return "order-id"; },
      executePerpetualClose: async () => { adapterCalled = true; return "order-id"; },
    };

    const result = await executeClose(pos, suggestion, confirm, adapter, makeConfig({ dryRun: true }));
    expect(result.status).toBe("planned");
    expect(adapterCalled).toBe(false);
  });

  it("allowRealExecution=false returns planned even with adapter", async () => {
    const pos = makePosition();
    const suggestion = makeSuggestion();
    const confirm = makeConfirmation();
    let adapterCalled = false;

    const adapter: CloseExecutionAdapter = {
      exchangeName: "Binance",
      executeSpotClose: async () => { adapterCalled = true; return "order-id"; },
      executePerpetualClose: async () => { adapterCalled = true; return "order-id"; },
    };

    const result = await executeClose(pos, suggestion, confirm, adapter, makeConfig({ dryRun: false, allowRealExecution: false }));
    expect(result.status).toBe("planned");
    expect(adapterCalled).toBe(false);
  });
});

// ─── executeClose — real execution ────────────────────

describe("executeClose — real execution", () => {
  it("allowRealExecution=true + confirmed calls adapter (perp first, then spot)", async () => {
    const pos = makePosition();
    const suggestion = makeSuggestion();
    const confirm = makeConfirmation();
    const callOrder: string[] = [];

    const adapter: CloseExecutionAdapter = {
      exchangeName: "Binance",
      executePerpetualClose: async (leg) => { callOrder.push("perp"); return "perp-order"; },
      executeSpotClose: async (leg) => { callOrder.push("spot"); return "spot-order"; },
    };

    const result = await executeClose(pos, suggestion, confirm, adapter, makeConfig({ dryRun: false, allowRealExecution: true }));

    expect(result.status).toBe("executed");
    expect(callOrder).toEqual(["perp", "spot"]); // perp first, then spot
  });

  it("perpetual fail prevents spot execution", async () => {
    const pos = makePosition();
    const suggestion = makeSuggestion();
    const confirm = makeConfirmation();
    let spotCalled = false;

    const adapter: CloseExecutionAdapter = {
      exchangeName: "Binance",
      executePerpetualClose: async () => { throw new Error("Perp close failed"); },
      executeSpotClose: async () => { spotCalled = true; return "spot-order"; },
    };

    const result = await executeClose(pos, suggestion, confirm, adapter, makeConfig({ dryRun: false, allowRealExecution: true }));

    expect(result.status).toBe("blocked");
    expect(result.errors.some((e) => e.includes("Perpetual close"))).toBe(true);
    expect(spotCalled).toBe(false);
  });

  it("spot fail returns partial failure", async () => {
    const pos = makePosition();
    const suggestion = makeSuggestion();
    const confirm = makeConfirmation();

    const adapter: CloseExecutionAdapter = {
      exchangeName: "Binance",
      executePerpetualClose: async () => "perp-order",
      executeSpotClose: async () => { throw new Error("Spot close failed"); },
    };

    const result = await executeClose(pos, suggestion, confirm, adapter, makeConfig({ dryRun: false, allowRealExecution: true }));

    expect(result.status).toBe("blocked");
    expect(result.errors.some((e) => e.includes("Spot close"))).toBe(true);
  });
});

// ─── Default Security ─────────────────────────────────

describe("default security", () => {
  it("default config prevents real execution", async () => {
    const pos = makePosition();
    const suggestion = makeSuggestion();
    const confirm = makeConfirmation();
    let adapterCalled = false;

    const adapter: CloseExecutionAdapter = {
      exchangeName: "Binance",
      executeSpotClose: async () => { adapterCalled = true; return "order-id"; },
      executePerpetualClose: async () => { adapterCalled = true; return "order-id"; },
    };

    const result = await executeClose(pos, suggestion, confirm, adapter, { markPrice: 100_000 });
    expect(result.status).toBe("planned");
    expect(adapterCalled).toBe(false);
  });
});

// ─── Urgent Exit ────────────────────────────────────

describe("urgent exit", () => {
  it("urgent_exit + confirmed → planned", async () => {
    const pos = makePosition();
    const suggestion = makeSuggestion({ status: "urgent_exit", reasons: ["stop_loss_triggered"] });
    const confirm = makeConfirmation();

    const result = await executeClose(pos, suggestion, confirm, undefined, DEFAULT_CONFIG);
    expect(result.status).toBe("planned");
    expect(result.plan!.reason).toBe("Stop-loss triggered");
  });
});

// ─── Immutability ─────────────────────────────────

describe("immutability", () => {
  it("does not mutate input", () => {
    const pos = makePosition();
    const suggestion = makeSuggestion();
    const originalId = pos.id;
    buildCloseExecutionPlan(pos, suggestion, DEFAULT_CONFIG);
    expect(pos.id).toBe(originalId);
  });
});
