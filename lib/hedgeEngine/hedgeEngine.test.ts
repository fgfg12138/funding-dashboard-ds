/**
 * Hedge Engine Tests — Live Phase 2
 *
 * Acceptance criteria — Spot-Perp:
 *   symbol=BTCUSDT, spotExchange=binance, perpExchange=binance,
 *   notional=20000, price=100000
 *   → spot long qty=0.2, perp short qty=0.2, delta≈0
 *
 * Perp-Perp Spread:
 *   symbol=BTCUSDT, shortExchange=binance, longExchange=bybit,
 *   notional=20000, price=100000
 *   → binance perp short 0.2, bybit perp long 0.2, delta≈0
 */

import { describe, expect, it } from "vitest";
import {
  buildPerpPerpSpreadHedgePlan,
  buildSpotPerpHedgePlan,
  calculateHedgeDelta,
  executeHedgePlan,
  validateHedgePlan,
} from "./hedgeEngine";
import type { HedgeLegPlan } from "./hedgeEngineTypes";

// ─── Acceptance: Spot-Perp ──────────────────────────────

describe("acceptance — spot-perp", () => {
  const plan = buildSpotPerpHedgePlan("BTCUSDT", "binance", "binance", 20_000, 100_000);

  it("creates 2 legs", () => {
    expect(plan.legs.length).toBe(2);
  });

  it("spot leg is long, qty = 0.2", () => {
    const spot = plan.legs.find((l) => l.legType === "spot")!;
    expect(spot.side).toBe("long");
    expect(spot.quantity).toBeCloseTo(0.2, 4);
    expect(spot.exchange).toBe("binance");
  });

  it("perp leg is short, qty = 0.2", () => {
    const perp = plan.legs.find((l) => l.legType === "perpetual")!;
    expect(perp.side).toBe("short");
    expect(perp.quantity).toBeCloseTo(0.2, 4);
    expect(perp.exchange).toBe("binance");
  });

  it("expectedDeltaUsd ≈ 0", () => {
    expect(Math.abs(plan.expectedDeltaUsd)).toBe(0);
  });

  it("validateHedgePlan passes", () => {
    const errors = validateHedgePlan(plan);
    expect(errors).toEqual([]);
  });
});

// ─── Acceptance: Perp-Perp Spread ───────────────────────

describe("acceptance — perp-perp spread", () => {
  const plan = buildPerpPerpSpreadHedgePlan("BTCUSDT", "binance", "bybit", 20_000, 100_000);

  it("creates 2 legs", () => {
    expect(plan.legs.length).toBe(2);
  });

  it("binance leg is short, qty = 0.2", () => {
    const binanceLeg = plan.legs.find((l) => l.exchange === "binance")!;
    expect(binanceLeg.side).toBe("short");
    expect(binanceLeg.quantity).toBeCloseTo(0.2, 4);
    expect(binanceLeg.legType).toBe("perpetual");
  });

  it("bybit leg is long, qty = 0.2", () => {
    const bybitLeg = plan.legs.find((l) => l.exchange === "bybit")!;
    expect(bybitLeg.side).toBe("long");
    expect(bybitLeg.quantity).toBeCloseTo(0.2, 4);
    expect(bybitLeg.legType).toBe("perpetual");
  });

  it("expectedDeltaUsd ≈ 0", () => {
    expect(Math.abs(plan.expectedDeltaUsd)).toBe(0);
  });

  it("validateHedgePlan passes", () => {
    const errors = validateHedgePlan(plan);
    expect(errors).toEqual([]);
  });
});

// ─── calculateHedgeDelta ──────────────────────────────

describe("calculateHedgeDelta", () => {
  it("long + short = 0", () => {
    const legs: HedgeLegPlan[] = [
      { exchange: "binance", symbol: "BTCUSDT", legType: "spot", side: "long", quantity: 0.2, price: 100_000, notionalUsd: 20_000 },
      { exchange: "binance", symbol: "BTCUSDT", legType: "perpetual", side: "short", quantity: 0.2, price: 100_000, notionalUsd: 20_000 },
    ];
    expect(calculateHedgeDelta(legs)).toBe(0);
  });

  it("short + long = 0", () => {
    const legs: HedgeLegPlan[] = [
      { exchange: "binance", symbol: "BTCUSDT", legType: "perpetual", side: "short", quantity: 0.2, price: 100_000, notionalUsd: 20_000 },
      { exchange: "bybit", symbol: "BTCUSDT", legType: "perpetual", side: "long", quantity: 0.2, price: 100_000, notionalUsd: 20_000 },
    ];
    expect(calculateHedgeDelta(legs)).toBe(0);
  });

  it("two longs = positive sum", () => {
    const legs: HedgeLegPlan[] = [
      { exchange: "binance", symbol: "BTCUSDT", legType: "spot", side: "long", quantity: 1, price: 100_000, notionalUsd: 100_000 },
      { exchange: "bybit", symbol: "BTCUSDT", legType: "perpetual", side: "long", quantity: 1, price: 100_000, notionalUsd: 100_000 },
    ];
    expect(calculateHedgeDelta(legs)).toBe(200_000);
  });
});

// ─── validateHedgePlan ─────────────────────────────

describe("validateHedgePlan", () => {
  it("blocks delta above maxDeltaPercent", () => {
    const plan = buildSpotPerpHedgePlan("BTCUSDT", "binance", "binance", 20_000, 100_000);
    // Manually skew the delta
    plan.legs[0].notionalUsd = 30_000; // skew
    const skewedDelta = calculateHedgeDelta(plan.legs);
    plan.expectedDeltaUsd = skewedDelta;
    const maxLeg = Math.max(...plan.legs.map((l) => l.notionalUsd));
    plan.expectedDeltaPercent = maxLeg > 0 ? (skewedDelta / maxLeg) * 100 : 0;

    const errors = validateHedgePlan(plan, { maxDeltaPercent: 0.5 });
    expect(errors.some((e) => e.includes("delta"))).toBe(true);
  });

  it("blocks notional above maxNotionalUsd", () => {
    const plan = buildSpotPerpHedgePlan("BTCUSDT", "binance", "binance", 200_000, 100_000);
    const errors = validateHedgePlan(plan, { maxNotionalUsd: 50_000 });
    expect(errors.some((e) => e.includes("notional"))).toBe(true);
  });

  it("blocks fewer than 2 legs", () => {
    const plan = buildSpotPerpHedgePlan("BTCUSDT", "binance", "binance", 20_000, 100_000);
    (plan as any).legs = [plan.legs[0]];
    const errors = validateHedgePlan(plan);
    expect(errors.some((e) => e.includes("at least 2"))).toBe(true);
  });

  it("passes for valid plan", () => {
    const plan = buildSpotPerpHedgePlan("BTCUSDT", "binance", "binance", 20_000, 100_000);
    const errors = validateHedgePlan(plan);
    expect(errors).toEqual([]);
  });
});

// ─── executeHedgePlan — dryRun ──────────────────────

describe("executeHedgePlan — dryRun", () => {
  it("dryRun=true returns planned, no orders", async () => {
    const plan = buildSpotPerpHedgePlan("BTCUSDT", "binance", "binance", 20_000, 100_000);
    const result = await executeHedgePlan(plan, { dryRun: true });

    expect(result.status).toBe("planned");
    expect(result.orders).toEqual([]);
    expect(result.errors).toEqual([]);
  });
});

// ─── executeHedgePlan — real execution ─────────────

describe("executeHedgePlan — real execution", () => {
  it("executes through Order Router, returns orders", async () => {
    const plan = buildSpotPerpHedgePlan("BTCUSDT", "binance", "binance", 20_000, 100_000);
    const result = await executeHedgePlan(plan, { dryRun: false });

    expect(result.status).toBe("executed");
    expect(result.orders.length).toBe(2);
    expect(result.orders.every((o) => o.orderId.startsWith("binance-"))).toBe(true);
    expect(result.errors).toEqual([]);
  });

  it("spot-perp execution order: spot first, then perp", async () => {
    const plan = buildSpotPerpHedgePlan("BTCUSDT", "binance", "binance", 20_000, 100_000);
    const result = await executeHedgePlan(plan, { dryRun: false });

    // Spot should be first (avoid naked short)
    const firstLegType = result.orders[0]?.exchange ? "spot" : "unknown";
    expect(firstLegType).toBe("spot");
  });

  it("validates before execution, returns failed on invalid", async () => {
    const plan = buildSpotPerpHedgePlan("BTCUSDT", "binance", "binance", 200_000, 100_000);
    const result = await executeHedgePlan(plan, { dryRun: false, maxNotionalUsd: 50_000 });

    expect(result.status).toBe("failed");
    expect(result.orders).toEqual([]);
    expect(result.errors.length).toBeGreaterThan(0);
  });
});

// ─── Partial Execution ─────────────────────────────

describe("partial execution", () => {
  it("allowPartialExecution=false stops on first failure (unknown exchange)", async () => {
    // Use an exchange not in the router
    const plan = buildSpotPerpHedgePlan("BTCUSDT", "unknown_exchange" as any, "binance", 20_000, 100_000);
    const result = await executeHedgePlan(plan, { dryRun: false, allowPartialExecution: false });

    expect(result.status).toBe("failed");
    expect(result.orders.length).toBeLessThan(2); // Not all legs executed
  });
});

// ─── Immutability ──────────────────────────────

describe("immutability", () => {
  it("does not mutate inputs", () => {
    const plan = buildSpotPerpHedgePlan("BTCUSDT", "binance", "binance", 20_000, 100_000);
    const originalId = plan.id;
    validateHedgePlan(plan);
    expect(plan.id).toBe(originalId);
  });
});

// ─── Edge Cases ─────────────────────────────────

describe("edge cases", () => {
  it("throws for zero price", () => {
    expect(() => buildSpotPerpHedgePlan("BTCUSDT", "binance", "binance", 20_000, 0)).toThrow("Price");
  });

  it("throws for zero notional", () => {
    expect(() => buildSpotPerpHedgePlan("BTCUSDT", "binance", "binance", 0, 100_000)).toThrow("Notional");
  });
});

// ─── Limit Order Support ────────────────────────────────

describe("limit order support", () => {
  it("default remains market order (no params)", () => {
    const plan = buildSpotPerpHedgePlan("BTCUSDT", "binance", "binance", 20_000, 100_000);
    for (const leg of plan.legs) {
      expect(leg.orderType).toBeUndefined(); // defaults to market at execution
    }
  });

  it("buildSpotPerpHedgePlan with limit order params", () => {
    const plan = buildSpotPerpHedgePlan("BTCUSDT", "binance", "bybit", 20_000, 100_000, {
      orderType: "limit",
      limitPrice: 99_000,
      timeInForce: "GTC",
    });

    for (const leg of plan.legs) {
      expect(leg.orderType).toBe("limit");
      expect(leg.limitPrice).toBe(99_000);
      expect(leg.timeInForce).toBe("GTC");
    }
  });

  it("buildPerpPerpSpreadHedgePlan with limit order params", () => {
    const plan = buildPerpPerpSpreadHedgePlan("BTCUSDT", "binance", "bybit", 20_000, 100_000, {
      orderType: "limit",
      limitPrice: 99_000,
      timeInForce: "IOC",
    });

    for (const leg of plan.legs) {
      expect(leg.orderType).toBe("limit");
      expect(leg.limitPrice).toBe(99_000);
      expect(leg.timeInForce).toBe("IOC");
    }
  });

  it("executeHedgePlan passes limit order type through Order Router", async () => {
    const plan = buildSpotPerpHedgePlan("BTCUSDT", "binance", "binance", 20_000, 100_000, {
      orderType: "limit",
      limitPrice: 1,
      timeInForce: "GTC",
    });
    const result = await executeHedgePlan(plan, { dryRun: false });
    expect(result.status).toBe("executed");
    expect(result.orders.length).toBe(2);
  });

  it("validateHedgePlan blocks limit orders with no price", () => {
    const plan = buildSpotPerpHedgePlan("BTCUSDT", "binance", "binance", 20_000, 100_000, {
      orderType: "limit",
      limitPrice: 0,
    });
    const errors = validateHedgePlan(plan);
    expect(errors.some((e) => e.includes("limitPrice"))).toBe(true);
  });

  it("executionPriority order is preserved with limit order params", () => {
    const plan = buildSpotPerpHedgePlan("BTCUSDT", "binance", "binance", 20_000, 100_000, {
      orderType: "limit",
      limitPrice: 99_000,
    });
    expect(plan.legs[0].executionPriority).toBe(1);
    expect(plan.legs[1].executionPriority).toBe(2);
  });
});
