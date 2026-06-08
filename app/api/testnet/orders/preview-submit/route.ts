/**
 * POST /api/testnet/orders/preview-submit — Skeleton Only
 *
 * Phase 5.9: Returns blocked. No real testnet interaction.
 */

import { NextResponse } from "next/server";

const BLOCKED_RESPONSE = {
  success: false,
  error: {
    code: "exchange-env-invalid",
    message: "Testnet route skeleton only — no network request, no order placement",
  },
  auditId: `skeleton-${Date.now()}`,
};

export async function POST() {
  return NextResponse.json(BLOCKED_RESPONSE, { status: 403 });
}
