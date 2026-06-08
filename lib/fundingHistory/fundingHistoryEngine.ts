/**
 * Funding History Engine — Beta Phase 3
 *
 * Orchestrates reading funding history from exchange adapters,
 * validates API key permissions, merges cross-exchange data,
 * and provides filtering / aggregation utilities.
 *
 * Pure functions (adapter calls are the only async boundary).
 */

import type { ExchangeApiKey } from "../security/apiKeyTypes";
import type { FundingHistoryAdapter } from "./adapters/FundingHistoryAdapter";
import type {
  FundingHistoryEntry,
  FundingHistoryQuery,
  FundingHistorySnapshot,
  FundingHistorySyncResult,
} from "./fundingHistoryTypes";

// ─── Public API ──────────────────────────────────────────

/**
 * Sync funding history from a single exchange adapter.
 *
 * Validates read-only API key before proceeding.
 *
 * @param adapter - Exchange adapter.
 * @param apiKey  - Stored API key (used for permission check).
 * @param query   - Optional query filters (passed to adapter).
 * @returns FundingHistorySyncResult with snapshot or errors.
 */
export async function syncFundingHistory(
  adapter: FundingHistoryAdapter,
  apiKey: ExchangeApiKey,
  query?: FundingHistoryQuery,
): Promise<FundingHistorySyncResult> {
  const exchange = adapter.exchangeName as FundingHistorySyncResult["exchange"];
  const errors: string[] = [];

  // ── Permission check ─────────────────────────────────
  if (!apiKey.isReadOnly) {
    errors.push(`API key for ${exchange} is not read-only.`);
  }
  if (apiKey.tradingEnabled) {
    errors.push(`API key for ${exchange} has trading enabled (forbidden).`);
  }
  if (apiKey.withdrawEnabled) {
    errors.push(`API key for ${exchange} has withdrawal enabled (forbidden).`);
  }

  if (errors.length > 0) {
    return { exchange, success: false, errors };
  }

  // ── Fetch data ───────────────────────────────────────
  try {
    const entries = await adapter.getFundingHistory(query ?? {});
    const snapshot: FundingHistorySnapshot = {
      entries,
      syncedAt: Date.now(),
      exchange,
    };
    return { exchange, success: true, snapshot, errors: [] };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    errors.push(`Failed to sync funding history for ${exchange}: ${message}`);
    return { exchange, success: false, errors };
  }
}

/**
 * Sync funding history from multiple exchange adapters in parallel.
 *
 * One failure does not block other exchanges.
 *
 * @param adapters - Map of exchange name to adapter.
 * @param apiKeys  - Map of exchange name to API key.
 * @param query    - Optional query passed to each adapter.
 * @returns Array of FundingHistorySyncResult (one per exchange).
 */
export async function syncAllFundingHistory(
  adapters: Record<string, FundingHistoryAdapter>,
  apiKeys: Record<string, ExchangeApiKey>,
  query?: FundingHistoryQuery,
): Promise<FundingHistorySyncResult[]> {
  const exchanges = Object.keys(adapters);

  const results = await Promise.all(
    exchanges.map(async (exchange) => {
      const adapter = adapters[exchange];
      const apiKey = apiKeys[exchange];
      if (!apiKey) {
        return {
          exchange: exchange as FundingHistorySyncResult["exchange"],
          success: false,
          errors: [`No API key found for ${exchange}.`],
        };
      }
      return syncFundingHistory(adapter, apiKey, query);
    }),
  );

  return results;
}

/**
 * Merge multiple funding history snapshots into one.
 *
 * Entries are concatenated; syncedAt is the latest timestamp.
 *
 * @param snapshots - Array of snapshots to merge.
 * @returns A single FundingHistorySnapshot with all entries combined.
 */
export function mergeFundingHistorySnapshots(
  snapshots: FundingHistorySnapshot[],
): FundingHistorySnapshot {
  const entries: FundingHistoryEntry[] = [];
  let latestSyncedAt = 0;

  for (const snap of snapshots) {
    entries.push(...snap.entries);
    if (snap.syncedAt > latestSyncedAt) {
      latestSyncedAt = snap.syncedAt;
    }
  }

  return { entries, syncedAt: latestSyncedAt };
}

/**
 * Filter funding history entries by query parameters.
 *
 * Supports filtering by exchange, symbol, startTime, endTime.
 * Limit is applied AFTER all other filters.
 *
 * @param entries - Entries to filter.
 * @param query   - Query with filter fields.
 * @returns Filtered entries (new array — original is NOT mutated).
 */
export function filterFundingHistory(
  entries: FundingHistoryEntry[],
  query: FundingHistoryQuery,
): FundingHistoryEntry[] {
  let filtered = entries;

  if (query.exchange) {
    filtered = filtered.filter((e) => e.exchange === query.exchange);
  }

  if (query.symbol) {
    filtered = filtered.filter((e) => e.symbol === query.symbol);
  }

  if (query.startTime !== undefined) {
    filtered = filtered.filter((e) => e.settledAt >= query.startTime!);
  }

  if (query.endTime !== undefined) {
    filtered = filtered.filter((e) => e.settledAt <= query.endTime!);
  }

  if (query.limit !== undefined && query.limit >= 0) {
    filtered = filtered.slice(0, query.limit);
  }

  return filtered;
}

/**
 * Calculate the total funding collected across all entries.
 *
 * Positive = net received, negative = net paid.
 *
 * @param entries - Funding history entries.
 * @returns Sum of all fundingAmountUsd.
 */
export function calculateTotalFundingCollected(entries: FundingHistoryEntry[]): number {
  return entries.reduce((sum, e) => sum + e.fundingAmountUsd, 0);
}

/**
 * Calculate funding collected grouped by symbol.
 *
 * @param entries - Funding history entries.
 * @returns Record mapping symbol → total funding amount.
 */
export function calculateFundingBySymbol(entries: FundingHistoryEntry[]): Record<string, number> {
  const result: Record<string, number> = {};

  for (const entry of entries) {
    result[entry.symbol] = (result[entry.symbol] ?? 0) + entry.fundingAmountUsd;
  }

  return result;
}
