/**
 * Phase 6.0 Real Testnet Readiness Review
 *
 * Evaluates whether the project is ready to begin real testnet integration.
 * This is a pure assessment — no capabilities are enabled.
 * Phase 6.0 always returns ready=false because real testnet
 * capabilities have not yet been implemented.
 */

import type {
  Phase6ReviewItem,
  Phase6ReviewArea,
  Phase6ReviewStatus,
  Phase6ReviewResult,
} from "./phase6ReadinessTypes";

interface ReviewItemDef {
  id: string;
  area: Phase6ReviewArea;
  label: string;
  required: boolean;
  currentStatus: Phase6ReviewStatus;
  requirement: string;
  currentState: string;
  gap: string;
}

const ITEM_DEFS: ReviewItemDef[] = [
  // ─── Secret Storage ────────────────────────────────
  {
    id: "secret-storage-arch",
    area: "secret-storage",
    label: "Encrypted API Key storage architecture",
    required: true,
    currentStatus: "pass",
    requirement: "API Keys stored encrypted at rest, never in plaintext",
    currentState: "Phase 3: EncryptedSecretPayload type, crypto.ts for encrypt/decrypt",
    gap: "None — storage architecture is designed",
  },
  {
    id: "secret-server-retrieval",
    area: "secret-storage",
    label: "Server-side secret retrieval for testnet",
    required: true,
    currentStatus: "blocked",
    requirement: "Server-side route to retrieve and decrypt API Key for testnet use",
    currentState: "Phase 5.18: Secret policy defined, but no retrieval implementation",
    gap: "No server-side route to decrypt and use API Key for signing",
  },
  {
    id: "secret-no-client",
    area: "secret-storage",
    label: "Secret never enters client component",
    required: true,
    currentStatus: "pass",
    requirement: "Decrypted secrets must never reach the browser",
    currentState: "Phase 5.8 design: Secret only in server route handler",
    gap: "None — design enforces server-only secret access",
  },

  // ─── Permission Verification ────────────────────────
  {
    id: "perm-skeleton",
    area: "permission-verification",
    label: "Permission check skeleton",
    required: true,
    currentStatus: "pass",
    requirement: "Permission check structure exists and is integrated",
    currentState: "Phase 5.19: testnetPermissionCheck.ts — all flags disabled",
    gap: "None — skeleton is in place",
  },
  {
    id: "perm-real-verification",
    area: "permission-verification",
    label: "Real permission verification against exchange testnet endpoint",
    required: true,
    currentStatus: "blocked",
    requirement: "Call exchange API to verify key canRead/canTrade/withdrawDisabled",
    currentState: "No real API call to exchange permission endpoint",
    gap: "Requires server-side secret retrieval + HTTP client to exchange testnet",
  },

  // ─── Signing Architecture ──────────────────────────
  {
    id: "signing-policy",
    area: "signing-architecture",
    label: "Signing policy defined",
    required: true,
    currentStatus: "pass",
    requirement: "Design document specifies where and how signing occurs",
    currentState: "Phase 5.8: Signing only on server side, never client",
    gap: "None — policy is defined",
  },
  {
    id: "signing-implementation",
    area: "signing-architecture",
    label: "Server-side signing implementation (HMAC/ed25519)",
    required: true,
    currentStatus: "blocked",
    requirement: "Implement HMAC SHA256 or ed25519 signing for exchange API requests",
    currentState: "No signing implementation exists",
    gap: "Requires crypto library integration + exchange-specific signing logic",
  },

  // ─── Middleware Strategy ────────────────────────────
  {
    id: "middleware-current",
    area: "middleware-strategy",
    label: "Current middleware READ_ONLY guard",
    required: true,
    currentStatus: "pass",
    requirement: "Middleware blocks mutation on all non-allowlist paths",
    currentState: "Phase 4: middleware.ts returns 405 for non-allowlist POST",
    gap: "None — current guard is working",
  },
  {
    id: "middleware-testnet-allowlist",
    area: "middleware-strategy",
    label: "Testnet mutation allowlist design",
    required: true,
    currentStatus: "blocked",
    requirement: "Design and implement allowlist for /api/testnet POST routes",
    currentState: "/api/testnet not in middleware allowlist",
    gap: "Requires adding /api/testnet paths to allowlist after real testnet is ready",
  },

  // ─── Kill Switch ───────────────────────────────────
  {
    id: "kill-switch-skeleton",
    area: "kill-switch",
    label: "Kill Switch concept defined",
    required: true,
    currentStatus: "pass",
    requirement: "Kill Switch mechanism is conceptually designed",
    currentState: "Phase 5.10: guard skeleton includes killSwitchDisabled check",
    gap: "None — concept exists in guard checklist",
  },
  {
    id: "kill-switch-implementation",
    area: "kill-switch",
    label: "Kill Switch real implementation for testnet",
    required: true,
    currentStatus: "not-started",
    requirement: "Global kill switch that immediately blocks all testnet orders",
    currentState: "No kill switch integration for testnet routes",
    gap: "Requires shared state mechanism + route middleware integration",
  },

  // ─── Audit Persistence ─────────────────────────────
  {
    id: "audit-skeleton",
    area: "audit-persistence",
    label: "Audit event skeleton",
    required: true,
    currentStatus: "pass",
    requirement: "Audit event types and in-memory store exist",
    currentState: "Phase 5.14: testnetAuditStore.ts — 5 event types",
    gap: "None — skeleton is in place",
  },
  {
    id: "audit-persistent-storage",
    area: "audit-persistence",
    label: "Persistent audit storage",
    required: true,
    currentStatus: "blocked",
    requirement: "Audit events persisted to database or log file",
    currentState: "In-memory only — events lost on restart",
    gap: "Requires database integration or log file writer",
  },

  // ─── Rate Limit ────────────────────────────────────
  {
    id: "rate-limit-skeleton",
    area: "rate-limit",
    label: "Rate limit store skeleton",
    required: true,
    currentStatus: "pass",
    requirement: "Rate limit counting structure exists",
    currentState: "Phase 5.13: testnetRateLimitStore.ts — 3 scopes",
    gap: "None — skeleton is in place",
  },
  {
    id: "rate-limit-exchange-config",
    area: "rate-limit",
    label: "Exchange-specific rate limit configuration",
    required: true,
    currentStatus: "not-started",
    requirement: "Configure per-exchange rate limits matching real testnet API limits",
    currentState: "Default policies only (10/s exchange, 30/60s route, 60/60s session)",
    gap: "Requires exchange-specific limit research and configuration",
  },

  // ─── Idempotency ───────────────────────────────────
  {
    id: "idempotency-skeleton",
    area: "idempotency",
    label: "Idempotency store skeleton",
    required: true,
    currentStatus: "pass",
    requirement: "Idempotency key recording exists for dedup",
    currentState: "Phase 5.12: testnetIdempotencyStore.ts — in-memory",
    gap: "None — skeleton is in place",
  },
  {
    id: "idempotency-exchange-integration",
    area: "idempotency",
    label: "Exchange-level idempotency integration",
    required: true,
    currentStatus: "not-started",
    requirement: "Send exchange-compatible idempotency keys with orders",
    currentState: "Skeleton records keys but no exchange integration",
    gap: "Requires exchange API spec research + header/key generation",
  },

  // ─── Rollback Plan ─────────────────────────────────
  {
    id: "rollback-documented",
    area: "rollback-plan",
    label: "Testnet rollback plan documented",
    required: true,
    currentStatus: "blocked",
    requirement: "Documented procedure to disable testnet and revert to skeleton",
    currentState: "No formal rollback plan for testnet activation",
    gap: "Requires documented procedure covering cancellation, reconciliation, config reset",
  },

  // ─── Exchange Adapter ──────────────────────────────
  {
    id: "adapter-skeleton",
    area: "exchange-adapter",
    label: "Binance testnet adapter skeleton",
    required: true,
    currentStatus: "pass",
    requirement: "Adapter interface and disabled skeleton exist",
    currentState: "Phase 5.7: binanceTestnetAdapterSkeleton.ts — all methods disabled",
    gap: "None — skeleton is in place",
  },
  {
    id: "adapter-real-binance",
    area: "exchange-adapter",
    label: "Real Binance testnet adapter (network calls)",
    required: true,
    currentStatus: "blocked",
    requirement: "Working adapter with real testnet HTTP calls",
    currentState: "No real network adapter — all methods disabled",
    gap: "Requires server-side secret + signing + HTTP client",
  },
  {
    id: "adapter-okx-bybit",
    area: "exchange-adapter",
    label: "OKX/Bybit testnet adapters",
    required: false,
    currentStatus: "not-started",
    requirement: "Adapters for additional exchanges",
    currentState: "Not planned for initial testnet launch",
    gap: "Future scope",
  },
];

/**
 * Build the Phase 6.0 real testnet readiness review.
 *
 * @returns A Phase6ReviewResult with all items evaluated.
 */
export function buildPhase6ReadinessReview(): Phase6ReviewResult {
  const items: Phase6ReviewItem[] = ITEM_DEFS.map((def) => ({
    id: def.id,
    area: def.area,
    label: def.label,
    status: def.currentStatus,
    required: def.required,
    requirement: def.requirement,
    currentState: def.currentState,
    gap: def.gap,
  }));

  const total = items.length;
  const passed = items.filter((i) => i.status === "pass").length;
  const failed = items.filter((i) => i.status === "fail").length;
  const blocked = items.filter((i) => i.status === "blocked").length;
  const notStarted = items.filter((i) => i.status === "not-started").length;
  const requiredBlocked = items.filter((i) => i.required && i.status !== "pass").length;

  const ready = requiredBlocked === 0;

  // Build area summary
  const summary = {} as Record<Phase6ReviewArea, { total: number; passed: number; blocked: number }>;
  for (const item of items) {
    if (!summary[item.area]) summary[item.area] = { total: 0, passed: 0, blocked: 0 };
    summary[item.area].total++;
    if (item.status === "pass") summary[item.area].passed++;
    if (item.status === "blocked") summary[item.area].blocked++;
  }

  return {
    ready,
    total,
    passed,
    failed,
    blocked,
    notStarted,
    requiredBlocked,
    items,
    summary: summary as Record<Phase6ReviewArea, { total: number; passed: number; blocked: number }>,
    source: "phase-6-readiness-review",
  };
}
