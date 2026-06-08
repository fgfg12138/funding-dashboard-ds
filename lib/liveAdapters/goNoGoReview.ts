/**
 * Go/No-Go Review — Phase 6.8
 *
 * Assesses whether the project is ready to begin real testnet integration.
 * Current decision: NO_GO — 11 required items blocked/not-started.
 * No actual capabilities are enabled.
 */

import type {
  GoNoGoDecision,
  GoNoGoReviewItem,
  GoNoGoReviewResult,
} from "./goNoGoReviewTypes";

interface ReviewItemDef {
  id: string;
  domain: string;
  label: string;
  required: boolean;
  currentStatus: "pass" | "blocked" | "not-started";
  evidence: string;
  blockingReason?: string;
}

const ITEM_DEFS: ReviewItemDef[] = [
  // 1. Secret Vault (design done, implementation blocked)
  {
    id: "secret-vault-design",
    domain: "Secret Vault",
    label: "Secret vault architecture design completed",
    required: true,
    currentStatus: "pass",
    evidence: "Phase 6.2: docs/SERVER_SECRET_VAULT_DESIGN.md — 3 providers, server-only boundary",
  },
  {
    id: "secret-vault-impl",
    domain: "Secret Vault",
    label: "Secret vault real implementation (retrieve + decrypt)",
    required: true,
    currentStatus: "blocked",
    evidence: "No server-side secret retrieval or AES decryption implemented",
    blockingReason: "Requires server route implementation + encrypted env config",
  },

  // 2. Permission Verification
  {
    id: "perm-design",
    domain: "Permission Verification",
    label: "Permission verification design completed",
    required: true,
    currentStatus: "pass",
    evidence: "Phase 6.3: docs/REAL_PERMISSION_VERIFICATION_DESIGN.md — 3 exchanges, cache strategy",
  },
  {
    id: "perm-impl",
    domain: "Permission Verification",
    label: "Real permission verification request to exchange testnet",
    required: true,
    currentStatus: "blocked",
    evidence: "No real API call to exchange permission endpoint",
    blockingReason: "Requires server-side secret + HTTP client to exchange testnet",
  },

  // 3. Signing
  {
    id: "signing-design",
    domain: "Signing",
    label: "Signing architecture design completed",
    required: true,
    currentStatus: "pass",
    evidence: "Phase 6.4: docs/SIGNING_ARCHITECTURE_DESIGN.md — 8 preconditions, replay protection",
  },
  {
    id: "signing-impl",
    domain: "Signing",
    label: "HMAC SHA256/ed25519 signing implementation",
    required: true,
    currentStatus: "blocked",
    evidence: "No signing implementation exists",
    blockingReason: "Requires crypto library integration + exchange-specific signing logic",
  },

  // 4. Persistent Audit
  {
    id: "audit-design",
    domain: "Persistent Audit",
    label: "Persistent audit storage design completed",
    required: true,
    currentStatus: "pass",
    evidence: "Phase 6.1: docs/PERSISTENT_AUDIT_STORAGE_DESIGN.md — tables, retention, hash chain",
  },
  {
    id: "audit-impl",
    domain: "Persistent Audit",
    label: "Persistent audit storage implementation (SQLite/Postgres)",
    required: true,
    currentStatus: "blocked",
    evidence: "In-memory only — no database connection",
    blockingReason: "Requires database integration (SQLite for staging, Postgres for production)",
  },

  // 5. Rollback Plan
  {
    id: "rollback-design",
    domain: "Rollback Plan",
    label: "Rollback plan design completed",
    required: true,
    currentStatus: "pass",
    evidence: "Phase 6.5: docs/TESTNET_ROLLBACK_PLAN_DESIGN.md — 7 scenarios, state matrix",
  },
  {
    id: "rollback-impl",
    domain: "Rollback Plan",
    label: "Real rollback/cancel/reconciliation execution",
    required: true,
    currentStatus: "blocked",
    evidence: "No real cancellation or reconciliation implemented",
    blockingReason: "Requires exchange API cancel endpoint + reconciliation logic",
  },

  // 6. Kill Switch
  {
    id: "kill-switch-concept",
    domain: "Kill Switch",
    label: "Kill Switch concept defined in guard",
    required: true,
    currentStatus: "pass",
    evidence: "Phase 5.10: guard skeleton includes killSwitchDisabled check",
  },
  {
    id: "kill-switch-impl",
    domain: "Kill Switch",
    label: "Kill Switch real implementation for testnet",
    required: true,
    currentStatus: "not-started",
    evidence: "No kill switch integration for testnet routes",
    blockingReason: "Requires shared state mechanism + route middleware integration",
  },

  // 7. Rate Limit
  {
    id: "rate-limit-skeleton",
    domain: "Rate Limit",
    label: "Rate limit store skeleton",
    required: true,
    currentStatus: "pass",
    evidence: "Phase 5.13: testnetRateLimitStore.ts — 3 scopes, in-memory",
  },
  {
    id: "rate-limit-exchange",
    domain: "Rate Limit",
    label: "Exchange-specific rate limit configuration",
    required: false,
    currentStatus: "not-started",
    evidence: "Default policies only (10/s exchange, 30/60s route)",
  },

  // 8. Idempotency
  {
    id: "idempotency-skeleton",
    domain: "Idempotency",
    label: "Idempotency store skeleton",
    required: true,
    currentStatus: "pass",
    evidence: "Phase 5.12: testnetIdempotencyStore.ts — in-memory dedup",
  },
  {
    id: "idempotency-exchange",
    domain: "Idempotency",
    label: "Exchange-level idempotency integration",
    required: false,
    currentStatus: "not-started",
    evidence: "Skeleton records keys but no exchange integration",
  },

  // 9. Middleware
  {
    id: "middleware-current",
    domain: "Middleware",
    label: "Current middleware READ_ONLY guard",
    required: true,
    currentStatus: "pass",
    evidence: "Phase 4: middleware.ts blocks mutation on non-allowlist paths",
  },
  {
    id: "middleware-allowlist",
    domain: "Middleware",
    label: "Testnet mutation allowlist in middleware",
    required: true,
    currentStatus: "blocked",
    evidence: "/api/testnet not in middleware allowlist",
    blockingReason: "Must add /api/testnet POST routes to allowlist before real testnet",
  },

  // 10. Binance Testnet Adapter
  {
    id: "adapter-skeleton",
    domain: "Binance Testnet Adapter",
    label: "Binance testnet adapter skeleton",
    required: true,
    currentStatus: "pass",
    evidence: "Phase 5.7: binanceTestnetAdapterSkeleton.ts — all methods disabled",
  },
  {
    id: "adapter-real",
    domain: "Binance Testnet Adapter",
    label: "Real Binance testnet adapter with HTTP calls",
    required: true,
    currentStatus: "blocked",
    evidence: "No real network adapter — all methods return disabled",
    blockingReason: "Requires server-side secret + signing + HTTP client + middleware",
  },

  // 11. Operations Approval
  {
    id: "ops-approval",
    domain: "Operations Approval",
    label: "Operations/stakeholder approval for testnet",
    required: true,
    currentStatus: "not-started",
    evidence: "No ops review conducted for testnet activation",
    blockingReason: "Requires formal approval from operations team",
  },

  // 12. Mainnet Isolation
  {
    id: "mainnet-boundary",
    domain: "Mainnet Isolation",
    label: "Mainnet boundary tests and enforcement",
    required: true,
    currentStatus: "pass",
    evidence: "Phase 3/5.6: boundary tests, env config, ALLOW_MAINNET_TRADING=false default",
  },
  {
    id: "mainnet-env-config",
    domain: "Mainnet Isolation",
    label: "EXCHANGE_ENV config ensures no mainnet",
    required: true,
    currentStatus: "pass",
    evidence: "Phase 5.16: testnetEnvConfig.ts — allowMainnetTrading always false",
  },
];

/**
 * Build the Phase 6.8 Go/No-Go review result.
 *
 * @returns A GoNoGoReviewResult with decision and all items.
 */
export function buildGoNoGoReview(): GoNoGoReviewResult {
  const items: GoNoGoReviewItem[] = ITEM_DEFS.map((def) => ({
    id: def.id,
    domain: def.domain,
    label: def.label,
    status: def.currentStatus,
    required: def.required,
    evidence: def.evidence,
    blockingReason: def.blockingReason,
  }));

  const total = items.length;
  const pass = items.filter((i) => i.status === "pass").length;
  const blocked = items.filter((i) => i.status === "blocked").length;
  const notStarted = items.filter((i) => i.status === "not-started").length;
  const requiredBlocked = items.filter((i) => i.required && i.status !== "pass").length;

  const readyForRealTestnet = requiredBlocked === 0;
  const decision: GoNoGoDecision = readyForRealTestnet ? "GO" : "NO_GO";

  return {
    decision,
    readyForRealTestnet,
    total,
    pass,
    blocked,
    notStarted,
    requiredBlocked,
    items,
    source: "phase-6-8-go-no-go-review",
  };
}
