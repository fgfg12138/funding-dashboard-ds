/**
 * Mock OKX Funding History Adapter — Beta Phase 3
 *
 * Returns predefined mock data. No real API calls.
 */

import type { FundingHistoryEntry, FundingHistoryQuery } from "../fundingHistoryTypes";
import type { FundingHistoryAdapter } from "./FundingHistoryAdapter";

const EXCHANGE = "okx";

const UTC = (y: number, m: number, d: number, h: number) =>
  Date.UTC(y, m - 1, d, h, 0, 0, 0);

const MOCK_ENTRIES: FundingHistoryEntry[] = [
  {
    exchange: EXCHANGE,
    symbol: "SOLUSDT",
    fundingRate: 0.0002,
    fundingAmountUsd: 3,
    positionSide: "short",
    notionalUsd: 15_000,
    settledAt: UTC(2026, 1, 1, 8),
    transactionId: "okx-fh-001",
  },
];

export class MockOkxFundingHistoryAdapter implements FundingHistoryAdapter {
  readonly exchangeName = EXCHANGE;

  async getFundingHistory(_query: FundingHistoryQuery): Promise<FundingHistoryEntry[]> {
    return MOCK_ENTRIES;
  }
}
