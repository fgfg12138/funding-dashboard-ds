/**
 * Binance Real Order Adapter — Live Phase 1 / Binance Phase 1
 *
 * Real Binance USD-M Futures order adapter implementing the OrderAdapter interface.
 *
 * Safety defaults:
 *   - testnet = true (no production by default)
 *   - dryRun = true (no HTTP requests by default)
 *   - allowRealExecution = false (must be explicitly enabled)
 *
 * Pure functions + controlled async via injected HTTP client.
 * Secret is never logged or exposed in error messages.
 */

import type { OrderAdapter } from "../OrderAdapter";
import type { UnifiedOrder, UnifiedOrderRequest } from "../../orderRouterTypes";
import type { BinanceHttpClient } from "./BinanceHttpClient";
import { mapUnifiedOrderRequestToBinance, mapBinanceOrderToUnifiedOrder } from "./BinanceOrderMapper";
import { addSignature } from "./BinanceSigning";

// ─── Config ──────────────────────────────────────────────

export type BinanceAdapterConfig = {
  /** Binance API key. */
  apiKey: string;

  /** Binance API secret. Never logged. */
  secret: string;

  /** Base URL for API requests (default: testnet). */
  baseUrl?: string;

  /** Whether to use testnet (default: true). */
  testnet?: boolean;

  /** If true, return simulated orders without real API calls (default: true). */
  dryRun?: boolean;

  /** Whether real execution is permitted (default: false). */
  allowRealExecution?: boolean;

  /** Receive window in ms (default: 5000). */
  recvWindow?: number;
};

const TESTNET_BASE_URL = "https://testnet.binancefuture.com";
const PROD_BASE_URL = "https://fapi.binance.com";

let _dryRunSeq = 0;
function dryRunOrderId(): string {
  _dryRunSeq += 1;
  return `binance-dryrun-${String(_dryRunSeq).padStart(6, "0")}`;
}

/**
 * Sanitize a value for error messages — replaces secrets with [REDACTED].
 */
function sanitize(value: unknown): unknown {
  if (typeof value === "string" && value.length > 8) {
    return `${value.slice(0, 4)}...${value.slice(-4)}`;
  }
  return value;
}

// ─── Adapter ─────────────────────────────────────────────

export class BinanceRealOrderAdapter implements OrderAdapter {
  readonly exchangeName = "binance";

  private config: Required<BinanceAdapterConfig>;
  private httpClient: BinanceHttpClient;

  constructor(config: BinanceAdapterConfig, httpClient: BinanceHttpClient) {
    this.config = {
      apiKey: config.apiKey,
      secret: config.secret,
      baseUrl: config.baseUrl ?? (config.testnet !== false ? TESTNET_BASE_URL : PROD_BASE_URL),
      testnet: config.testnet ?? true,
      dryRun: config.dryRun ?? true,
      allowRealExecution: config.allowRealExecution ?? false,
      recvWindow: config.recvWindow ?? 5000,
    };
    this.httpClient = httpClient;
  }

  // ─── createOrder ────────────────────────────────────

  async createOrder(request: UnifiedOrderRequest): Promise<UnifiedOrder> {
    // Dry run: return simulated order
    if (this.config.dryRun) {
      const now = Date.now();
      return {
        exchange: "binance",
        orderId: dryRunOrderId(),
        clientOrderId: request.clientOrderId,
        symbol: request.symbol,
        side: request.side,
        type: request.type,
        quantity: request.quantity,
        filledQuantity: 0,
        price: request.price,
        status: "open",
        createdAt: now,
        updatedAt: now,
      };
    }

    // Safety gate: real execution must be explicitly enabled
    if (!this.config.allowRealExecution) {
      throw new Error("Real execution is disabled for Binance adapter. Set allowRealExecution=true to enable.");
    }

    // Build and sign parameters
    const params = mapUnifiedOrderRequestToBinance(request);

    // Add signed params
    const signedParams: Record<string, string | number | undefined> = {
      ...params,
      recvWindow: this.config.recvWindow,
      timestamp: Date.now(),
    };

    addSignature(signedParams, this.config.secret);

    // Execute
    const response = await this.httpClient.request({
      method: "POST",
      path: "/fapi/v1/order",
      params: signedParams,
      signed: true,
      apiKey: this.config.apiKey,
      secret: this.config.secret,
    });

    return mapBinanceOrderToUnifiedOrder(response.body, "binance");
  }

  // ─── cancelOrder ────────────────────────────────────

  async cancelOrder(orderId: string, symbol: string): Promise<UnifiedOrder> {
    if (this.config.dryRun) {
      const now = Date.now();
      return {
        exchange: "binance",
        orderId,
        symbol,
        side: "buy",
        type: "limit",
        quantity: 0,
        filledQuantity: 0,
        status: "cancelled",
        createdAt: now - 60_000,
        updatedAt: now,
      };
    }

    if (!this.config.allowRealExecution) {
      throw new Error("Real execution is disabled for Binance adapter.");
    }

    const params: Record<string, string | number | undefined> = {
      symbol,
      orderId,
      timestamp: Date.now(),
      recvWindow: this.config.recvWindow,
    };

    addSignature(params, this.config.secret);

    const response = await this.httpClient.request({
      method: "DELETE",
      path: "/fapi/v1/order",
      params,
      signed: true,
      apiKey: this.config.apiKey,
      secret: this.config.secret,
    });

    return mapBinanceOrderToUnifiedOrder(response.body, "binance");
  }

  // ─── getOrder ───────────────────────────────────────

  async getOrder(orderId: string, symbol: string): Promise<UnifiedOrder> {
    if (this.config.dryRun) {
      const now = Date.now();
      return {
        exchange: "binance",
        orderId,
        symbol,
        side: "buy",
        type: "limit",
        quantity: 0.1,
        filledQuantity: 0,
        status: "open",
        createdAt: now - 60_000,
        updatedAt: now,
      };
    }

    const params: Record<string, string | number | undefined> = {
      symbol,
      orderId,
      timestamp: Date.now(),
      recvWindow: this.config.recvWindow,
    };

    addSignature(params, this.config.secret);

    const response = await this.httpClient.request({
      method: "GET",
      path: "/fapi/v1/order",
      params,
      signed: true,
      apiKey: this.config.apiKey,
      secret: this.config.secret,
    });

    return mapBinanceOrderToUnifiedOrder(response.body, "binance");
  }
}
