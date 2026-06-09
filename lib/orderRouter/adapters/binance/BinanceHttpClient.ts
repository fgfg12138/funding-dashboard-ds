/**
 * Binance HTTP Client — Binance Real Order Adapter
 *
 * Defines the HTTP client interface for Binance REST API calls
 * and provides a mock implementation for testing.
 *
 * Real implementation (node-fetch / axios) can be injected later.
 */

// ─── HTTP Client Interface ──────────────────────────────

export type HttpMethod = "GET" | "POST" | "DELETE" | "PUT";

export type HttpRequestOptions = {
  method: HttpMethod;
  path: string;
  params?: Record<string, string | number | undefined>;
  signed?: boolean;
  apiKey?: string;
  secret?: string;
};

export type HttpResponse = {
  statusCode: number;
  body: Record<string, unknown>;
  headers: Record<string, string>;
};

export interface BinanceHttpClient {
  /**
   * Make a request to the Binance REST API.
   *
   * @param options - Request options (method, path, params, signed).
   * @returns The response with status code and parsed body.
   * @throws Error on network failure or non-2xx status.
   */
  request(options: HttpRequestOptions): Promise<HttpResponse>;
}

// ─── Mock HTTP Client ───────────────────────────────────

export class MockBinanceHttpClient implements BinanceHttpClient {
  /** Record of calls made to this mock. */
  public calls: Array<{ method: string; path: string; params?: Record<string, unknown> }> = [];

  /** Predefined response to return. */
  public nextResponse: HttpResponse = {
    statusCode: 200,
    body: {},
    headers: {},
  };

  /** Error to throw (overrides nextResponse). */
  public nextError: Error | null = null;

  setResponse(response: Partial<HttpResponse>): void {
    this.nextResponse = { statusCode: 200, body: {}, headers: {}, ...response };
  }

  setError(error: Error): void {
    this.nextError = error;
  }

  reset(): void {
    this.calls = [];
    this.nextResponse = { statusCode: 200, body: {}, headers: {} };
    this.nextError = null;
  }

  async request(options: HttpRequestOptions): Promise<HttpResponse> {
    this.calls.push({
      method: options.method,
      path: options.path,
      params: options.params as Record<string, unknown> | undefined,
    });

    if (this.nextError) {
      throw this.nextError;
    }

    return { ...this.nextResponse };
  }
}
