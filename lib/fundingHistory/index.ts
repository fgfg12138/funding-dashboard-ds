/**
 * Funding History — Barrel export
 *
 * Re-exports all Beta-3 types, engine functions, and adapters.
 */

// Types
export type {
  FundingHistoryEntry,
  FundingHistoryQuery,
  FundingHistorySnapshot,
  FundingHistorySyncResult,
} from "./fundingHistoryTypes";

// Engine
export {
  calculateFundingBySymbol,
  calculateTotalFundingCollected,
  filterFundingHistory,
  mergeFundingHistorySnapshots,
  syncAllFundingHistory,
  syncFundingHistory,
} from "./fundingHistoryEngine";

// Adapter interface
export type { FundingHistoryAdapter } from "./adapters/FundingHistoryAdapter";

// Mock adapters
export { MockBinanceFundingHistoryAdapter } from "./adapters/MockBinanceFundingHistoryAdapter";
export { MockBybitFundingHistoryAdapter } from "./adapters/MockBybitFundingHistoryAdapter";
export { MockOkxFundingHistoryAdapter } from "./adapters/MockOkxFundingHistoryAdapter";
