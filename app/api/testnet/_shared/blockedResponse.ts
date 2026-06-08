/**
 * Shared blocked response helpers for /api/testnet/* route skeletons.
 *
 * Phase 5.11: All routes use these helpers to produce uniform 403 blocked responses.
 * No real testnet interaction, no secret decryption, no signing.
 */

import { NextResponse } from "next/server";
import { evaluateTestnetRouteSecurity } from "@/lib/liveAdapters/testnetRouteSecurityGuard";
import { createIdempotencyRecord } from "@/lib/liveAdapters/testnetIdempotencyStore";
import type {
  TestnetRouteName,
  TestnetRouteSecurityChecklist,
  TestnetRouteSecurityGuardInput,
} from "@/lib/liveAdapters/testnetRouteTypes";

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
