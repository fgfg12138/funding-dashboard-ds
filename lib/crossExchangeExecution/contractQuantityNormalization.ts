/**
 * Contract Quantity Normalization — Testnet/Demo Plan
 *
 * Normalizes order quantities across Binance, OKX, and HTX
 * to ensure cross-exchange legs have matching notional values.
 */

export type NormalizationResult = {
  exchangeId: string;
  canonicalSymbol: string;
  exchangeSymbol: string;
  targetNotionalUsd: number;
  markPrice: number;
  contractSize: number;
  rawQuantity: number;
  normalizedQuantity: number;
  expectedNotionalUsd: number;
  quantityPrecisionApplied: number;
  stepSizeApplied: number;
  minOrderSizePassed: boolean;
  minNotionalPassed: boolean;
  notionalMismatchPercent: number;
  valid: boolean;
};

export type TradingRuleSummary = {
  minOrderSize: number;
  maxOrderSize?: number;
  minPriceIncrement: number;
  minBaseAmountIncrement: number;
  minNotional: number;
};

// ─── Normalize quantity for a single exchange leg ──────

export function normalizeExecutionQuantity(
  exchangeId: string,
  canonicalSymbol: string,
  exchangeSymbol: string,
  targetNotionalUsd: number,
  markPrice: number,
  contractSize: number,
  tradingRule: TradingRuleSummary,
): NormalizationResult {
  // Raw quantity needed to achieve target notional
  const rawQuantity = contractSize > 0 ? targetNotionalUsd / (markPrice * contractSize) : 0;
  const stepSize = tradingRule.minBaseAmountIncrement;

  // Round down to step size
  const steppedQuantity = stepSize > 0 ? Math.floor(rawQuantity / stepSize) * stepSize : rawQuantity;

  // Apply quantity precision (decimal places from stepSize)
  const stepStr = String(stepSize);
  const decimals = stepStr.includes(".") ? stepStr.split(".")[1].length : 0;
  const normalizedQuantity = Number(steppedQuantity.toFixed(decimals));

  // Expected notional after normalization
  const expectedNotionalUsd = normalizedQuantity * markPrice * contractSize;

  // Checks
  const minOrderSizePassed = normalizedQuantity >= tradingRule.minOrderSize;
  const minNotionalPassed = expectedNotionalUsd >= tradingRule.minNotional;
  const notionalMismatchPercent = targetNotionalUsd > 0
    ? Math.abs(expectedNotionalUsd - targetNotionalUsd) / targetNotionalUsd * 100
    : 0;

  return {
    exchangeId,
    canonicalSymbol,
    exchangeSymbol,
    targetNotionalUsd,
    markPrice,
    contractSize,
    rawQuantity,
    normalizedQuantity,
    expectedNotionalUsd,
    quantityPrecisionApplied: decimals,
    stepSizeApplied: stepSize,
    minOrderSizePassed,
    minNotionalPassed,
    notionalMismatchPercent,
    valid: minOrderSizePassed && minNotionalPassed && expectedNotionalUsd > 0 && Number.isFinite(expectedNotionalUsd),
  };
}

// ─── Calculate notional from quantity ──────────────────

export function calculateNotionalFromQuantity(
  quantity: number,
  markPrice: number,
  contractSize: number,
): number {
  return quantity * markPrice * contractSize;
}

// ─── Validate cross-exchange leg notional mismatch ─────

export function validateCrossExchangeLegNotional(
  shortResult: NormalizationResult,
  longResult: NormalizationResult,
  maxMismatchPercent = 1,
): { passed: boolean; mismatchPercent: number; reason?: string } {
  const maxNotional = Math.max(shortResult.expectedNotionalUsd, longResult.expectedNotionalUsd);
  const minNotional = Math.min(shortResult.expectedNotionalUsd, longResult.expectedNotionalUsd);
  const mismatchPercent = maxNotional > 0 ? (maxNotional - minNotional) / maxNotional * 100 : 0;

  if (mismatchPercent > maxMismatchPercent) {
    return { passed: false, mismatchPercent, reason: `Leg notional mismatch ${mismatchPercent.toFixed(2)}% > ${maxMismatchPercent}%` };
  }
  if (!shortResult.valid) {
    return { passed: false, mismatchPercent, reason: `Short leg invalid: ${shortResult.exchangeId} qty=${shortResult.normalizedQuantity}` };
  }
  if (!longResult.valid) {
    return { passed: false, mismatchPercent, reason: `Long leg invalid: ${longResult.exchangeId} qty=${longResult.normalizedQuantity}` };
  }
  return { passed: true, mismatchPercent };
}

// ─── Validate exchange quantity rules ──────────────────

export function validateExchangeQuantityRules(
  quantity: number,
  tradingRule: TradingRuleSummary,
): { passed: boolean; reasons: string[] } {
  const reasons: string[] = [];
  if (quantity < tradingRule.minOrderSize) reasons.push(`qty ${quantity} < minOrderSize ${tradingRule.minOrderSize}`);
  if (quantity > (tradingRule.maxOrderSize ?? Infinity)) reasons.push(`qty ${quantity} > maxOrderSize ${tradingRule.maxOrderSize}`);
  return { passed: reasons.length === 0, reasons };
}

// ─── Generate normalization report ─────────────────────

export function generateQuantityNormalizationReport(
  results: NormalizationResult[],
  maxMismatchPercent = 1,
): { passed: boolean; results: NormalizationResult[]; mismatchPercent: number; reason?: string } {
  if (results.length < 2) {
    return { passed: false, results, mismatchPercent: 0, reason: "Need at least 2 legs" };
  }

  const validation = validateCrossExchangeLegNotional(results[0], results[1], maxMismatchPercent);
  return {
    passed: validation.passed && results.every((r) => r.valid),
    results,
    mismatchPercent: validation.mismatchPercent,
    reason: validation.reason,
  };
}
