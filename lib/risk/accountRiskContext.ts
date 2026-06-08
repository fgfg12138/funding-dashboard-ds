/**
 * Account Risk Context — pure function module.
 *
 * Aggregates PrivateAccountSnapshots into a summary context that
 * the Risk Gate can use to evaluate account-level constraints.
 *
 * All data must be marked `source: "mock"` in Phase 3.6.
 * No network calls, no API Key access, no real account data.
 */

import type { PrivateAccountSnapshot } from "../exchangeAdapters/privateAccountTypes";

// ─── Types ──────────────────────────────────────────────

export type AccountRiskContext = {
  source: "mock";
  totalUsdValue: number;
  availableUsdBalance: number;
  totalPositionExposureUsd: number;
  symbolExposureUsdBySymbol: Record<string, number>;
  exchangeExposureUsd: Record<string, number>;
  warnings: string[];
};

// ─── Functions ──────────────────────────────────────────

/**
 * Build an AccountRiskContext from one or more PrivateAccountSnapshots.
 *
 * @param snapshots  Array of snapshots from PrivateAccountAdapter.getSnapshot()
 * @returns AccountRiskContext (source is always "mock" in Phase 3.6)
 */
export function buildAccountRiskContext(
  snapshots: PrivateAccountSnapshot[],
): AccountRiskContext {
  const warnings: string[] = [];

  if (snapshots.length === 0) {
    warnings.push("无账户快照数据");
  }

  const totalUsdValue = calculateAccountTotalUsd(snapshots);
  const availableUsdBalance = calculateAvailableUsdBalance(snapshots);
  const totalPositionExposureUsd = calculateAccountOpenPositionExposure(snapshots);
  const symbolExposureUsdBySymbol = calculateSymbolExposures(snapshots);
  const exchangeExposureUsd = calculateExchangeExposures(snapshots);

  return {
    source: "mock",
    totalUsdValue,
    availableUsdBalance,
    totalPositionExposureUsd,
    symbolExposureUsdBySymbol,
    exchangeExposureUsd,
    warnings,
  };
}

/** Sum of total usd value across all exchange snapshots. */
export function calculateAccountTotalUsd(
  snapshots: PrivateAccountSnapshot[],
): number {
  return snapshots.reduce((s, snap) => s + snap.balances.totalUsdValue, 0);
}

/** Sum of free (unlocked) USDT balance across all exchanges. */
export function calculateAvailableUsdBalance(
  snapshots: PrivateAccountSnapshot[],
): number {
  return snapshots.reduce((s, snap) => {
    const usdt = snap.balances.assets.find(
      (a) => a.asset === "USDT",
    );
    return s + (usdt?.free ?? 0);
  }, 0);
}

/** Sum of notional exposure across all open positions. */
export function calculateAccountOpenPositionExposure(
  snapshots: PrivateAccountSnapshot[],
): number {
  return snapshots.reduce(
    (s, snap) =>
      s + snap.positions.reduce((ps, p) => ps + p.notionalUsd, 0),
    0,
  );
}

/** Map of symbol → total notional exposure across all exchanges. */
export function calculateSymbolExposures(
  snapshots: PrivateAccountSnapshot[],
): Record<string, number> {
  const result: Record<string, number> = {};
  for (const snap of snapshots) {
    for (const pos of snap.positions) {
      result[pos.symbol] = (result[pos.symbol] ?? 0) + pos.notionalUsd;
    }
  }
  return result;
}

/** Map of exchange → total position notional exposure. */
export function calculateExchangeExposures(
  snapshots: PrivateAccountSnapshot[],
): Record<string, number> {
  const result: Record<string, number> = {};
  for (const snap of snapshots) {
    const total = snap.positions.reduce((s, p) => s + p.notionalUsd, 0);
    if (total > 0) {
      result[snap.exchangeId] = (result[snap.exchangeId] ?? 0) + total;
    }
  }
  return result;
}

/** Get total notional for a specific symbol from the context. */
export function calculateAccountSymbolExposure(
  snapshots: PrivateAccountSnapshot[],
  symbol: string,
): number {
  const exposures = calculateSymbolExposures(snapshots);
  return exposures[symbol] ?? 0;
}
