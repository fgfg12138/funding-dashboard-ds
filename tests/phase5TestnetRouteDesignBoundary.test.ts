/**
 * Phase 5.8 Testnet Server Route Design Boundary Tests
 *
 * Verifies Phase 5.8 remains in design-only mode:
 * - No app/api/testnet directory
 * - No middleware change
 * - testnetRouteTypes.ts contains only types
 * - No fetch/axios/crypto/decryptSecret/HMAC in route types
 * - Docs state server-side only, no client secret, no route implementation
 */

import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const root = process.cwd();

function read(relativePath: string) {
  return readFileSync(join(root, relativePath), "utf8");
}

const typesContent = (() => {
  try {
    return read("lib/liveAdapters/testnetRouteTypes.ts");
  } catch {
    return null;
  }
})();

// ─── No Route Directory ──────────────────────────────────

describe("Phase 5.8 — No API Route Implementation", () => {
  it("app/api/testnet directory does not exist", () => {
    expect(existsSync(join(root, "app/api/testnet"))).toBe(false);
  });

  it("middleware has not opened /api/testnet route", () => {
    const middleware = read("middleware.ts");
    const allowlistMatch = middleware.match(/\/api\/[a-z-]+/g);
    if (allowlistMatch) {
      const testnetRoute = allowlistMatch.find((p) => p.includes("testnet"));
      expect(testnetRoute, "middleware allowlist contains /api/testnet").toBeUndefined();
    }
  });
});

// ─── Static Analysis of Route Types ──────────────────────

describe("Phase 5.8 — Route Types Static Analysis", () => {
  it("testnetRouteTypes.ts exists and contains only types/interfaces", () => {
    expect(typesContent).not.toBeNull();
    // Should have type/interface exports
    expect(typesContent).toContain("export type");
    // No function implementations
    const fnLines = typesContent!.split("\n").filter((l) => /^(export\s+)?(async\s+)?function\s/.test(l.trim()));
    expect(fnLines, "No function implementations allowed").toEqual([]);
  });

  it("does not contain fetch(", () => {
    const noComments = typesContent!.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");
    expect(noComments).not.toContain("fetch(");
  });

  it("does not contain axios", () => {
    const noComments = typesContent!.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");
    expect(noComments).not.toContain("axios");
  });

  it("does not contain decryptSecret / importMasterKey", () => {
    expect(typesContent).not.toContain("decryptSecret");
    expect(typesContent).not.toContain("importMasterKey");
  });

  it("does not contain createHmac / HMAC / signature implementation", () => {
    expect(typesContent).not.toContain("createHmac");
    expect(typesContent).not.toContain("crypto.subtle.sign");
    expect(typesContent).not.toContain("Hmac");
  });

  it("does not import crypto or apiKeyStore", () => {
    const importLines = typesContent!.split("\n").filter((l) => l.includes("from "));
    for (const line of importLines) {
      expect(line).not.toMatch(/crypto|apiKeyStore|decrypt/);
    }
  });

  it("does not import fetch-like modules", () => {
    const importLines = typesContent!.split("\n").filter((l) => l.includes("from "));
    for (const line of importLines) {
      expect(line).not.toMatch(/node:http|axios|node-fetch|cross-fetch/);
    }
  });
});

// ─── Required Types Exist ────────────────────────────────

describe("Phase 5.8 — Required Types Present", () => {
  it("defines TestnetRouteName", () => {
    expect(typesContent).toContain("TestnetRouteName");
  });
  it("defines TestnetRouteMethod", () => {
    expect(typesContent).toContain("TestnetRouteMethod");
  });
  it("defines TestnetRouteRequestBase", () => {
    expect(typesContent).toContain("TestnetRouteRequestBase");
  });
  it("defines TestnetSubmitOrderRequest", () => {
    expect(typesContent).toContain("TestnetSubmitOrderRequest");
  });
  it("defines TestnetCancelOrderRequest", () => {
    expect(typesContent).toContain("TestnetCancelOrderRequest");
  });
  it("defines TestnetOrderStatusRequest", () => {
    expect(typesContent).toContain("TestnetOrderStatusRequest");
  });
  it("defines TestnetAccountSnapshotRequest", () => {
    expect(typesContent).toContain("TestnetAccountSnapshotRequest");
  });
  it("defines TestnetRouteResponse", () => {
    expect(typesContent).toContain("TestnetRouteResponse");
  });
  it("defines TestnetRouteErrorCode", () => {
    expect(typesContent).toContain("TestnetRouteErrorCode");
  });
  it("defines IdempotencyPolicy", () => {
    expect(typesContent).toContain("IdempotencyPolicy");
  });
  it("defines RateLimitPolicy", () => {
    expect(typesContent).toContain("RateLimitPolicy");
  });
  it("defines TestnetRouteSecurityChecklist", () => {
    expect(typesContent).toContain("TestnetRouteSecurityChecklist");
  });
});

// ─── Docs Assertions ─────────────────────────────────────

describe("Phase 5.8 — Docs Assertions", () => {
  const doc = read("docs/TESTNET_SERVER_ROUTE_DESIGN.md");

  it("states server-side only", () => {
    expect(doc).toContain("Server-Side");
  });

  it("states no client secret", () => {
    expect(doc).toContain("Secret 不能进入");
    expect(doc).toContain("Client Component");
  });

  it("states no route implementation in Phase 5.8", () => {
    expect(doc).toContain("No route implementation in Phase 5.8");
  });

  it("states no middleware change", () => {
    expect(doc).toContain("No middleware changes");
  });

  it("documents all 4 routes", () => {
    expect(doc).toContain("orders/preview-submit");
    expect(doc).toContain("orders/cancel");
    expect(doc).toContain("orders/:id");
    expect(doc).toContain("account/snapshot");
  });

  it("documents security checklist (10 items)", () => {
    const checklistItems = (doc.match(/^\| \d+ \|/gm) || []).length;
    expect(checklistItems).toBeGreaterThanOrEqual(10);
  });

  it("documents idempotency strategy", () => {
    expect(doc).toContain("Idempotency");
    expect(doc).toContain("dedup");
  });

  it("documents rate limit strategy", () => {
    expect(doc).toContain("Rate Limit");
    expect(doc).toContain("Per Exchange");
  });

  it("documents audit events", () => {
    expect(doc).toContain("route_request_received");
    expect(doc).toContain("route_request_blocked");
    expect(doc).toContain("route_testnet_order_submitted");
    expect(doc).toContain("route_testnet_order_failed");
  });

  it("documents failure handling", () => {
    expect(doc).toContain("Timeout");
    expect(doc).toContain("Partial Fill");
    expect(doc).toContain("Rejected by Exchange");
  });
});
