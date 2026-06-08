/**
 * Account Sync — Barrel export
 *
 * Re-exports all Beta-2 Account Sync types, engine functions, and adapters.
 */

// Types
export type {
  AccountBalance,
  AccountOrder,
  AccountPosition,
  AccountSnapshot,
  SyncResult,
} from "./accountSyncTypes";

// Engine
export {
  createEmptySnapshot,
  mergeSnapshots,
  syncAllAccounts,
  syncExchangeAccount,
} from "./accountSyncEngine";

// Adapter interface
export type { AccountSyncAdapter } from "./adapters/AccountSyncAdapter";

// Mock adapters (for testing / development)
export { MockBinanceAdapter } from "./adapters/MockBinanceAdapter";
export { MockBybitAdapter } from "./adapters/MockBybitAdapter";
export { MockOkxAdapter } from "./adapters/MockOkxAdapter";
