/**
 * Mock PrivateAccountAdapter — returns hardcoded dummy data.
 *
 * No API Key required.  No network requests.  No real account access.
 * All values are illustrative and must NOT be used as real trading data.
 *
 * The `source` field in every snapshot is "mock".
 */

import type { ExchangeName } from "../exchanges/types";
import type {
  AccountAsset,
  AccountBalanceSnapshot,
  AccountFundingPayment,
  AccountOpenOrder,
  AccountPosition,
  PrivateAccountAdapter,
  PrivateAccountAdapterMode,
  PrivateAccountSnapshot,
} from "./privateAccountTypes";

/**
 * Create a mock PrivateAccountAdapter for the given exchange.
 *
 * @param exchangeId  Exchange name (e.g. "Binance").
 * @returns A PrivateAccountAdapter that returns mock data.
 */
export function createMockPrivateAccountAdapter(
  exchangeId: ExchangeName,
): PrivateAccountAdapter {
  const mode: PrivateAccountAdapterMode = "mock";

  async function getBalances(): Promise<AccountBalanceSnapshot> {
    const fetchedAt = Date.now();
    const assets: AccountAsset[] = [
      { asset: "USDT", free: 10_000, locked: 500, total: 10_500, usdValue: 10_500 },
      { asset: "BTC", free: 0.5, locked: 0.1, total: 0.6, usdValue: 42_000 },
      { asset: "ETH", free: 5, locked: 1, total: 6, usdValue: 18_000 },
    ];
    return {
      exchangeId,
      assets,
      totalUsdValue: assets.reduce((s, a) => s + a.usdValue, 0),
      fetchedAt,
    };
  }

  async function getPositions(): Promise<AccountPosition[]> {
    return [
      {
        exchangeId,
        symbol: "BTC/USDT",
        marketType: "perp",
        side: "long",
        notionalUsd: 10_000,
        entryPrice: 67_500,
        markPrice: 68_200,
        unrealizedPnl: 103.7,
        leverage: 2,
        updatedAt: Date.now(),
      },
    ];
  }

  async function getOpenOrders(): Promise<AccountOpenOrder[]> {
    return [
      {
        exchangeId,
        orderId: "mock-order-001",
        symbol: "BTC/USDT",
        marketType: "perp",
        side: "buy",
        price: 66_000,
        quantity: 0.05,
        status: "open",
        createdAt: Date.now() - 60_000,
      },
    ];
  }

  async function getFundingPayments(limit = 10): Promise<AccountFundingPayment[]> {
    const now = Date.now();
    const payments: AccountFundingPayment[] = [];
    for (let i = 0; i < limit; i++) {
      payments.push({
        exchangeId,
        symbol: "BTC/USDT",
        amountUsd: i % 2 === 0 ? 3.5 : -2.1,
        fundingRate: i % 2 === 0 ? 0.00035 : -0.00021,
        paidAt: now - i * 8 * 3_600_000,
      });
    }
    return payments;
  }

  async function getSnapshot(): Promise<PrivateAccountSnapshot> {
    const fetchedAt = Date.now();
    const [balances, positions, openOrders, fundingPayments] = await Promise.all([
      getBalances(),
      getPositions(),
      getOpenOrders(),
      getFundingPayments(5),
    ]);

    return {
      exchangeId,
      mode,
      balances,
      positions,
      openOrders,
      fundingPayments,
      fetchedAt,
      source: "mock",
    };
  }

  return {
    exchangeId,
    mode,
    getBalances,
    getPositions,
    getOpenOrders,
    getFundingPayments,
    getSnapshot,
  };
}
