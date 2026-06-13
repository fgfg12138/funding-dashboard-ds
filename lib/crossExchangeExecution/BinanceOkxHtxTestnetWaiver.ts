/**
 * Binance + OKX + HTX Testnet Waiver
 *
 * Formal waiver documenting HTX's lack of testnet/demo trading environment.
 * HTX (Huobi) does not provide a separate testnet or demo API for USDT-margined
 * perpetual swaps. Only mainnet read-only access is available.
 */

export type TestnetWaiverReport = {
  exchangeId: string;
  testnetAvailable: boolean;
  demoAvailable: boolean;
  reason: string;
  allowedMode: string;
  liveTradingAllowed: boolean;
  requiresManualApproval: boolean;
  generatedAt: number;
};

export function generateHtxTestnetWaiver(): TestnetWaiverReport {
  return {
    exchangeId: "htx",
    testnetAvailable: false,
    demoAvailable: false,
    reason: "HTX demo/testnet trading environment not available. HTX (Huobi) does not provide a separate testnet or demo API for USDT-margined perpetual swaps. Only mainnet read-only public API endpoints are accessible.",
    allowedMode: "mainnet_readonly_dry_run",
    liveTradingAllowed: false,
    requiresManualApproval: true,
    generatedAt: Date.now(),
  };
}

export function generateWaiverSummary(): TestnetWaiverReport[] {
  return [
    {
      exchangeId: "binance",
      testnetAvailable: false,
      demoAvailable: false,
      reason: "No Binance Futures testnet API key configured. Binance does provide a testnet environment, access requires separate API credentials.",
      allowedMode: "mainnet_readonly_dry_run",
      liveTradingAllowed: false,
      requiresManualApproval: true,
      generatedAt: Date.now(),
    },
    {
      exchangeId: "okx",
      testnetAvailable: false,
      demoAvailable: false,
      reason: "Only mainnet read-only API configured; no OKX demo trading credentials provided.",
      allowedMode: "mainnet_readonly_dry_run",
      liveTradingAllowed: false,
      requiresManualApproval: true,
      generatedAt: Date.now(),
    },
    generateHtxTestnetWaiver(),
  ];
}
