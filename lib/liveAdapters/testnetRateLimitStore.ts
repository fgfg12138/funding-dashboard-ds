/**
 * Testnet Rate Limit Store Skeleton — Phase 5.13
 *
 * In-memory rate limit store with sliding-window counting.
 * SSR-safe. No secrets stored. No network calls.
 *
 * Default policies:
 *   - exchange: 10 req / 1s
 *   - route:    30 req / 60s
 *   - session:  60 req / 60s
 */

import type {
  TestnetRateLimitScope,
  TestnetRateLimitPolicy,
  TestnetRateLimitRecord,
  TestnetRateLimitInput,
  TestnetRateLimitCheckResult,
} from "./testnetRateLimitTypes";
import type { TestnetRouteName } from "./testnetRouteTypes";

// ─── Default Policies ────────────────────────────────────

const DEFAULT_POLICIES: TestnetRateLimitPolicy[] = [
  { scope: "exchange", maxRequests: 10, windowSeconds: 1 },
  { scope: "route", maxRequests: 30, windowSeconds: 60 },
  { scope: "session", maxRequests: 60, windowSeconds: 60 },
];

/** Get the default rate limit policy definitions. */
export function getDefaultRateLimitPolicies(): TestnetRateLimitPolicy[] {
  return DEFAULT_POLICIES.map((p) => ({ ...p }));
}

// ─── In-Memory Store ─────────────────────────────────────

let _records: TestnetRateLimitRecord[] = [];
let _idCounter = 0;

/** Reset the store (for testing). */
export function resetRateLimitStore(): void {
  _records = [];
  _idCounter = 0;
}

// ─── Key Builder ─────────────────────────────────────────

/**
 * Build a deterministic scope key for rate limit tracking.
 *
 * Examples:
 *   "exchange:binance"
 *   "route:orders-preview-submit"
 *   "session:sess-abc123"
 */
export function buildRateLimitKey(
  scope: TestnetRateLimitScope,
  routeName: TestnetRouteName,
  exchangeId: string,
  sessionId?: string,
): string {
  switch (scope) {
    case "exchange":
      return `exchange:${exchangeId}`;
    case "route":
      return `route:${routeName}`;
    case "session":
      return `session:${sessionId ?? "unknown"}`;
  }
}

// ─── Internal Helpers ────────────────────────────────────

function findOrCreateRecord(input: TestnetRateLimitInput, policy: TestnetRateLimitPolicy): TestnetRateLimitRecord {
  const now = Date.now();
  const scopeKey = buildRateLimitKey(input.scope, input.routeName, input.exchangeId, input.sessionId);
  const windowMs = policy.windowSeconds * 1000;

  // Find existing non-expired record
  let record = _records.find((r) => r.scopeKey === scopeKey && r.windowEndsAt > now);

  if (!record) {
    // Create new window
    const id = `rl-${++_idCounter}-${now}`;
    record = {
      id,
      scope: input.scope,
      scopeKey,
      routeName: input.routeName,
      exchangeId: input.exchangeId,
      count: 0,
      windowStartedAt: now,
      windowEndsAt: now + windowMs,
      blocked: false,
      source: "testnet-route-skeleton",
    };
    _records.push(record);
  }

  return record;
}

// ─── Store Methods ───────────────────────────────────────

/**
 * Check rate limit for a given scope/route/exchange.
 * Does NOT increment the counter.
 *
 * @param input - The rate limit input (scope, route, exchange).
 * @returns Check result with allowed flag and current count.
 */
export function checkRateLimit(input: TestnetRateLimitInput): TestnetRateLimitCheckResult {
  const policies = getDefaultRateLimitPolicies();
  const policy = policies.find((p) => p.scope === input.scope) ?? policies[0];

  const record = findOrCreateRecord(input, policy);

  // If window expired, treat as fresh
  const now = Date.now();
  if (record.windowEndsAt <= now) {
    return {
      allowed: true,
      currentCount: 0,
      maxRequests: policy.maxRequests,
      windowEndsAt: now + policy.windowSeconds * 1000,
      retryAfterSeconds: 0,
      source: "testnet-route-skeleton",
    };
  }

  const allowed = record.count < policy.maxRequests;
  const retryAfterSeconds = allowed ? 0 : Math.max(0, Math.ceil((record.windowEndsAt - now) / 1000));

  return {
    allowed,
    currentCount: record.count,
    maxRequests: policy.maxRequests,
    windowEndsAt: record.windowEndsAt,
    retryAfterSeconds,
    source: "testnet-route-skeleton",
  };
}

/**
 * Increment rate limit counter for a given scope/route/exchange.
 *
 * @param input - The rate limit input.
 * @returns Check result after incrementing.
 */
export function incrementRateLimit(input: TestnetRateLimitInput): TestnetRateLimitCheckResult {
  const now = Date.now();
  const policies = getDefaultRateLimitPolicies();
  const policy = policies.find((p) => p.scope === input.scope) ?? policies[0];

  const record = findOrCreateRecord(input, policy);

  // If window expired, reset
  if (record.windowEndsAt <= now) {
    record.count = 0;
    record.windowStartedAt = now;
    record.windowEndsAt = now + policy.windowSeconds * 1000;
    record.blocked = false;
  }

  record.count += 1;

  const allowed = record.count <= policy.maxRequests;
  record.blocked = !allowed;

  const retryAfterSeconds = allowed ? 0 : Math.max(0, Math.ceil((record.windowEndsAt - now) / 1000));

  return {
    allowed,
    currentCount: record.count,
    maxRequests: policy.maxRequests,
    windowEndsAt: record.windowEndsAt,
    retryAfterSeconds,
    source: "testnet-route-skeleton",
  };
}

/**
 * Reset rate limit for a specific scopeKey.
 *
 * @param scopeKey - The scope key to reset (e.g. "exchange:binance").
 */
export function resetRateLimit(scopeKey: string): void {
  const record = _records.find((r) => r.scopeKey === scopeKey);
  if (record) {
    record.count = 0;
    record.blocked = false;
    record.windowStartedAt = Date.now();
    record.windowEndsAt = 0; // force re-creation on next check
  }
}

/**
 * List all rate limit records.
 *
 * @returns A shallow copy of records.
 */
export function listRateLimitRecords(): TestnetRateLimitRecord[] {
  return [..._records];
}

/**
 * Clear all rate limit records from the store.
 */
export function clearRateLimitRecords(): void {
  _records = [];
}
