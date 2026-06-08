/**
 * GET /api/testnet/orders/[id] — Skeleton Only
 *
 * Phase 5.11: Uses shared blocked response helper. Returns 403 blocked.
 * No real testnet interaction, no secret decryption, no signing.
 */

import { buildGuardedBlockedResponse } from "../../_shared/blockedResponse";

export async function GET() {
  return buildGuardedBlockedResponse("orders-status", "binance");
}
