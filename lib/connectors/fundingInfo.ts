/**
 * Funding Info — Multi-Exchange Connector Spec
 *
 * Funding rate tracking for perpetual contracts.
 * Pure types + functions — no external dependencies.
 */

import type { ExchangeId } from "../exchangeRegistry/exchangeRegistryTypes";

// ─── Types ─────────────────────────────────────────────

export type FundingInfo = {
  /** Exchange identifier. */
  exchangeId: ExchangeId;
  /** Canonical symbol (e.g. "BTCUSDT"). */
  canonicalSymbol: string;
  /** Exchange-specific symbol. */
  exchangeSymbol: string;
  /** Current mark price. */
  markPrice: number;
  /** Current index price (optional). */
  indexPrice?: number;
  /** Last published funding rate (decimal, e.g. 0.0001 = 0.01%). */
  lastFundingRate: number;
  /** Timestamp (ms) of next funding settlement. */
  nextFundingTime: number;
};

export type FundingPayment = {
  /** Exchange identifier. */
  exchangeId: ExchangeId;
  /** Canonical symbol. */
  canonicalSymbol: string;
  /** Exchange-specific symbol. */
  exchangeSymbol: string;
  /** Payment amount in USD (positive = received, negative = paid). */
  amountUsd: number;
  /** Funding rate at time of payment. */
  fundingRate: number;
  /** Timestamp (ms) when the payment occurred. */
  paidAt: number;
  /** Position side at time of payment (optional). */
  positionSide?: "long" | "short";
};

// ─── Functions ─────────────────────────────────────────

export function createFundingInfo(params: {
  exchangeId: ExchangeId;
  canonicalSymbol: string;
  exchangeSymbol: string;
  markPrice: number;
  indexPrice?: number;
  lastFundingRate: number;
  nextFundingTime: number;
}): FundingInfo {
  return { ...params };
}

export function recordFundingPayment(
  payments: FundingPayment[],
  payment: FundingPayment,
): FundingPayment[] {
  return [...payments, payment];
}

export function calculateFundingPaymentTotal(payments: FundingPayment[]): number {
  return payments.reduce((sum, p) => sum + p.amountUsd, 0);
}
