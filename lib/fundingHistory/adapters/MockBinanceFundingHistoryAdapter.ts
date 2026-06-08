/**
 * Mock Binance Funding History Adapter — Beta Phase 3
 *
 * Returns predefined mock data. No real API calls.
 */

import type { FundingHistoryEntry, FundingHistoryQuery } from "../fundingHistoryTypes";
import type { FundingHistoryAdapter } from "./FundingHistoryAdapter";

const EXCHANGE = "binance";

const UTC = (y: number, m: number, d: number, h: number) =>
  Date.UTC(y, m - 1, d, h, 0, 0, 0);

const MOCK_ENTRIES: FundingHistoryEntry[] = [
  {
    exchange: EXCHANGE,
    symbol: "BTCUSDT",
    fundingRate: 0.0001,
    fundingAmountUsd: 5,
    positionSide: "short",
    notionalUsd: 50_000,
    settledAt: UTC(2026, 1, 1, 8),
    transactionId: "binance-fh-001",
  },
  {
    exchange: EXCHANGE,
    symbol: "ETHUSDT",
    fundingRate: -0.00005,
    fundingAmountUsd: -2,
    positionSide: "long",
    notionalUsd: 40_000,
    settledAt: UTC(2026, 1, 1, 8),
    transactionId: "binance-fh-002",
  },
];

export class MockBinanceFundingHistoryAdapter implements FundingHistoryAdapter {
  readonly exchangeName = EXCHANGE;

  async getFundingHistory(_query: FundingHistoryQuery): Promise<FundingHistoryEntry[]> {
    return MOCK_ENTRIES;
  }
}
