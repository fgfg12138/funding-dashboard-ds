/**
 * PrivateAccountAdapter — re-exports the interface and a factory function.
 *
 * Use `createAdapter(exchangeId, mode)` to get an adapter instance.
 *
 * Phase 3.4: Only "mock" mode is available.
 * Phase 3.5+: "live" mode will connect to exchange private APIs.
 */

import type { ExchangeName } from "../exchanges/types";
import type { PrivateAccountAdapter, PrivateAccountAdapterMode } from "./privateAccountTypes";
import { createMockPrivateAccountAdapter } from "./mockPrivateAccountAdapter";

/**
 * Create a PrivateAccountAdapter for the given exchange and mode.
 *
 * @param exchangeId  The exchange to connect to (e.g. "Binance").
 * @param mode        "mock" (default, Phase 3.4) or "live-disabled" (not yet available).
 * @returns A PrivateAccountAdapter instance.
 */
export function createPrivateAccountAdapter(
  exchangeId: ExchangeName,
  mode: PrivateAccountAdapterMode = "mock",
): PrivateAccountAdapter {
  if (mode === "live-disabled") {
    throw new Error(
      `[createPrivateAccountAdapter] Live mode is not yet available for ${exchangeId}. ` +
        "Use mode='mock' for Phase 3.4 mock data.",
    );
  }

  return createMockPrivateAccountAdapter(exchangeId);
}
