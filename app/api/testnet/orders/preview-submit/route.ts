/**
 * POST /api/testnet/orders/preview-submit — Skeleton Only
 *
 * Phase 5.10: Calls security guard skeleton but still returns 403 blocked.
 * No real testnet interaction, no secret decryption, no signing.
 */

import { NextResponse } from "next/server";
import { evaluateTestnetRouteSecurity } from "@/lib/liveAdapters/testnetRouteSecurityGuard";
import type {
  TestnetRouteSecurityChecklist,
  TestnetRouteSecurityGuardInput,
} from "@/lib/liveAdapters/testnetRouteTypes";

const DEFAULT_CHECKLIST: TestnetRouteSecurityChecklist = {
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

export async function POST() {
  const input: TestnetRouteSecurityGuardInput = {
    checklist: DEFAULT_CHECKLIST,
    routeName: "orders-preview-submit",
    exchangeId: "binance",
    now: Date.now(),
    phase: "5.10-skeleton",
  };

  const guardResult = evaluateTestnetRouteSecurity(input);

  return NextResponse.json(
    {
      success: false,
      error: {
        code: guardResult.errorCode ?? "exchange-env-invalid",
        message: "Testnet route skeleton only — no network request, no order placement",
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
