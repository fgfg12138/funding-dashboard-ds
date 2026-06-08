/**
 * TradingAdapter Types — Phase 5.0 Design Only
 *
 * This file defines the type contracts for future TradingAdapter implementations.
 *
 * **No function logic, no fetch/axios calls, no SDK imports.**
 * **No real order placement.**
 */

import type { ExchangeName } from "../exchanges/types";

// ─── Environment ────────────────────────────────────────

/** Trading environment mode. Default must be "disabled". */
export type TradingEnvironment = "disabled" | "sandbox" | "testnet";

/** TradingAdapter operating mode. Phase 5.0 only supports "design-only". */
export type TradingAdapterMode = "design-only";

// ─── Order Types ────────────────────────────────────────

export type TradingOrderIntent = "open" | "close" | "reduce";

export type TradingOrderSide = "buy" | "sell" | "long" | "short";

export type TradingOrderType = "market" | "limit";

export type TradingOrderSandboxStatus =
  | "sandbox-ready"
  | "sandbox-submitted"
  | "sandbox-filled"
  | "sandbox-cancelled"
  | "sandbox-partial"
  | "sandbox-failed";

// ─── Request / Result ───────────────────────────────────

export type TradingOrderRequest = {
  exchangeId: ExchangeName;
  symbol: string;
  marketType: "spot" | "perp";
  intent: TradingOrderIntent;
  side: TradingOrderSide;
  orderType: TradingOrderType;
  quantity: number;
  price?: number;
  notionalUsd?: number;
  reduceOnly: boolean;
  clientOrderId: string;
  previewId?: string;
  confirmationId?: string;
  queueItemId?: string;
};

export type TradingOrderResult = {
  exchangeId: ExchangeName;
  orderId: string;
  clientOrderId: string;
  symbol: string;
  side: string;
  orderType: string;
  price: number;
  quantity: number;
  filledQuantity: number;
  status: TradingOrderSandboxStatus;
  source: "mock-sandbox" | "sandbox" | "testnet";
  fee?: number;
  filledPrice?: number;
  submittedAt: number;
  filledAt?: number;
  errorMessage?: string;
};

export type EnvironmentValidationResult = {
  valid: boolean;
  environment: TradingEnvironment;
  warnings: string[];
};

export type PermissionValidationResult = {
  valid: boolean;
  canTrade: boolean;
  canWithdraw: boolean;
  warnings: string[];
};

// ─── Adapter Interface (Design Only) ────────────────────

/**
 * TradingAdapter interface — Phase 5.0 design document.
 *
 * All methods are **interface declarations only**.
 * No implementation exists in this file or any Phase 5.0 code.
 *
 * Implementations will be added in Phase 5.2+ with:
 * - Mock contract testing (Phase 5.1)
 * - Sandbox integration (Phase 5.2)
 * - Mainnet support (Phase 5.3+)
 */
export interface TradingAdapter {
  readonly exchangeId: ExchangeName;
  readonly mode: TradingAdapterMode;

  /** Validate that sandbox/testnet environment is properly configured. */
  validateEnvironment(): Promise<EnvironmentValidationResult>;

  /** Validate API Key permissions for trading. */
  validatePermissions(): Promise<PermissionValidationResult>;

  /** Build an order request from preview/confirmation data. */
  buildSandboxOrderRequest(preview?: any, confirmation?: any): TradingOrderRequest;

  /** Submit an order to the sandbox/testnet exchange. */
  submitSandboxOrder(request: TradingOrderRequest): Promise<TradingOrderResult>;

  /** Cancel a sandbox order. */
  cancelSandboxOrder(orderId: string): Promise<boolean>;

  /** Get the current status of a sandbox order. */
  getSandboxOrderStatus(orderId: string): Promise<TradingOrderResult>;
}
