/**
 * Hedge Engine — Live Phase 2 + Limit Order Patch
 *
 * Builds delta-neutral hedge plans (spot-perp or perp-perp spread)
 * and executes them through the Live-1 Order Router.
 *
 * Supports market orders (default) and limit orders with timeInForce.
 *
 * Pure functions — Order Router calls are the only async boundary.
 */

import type { UnifiedOrderRequest, OrderExecutionResult } from "../orderRouter/orderRouterTypes";
import { createOrder as routerCreateOrder } from "../orderRouter/orderRouter";
import type {
  HedgeEngineConfig,
  HedgeExecutionResult,
  HedgeLegPlan,
  HedgePlan,
  HedgePlanStatus,
  OrderTimeInForce,
} from "./hedgeEngineTypes";

// ─── Optional order execution parameters ────────────────

export type OrderExecutionParams = {
  /** Order type: market (default) or limit. */
  orderType?: "market" | "limit";
  /** Time-in-force for limit orders (default GTC). */
  timeInForce?: OrderTimeInForce;
  /** Limit price (required when orderType="limit"). */
  limitPrice?: number;
};

// ─── Defaults ────────────────────────────────────────────

const DEFAULTS = {
  maxDeltaPercent: 0.5,
  maxNotionalUsd: 100_000,
  allowPartialExecution: false,
  dryRun: true,
};

let _seq = 0;
function nextId(): string {
  _seq += 1;
  return `hedge-${String(_seq).padStart(6, "0")}`;
}

function resolveConfig(c?: HedgeEngineConfig): Required<HedgeEngineConfig> {
  return {
    maxDeltaPercent: c?.maxDeltaPercent ?? DEFAULTS.maxDeltaPercent,
    maxNotionalUsd: c?.maxNotionalUsd ?? DEFAULTS.maxNotionalUsd,
    allowPartialExecution: c?.allowPartialExecution ?? DEFAULTS.allowPartialExecution,
    dryRun: c?.dryRun ?? DEFAULTS.dryRun,
  };
}

// ─── Helper: apply order params to legs ────────────────

function applyOrderParams(
  legs: HedgeLegPlan[],
  params?: OrderExecutionParams,
): HedgeLegPlan[] {
  if (!params) return legs;
  return legs.map((leg) => ({
    ...leg,
    orderType: leg.orderType ?? params.orderType,
    timeInForce: leg.timeInForce ?? params.timeInForce,
    limitPrice: leg.limitPrice ?? params.limitPrice,
  }));
}

// ─── Public API ──────────────────────────────────────────

/**
 * Calculate the net delta of a collection of hedge legs.
 *
 * long = +notionalUsd, short = -notionalUsd
 */
export function calculateHedgeDelta(legs: HedgeLegPlan[]): number {
  return legs.reduce((sum, leg) => {
    return sum + (leg.side === "long" ? leg.notionalUsd : -leg.notionalUsd);
  }, 0);
}

/**
 * Build a standard spot-perp hedge plan.
 *
 * Creates two legs:
 *   1. spot long on spotExchange
 *   2. perpetual short on perpExchange
 *
 * @param symbol       - Trading pair symbol.
 * @param spotExchange - Exchange for the spot leg.
 * @param perpExchange - Exchange for the perpetual leg.
 * @param notionalUsd  - Target notional value per leg.
 * @param price        - Current mark price for quantity calculation.
 * @param orderParams  - Optional order type / limit price / timeInForce.
 * @returns A HedgePlan with expected delta ≈ 0.
 */
export function buildSpotPerpHedgePlan(
  symbol: string,
  spotExchange: string,
  perpExchange: string,
  notionalUsd: number,
  price: number,
  orderParams?: OrderExecutionParams,
): HedgePlan {
  if (price <= 0) throw new Error("Price must be > 0.");
  if (notionalUsd <= 0) throw new Error("Notional must be > 0.");

  const quantity = notionalUsd / price;

  let legs: HedgeLegPlan[] = [
    {
      exchange: spotExchange,
      symbol,
      legType: "spot",
      side: "long",
      quantity,
      price,
      notionalUsd,
      executionPriority: 1, // spot first for entry
    },
    {
      exchange: perpExchange,
      symbol,
      legType: "perpetual",
      side: "short",
      quantity,
      price,
      notionalUsd,
      executionPriority: 2, // perp second for entry
    },
  ];

  legs = applyOrderParams(legs, orderParams);

  const expectedDeltaUsd = calculateHedgeDelta(legs);
  const maxLegNotional = Math.max(...legs.map((l) => l.notionalUsd));
  const expectedDeltaPercent = maxLegNotional > 0 ? (expectedDeltaUsd / maxLegNotional) * 100 : 0;

  return {
    id: nextId(),
    symbol,
    legs,
    targetDeltaUsd: 0,
    expectedDeltaUsd,
    expectedDeltaPercent,
    status: "planned",
    createdAt: Date.now(),
  };
}

/**
 * Build a perp-perp spread hedge plan for cross-exchange arbitrage.
 *
 * Creates two legs:
 *   1. perpetual short on shortExchange
 *   2. perpetual long on longExchange
 *
 * @param symbol        - Trading pair symbol.
 * @param shortExchange - Exchange for the short leg.
 * @param longExchange   - Exchange for the long leg.
 * @param notionalUsd   - Target notional value per leg.
 * @param price         - Current mark price for quantity calculation.
 * @param orderParams   - Optional order type / limit price / timeInForce.
 * @returns A HedgePlan with expected delta ≈ 0.
 */
export function buildPerpPerpSpreadHedgePlan(
  symbol: string,
  shortExchange: string,
  longExchange: string,
  notionalUsd: number,
  price: number,
  orderParams?: OrderExecutionParams,
): HedgePlan {
  if (price <= 0) throw new Error("Price must be > 0.");
  if (notionalUsd <= 0) throw new Error("Notional must be > 0.");

  const quantity = notionalUsd / price;

  let legs: HedgeLegPlan[] = [
    {
      exchange: shortExchange,
      symbol,
      legType: "perpetual",
      side: "short",
      quantity,
      price,
      notionalUsd,
      executionPriority: 1, // short first for entry
    },
    {
      exchange: longExchange,
      symbol,
      legType: "perpetual",
      side: "long",
      quantity,
      price,
      notionalUsd,
      executionPriority: 2, // long second for entry
    },
  ];

  legs = applyOrderParams(legs, orderParams);

  const expectedDeltaUsd = calculateHedgeDelta(legs);
  const maxLegNotional = Math.max(...legs.map((l) => l.notionalUsd));
  const expectedDeltaPercent = maxLegNotional > 0 ? (expectedDeltaUsd / maxLegNotional) * 100 : 0;

  return {
    id: nextId(),
    symbol,
    legs,
    targetDeltaUsd: 0,
    expectedDeltaUsd,
    expectedDeltaPercent,
    status: "planned",
    createdAt: Date.now(),
  };
}

/**
 * Validate a hedge plan against configurable thresholds.
 */
export function validateHedgePlan(
  plan: HedgePlan,
  config?: HedgeEngineConfig,
): string[] {
  const errors: string[] = [];
  const cfg = resolveConfig(config);

  // 1. At least 2 legs
  if (plan.legs.length < 2) {
    errors.push(`Hedge plan must have at least 2 legs, got ${plan.legs.length}.`);
  }

  // 2. Delta within tolerance
  const absDelta = Math.abs(plan.expectedDeltaPercent);
  if (absDelta > cfg.maxDeltaPercent) {
    errors.push(`Expected delta ${plan.expectedDeltaPercent.toFixed(2)}% exceeds max ${cfg.maxDeltaPercent}%.`);
  }

  // 3. Notional within limit
  const totalNotional = plan.legs.reduce((sum, l) => sum + l.notionalUsd, 0);
  if (totalNotional > cfg.maxNotionalUsd) {
    errors.push(`Total notional $${totalNotional.toLocaleString()} exceeds max $${cfg.maxNotionalUsd.toLocaleString()}.`);
  }

  // 4. Limit order validation
  for (const leg of plan.legs) {
    if (leg.orderType === "limit") {
      const limitPrice = leg.limitPrice ?? leg.price;
      if (!limitPrice || limitPrice <= 0) {
        errors.push(`Limit order requires limitPrice > 0 for ${leg.legType} leg.`);
      }
    }
  }

  return errors;
}

// ─── Execution ───────────────────────────────────────────

/**
 * Map a HedgeSide to an OrderRouter OrderSide.
 */
function toOrderSide(side: "long" | "short"): "buy" | "sell" {
  return side === "long" ? "buy" : "sell";
}

/**
 * Execute a hedge plan through the Live-1 Order Router.
 *
 * Supports both market and limit orders based on leg.orderType.
 * When orderType="limit", uses limitPrice (falls back to leg.price)
 * and timeInForce (defaults to GTC).
 *
 * @param plan   - The hedge plan to execute.
 * @param config - Execution configuration.
 * @returns HedgeExecutionResult with order details and errors.
 */
export async function executeHedgePlan(
  plan: HedgePlan,
  config?: HedgeEngineConfig,
): Promise<HedgeExecutionResult> {
  const cfg = resolveConfig(config);

  // Validate first
  const validationErrors = validateHedgePlan(plan, config);
  if (validationErrors.length > 0) {
    return {
      planId: plan.id,
      status: "failed",
      orders: [],
      errors: validationErrors,
    };
  }

  // Dry run
  if (cfg.dryRun) {
    return {
      planId: plan.id,
      status: "planned",
      orders: [],
      errors: [],
    };
  }

  // Real execution through Order Router
  const orders: HedgeExecutionResult["orders"] = [];
  const errors: string[] = [];
  let finalStatus: HedgePlanStatus = "executed";

  // Determine execution order by executionPriority (ascending)
  const sortedLegs = [...plan.legs].sort((a, b) => {
    const pa = a.executionPriority ?? 99;
    const pb = b.executionPriority ?? 99;
    return pa - pb;
  });

  for (const leg of sortedLegs) {
    const orderType = leg.orderType ?? "market";
    const request: UnifiedOrderRequest = {
      exchange: leg.exchange,
      symbol: leg.symbol,
      side: toOrderSide(leg.side),
      type: orderType,
      quantity: leg.quantity,
    };

    // Limit order fields
    if (orderType === "limit") {
      const limitPrice = leg.limitPrice ?? leg.price;
      request.price = limitPrice;
    }

    try {
      const result: OrderExecutionResult = await routerCreateOrder(request);
      if (result.success && result.order) {
        orders.push({
          exchange: result.order.exchange,
          orderId: result.order.orderId,
          symbol: result.order.symbol,
          side: result.order.side,
          quantity: result.order.quantity,
        });
      } else {
        errors.push(...result.errors);
        if (!cfg.allowPartialExecution) {
          finalStatus = "failed";
          break;
        }
        finalStatus = "partial";
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      errors.push(`Leg execution error: ${msg}`);
      if (!cfg.allowPartialExecution) {
        finalStatus = "failed";
        break;
      }
      finalStatus = "partial";
    }
  }

  return {
    planId: plan.id,
    status: finalStatus,
    orders,
    errors,
    executedAt: Date.now(),
  };
}
