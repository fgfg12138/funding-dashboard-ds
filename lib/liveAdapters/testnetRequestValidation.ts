/**
 * Testnet Request Validation Skeleton — Phase 5.20
 *
 * Validates testnet route request payload shape and parameter bounds.
 * Does NOT submit orders, sign requests, or call exchanges.
 *
 * Rules:
 * 1. payload missing → blocked
 * 2. exchangeId missing → blocked
 * 3. exchangeId not in binance/okx/bybit → blocked
 * 4. submit route: symbol, side, orderType required; quantity > 0; limit requires price
 * 5. cancel/status route: orderId required
 * 6. account-snapshot: exchangeId must exist
 * 7. Sensitive fields (secret, apiSecret, secretKey, password, privateKey) → blocked + sanitized
 * 8. Phase 5.20: even valid → route still returns 403
 */

import type {
  TestnetRequestValidationInput,
  TestnetRequestValidationResult,
} from "./testnetRequestValidationTypes";
import type { TestnetRouteErrorCode } from "./testnetRouteTypes";

const VALID_EXCHANGE_IDS = ["binance", "okx", "bybit"] as const;

const SENSITIVE_FIELD_PATTERNS = [
  "secret",
  "apiSecret",
  "api_secret",
  "secretKey",
  "password",
  "privateKey",
  "private_key",
];

/**
 * Evaluate the request validation for a testnet route.
 *
 * @param input - The validation input with route name, method, and payload.
 * @returns The validation result with sanitized payload and reason codes.
 */
export function evaluateTestnetRequestValidation(
  input: TestnetRequestValidationInput,
): TestnetRequestValidationResult {
  const { routeName, payload } = input;

  const blocks: { reasonCode: string; message: string }[] = [];
  let sanitized: Record<string, unknown> | undefined;

  // Rule 1: payload must exist
  if (payload === null || payload === undefined) {
    blocks.push({
      reasonCode: "PAYLOAD_MISSING",
      message: "Request payload is missing or null",
    });
    return buildResult(blocks, undefined);
  }

  // Rule 7: check and sanitize sensitive fields
  const detectedSensitive: string[] = [];
  sanitized = { ...payload };
  for (const key of Object.keys(payload)) {
    const lower = key.toLowerCase();
    if (SENSITIVE_FIELD_PATTERNS.some((p) => lower.includes(p))) {
      detectedSensitive.push(key);
      delete sanitized[key];
      sanitized[`_${key}_redacted`] = true;
    }
  }
  if (detectedSensitive.length > 0) {
    blocks.push({
      reasonCode: "SENSITIVE_FIELDS_DETECTED",
      message: `Sensitive fields found in payload and removed: ${detectedSensitive.join(", ")}`,
    });
  }

  // Rule 2: exchangeId required
  const exchangeId = String(payload.exchangeId ?? "");
  if (!exchangeId) {
    blocks.push({
      reasonCode: "EXCHANGE_ID_MISSING",
      message: "exchangeId is required",
    });
  }

  // Rule 3: exchangeId must be valid
  if (exchangeId && !VALID_EXCHANGE_IDS.includes(exchangeId as typeof VALID_EXCHANGE_IDS[number])) {
    blocks.push({
      reasonCode: "INVALID_EXCHANGE_ID",
      message: `exchangeId "${exchangeId}" is not supported. Supported: ${VALID_EXCHANGE_IDS.join(", ")}`,
    });
  }

  // Route-specific rules
  if (routeName === "orders-preview-submit" || routeName === "orders-cancel" || routeName === "orders-status") {
    // Rule 4: submit route validation
    if (routeName === "orders-preview-submit") {
      const symbol = String(payload.symbol ?? "");
      const side = String(payload.side ?? "");
      const orderType = String(payload.orderType ?? "");
      const quantity = Number(payload.quantity ?? 0);
      const price = payload.price !== undefined ? Number(payload.price) : undefined;

      if (!symbol) blocks.push({ reasonCode: "SYMBOL_MISSING", message: "symbol is required for order submission" });
      if (!["Buy", "Sell"].includes(side)) blocks.push({ reasonCode: "INVALID_SIDE", message: "side must be 'Buy' or 'Sell'" });
      if (!["Market", "Limit"].includes(orderType)) blocks.push({ reasonCode: "INVALID_ORDER_TYPE", message: "orderType must be 'Market' or 'Limit'" });
      if (quantity <= 0) blocks.push({ reasonCode: "INVALID_QUANTITY", message: "quantity must be greater than 0" });

      // Limit order requires price
      if (orderType === "Limit" && (price === undefined || price <= 0)) {
        blocks.push({ reasonCode: "LIMIT_PRICE_REQUIRED", message: "price is required and must be > 0 for Limit orders" });
      }
    }

    // Rule 5: cancel/status requires orderId
    if (routeName === "orders-cancel" || routeName === "orders-status") {
      const orderId = String(payload.orderId ?? "");
      if (!orderId) {
        blocks.push({ reasonCode: "ORDER_ID_MISSING", message: "orderId is required for cancel/status" });
      }
    }
  }

  // Rule 6: account-snapshot — exchangeId already checked above

  return buildResult(blocks, sanitized);
}

function buildResult(
  blocks: { reasonCode: string; message: string }[],
  sanitizedPayload: Record<string, unknown> | undefined,
): TestnetRequestValidationResult {
  if (blocks.length > 0) {
    const firstCode = blocks[0].reasonCode;
    const errorCode: TestnetRouteErrorCode | "invalid-request" =
      firstCode === "PAYLOAD_MISSING" || firstCode === "INVALID_EXCHANGE_ID" || firstCode === "SENSITIVE_FIELDS_DETECTED"
        ? "invalid-request"
        : "invalid-request";

    return {
      valid: false,
      severity: "blocked",
      errorCode: errorCode as TestnetRouteErrorCode | "invalid-request",
      reasonCodes: blocks.map((b) => b.reasonCode),
      messages: blocks.map((b) => b.message),
      sanitizedPayload,
      source: "testnet-request-validation-skeleton",
    };
  }

  return {
    valid: true,
    severity: "info",
    reasonCodes: [],
    messages: ["Request payload is valid"],
    sanitizedPayload,
    source: "testnet-request-validation-skeleton",
  };
}
