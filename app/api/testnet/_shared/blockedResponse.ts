/**
 * Shared blocked response helpers for /api/testnet/* route skeletons.
 *
 * Phase 5.11: All routes use these helpers to produce uniform 403 blocked responses.
 * No real testnet interaction, no secret decryption, no signing.
 */

import { NextResponse } from "next/server";
import { evaluateTestnetRouteSecurity } from "@/lib/liveAdapters/testnetRouteSecurityGuard";
import { createIdempotencyRecord } from "@/lib/liveAdapters/testnetIdempotencyStore";
import { checkRateLimit, incrementRateLimit } from "@/lib/liveAdapters/testnetRateLimitStore";
import { createTestnetAuditEvent, buildTestnetRequestId } from "@/lib/liveAdapters/testnetAuditStore";
import { parseTestnetEnvConfig, validateTestnetEnvConfig } from "@/lib/liveAdapters/testnetEnvConfig";
import { evaluateTestnetSecretAccessPolicy } from "@/lib/liveAdapters/testnetSecretPolicy";
import { evaluateTestnetPermissionCheck } from "@/lib/liveAdapters/testnetPermissionCheck";
import type {
  TestnetRouteName,
  TestnetRouteSecurityChecklist,
  TestnetRouteSecurityGuardInput,
} from "@/lib/liveAdapters/testnetRouteTypes";
import type { TestnetRateLimitInput } from "@/lib/liveAdapters/testnetRateLimitTypes";

const SKELETON_MESSAGE = "Testnet route skeleton only — no network request, no order placement";

/**
 * Build a default checklist with all fields set to false.
 * In Phase 5.11 the guard will always block regardless.
 */
export function buildDefaultSkeletonChecklist(): TestnetRouteSecurityChecklist {
  return {
    exchangeEnvValid: false,
    liveTradingBlocked: false,
    mainnetBlocked: false,
    killSwitchDisabled: false,
    apiKeyVerified: false,
    withdrawPermissionDisabled: false,
    ipWhitelistPresent: false,
    riskGatePassed: false,
    confirmationExists: false,
    queueItemNotExpired: false,
  };
}

/**
 * Build a blocked response without invoking the security guard.
 * Simpler path — returns immediately with 403.
 */
export function buildBlockedTestnetResponse(routeName: TestnetRouteName, exchangeId?: string) {
  return NextResponse.json(
    {
      success: false,
      error: {
        code: "exchange-env-invalid",
        message: SKELETON_MESSAGE,
      },
      auditId: `skeleton-${Date.now()}`,
    },
    { status: 403 },
  );
}

/**
 * Build a guarded blocked response — calls evaluateTestnetRouteSecurity
 * with default (all-false) checklist, then returns 403.
 *
 * Even if guard evaluated all-true, Phase 5.11 still blocks.
 */
export function buildGuardedBlockedResponse(routeName: TestnetRouteName, exchangeId?: string) {
  const input: TestnetRouteSecurityGuardInput = {
    checklist: buildDefaultSkeletonChecklist(),
    routeName,
    exchangeId: exchangeId ?? "binance",
    now: Date.now(),
    phase: "5.10-skeleton",
  };

  const guardResult = evaluateTestnetRouteSecurity(input);

  return NextResponse.json(
    {
      success: false,
      error: {
        code: guardResult.errorCode ?? "exchange-env-invalid",
        message: SKELETON_MESSAGE,
      },
      guard: {
        allowed: guardResult.allowed,
        reasonCodes: guardResult.reasonCodes,
        source: guardResult.source,
      },
      auditId: `skeleton-${Date.now()}`,
    },
    { status: 403 },
  );
}

/**
 * Build a guarded blocked response with idempotency recording.
 *
 * Records an idempotency record (status: recorded-blocked) and returns 403.
 * If the same idempotencyKey + routeName is submitted again, the record
 * is marked duplicate-blocked and the same 403 is returned.
 *
 * Uses synthetic idempotencyKey "skeleton-disabled" by default.
 * No real body parsing in Phase 5.12 skeleton.
 */
export function buildGuardedBlockedResponseWithIdempotency(
  routeName: TestnetRouteName,
  exchangeId?: string,
  idempotencyKey?: string,
) {
  const key = idempotencyKey ?? "skeleton-disabled";

  const input: TestnetRouteSecurityGuardInput = {
    checklist: buildDefaultSkeletonChecklist(),
    routeName,
    exchangeId: exchangeId ?? "binance",
    now: Date.now(),
    phase: "5.10-skeleton",
  };

  const guardResult = evaluateTestnetRouteSecurity(input);

  const idempotencyResult = createIdempotencyRecord({
    idempotencyKey: key,
    clientOrderId: `skeleton-${key}`,
    routeName,
    exchangeId: exchangeId ?? "binance",
    requestFields: { routeName, exchangeId, phase: "5.12-skeleton" },
    responseSnapshot: {
      success: false,
      errorCode: guardResult.errorCode ?? "exchange-env-invalid",
      message: SKELETON_MESSAGE,
      httpStatus: 403,
    },
  });

  return NextResponse.json(
    {
      success: false,
      error: {
        code: guardResult.errorCode ?? "exchange-env-invalid",
        message: SKELETON_MESSAGE,
      },
      guard: {
        allowed: guardResult.allowed,
        reasonCodes: guardResult.reasonCodes,
        source: guardResult.source,
      },
      idempotency: {
        isDuplicate: idempotencyResult.isDuplicate,
        status: idempotencyResult.record.status,
        recordId: idempotencyResult.record.id,
      },
      auditId: `skeleton-${Date.now()}`,
    },
    { status: 403 },
  );
}

/**
 * Build a guarded blocked response with idempotency + rate limit recording.
 *
 * Checks and increments exchange/route/session rate limit counters.
 * Even if rate limit passes, still returns 403 blocked.
 */
export function buildGuardedBlockedResponseWithRateLimit(
  routeName: TestnetRouteName,
  exchangeId?: string,
  idempotencyKey?: string,
) {
  const key = idempotencyKey ?? "skeleton-disabled";
  const exch = exchangeId ?? "binance";
  const requestId = buildTestnetRequestId(routeName, exch);
  const method = routeName === "account-snapshot" || routeName === "orders-status" ? "GET" : "POST";

  // Audit: request received
  createTestnetAuditEvent({
    eventType: "route_request_received",
    routeName,
    method,
    exchangeId: exch,
    requestId,
    idempotencyKey: key,
    clientOrderId: `skeleton-${key}`,
    severity: "info",
    message: "Testnet route request received (skeleton)",
    metadata: { phase: "5.14-skeleton" },
  });

  const guardInput: TestnetRouteSecurityGuardInput = {
    checklist: buildDefaultSkeletonChecklist(),
    routeName,
    exchangeId: exch,
    now: Date.now(),
    phase: "5.10-skeleton",
  };

  // Parse and validate env config from process.env
  const envConfig = parseTestnetEnvConfig({
    EXCHANGE_ENV: process.env.EXCHANGE_ENV,
    LIVE_TRADING_ENABLED: process.env.LIVE_TRADING_ENABLED,
    ALLOW_MAINNET_TRADING: process.env.ALLOW_MAINNET_TRADING,
    TESTNET_ROUTES_ENABLED: process.env.TESTNET_ROUTES_ENABLED,
    TESTNET_ORDER_SUBMIT_ENABLED: process.env.TESTNET_ORDER_SUBMIT_ENABLED,
  });
  const envValidation = validateTestnetEnvConfig(envConfig);
  const envMeta = {
    exchangeEnv: envConfig.exchangeEnv,
    testnetRoutesEnabled: envConfig.testnetRoutesEnabled,
    testnetOrderSubmitEnabled: envConfig.testnetOrderSubmitEnabled,
    valid: envValidation.valid,
    warnings: envValidation.warnings,
    errors: envValidation.errors,
  };

  const guardResult = evaluateTestnetRouteSecurity(guardInput);

  // Evaluate secret access policy
  const secretPolicy = evaluateTestnetSecretAccessPolicy({
    exchangeId: exch,
    envConfig,
    envValidation,
    guardResult,
    routeName,
    phase: "5.18-policy-only",
  });

  // Evaluate permission check
  const permissionCheck = evaluateTestnetPermissionCheck({
    exchangeId: exch,
    routeName,
    secretPolicyResult: secretPolicy,
    phase: "5.19-permission-skeleton",
  });

  // Check + increment rate limits for all 3 scopes
  const rateLimitInputs: TestnetRateLimitInput[] = [
    { scope: "exchange", routeName, exchangeId: exch },
    { scope: "route", routeName, exchangeId: exch },
    { scope: "session", routeName, exchangeId: exch, sessionId: "skeleton" },
  ];

  const rateLimitResults = rateLimitInputs.map((rlInput) => {
    checkRateLimit(rlInput);
    return incrementRateLimit(rlInput);
  });

  // Audit: rate limited if any scope blocked
  const anyRateLimited = rateLimitResults.some((r) => !r.allowed);
  if (anyRateLimited) {
    createTestnetAuditEvent({
      eventType: "route_rate_limited",
      routeName,
      method,
      exchangeId: exch,
      requestId,
      idempotencyKey: key,
      severity: "warning",
      message: "Rate limit exceeded in skeleton",
      metadata: {
        exchangeAllowed: rateLimitResults[0].allowed,
        routeAllowed: rateLimitResults[1].allowed,
        sessionAllowed: rateLimitResults[2].allowed,
      },
    });
  }

  const idempotencyResult = createIdempotencyRecord({
    idempotencyKey: key,
    clientOrderId: `skeleton-${key}`,
    routeName,
    exchangeId: exch,
    requestFields: { routeName, exchangeId: exch, phase: "5.14-skeleton" },
    responseSnapshot: {
      success: false,
      errorCode: guardResult.errorCode ?? "exchange-env-invalid",
      message: SKELETON_MESSAGE,
      httpStatus: 403,
    },
  });

  // Audit: duplicate blocked
  if (idempotencyResult.isDuplicate) {
    createTestnetAuditEvent({
      eventType: "route_duplicate_blocked",
      routeName,
      method,
      exchangeId: exch,
      requestId,
      idempotencyKey: key,
      clientOrderId: `skeleton-${key}`,
      severity: "warning",
      message: "Duplicate request blocked by idempotency skeleton",
      metadata: { existingRecordId: idempotencyResult.record.id },
    });
  }

  // Audit: skeleton blocked
  createTestnetAuditEvent({
    eventType: "route_skeleton_blocked",
    routeName,
    method,
    exchangeId: exch,
    requestId,
    idempotencyKey: key,
    clientOrderId: `skeleton-${key}`,
    severity: "blocked",
    message: SKELETON_MESSAGE,
    metadata: {
      guardErrorCode: guardResult.errorCode ?? "none",
      isDuplicate: idempotencyResult.isDuplicate,
    },
  });

  const rateLimitMeta = rateLimitResults.map((r) => ({
    allowed: r.allowed,
    currentCount: r.currentCount,
    maxRequests: r.maxRequests,
    retryAfterSeconds: r.retryAfterSeconds,
  }));

  return NextResponse.json(
    {
      success: false,
      error: {
        code: guardResult.errorCode ?? "exchange-env-invalid",
        message: SKELETON_MESSAGE,
      },
      guard: {
        allowed: guardResult.allowed,
        reasonCodes: guardResult.reasonCodes,
        source: guardResult.source,
      },
      idempotency: {
        isDuplicate: idempotencyResult.isDuplicate,
        status: idempotencyResult.record.status,
        recordId: idempotencyResult.record.id,
      },
      env: envMeta,
      secretPolicy: {
        allowedToRequestSecret: secretPolicy.allowedToRequestSecret,
        severity: secretPolicy.severity,
        reasonCodes: secretPolicy.reasonCodes,
        source: secretPolicy.source,
      },
      permission: {
        allowed: permissionCheck.allowed,
        canRead: permissionCheck.canRead,
        canTrade: permissionCheck.canTrade,
        canWithdraw: permissionCheck.canWithdraw,
        ipWhitelistPresent: permissionCheck.ipWhitelistPresent,
        source: permissionCheck.source,
      },
      rateLimit: rateLimitMeta,
      audit: { requestId },
      auditId: `skeleton-${Date.now()}`,
    },
    { status: 403 },
  );
}
