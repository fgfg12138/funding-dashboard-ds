import type { PrivateAccountSnapshot } from "./privateAccountTypes";

export type AccountSyncSummary = {
  exchangeCount: number;
  totalUsdValue: number;
  totalPositions: number;
  totalOpenOrders: number;
  totalFundingPayments: number;
  source: "mock";
  byExchange: Array<{
    exchangeId: string;
    totalUsdValue: number;
    balanceCount: number;
    positionCount: number;
    openOrderCount: number;
    fundingPaymentCount: number;
  }>;
};

/**
 * Aggregate multiple exchange PrivateAccountSnapshots into a single summary.
 * Pure function — no side effects.
 */
export function summarizeAccountSnapshots(
  snapshots: PrivateAccountSnapshot[],
): AccountSyncSummary {
  const totalUsdValue = snapshots.reduce((s, snap) => s + snap.balances.totalUsdValue, 0);
  const totalPositions = snapshots.reduce((s, snap) => s + snap.positions.length, 0);
  const totalOpenOrders = snapshots.reduce((s, snap) => s + snap.openOrders.length, 0);
  const totalFundingPayments = snapshots.reduce((s, snap) => s + snap.fundingPayments.length, 0);

  const byExchange = snapshots.map((snap) => ({
    exchangeId: snap.exchangeId,
    totalUsdValue: snap.balances.totalUsdValue,
    balanceCount: snap.balances.assets.length,
    positionCount: snap.positions.length,
    openOrderCount: snap.openOrders.length,
    fundingPaymentCount: snap.fundingPayments.length,
  }));

  return {
    exchangeCount: snapshots.length,
    totalUsdValue,
    totalPositions,
    totalOpenOrders,
    totalFundingPayments,
    source: "mock",
    byExchange,
  };
}
