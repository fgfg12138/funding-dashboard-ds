/**
 * Testnet Rate Limit Store Types — Phase 5.13 Skeleton
 *
 * Defines policy, record, and input types for the in-memory rate limit store.
 * No secret storage, no network calls, no real enforcement beyond skeleton.
 */

import type { TestnetRouteName } from "./testnetRouteTypes";

// ─── Scope ───────────────────────────────────────────────

export type TestnetRateLimitScope = "exchange" | "route" | "session";

// ─── Policy ──────────────────────────────────────────────

export type TestnetRateLimitPolicy = {
  scope: TestnetRateLimitScope;
  maxRequests: number;
  windowSeconds: number;
};

// ─── Record ──────────────────────────────────────────────

export type TestnetRateLimitRecord = {
  id: string;
  scope: TestnetRateLimitScope;
  /** Key built from scope + identifiers (e.g. "exchange:binance") */
  scopeKey: string;
  routeName: TestnetRouteName;
  exchangeId: string;
  count: number;
  windowStartedAt: number;
  windowEndsAt: number;
  blocked: boolean;
  source: "testnet-route-skeleton";
};

// ─── Input ───────────────────────────────────────────────

export type TestnetRateLimitInput = {
  scope: TestnetRateLimitScope;
  routeName: TestnetRouteName;
  exchangeId: string;
  /** Optional session identifier for session-scoped limits */
  sessionId?: string;
};

// ─── Check Result ────────────────────────────────────────

export type TestnetRateLimitCheckResult = {
  allowed: boolean;
  currentCount: number;
  maxRequests: number;
  windowEndsAt: number;
  retryAfterSeconds: number;
  source: "testnet-route-skeleton";
};
