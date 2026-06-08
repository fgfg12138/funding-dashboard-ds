/**
 * Account Sync Engine — Beta Phase 2
 *
 * Orchestrates reading account data from one or more exchanges
 * via adapters, validates API key permissions, and merges results
 * into unified snapshots.
 *
 * Pure functions / controlled side effects — adapter calls are the
 * only async boundary (mock adapters in tests, real adapters later).
 */

import type { ExchangeApiKey } from "../security/apiKeyTypes";
import type { AccountBalance, AccountOrder, AccountPosition, AccountSnapshot, SyncResult } from "./accountSyncTypes";
import type { AccountSyncAdapter } from "./adapters/AccountSyncAdapter";

// ─── Public API ──────────────────────────────────────────

/**
 * Create an empty snapshot with no data.
 */
export function createEmptySnapshot(): AccountSnapshot {
  return {
    balances: [],
    positions: [],
    orders: [],
    syncedAt: Date.now(),
  };
}

/**
 * Sync a single exchange account using the provided adapter and API key.
 *
 * Validates that the API key is read-only before proceeding.
 * If validation fails, returns a SyncResult with success=false.
 *
 * @param adapter  - The exchange adapter (mock or real).
 * @param apiKey   - The stored API key (used for permission check only; actual credentials
 *                   are handled by the adapter in this phase).
 * @returns A SyncResult with the fetched snapshot, or errors on failure.
 */
export async function syncExchangeAccount(
  adapter: AccountSyncAdapter,
  apiKey: ExchangeApiKey,
): Promise<SyncResult> {
  const errors: string[] = [];
  const exchange = adapter.exchangeName as SyncResult["exchange"];

  // ── Permission check ─────────────────────────────────
  if (!apiKey.isReadOnly) {
    errors.push(`API key for ${exchange} is not read-only.`);
  }
  if (apiKey.tradingEnabled) {
    errors.push(`API key for ${exchange} has trading enabled (forbidden for read-only sync).`);
  }
  if (apiKey.withdrawEnabled) {
    errors.push(`API key for ${exchange} has withdrawal enabled (forbidden for read-only sync).`);
  }

  if (errors.length > 0) {
    return { exchange, success: false, errors };
  }

  // ── Fetch data ───────────────────────────────────────
  try {
    const [balances, positions, orders] = await Promise.all([
      adapter.getBalances(),
      adapter.getPositions(),
      adapter.getOrders(),
    ]);

    const snapshot: AccountSnapshot = {
      balances,
      positions,
      orders,
      syncedAt: Date.now(),
    };

    return { exchange, success: true, snapshot, errors: [] };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    errors.push(`Failed to sync ${exchange}: ${message}`);
    return { exchange, success: false, errors };
  }
}

/**
 * Sync multiple exchange accounts in parallel.
 *
 * Each exchange is independent — one failure does not block others.
 *
 * @param adapters - Map of exchange name to adapter.
 * @param apiKeys  - Map of exchange name to API key.
 * @returns An array of SyncResult (one per exchange).
 */
export async function syncAllAccounts(
  adapters: Record<string, AccountSyncAdapter>,
  apiKeys: Record<string, ExchangeApiKey>,
): Promise<SyncResult[]> {
  const exchanges = Object.keys(adapters);
  const results = await Promise.all(
    exchanges.map(async (exchange) => {
      const adapter = adapters[exchange];
      const apiKey = apiKeys[exchange];
      if (!apiKey) {
        return {
          exchange: exchange as SyncResult["exchange"],
          success: false,
          errors: [`No API key found for ${exchange}.`],
        };
      }
      return syncExchangeAccount(adapter, apiKey);
    }),
  );

  return results;
}

/**
 * Merge multiple account snapshots into a single unified snapshot.
 *
 * Balances, positions, and orders are concatenated.
 * The syncedAt timestamp is the latest among all snapshots.
 *
 * @param snapshots - Array of AccountSnapshot to merge.
 * @returns A single AccountSnapshot with all data combined.
 */
export function mergeSnapshots(snapshots: AccountSnapshot[]): AccountSnapshot {
  const balances: AccountBalance[] = [];
  const positions: AccountPosition[] = [];
  const orders: AccountOrder[] = [];
  let latestSyncedAt = 0;

  for (const snap of snapshots) {
    balances.push(...snap.balances);
    positions.push(...snap.positions);
    orders.push(...snap.orders);
    if (snap.syncedAt > latestSyncedAt) {
      latestSyncedAt = snap.syncedAt;
    }
  }

  return {
    balances,
    positions,
    orders,
    syncedAt: latestSyncedAt,
  };
}
