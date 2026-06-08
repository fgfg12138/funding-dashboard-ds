/**
 * POST /api/testnet/orders/preview-submit — Skeleton Only
 *
 * Phase 5.23: Uses buildGuardedBlockedResponseWithRateLimit — full preflight pipeline.
 * Returns 403 blocked. No real testnet interaction, no secret decryption, no signing.
 */

import { buildGuardedBlockedResponseWithRateLimit } from "../../_shared/blockedResponse";

export async function POST() {
  return buildGuardedBlockedResponseWithRateLimit("orders-preview-submit", "binance");
}
