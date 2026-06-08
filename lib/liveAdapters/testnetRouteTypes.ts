/**
 * Testnet Server Route Types — Phase 5.8 Design Only
 *
 * Defines the request/response schemas for future /api/testnet/* routes.
 * No function logic, no fetch/axios calls, no SDK imports, no crypto.
 */

// ─── Route Identity ─────────────────────────────────────

export type TestnetRouteName =
  | "orders-preview-submit"
  | "orders-cancel"
  | "orders-status"
  | "account-snapshot";

export type TestnetRouteMethod = "POST" | "GET";

// ─── Security Checklist ─────────────────────────────────

export type TestnetRouteSecurityChecklist = {
  /** EXCHANGE_ENV === "testnet" */
  exchangeEnvValid: boolean;
  /** LIVE_TRADING_ENABLED === false (or testnet-only flag) */
  liveTradingBlocked: boolean;
  /** ALLOW_MAINNET_TRADING === false */
  mainnetBlocked: boolean;
  /** Kill Switch is not triggered */
  killSwitchDisabled: boolean;
  /** API Key exists and is verified */
  apiKeyVerified: boolean;
  /** Withdraw permission is disabled for testnet keys */
  withdrawPermissionDisabled: boolean;
  /** IP whitelist is present and non-empty */
  ipWhitelistPresent: boolean;
  /** Risk Gate check passed */
  riskGatePassed: boolean;
  /** User confirmation exists */
  confirmationExists: boolean;
  /** Queue item has not expired */
  queueItemNotExpired: boolean;
};

// ─── Idempotency ────────────────────────────────────────

export type IdempotencyPolicy = {
  /** Client-generated idempotency key (UUID) */
  idempotencyKey: string;
  /** Client-generated order ID for duplicate detection */
  clientOrderId: string;
  /** Window in seconds during which duplicates are rejected */
  dedupWindowSeconds: number;
};

export type IdempotencyCheckResult = {
  isDuplicate: boolean;
  originalStatus?: string;
  originalOrderId?: string;
};

// ─── Rate Limit ──────────────────────────────────────────

export type RateLimitScope = "exchange" | "route" | "session";

export type RateLimitPolicy = {
  scope: RateLimitScope;
  maxRequests: number;
  windowSeconds: number;
};

export type TestnetRateLimitConfig = {
  perExchange: RateLimitPolicy;
  perRoute: RateLimitPolicy;
  perSession: RateLimitPolicy;
};

// ─── Request Base ────────────────────────────────────────

export type TestnetRouteRequestBase = {
  exchangeId: string;
  idempotency: IdempotencyPolicy;
};

// ─── Route-Specific Requests ────────────────────────────

export type TestnetSubmitOrderRequest = TestnetRouteRequestBase & {
  symbol: string;
  side: "Buy" | "Sell";
  orderType: "Market" | "Limit";
  quantity: number;
  price?: number;
  timeInForce?: "GTC" | "IOC" | "FOK";
  reduceOnly?: boolean;
};

export type TestnetCancelOrderRequest = TestnetRouteRequestBase & {
  orderId: string;
};

export type TestnetOrderStatusRequest = TestnetRouteRequestBase & {
  orderId: string;
};

export type TestnetAccountSnapshotRequest = TestnetRouteRequestBase & {
  /** Optional — defaults to all symbols */
  symbol?: string;
};

// ─── Response ────────────────────────────────────────────

export type TestnetRouteErrorCode =
  | "exchange-env-invalid"         // EXCHANGE_ENV !== "testnet"
  | "live-trading-enabled"         // LIVE_TRADING_ENABLED === true
  | "mainnet-allowed"              // ALLOW_MAINNET_TRADING === true
  | "kill-switch-active"          // Kill Switch triggered
  | "api-key-not-verified"        // API Key verification failed
  | "withdraw-not-disabled"       // Withdraw permission not disabled
  | "ip-whitelist-missing"        // No IP whitelist
  | "risk-gate-blocked"           // Risk Gate rejected
  | "confirmation-missing"        // User confirmation not provided
  | "queue-expired"               // Queue item expired
  | "rate-limit-exceeded"         // Rate limit hit
  | "duplicate-request"           // Idempotency key already used
  | "order-not-found"             // Order not found on exchange
  | "timeout"                     // Exchange request timed out
  | "partial-fill-unknown"        // Partial fill with inconsistent status
  | "rejected-by-exchange"        // Exchange rejected the order
  | "internal-error";             // Unexpected server error

export type TestnetRouteResponse<T = unknown> = {
  success: boolean;
  data?: T;
  error?: {
    code: TestnetRouteErrorCode;
    message: string;
  };
  auditId?: string;
};

// ─── Route Response Data ─────────────────────────────────

export type TestnetSubmitOrderResponseData = {
  orderId: string;
  clientOrderId: string;
  status: string;
  symbol: string;
  side: "Buy" | "Sell";
  orderType: "Market" | "Limit";
  price: number;
  quantity: number;
  filledQuantity: number;
  submittedAt: number;
};

export type TestnetCancelOrderResponseData = {
  orderId: string;
  cancelled: boolean;
};

export type TestnetOrderStatusResponseData = {
  orderId: string;
  exchangeId: string;
  clientOrderId: string;
  symbol: string;
  side: "Buy" | "Sell";
  orderType: "Market" | "Limit";
  price: number;
  quantity: number;
  filledQuantity: number;
  status: string;
  submittedAt: number;
  filledAt?: number;
  cancelledAt?: number;
  errorMessage?: string;
};

export type TestnetAccountSnapshotResponseData = {
  exchangeId: string;
  balances: TestnetBalanceItem[];
  updatedAt: number;
};

export type TestnetBalanceItem = {
  asset: string;
  walletBalance: number;
  availableBalance: number;
};

// ─── Audit ───────────────────────────────────────────────

export type AuditEventType =
  | "route_request_received"
  | "route_request_blocked"
  | "route_testnet_order_submitted"
  | "route_testnet_order_failed";

export type AuditEvent = {
  eventType: AuditEventType;
  routeName: TestnetRouteName;
  exchangeId: string;
  timestamp: number;
  requestId: string;
  userId?: string;
  errorCode?: TestnetRouteErrorCode;
  metadata?: Record<string, string>;
};

// ─── Failure Handling ────────────────────────────────────

export type TestnetFailureMode =
  | "timeout"
  | "partial-fill"
  | "rejected"
  | "inconsistent-status";

export type TestnetFailureResult = {
  mode: TestnetFailureMode;
  orderId: string;
  exchangeId: string;
  message: string;
  retryable: boolean;
  requiresReconciliation: boolean;
};

// ─── Security Guard ──────────────────────────────────────

export type SecurityGuardSeverity = "blocked" | "warning" | "info";

export type TestnetRouteSecurityGuardInput = {
  checklist: TestnetRouteSecurityChecklist;
  routeName: TestnetRouteName;
  exchangeId: string;
  now: number;
  phase: "5.10-skeleton";
};

export type TestnetRouteSecurityGuardResult = {
  allowed: boolean;
  severity: SecurityGuardSeverity;
  errorCode?: TestnetRouteErrorCode;
  reasonCodes: string[];
  messages: string[];
  source: "testnet-route-skeleton";
};
