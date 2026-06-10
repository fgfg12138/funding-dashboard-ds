/**
 * Throttler — Multi-Exchange Connector Spec
 *
 * Rate-limiting abstraction for exchange API endpoints.
 * Pure functions — no external dependencies, no timers.
 */

import type { ExchangeId } from "../exchangeRegistry/exchangeRegistryTypes";

// ─── Types ─────────────────────────────────────────────

export type RateLimit = {
  /** Exchange identifier. */
  exchangeId: ExchangeId;
  /** API endpoint path (e.g. "/fapi/v1/order"). */
  endpoint: string;
  /** Weight cost of this endpoint. */
  weight: number;
  /** Maximum weight allowed in the interval. */
  limit: number;
  /** Interval in milliseconds. */
  intervalMs: number;
};

export type ThrottleState = {
  /** Map of endpoint → array of timestamp (ms) of recent requests. */
  usage: Map<string, number[]>;
};

// ─── Functions ─────────────────────────────────────────

export function createThrottleState(): ThrottleState {
  return { usage: new Map() };
}

/** Check whether a request is allowed at current time. Returns remaining weight capacity. */
export function evaluateThrottle(
  state: ThrottleState,
  endpoint: string,
  limit: number,
  intervalMs: number,
  now: number,
): { allowed: boolean; remainingWeight: number } {
  const timestamps = state.usage.get(endpoint) ?? [];
  const cutoff = now - intervalMs;
  const recent = timestamps.filter((t) => t >= cutoff);
  const used = recent.length;
  const remainingWeight = Math.max(0, limit - used);

  return { allowed: remainingWeight > 0, remainingWeight };
}

/** Record that a request was made. Mutates state in place. */
export function recordThrottleUsage(
  state: ThrottleState,
  endpoint: string,
  now: number,
): void {
  const timestamps = state.usage.get(endpoint) ?? [];
  timestamps.push(now);
  state.usage.set(endpoint, timestamps);
}

/** Compute the delay in ms before a request can be made. Returns 0 if allowed now. */
export function throttleDelayMs(
  state: ThrottleState,
  endpoint: string,
  limit: number,
  intervalMs: number,
  now: number,
): number {
  const { allowed, remainingWeight } = evaluateThrottle(state, endpoint, limit, intervalMs, now);
  if (allowed) return 0;

  const timestamps = state.usage.get(endpoint) ?? [];
  if (timestamps.length === 0) return 0;

  const cutoff = now - intervalMs;
  const earliest = timestamps.filter((t) => t >= cutoff).sort((a, b) => a - b);
  if (earliest.length === 0) return 0;

  // The oldest request in the window will expire first — wait until it drops out
  const oldest = earliest[0];
  const waitMs = oldest + intervalMs - now;

  return Math.max(0, waitMs);
}
