/**
 * Binance Mainnet Read-Only Client — Live Safety Gate
 *
 * Wraps a BinanceHttpClient and ONLY allows GET requests.
 * POST, PUT, and DELETE are blocked with an error.
 *
 * This is the security boundary for Mainnet Read-Only Shadow.
 * It ensures no orders can be created, cancelled, or modified.
 */

import type { BinanceHttpClient, HttpRequestOptions, HttpResponse } from "./BinanceHttpClient";

export class BinanceMainnetReadOnlyClient implements BinanceHttpClient {
  private inner: BinanceHttpClient;

  constructor(inner: BinanceHttpClient) {
    this.inner = inner;
  }

  async request(options: HttpRequestOptions): Promise<HttpResponse> {
    if (options.method !== "GET") {
      throw new Error(
        `READ-ONLY MODE: ${options.method} ${options.path} is blocked. ` +
        `Only GET requests are allowed in read-only mode.`,
      );
    }

    return this.inner.request(options);
  }
}
