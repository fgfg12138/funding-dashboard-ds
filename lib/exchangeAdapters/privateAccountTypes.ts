import type { ExchangeName } from "../exchanges/types";

// ─── Mode ───────────────────────────────────────────────

/** PrivateAccountAdapter operating mode. Phase 3.4 only supports "mock". */
export type PrivateAccountAdapterMode = "mock" | "live-disabled";

// ─── Account Asset ──────────────────────────────────────

export type AccountAsset = {
  asset: string;
  free: number;
  locked: number;
  total: number;
  usdValue: number;
};

export type AccountBalanceSnapshot = {
  exchangeId: ExchangeName;
  assets: AccountAsset[];
  totalUsdValue: number;
  fetchedAt: number;
};

// ─── Position ───────────────────────────────────────────

export type AccountPosition = {
  exchangeId: ExchangeName;
  symbol: string;
  marketType: "perp" | "spot";
  side: "long" | "short";
  notionalUsd: number;
  entryPrice: number;
  markPrice: number;
  unrealizedPnl: number;
  leverage: number;
  updatedAt: number;
};

// ─── Open Order ─────────────────────────────────────────

export type AccountOpenOrder = {
  exchangeId: ExchangeName;
  orderId: string;
  symbol: string;
  marketType: "perp" | "spot";
  side: "buy" | "sell";
  price: number;
  quantity: number;
  status: "open" | "partially_filled";
  createdAt: number;
};

// ─── Funding Payment ────────────────────────────────────

export type AccountFundingPayment = {
  exchangeId: ExchangeName;
  symbol: string;
  amountUsd: number;
  fundingRate: number;
  paidAt: number;
};

// ─── Snapshot ───────────────────────────────────────────

export type PrivateAccountSnapshot = {
  exchangeId: ExchangeName;
  mode: PrivateAccountAdapterMode;
  balances: AccountBalanceSnapshot;
  positions: AccountPosition[];
  openOrders: AccountOpenOrder[];
  fundingPayments: AccountFundingPayment[];
  fetchedAt: number;
  source: "mock";
};

// ─── Adapter Interface ──────────────────────────────────

/**
 * Read-only private account adapter interface.
 *
 * Implementations read account data from an exchange using a configured
 * API Key (Phase 3.5+) or return mock data (Phase 3.4).
 * All methods are read-only — no trade / order / withdrawal capability.
 */
export interface PrivateAccountAdapter {
  readonly exchangeId: ExchangeName;
  readonly mode: PrivateAccountAdapterMode;

  /** Get current balances for all assets. */
  getBalances(): Promise<AccountBalanceSnapshot>;

  /** Get current open positions. */
  getPositions(): Promise<AccountPosition[]>;

  /** Get current open orders. */
  getOpenOrders(): Promise<AccountOpenOrder[]>;

  /** Get historical funding payments (most recent first). */
  getFundingPayments(limit?: number): Promise<AccountFundingPayment[]>;

  /** Convenience method: fetch all data in one call. */
  getSnapshot(): Promise<PrivateAccountSnapshot>;
}
