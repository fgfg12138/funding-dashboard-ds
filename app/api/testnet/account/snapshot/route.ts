/**
 * GET /api/testnet/account/snapshot — Skeleton Only
 *
 * Phase 5.23: Uses buildGuardedBlockedResponseWithRateLimit — full preflight pipeline.
 * Returns 403 blocked. No real testnet interaction, no secret decryption, no signing.
 */

import { buildGuardedBlockedResponseWithRateLimit } from "../../_shared/blockedResponse";

export async function GET() {
  return buildGuardedBlockedResponseWithRateLimit("account-snapshot", "binance");
}
