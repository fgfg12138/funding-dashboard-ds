/**
 * POST /api/testnet/orders/cancel — Skeleton Only
 *
 * Phase 5.11: Uses shared blocked response helper. Returns 403 blocked.
 * No real testnet interaction, no secret decryption, no signing.
 */

import { buildGuardedBlockedResponseWithRateLimit } from "../../_shared/blockedResponse";

export async function POST() {
  return buildGuardedBlockedResponseWithRateLimit("orders-cancel", "binance");
}
