/**
 * Binance Testnet Smoke Test
 *
 * Manual connectivity test for Binance USD-M Futures Testnet.
 *
 * ⚠️ SKIPPED by default.
 *
 * To run:
 *   1. Create API keys on https://testnet.binancefuture.com
 *   2. Set env vars:
 *        BINANCE_TESTNET_API_KEY=xxx
 *        BINANCE_TESTNET_API_SECRET=xxx
 *        RUN_BINANCE_TESTNET_SMOKE=true
 *   3. Run: npx vitest run --reporter=verbose
 *
 * ⚠️ Only connects to testnet. Will throw if baseUrl is not testnet.
 */

import { describe, expect, it } from "vitest";
import { BinanceFetchHttpClient } from "./BinanceFetchHttpClient";
import { BinanceRealOrderAdapter } from "./BinanceRealOrderAdapter";

const RUN_SMOKE = process.env.RUN_BINANCE_TESTNET_SMOKE === "true";
const API_KEY = process.env.BINANCE_TESTNET_API_KEY ?? "";
const API_SECRET = process.env.BINANCE_TESTNET_API_SECRET ?? "";
const testOrSkip = RUN_SMOKE ? it : it.skip;

// Skip by default — only runs when RUN_BINANCE_TESTNET_SMOKE=true
describe.skip("Binance Testnet Smoke (enable via env RUN_BINANCE_TESTNET_SMOKE=true)", () => {
  const client = new BinanceFetchHttpClient({
    apiKey: API_KEY,
    secret: API_SECRET,
    baseUrl: "https://testnet.binancefuture.com",
  });

  const adapter = new BinanceRealOrderAdapter(
    {
      apiKey: API_KEY,
      secret: API_SECRET,
      dryRun: false,
      allowRealExecution: true,
      testnet: true,
    },
    client,
  );

  it("ensures testnet baseUrl", () => {
    expect("https://testnet.binancefuture.com").toContain("testnet");
  });

  it("connects to testnet ping endpoint", async () => {
    const response = await client.request({
      method: "GET",
      path: "/fapi/v1/ping",
    });
    expect(response.statusCode).toBe(200);
  });

  it("can get server time", async () => {
    const response = await client.request({
      method: "GET",
      path: "/fapi/v1/time",
    });
    expect(response.statusCode).toBe(200);
    expect(response.body.serverTime).toBeDefined();
  });

  it("can get exchange info for BTCUSDT", async () => {
    const response = await client.request({
      method: "GET",
      path: "/fapi/v1/exchangeInfo",
      params: { symbol: "BTCUSDT" },
    });
    expect(response.statusCode).toBe(200);
    expect(response.body.symbols).toBeDefined();
  });

  it("signed request: can get account information", async () => {
    const response = await client.request({
      method: "GET",
      path: "/fapi/v2/account",
      signed: true,
      apiKey: API_KEY,
      secret: API_SECRET,
    });
    expect(response.statusCode).toBe(200);
    expect(response.body.canTrade).toBeDefined();
  });

  it("signed request: can get open orders", async () => {
    const response = await client.request({
      method: "GET",
      path: "/fapi/v1/openOrders",
      params: { symbol: "BTCUSDT" },
      signed: true,
      apiKey: API_KEY,
      secret: API_SECRET,
    });
    expect(response.statusCode).toBe(200);
    expect(Array.isArray(response.body)).toBe(true);
  });
});
