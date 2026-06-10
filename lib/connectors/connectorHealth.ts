/**
 * Connector Health — Multi-Exchange Connector Spec
 *
 * Tracks the health status of an exchange connector.
 * Pure types + functions — no external dependencies.
 */

import type { ExchangeId } from "../exchangeRegistry/exchangeRegistryTypes";

// ─── Types ─────────────────────────────────────────────

export type HealthStatus = "healthy" | "degraded" | "down";

export type ConnectorHealth = {
  /** Exchange identifier. */
  exchangeId: ExchangeId;
  /** Current health status. */
  status: HealthStatus;
  /** Latency of last REST API call in ms (optional). */
  lastRestLatencyMs?: number;
  /** Timestamp (ms) of last user stream message (optional). */
  lastUserStreamAt?: number;
  /** Last error message (optional, cleared on successful operation). */
  lastError?: string;
  /** Timestamp (ms) when this record was last updated. */
  updatedAt: number;
};

// ─── Functions ─────────────────────────────────────────

export function updateConnectorHealth(
  current: ConnectorHealth,
  updates: Partial<Omit<ConnectorHealth, "exchangeId" | "updatedAt">>,
): ConnectorHealth {
  return {
    ...current,
    ...updates,
    updatedAt: Date.now(),
  };
}

export function createConnectorHealth(exchangeId: ExchangeId): ConnectorHealth {
  return {
    exchangeId,
    status: "healthy",
    updatedAt: Date.now(),
  };
}
