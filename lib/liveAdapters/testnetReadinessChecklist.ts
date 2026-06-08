/**
 * Testnet Readiness Checklist — Phase 5.25
 *
 * Evaluates whether the project is ready to enable real testnet trading.
 * This is a pure assessment — no capabilities are enabled.
 *
 * The current phase always returns ready=false.
 */

import type {
  TestnetReadinessCheckItem,
  TestnetReadinessCategory,
  TestnetReadinessStatus,
  TestnetReadinessResult,
} from "./testnetReadinessTypes";

// ─── Item Definitions ────────────────────────────────────

export interface TestnetReadinessItemDef {
  id: string;
  category: TestnetReadinessCategory;
  label: string;
  required: boolean;
  /** The current status for Phase 5.25. */
  currentStatus: TestnetReadinessStatus;
  evidence: string;
  blockingReason?: string;
}

const ITEM_DEFS: TestnetReadinessItemDef[] = [
  // ─── env ──────────────────────────────────────────────
  { id: "env-config", category: "env", label: "Testnet env config (EXCHANGE_ENV, safety flags)", required: true, currentStatus: "pass", evidence: "Phase 5.16: testnetEnvConfig.ts — default disabled, validate rules" },
  { id: "env-integration", category: "env", label: "Env config integration into route handler", required: true, currentStatus: "pass", evidence: "Phase 5.17: blockedResponse reads process.env, adds env metadata" },
  { id: "env-separate-staging", category: "env", label: "Separate staging/testnet deployment environment", required: true, currentStatus: "not-started", evidence: "No staging server configured for testnet deployment" },

  // ─── middleware ────────────────────────────────────────
  { id: "middleware-allowlist", category: "middleware", label: "Middleware testnet mutation allowlist", required: true, currentStatus: "blocked", evidence: "Phase 5.21: /api/testnet not in middleware allowlist", blockingReason: "Middleware must allow POST testnet routes before real testnet" },
  { id: "middleware-readonly", category: "middleware", label: "Middleware READ_ONLY_MODE guard for non-testnet paths", required: true, currentStatus: "pass", evidence: "Phase 4: middleware blocks mutation on non-allowlist paths" },

  // ─── secret ────────────────────────────────────────────
  { id: "secret-policy", category: "secret", label: "Secret access policy defined", required: true, currentStatus: "pass", evidence: "Phase 5.18: testnetSecretPolicy.ts — 6 rules, policy-only" },
  { id: "secret-server-retrieval", category: "secret", label: "Server-side secret retrieval implementation", required: true, currentStatus: "blocked", evidence: "No server-side API Key retrieval implemented yet", blockingReason: "Requires server-side route to decrypt and use API Key" },
  { id: "secret-no-client", category: "secret", label: "Secret never enters client component", required: true, currentStatus: "pass", evidence: "Phase 5.8 design: Secret only in server route handler" },

  // ─── permission ────────────────────────────────────────
  { id: "permission-skeleton", category: "permission", label: "Permission check skeleton", required: true, currentStatus: "pass", evidence: "Phase 5.19: testnetPermissionCheck.ts — all flags disabled" },
  { id: "real-permission-verification", category: "permission", label: "Real permission verification against exchange testnet", required: true, currentStatus: "blocked", evidence: "No real API call to verify key permissions", blockingReason: "Requires real testnet adapter and server-side secret" },

  // ─── signing ────────────────────────────────────────────
  { id: "signing-policy", category: "signing", label: "Signing policy defined", required: true, currentStatus: "pass", evidence: "Phase 5.8 design doc: signing only on server side" },
  { id: "signing-implementation", category: "signing", label: "Signing implementation (server-side)", required: true, currentStatus: "blocked", evidence: "No request signing implemented", blockingReason: "Requires HMAC/ed25519 implementation on server" },

  // ─── adapter ────────────────────────────────────────────
  { id: "adapter-skeleton", category: "adapter", label: "Binance testnet adapter skeleton", required: true, currentStatus: "pass", evidence: "Phase 5.7: binanceTestnetAdapterSkeleton.ts — all methods disabled" },
  { id: "real-binance-adapter", category: "adapter", label: "Real Binance testnet adapter (network calls)", required: true, currentStatus: "blocked", evidence: "No real network adapter implemented", blockingReason: "Requires server-side secret + signing + middleware" },
  { id: "okx-adapter", category: "adapter", label: "OKX testnet adapter", required: false, currentStatus: "not-started", evidence: "Not planned for initial testnet launch" },
  { id: "bybit-adapter", category: "adapter", label: "Bybit testnet adapter", required: false, currentStatus: "not-started", evidence: "Not planned for initial testnet launch" },

  // ─── risk ──────────────────────────────────────────────
  { id: "risk-gate-skeleton", category: "risk", label: "Risk gate skeleton", required: true, currentStatus: "pass", evidence: "Phase 5.10: testnetRouteSecurityGuard.ts — 10 checks" },
  { id: "risk-real-evaluation", category: "risk", label: "Real risk evaluation (balance, exposure)", required: true, currentStatus: "not-started", evidence: "No real-time risk evaluation against testnet account" },
  { id: "kill-switch", category: "risk", label: "Kill Switch for testnet", required: true, currentStatus: "not-started", evidence: "No Kill Switch integration for testnet routes" },

  // ─── audit ──────────────────────────────────────────────
  { id: "audit-skeleton", category: "audit", label: "Audit event skeleton", required: true, currentStatus: "pass", evidence: "Phase 5.14: testnetAuditStore.ts — 5 event types" },
  { id: "audit-persistent", category: "audit", label: "Persistent audit storage", required: true, currentStatus: "blocked", evidence: "In-memory only — no persistent audit log", blockingReason: "Requires database or log file integration" },

  // ─── rollback ───────────────────────────────────────────
  { id: "rollback-plan", category: "rollback", label: "Testnet rollback plan documented", required: true, currentStatus: "blocked", evidence: "No formal rollback plan exists", blockingReason: "Requires documented procedure in REAL_TESTNET_ADAPTER_DESIGN.md" },

  // ─── ops ────────────────────────────────────────────────
  { id: "ops-approval", category: "ops", label: "Operations approval for testnet", required: true, currentStatus: "not-started", evidence: "No ops review conducted for testnet activation" },
  { id: "monitoring", category: "ops", label: "Testnet monitoring and alerting", required: true, currentStatus: "not-started", evidence: "No monitoring for testnet route errors" },

  // ─── already complete items ─────────────────────────────
  { id: "route-skeleton", category: "env", label: "API route skeleton (4 routes, all 403)", required: true, currentStatus: "pass", evidence: "Phase 5.9: app/api/testnet/* returning 403" },
  { id: "guard-skeleton", category: "risk", label: "Security guard skeleton (10 checks)", required: true, currentStatus: "pass", evidence: "Phase 5.10: testnetRouteSecurityGuard.ts" },
  { id: "idempotency-skeleton", category: "env", label: "Idempotency store skeleton", required: true, currentStatus: "pass", evidence: "Phase 5.12: testnetIdempotencyStore.ts" },
  { id: "rate-limit-skeleton", category: "env", label: "Rate limit store skeleton", required: true, currentStatus: "pass", evidence: "Phase 5.13: testnetRateLimitStore.ts" },
  { id: "request-validation", category: "env", label: "Request validation skeleton", required: true, currentStatus: "pass", evidence: "Phase 5.20: testnetRequestValidation.ts" },
  { id: "runtime-smoke-tests", category: "env", label: "Runtime smoke tests (all 403)", required: true, currentStatus: "pass", evidence: "Phase 5.23: runtime smoke tests pass" },
  { id: "no-mainnet-boundary", category: "risk", label: "No-mainnet boundary tests", required: true, currentStatus: "pass", evidence: "Phase 3/5.6: boundary tests block mainnet" },
];

// ─── Build Checklist ─────────────────────────────────────

/**
 * Build the current testnet readiness assessment.
 *
 * @returns A TestnetReadinessResult with all items evaluated.
 */
export function buildTestnetReadinessChecklist(): TestnetReadinessResult {
  const items: TestnetReadinessCheckItem[] = ITEM_DEFS.map((def) => ({
    id: def.id,
    category: def.category,
    label: def.label,
    status: def.currentStatus,
    required: def.required,
    evidence: def.evidence,
    blockingReason: def.blockingReason,
  }));

  const total = items.length;
  const passed = items.filter((i) => i.status === "pass").length;
  const failed = items.filter((i) => i.status === "fail").length;
  const blocked = items.filter((i) => i.status === "blocked").length;
  const notStarted = items.filter((i) => i.status === "not-started").length;
  const requiredBlocked = items.filter((i) => i.required && i.status !== "pass").length;

  const ready = requiredBlocked === 0;

  return {
    ready,
    total,
    passed,
    failed,
    blocked,
    notStarted,
    requiredBlocked,
    items,
    source: "testnet-readiness-checklist",
  };
}

/**
 * Get a summary of the readiness checklist by category.
 *
 * @param result - The readiness result.
 * @returns A record mapping category to item counts.
 */
export function summarizeReadinessByCategory(
  result: TestnetReadinessResult,
): Record<TestnetReadinessCategory, { total: number; passed: number; blocked: number }> {
  const summary: Record<string, { total: number; passed: number; blocked: number }> = {};

  for (const item of result.items) {
    if (!summary[item.category]) {
      summary[item.category] = { total: 0, passed: 0, blocked: 0 };
    }
    summary[item.category].total++;
    if (item.status === "pass") summary[item.category].passed++;
    if (item.status === "blocked") summary[item.category].blocked++;
  }

  return summary as Record<TestnetReadinessCategory, { total: number; passed: number; blocked: number }>;
}
