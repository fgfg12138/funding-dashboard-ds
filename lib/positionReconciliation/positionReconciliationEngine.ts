/**
 * Position Reconciliation Engine — Beta Phase 4
 *
 * Compares exchange positions (from Account Sync) against local
 * arbitrage positions (ArbitragePosition[]) and produces a report
 * highlighting all discrepancies.
 *
 * Pure functions — no side effects, no trading.
 */

import type { AccountPosition } from "../accountSync/accountSyncTypes";
import type { ArbitragePosition } from "../arbitrage/arbitragePositionTypes";
import type {
  PositionReconciliationConfig,
  PositionReconciliationItem,
  PositionReconciliationReport,
  ReconciliationSeverity,
  ReconciliationStatus,
} from "./positionReconciliationTypes";

// ─── Defaults ────────────────────────────────────────────

const DEFAULT_QUANTITY_TOLERANCE_PERCENT = 0.5;
const DEFAULT_PRICE_TOLERANCE_PERCENT = 1;
const DEFAULT_DELTA_TOLERANCE_USD = 100;

// ─── Helpers ─────────────────────────────────────────────

function resolveConfig(c?: PositionReconciliationConfig): Required<PositionReconciliationConfig> {
  return {
    quantityTolerancePercent: c?.quantityTolerancePercent ?? DEFAULT_QUANTITY_TOLERANCE_PERCENT,
    priceTolerancePercent: c?.priceTolerancePercent ?? DEFAULT_PRICE_TOLERANCE_PERCENT,
    deltaToleranceUsd: c?.deltaToleranceUsd ?? DEFAULT_DELTA_TOLERANCE_USD,
  };
}

/**
 * Calculate the percentage difference between two values relative to the first.
 * Returns Infinity when localValue is 0 to avoid division by zero.
 */
export function calculateQuantityDiff(localQty: number, exchangeQty: number): number {
  if (localQty === 0) return exchangeQty === 0 ? 0 : Infinity;
  return Math.abs(localQty - exchangeQty) / localQty * 100;
}

/**
 * Calculate the percentage price difference between two values relative to the local price.
 */
export function calculatePriceDiff(localPrice: number, exchangePrice: number): number {
  if (localPrice === 0) return exchangePrice === 0 ? 0 : Infinity;
  return Math.abs(localPrice - exchangePrice) / localPrice * 100;
}

/**
 * Calculate the notional delta for an exchange position.
 * long = +notional, short = -notional.
 * Uses markPrice if available, otherwise entryPrice.
 */
export function calculateExchangeDelta(exchangePosition: AccountPosition): number {
  const price = exchangePosition.markPrice ?? exchangePosition.entryPrice;
  const notional = exchangePosition.quantity * price;
  return exchangePosition.side === "long" ? notional : -notional;
}

// ─── Matching ────────────────────────────────────────────

/**
 * Find the first exchange position matching a local position by exchange + symbol.
 */
export function matchLocalToExchangePosition(
  localPosition: ArbitragePosition,
  exchangePositions: AccountPosition[],
): AccountPosition | undefined {
  return exchangePositions.find(
    (ep) =>
      ep.exchange.toLowerCase() === localPosition.perpetualLeg.exchange.toLowerCase() &&
      ep.symbol === localPosition.symbol,
  );
}

// ─── Comparison ──────────────────────────────────────────

function buildSeverity(status: ReconciliationStatus): ReconciliationSeverity {
  switch (status) {
    case "matched":
      return "low";
    case "price_mismatch":
      return "low";
    case "quantity_mismatch":
    case "delta_mismatch":
      return "medium";
    case "side_mismatch":
    case "missing_on_exchange":
    case "missing_locally":
      return "high";
  }
}

/**
 * Compare a local position and an exchange position, returning
 * the most severe discrepancy found.
 *
 * Checks are ordered by priority: missing > side > quantity > price > delta.
 */
export function comparePositionPair(
  localPosition: ArbitragePosition,
  exchangePosition: AccountPosition | undefined,
  config: Required<PositionReconciliationConfig>,
): PositionReconciliationItem {
  const exchange = localPosition.perpetualLeg.exchange as import("../security/apiKeyTypes").SupportedExchange;
  const symbol = localPosition.symbol;

  // Case 1: missing on exchange
  if (!exchangePosition) {
    return {
      symbol,
      exchange,
      localPositionId: localPosition.id,
      status: "missing_on_exchange",
      severity: "high",
      message: `本地仓位 ${symbol} 在交易所未找到`,
      localQuantity: localPosition.perpetualLeg.quantity,
      localSide: localPosition.perpetualLeg.side,
      localEntryPrice: localPosition.perpetualLeg.entryPrice,
      localDeltaUsd: localPosition.deltaUsd,
      diff: `本地 ${localPosition.perpetualLeg.quantity} @ ${localPosition.perpetualLeg.entryPrice}，交易所无此仓位`,
    };
  }

  // Case 2: side mismatch (highest priority after missing)
  if (localPosition.perpetualLeg.side !== exchangePosition.side) {
    return {
      symbol,
      exchange,
      localPositionId: localPosition.id,
      exchangePositionId: exchangePosition.exchange,
      status: "side_mismatch",
      severity: "high",
      message: `方向不一致：本地 ${localPosition.perpetualLeg.side}，交易所 ${exchangePosition.side}`,
      localSide: localPosition.perpetualLeg.side,
      exchangeSide: exchangePosition.side,
      localQuantity: localPosition.perpetualLeg.quantity,
      exchangeQuantity: exchangePosition.quantity,
      localEntryPrice: localPosition.perpetualLeg.entryPrice,
      exchangeEntryPrice: exchangePosition.entryPrice,
      localDeltaUsd: localPosition.deltaUsd,
      exchangeDeltaUsd: calculateExchangeDelta(exchangePosition),
      diff: `方向差异`,
    };
  }

  // Case 3: quantity mismatch
  const qtyDiffPercent = calculateQuantityDiff(localPosition.perpetualLeg.quantity, exchangePosition.quantity);
  if (qtyDiffPercent > config.quantityTolerancePercent) {
    return {
      symbol,
      exchange,
      localPositionId: localPosition.id,
      exchangePositionId: exchangePosition.exchange,
      status: "quantity_mismatch",
      severity: "medium",
      message: `数量差异 ${qtyDiffPercent.toFixed(2)}%：本地 ${localPosition.perpetualLeg.quantity}，交易所 ${exchangePosition.quantity}`,
      localQuantity: localPosition.perpetualLeg.quantity,
      exchangeQuantity: exchangePosition.quantity,
      localSide: localPosition.perpetualLeg.side,
      exchangeSide: exchangePosition.side,
      localEntryPrice: localPosition.perpetualLeg.entryPrice,
      exchangeEntryPrice: exchangePosition.entryPrice,
      diff: `数量差 ${(exchangePosition.quantity - localPosition.perpetualLeg.quantity).toFixed(4)}`,
    };
  }

  // Case 4: price mismatch
  const priceDiffPercent = calculatePriceDiff(localPosition.perpetualLeg.entryPrice, exchangePosition.entryPrice);
  if (priceDiffPercent > config.priceTolerancePercent) {
    return {
      symbol,
      exchange,
      localPositionId: localPosition.id,
      exchangePositionId: exchangePosition.exchange,
      status: "price_mismatch",
      severity: "low",
      message: `入场价差异 ${priceDiffPercent.toFixed(2)}%：本地 ${localPosition.perpetualLeg.entryPrice}，交易所 ${exchangePosition.entryPrice}`,
      localQuantity: localPosition.perpetualLeg.quantity,
      exchangeQuantity: exchangePosition.quantity,
      localSide: localPosition.perpetualLeg.side,
      exchangeSide: exchangePosition.side,
      localEntryPrice: localPosition.perpetualLeg.entryPrice,
      exchangeEntryPrice: exchangePosition.entryPrice,
      diff: `价格差 ${(exchangePosition.entryPrice - localPosition.perpetualLeg.entryPrice).toFixed(2)}`,
    };
  }

  // Case 5: delta mismatch
  const exchangeDelta = calculateExchangeDelta(exchangePosition);
  if (Math.abs(localPosition.deltaUsd - exchangeDelta) > config.deltaToleranceUsd) {
    return {
      symbol,
      exchange,
      localPositionId: localPosition.id,
      exchangePositionId: exchangePosition.exchange,
      status: "delta_mismatch",
      severity: "medium",
      message: `Delta 差异：本地 ${localPosition.deltaUsd.toFixed(2)}，交易所 ${exchangeDelta.toFixed(2)}`,
      localQuantity: localPosition.perpetualLeg.quantity,
      exchangeQuantity: exchangePosition.quantity,
      localSide: localPosition.perpetualLeg.side,
      exchangeSide: exchangePosition.side,
      localDeltaUsd: localPosition.deltaUsd,
      exchangeDeltaUsd: exchangeDelta,
      diff: `Delta 差 ${(exchangeDelta - localPosition.deltaUsd).toFixed(2)}`,
    };
  }

  // All checks passed — matched
  return {
    symbol,
    exchange,
    localPositionId: localPosition.id,
    exchangePositionId: exchangePosition.exchange,
    status: "matched",
    severity: "low",
    message: `仓位 ${symbol} 对账一致`,
    localQuantity: localPosition.perpetualLeg.quantity,
    exchangeQuantity: exchangePosition.quantity,
    localSide: localPosition.perpetualLeg.side,
    exchangeSide: exchangePosition.side,
    localEntryPrice: localPosition.perpetualLeg.entryPrice,
    exchangeEntryPrice: exchangePosition.entryPrice,
    localDeltaUsd: localPosition.deltaUsd,
    exchangeDeltaUsd: exchangeDelta,
    diff: "无差异",
  };
}

// ─── Main reconciliation ────────────────────────────────

/**
 * Reconcile local arbitrage positions against exchange positions from Account Sync.
 *
 * Steps:
 * 1. For each local position, try to find a matching exchange position (exchange + symbol).
 * 2. If found, run comparePositionPair; if not, report missing_on_exchange.
 * 3. For each unmatched exchange position, report missing_locally.
 *
 * @param localPositions    - Array of local ArbitragePosition (from Alpha-3).
 * @param accountPositions  - Account positions from Account Sync snapshot.
 * @param config            - Tolerance configuration.
 * @returns A PositionReconciliationReport with all items, counts, and severity summary.
 */
export function reconcilePositions(
  localPositions: ArbitragePosition[],
  accountPositions: AccountPosition[],
  config?: PositionReconciliationConfig,
): PositionReconciliationReport {
  const cfg = resolveConfig(config);
  const items: PositionReconciliationItem[] = [];
  const matchedExchangeIds = new Set<string>();

  // 1. Match each local position
  for (const local of localPositions) {
    const exchangePos = matchLocalToExchangePosition(local, accountPositions);
    if (exchangePos) {
      // Use exchange + symbol as unique key for tracking matched exchange positions
      matchedExchangeIds.add(`${exchangePos.exchange}:${exchangePos.symbol}`);
    }
    items.push(comparePositionPair(local, exchangePos, cfg));
  }

  // 2. Find exchange positions with no local match
  for (const ep of accountPositions) {
    const key = `${ep.exchange}:${ep.symbol}`;
    if (!matchedExchangeIds.has(key)) {
      items.push({
        symbol: ep.symbol,
        exchange: ep.exchange as import("../security/apiKeyTypes").SupportedExchange,
        status: "missing_locally",
        severity: "high",
        message: `交易所 ${ep.exchange} 有 ${ep.symbol} 仓位，但本地未记录`,
        exchangeQuantity: ep.quantity,
        exchangeSide: ep.side,
        exchangeEntryPrice: ep.entryPrice,
        exchangeDeltaUsd: calculateExchangeDelta(ep),
        diff: `交易所 ${ep.quantity} @ ${ep.entryPrice}`,
      });
    }
  }

  // 3. Compute counts
  let matchedCount = 0;
  let mismatchCount = 0;
  let highSeverityCount = 0;

  for (const item of items) {
    if (item.status === "matched") {
      matchedCount++;
    } else {
      mismatchCount++;
    }
    if (item.severity === "high") {
      highSeverityCount++;
    }
  }

  return {
    items,
    matchedCount,
    mismatchCount,
    highSeverityCount,
    generatedAt: Date.now(),
  };
}
