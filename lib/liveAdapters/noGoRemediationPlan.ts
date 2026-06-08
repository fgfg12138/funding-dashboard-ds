/**
 * NO-GO Remediation Plan — Phase 6.9
 *
 * Defines the remediation roadmap for the 11 blockers identified
 * in the Phase 6.8 Go/No-Go review. Each item specifies what
 * must be done, what is forbidden, and acceptance criteria.
 *
 * Current decision remains NO_GO after this plan.
 * No actual capabilities are enabled.
 */

import type {
  NoGoRemediationItem,
  NoGoPriority,
  NoGoItemStatus,
  NoGoRemediationPlan,
} from "./noGoRemediationTypes";

interface RemediationItemDef {
  id: string;
  domain: string;
  blockerId: string;
  title: string;
  status: NoGoItemStatus;
  priority: NoGoPriority;
  dependsOn: string[];
  allowedPhase: string;
  forbiddenActions: string[];
  acceptanceCriteria: string[];
  riskLevel: "high" | "critical";
}

const ITEM_DEFS: RemediationItemDef[] = [
  {
    id: "remediate-secret-retrieval",
    domain: "Secret Retrieval",
    blockerId: "secret-vault-impl",
    title: "Implement server-side encrypted secret retrieval and AES-256-GCM decryption",
    status: "planned",
    priority: "critical",
    dependsOn: [],
    allowedPhase: "Phase 6.10+",
    forbiddenActions: [
      "Do NOT expose decrypted secret to client component",
      "Do NOT log secret or decrypted key",
      "Do NOT store secret in localStorage or sessionStorage",
      "Do NOT decrypt before vault policy check passes",
    ],
    acceptanceCriteria: [
      "Vault policy check passes before any decryption",
      "Secret is only decrypted in server route handler",
      "No decrypted secret reaches client bundle",
      "Decryption is audited with event type 'secret-access'",
    ],
    riskLevel: "critical",
  },
  {
    id: "remediate-permission-verification",
    domain: "Permission Verification",
    blockerId: "perm-impl",
    title: "Implement real permission verification call to exchange testnet endpoint",
    status: "planned",
    priority: "critical",
    dependsOn: ["remediate-secret-retrieval"],
    allowedPhase: "Phase 6.10+",
    forbiddenActions: [
      "Do NOT call exchange permission endpoint without decrypted secret",
      "Do NOT skip IP whitelist check",
      "Do NOT allow withdraw permission to pass",
      "Do NOT cache permissions longer than 5 minutes",
    ],
    acceptanceCriteria: [
      "Permission verification calls exchange testnet endpoint",
      "canRead=true, canTrade=true (testnet), canWithdraw=false",
      "IP whitelist present and non-empty",
      "Result is cached with 5-minute TTL",
      "Cache is cleared on Kill Switch trigger",
    ],
    riskLevel: "critical",
  },
  {
    id: "remediate-signing",
    domain: "Signing Implementation",
    blockerId: "signing-impl",
    title: "Implement HMAC SHA256 signing for exchange API requests",
    status: "planned",
    priority: "critical",
    dependsOn: ["remediate-secret-retrieval"],
    allowedPhase: "Phase 6.10+",
    forbiddenActions: [
      "Do NOT sign requests without decrypted secret",
      "Do NOT implement signing in client component",
      "Do NOT log signed payload or signature",
      "Do NOT store signature in audit metadata",
    ],
    acceptanceCriteria: [
      "HMAC SHA256 or ed25519 signing implemented server-side",
      "Signing uses decrypted secret from vault provider",
      "Signed payload never enters logs or audit store",
      "Timestamp + recvWindow replay protection enforced",
      "Idempotency checked before signing",
    ],
    riskLevel: "critical",
  },
  {
    id: "remediate-audit-persistence",
    domain: "Persistent Audit Implementation",
    blockerId: "audit-impl",
    title: "Implement persistent audit storage (SQLite for staging, Postgres for production)",
    status: "planned",
    priority: "high",
    dependsOn: [],
    allowedPhase: "Phase 6.10+",
    forbiddenActions: [
      "Do NOT connect to database without schema validation",
      "Do NOT store raw API Secret or signed payload in audit",
      "Do NOT store request body containing secrets",
    ],
    acceptanceCriteria: [
      "SQLite integration for local/staging environments",
      "Postgres schema available for production",
      "audit_events, audit_event_metadata, audit_integrity_checks tables created",
      "Sensitive fields sanitized before storage",
      "Retention policies enforced (local 7d, staging 30d, production 90d)",
    ],
    riskLevel: "high",
  },
  {
    id: "remediate-rollback",
    domain: "Rollback Execution",
    blockerId: "rollback-impl",
    title: "Implement real order cancellation and reconciliation logic",
    status: "planned",
    priority: "high",
    dependsOn: ["remediate-signing", "remediate-adapter"],
    allowedPhase: "Phase 6.10+",
    forbiddenActions: [
      "Do NOT call cancel API without signing implementation",
      "Do NOT cancel orders without audit trail",
      "Do NOT perform reconciliation without operator confirmation",
    ],
    acceptanceCriteria: [
      "Cancel endpoint called with proper signature",
      "Rollback recorded in persistent audit",
      "Reconciliation compares local state with exchange state",
      "Operator notified on all rollback events",
      "Kill Switch triggers automatic rollback for pending orders",
    ],
    riskLevel: "high",
  },
  {
    id: "remediate-middleware",
    domain: "Middleware Testnet Allowlist",
    blockerId: "middleware-allowlist",
    title: "Add /api/testnet/* POST routes to middleware mutation allowlist",
    status: "planned",
    priority: "critical",
    dependsOn: [],
    allowedPhase: "Phase 6.10+",
    forbiddenActions: [
      "Do NOT add /api/testnet to allowlist before all other blockers resolved",
      "Do NOT allow mainnet paths in allowlist",
      "Do NOT remove existing READ_ONLY_MODE guard for non-testnet paths",
    ],
    acceptanceCriteria: [
      "/api/testnet/orders/preview-submit and /api/testnet/orders/cancel added to allowlist",
      "Existing READ_ONLY_MODE guard unchanged for other paths",
      "All other testnet safety checks still enforce 403 for invalid requests",
    ],
    riskLevel: "critical",
  },
  {
    id: "remediate-adapter",
    domain: "Real Binance Testnet Adapter",
    blockerId: "adapter-real",
    title: "Implement real Binance testnet adapter with HTTP calls",
    status: "planned",
    priority: "critical",
    dependsOn: ["remediate-secret-retrieval", "remediate-signing", "remediate-middleware"],
    allowedPhase: "Phase 6.10+",
    forbiddenActions: [
      "Do NOT make real HTTP calls without secret + signing + middleware",
      "Do NOT skip rate limit checks",
      "Do NOT send orders without idempotency key",
    ],
    acceptanceCriteria: [
      "Binance testnet adapter makes real HTTP requests",
      "Requests are signed with HMAC SHA256",
      "Rate limit checked before each request",
      "Idempotency key sent with each order",
      "All requests and responses audited",
    ],
    riskLevel: "critical",
  },
  {
    id: "remediate-kill-switch",
    domain: "Kill Switch Testnet Integration",
    blockerId: "kill-switch-impl",
    title: "Implement global Kill Switch for testnet route blocking",
    status: "planned",
    priority: "high",
    dependsOn: [],
    allowedPhase: "Phase 6.10+",
    forbiddenActions: [
      "Do NOT implement Kill Switch without audit events",
      "Do NOT allow operator to disable Kill Switch without audit trail",
    ],
    acceptanceCriteria: [
      "Kill Switch immediately blocks all new testnet orders",
      "Kill Switch triggers cancellation of all pending orders",
      "Kill Switch event recorded in persistent audit",
      "Operator notified on Kill Switch activation",
      "Kill Switch cannot be disabled without explicit confirmation",
    ],
    riskLevel: "high",
  },
  {
    id: "remediate-ops-approval",
    domain: "Ops Approval",
    blockerId: "ops-approval",
    title: "Obtain formal operations/stakeholder approval for testnet activation",
    status: "not-started",
    priority: "high",
    dependsOn: [],
    allowedPhase: "Phase 6.10+",
    forbiddenActions: [
      "Do NOT activate real testnet without formal ops sign-off",
      "Do NOT bypass approval process for any reason",
    ],
    acceptanceCriteria: [
      "Formal ops review completed",
      "Stakeholder sign-off documented",
      "Emergency contact list defined",
      "Runbook for testnet operations documented",
    ],
    riskLevel: "high",
  },
  {
    id: "remediate-rate-limit-config",
    domain: "Rate Limit Exchange Config",
    blockerId: "rate-limit-exchange",
    title: "Configure exchange-specific rate limits matching real testnet API limits",
    status: "planned",
    priority: "medium",
    dependsOn: ["remediate-adapter"],
    allowedPhase: "Phase 6.10+",
    forbiddenActions: [
      "Do NOT apply exchange rate limits without validating against real testnet",
      "Do NOT set rate limits higher than exchange allows",
    ],
    acceptanceCriteria: [
      "Binance testnet rate limits researched and configured",
      "Rate limit exceeded returns proper error response",
      "Rate limit counters reset per exchange documentation",
    ],
    riskLevel: "high",
  },
  {
    id: "remediate-idempotency-config",
    domain: "Idempotency Exchange Integration",
    blockerId: "idempotency-exchange",
    title: "Configure exchange-level idempotency key generation and handling",
    status: "planned",
    priority: "medium",
    dependsOn: ["remediate-adapter"],
    allowedPhase: "Phase 6.10+",
    forbiddenActions: [
      "Do NOT send duplicate orders without idempotency check",
      "Do NOT reuse idempotency keys across different requests",
    ],
    acceptanceCriteria: [
      "Idempotency key generated per exchange spec",
      "Duplicate key returns cached response",
      "Idempotency cache has appropriate TTL",
    ],
    riskLevel: "high",
  },
];

/**
 * Build the NO-GO remediation plan.
 *
 * @returns A NoGoRemediationPlan with 11 remediation items.
 */
export function buildNoGoRemediationPlan(): NoGoRemediationPlan {
  const items: NoGoRemediationItem[] = ITEM_DEFS.map((def) => ({
    id: def.id,
    domain: def.domain,
    blockerId: def.blockerId,
    title: def.title,
    status: def.status,
    priority: def.priority,
    dependsOn: def.dependsOn,
    allowedPhase: def.allowedPhase,
    forbiddenActions: def.forbiddenActions,
    acceptanceCriteria: def.acceptanceCriteria,
    riskLevel: def.riskLevel,
  }));

  const total = items.length;
  const critical = items.filter((i) => i.priority === "critical").length;
  const high = items.filter((i) => i.priority === "high").length;
  const medium = items.filter((i) => i.priority === "medium").length;

  return {
    decision: "NO_GO",
    readyAfterPlan: false,
    total,
    critical,
    high,
    medium,
    items,
    source: "phase-6-9-no-go-remediation-plan",
  };
}
