/**
 * Binance Fetch HTTP Client — Binance Real Order Adapter
 *
 * Real HTTP client using Node.js global fetch (available in Node 18+ / Next.js).
 *
 * Connects to Binance USD-M Futures by default via testnet.
 * Default baseUrl: https://testnet.binancefuture.com
 *
 * Safety:
 *   - testnet by default
 *   - secret is never logged or exposed in error messages
 *   - no console.log of request params
 */

import type { BinanceHttpClient, HttpRequestOptions, HttpResponse } from "./BinanceHttpClient";
import { BinanceHttpError } from "./BinanceHttpError";
import { addSignature } from "./BinanceSigning";

// ─── Config ──────────────────────────────────────────────

export type BinanceFetchHttpClientConfig = {
  /** Binance API key. */
  apiKey: string;

  /** Binance API secret. Never logged. */
  secret: string;

  /** Base URL (default: https://testnet.binancefuture.com). */
  baseUrl?: string;

  /** Receive window in ms (default: 5000). */
  recvWindow?: number;
};

const DEFAULT_BASE_URL = "https://testnet.binancefuture.com";
const DEFAULT_RECV_WINDOW = 5000;

// ─── Build URL helpers ──────────────────────────────────

function buildQueryString(params: Record<string, string | number | undefined>): string {
  const keys = Object.keys(params).sort();
  const parts: string[] = [];

  for (const key of keys) {
    const value = params[key];
    if (value !== undefined) {
      parts.push(`${encodeURIComponent(key)}=${encodeURIComponent(String(value))}`);
    }
  }

  return parts.join("&");
}

function buildUrl(
  baseUrl: string,
  path: string,
  params?: Record<string, string | number | undefined>,
): string {
  const base = baseUrl.replace(/\/+$/, "");
  const cleanPath = path.startsWith("/") ? path : `/${path}`;

  if (!params || Object.keys(params).length === 0) {
    return `${base}${cleanPath}`;
  }

  const qs = buildQueryString(params);
  return `${base}${cleanPath}?${qs}`;
}

// ─── HTTP Client ─────────────────────────────────────────

export class BinanceFetchHttpClient implements BinanceHttpClient {
  private config: Required<BinanceFetchHttpClientConfig>;

  constructor(config: BinanceFetchHttpClientConfig) {
    this.config = {
      apiKey: config.apiKey,
      secret: config.secret,
      baseUrl: config.baseUrl ?? DEFAULT_BASE_URL,
      recvWindow: config.recvWindow ?? DEFAULT_RECV_WINDOW,
    };
  }

  /**
   * Make a request to the Binance REST API using the global fetch API.
   *
   * @param options - Request options.
   * @returns The parsed response.
   * @throws BinanceHttpError on non-2xx status.
   * @throws Error on network failure.
   */
  async request(options: HttpRequestOptions): Promise<HttpResponse> {
    const { method, path, signed } = options;

    // Build params with signature if required
    let params: Record<string, string | number | undefined> = {
      ...(options.params ?? {}),
    };

    if (signed) {
      params = {
        ...params,
        timestamp: Date.now(),
        recvWindow: this.config.recvWindow,
      };
      addSignature(params, this.config.secret);
    }

    // Build URL: for GET/DELETE params go in query string
    const url = buildUrl(this.config.baseUrl, path, params);

    // Build headers
    const headers: Record<string, string> = {
      "Content-Type": "application/x-www-form-urlencoded",
    };

    if (signed || this.config.apiKey) {
      headers["X-MBX-APIKEY"] = this.config.apiKey;
    }

    // Build fetch options
    const fetchOptions: RequestInit = {
      method,
      headers,
    };

    // For POST, we send params in query string (Binance Futures style)
    if (method === "POST" || method === "PUT") {
      // Params are already in URL as query string
      // Body can be empty since Binance accepts params in URL for futures API
    }

    const response = await fetch(url, fetchOptions);

    // Parse JSON body
    let body: Record<string, unknown>;
    const text = await response.text();

    try {
      body = JSON.parse(text);
    } catch {
      body = { raw: text };
    }

    // Build headers map from fetch response
    const responseHeaders: Record<string, string> = {};
    response.headers.forEach((value, key) => {
      responseHeaders[key] = value;
    });

    // Check for error status
    if (!response.ok) {
      throw new BinanceHttpError(response.status, body, path);
    }

    return {
      statusCode: response.status,
      body,
      headers: responseHeaders,
    };
  }
}
