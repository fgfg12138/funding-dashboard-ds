/**
 * Funding History Adapter Interface — Beta Phase 3
 *
 * Each exchange adapter implements this contract for reading
 * historical funding rate payments.
 */

import type { FundingHistoryEntry, FundingHistoryQuery } from "../fundingHistoryTypes";

export type FundingHistoryAdapter = {
  /** Exchange name this adapter targets. */
  readonly exchangeName: string;

  /**
   * Fetch historical funding payments matching the given query.
   * Returns an empty array if no entries match or the exchange
   * does not support funding history queries.
   */
  getFundingHistory(query: FundingHistoryQuery): Promise<FundingHistoryEntry[]>;
};
