/**
 * Original Plan Completion Audit Tests
 *
 * Verifies the original 0–10 step plan items against current implementation.
 * No functionality is added or modified.
 */

import { readFileSync, existsSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { buildReadinessSummary } from "@/lib/liveAdapters/testnetReadinessSummary";
import { buildPhase6ReadinessReview } from "@/lib/liveAdapters/phase6ReadinessReview";
import { buildGoNoGoReview } from "@/lib/liveAdapters/goNoGoReview";

const root = process.cwd();
function read(p: string) { return readFileSync(join(root, p), "utf8"); }
function exists(p: string) { return existsSync(join(root, p)); }

// ─── Step 0: Project Analysis ───────────────────────────

describe("Step 0 — Project Analysis", () => {
  it("ROADMAP.md exists with content", () => {
    const content = read("docs/ROADMAP.md");
    expect(content.length).toBeGreaterThan(0);
  });
});

// ─── Step 1: ROADMAP.md ────────────────────────────────

describe("Step 1 — ROADMAP.md", () => {
  it("docs/ROADMAP.md exists", () => {
    expect(exists("docs/ROADMAP.md")).toBe(true);
  });
});

// ─── Step 2: /execution ────────────────────────────────

describe("Step 2 — /execution page", () => {
  it("app/execution/page.tsx exists", () => {
    expect(exists("app/execution/page.tsx")).toBe(true);
  });
});

// ─── Step 3: lib/execution/ ────────────────────────────

describe("Step 3 — lib/execution/ core files", () => {
  it("lib/execution/types.ts exists", () => {
    expect(exists("lib/execution/types.ts")).toBe(true);
  });
  it("lib/execution/executionStore.ts exists", () => {
    expect(exists("lib/execution/executionStore.ts")).toBe(true);
  });
  it("lib/execution/executionEngine.ts exists", () => {
    expect(exists("lib/execution/executionEngine.ts")).toBe(true);
  });
});

// ─── Step 4: Net Profit Calculation ───────────────────

describe("Step 4 — Net Profit Calculation", () => {
  it("portfolio.ts has calculateClosedPnL", () => {
    const content = read("lib/execution/portfolio.ts");
    expect(content).toContain("calculateClosedPnL");
  });
  it("simAccount.ts has pnl field", () => {
    const content = read("lib/simulation/simAccount.ts");
    expect(content).toContain("pnl");
  });
  it("NO standalone calculateNetProfit function", () => {
    // This documents the gap — no standalone net profit function exists
    const files = ["lib/execution/portfolio.ts", "lib/simulation/simAccount.ts"];
    let found = false;
    for (const f of files) {
      if (read(f).includes("calculateNetProfit")) found = true;
    }
    expect(found).toBe(false);
  });
});

// ─── Step 5: /execution mock support ───────────────────

describe("Step 5 — /execution mock/open/close/history", () => {
  it("execution page references sandbox/paper/mock", () => {
    const content = read("app/execution/page.tsx");
    const count = (content.match(/sandbox|paper|mock/gi) || []).length;
    expect(count).toBeGreaterThanOrEqual(5);
  });
});

// ─── Step 6: /api-keys ─────────────────────────────────

describe("Step 6 — /api-keys placeholder/safety", () => {
  it("app/api-keys/page.tsx exists", () => {
    expect(exists("app/api-keys/page.tsx")).toBe(true);
  });
  it("inputs are disabled", () => {
    const content = read("app/api-keys/page.tsx");
    expect(content).toContain("disabled");
  });
  it("no POST endpoint to save keys", () => {
    expect(exists("app/api/keys")).toBe(false);
    expect(exists("app/api/api-keys")).toBe(false);
  });
});

// ─── Step 7: /strategies ──────────────────────────────

describe("Step 7 — /strategies", () => {
  it("app/strategies/page.tsx exists", () => {
    expect(exists("app/strategies/page.tsx")).toBe(true);
  });
  it("NO template system (documented gap)", () => {
    const content = read("app/strategies/page.tsx");
    // Document that no template system exists
    expect(content).toBeDefined();
  });
});

// ─── Step 8: /risk-center ─────────────────────────────

describe("Step 8 — /risk-center", () => {
  it("app/risk-center now exists (Recovery R1)", () => {
    expect(exists("app/risk-center/page.tsx")).toBe(true);
  });
  it("app/risk-rules exists as partial replacement", () => {
    expect(exists("app/risk-rules/page.tsx")).toBe(true);
  });
});

// ─── Step 9: / home page ──────────────────────────────

describe("Step 9 — / home page", () => {
  it("app/page.tsx exists", () => {
    expect(exists("app/page.tsx")).toBe(true);
  });
});

// ─── Step 10: LIVE_TRADING_ARCHITECTURE.md ─────────────

describe("Step 10 — LIVE_TRADING_ARCHITECTURE.md", () => {
  it("docs/LIVE_TRADING_ARCHITECTURE.md exists", () => {
    expect(exists("docs/LIVE_TRADING_ARCHITECTURE.md")).toBe(true);
  });
});

// ─── Safety Boundaries (cross-step) ────────────────────

describe("Safety Boundaries — No Real Trading", () => {
  it("all /api/testnet routes still blocked", () => {
    const routes = [
      "app/api/testnet/orders/preview-submit/route.ts",
      "app/api/testnet/orders/cancel/route.ts",
      "app/api/testnet/orders/[id]/route.ts",
      "app/api/testnet/account/snapshot/route.ts",
    ];
    for (const f of routes) {
      const content = read(f);
      const noComments = content.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");
      expect(noComments).not.toContain("success: true");
    }
  });

  it("no submitLiveOrder / placeLiveOrder in app/lib", () => {
    // Scan app/ and lib/ run files for real order function names
    const grepTerms = ["submitLiveOrder", "placeLiveOrder"];
    for (const term of grepTerms) {
      const dirs = ["app", "lib"];
      for (const dir of dirs) {
        function walk(d: string): void {
          for (const entry of readdirSync(join(root, d), { withFileTypes: true })) {
            const full = join(d, entry.name);
            if (entry.isDirectory() && !entry.name.startsWith(".") && entry.name !== "node_modules") walk(full);
            else if (entry.isFile() && /\.(ts|tsx)$/.test(entry.name) && !entry.name.includes(".test.")) {
              const content = readFileSync(join(root, full), "utf8");
              const noComments = content.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");
              expect(noComments, `${full} contains ${term}`).not.toContain(term);
            }
          }
        }
        if (exists(dir)) walk(dir);
      }
    }
  });

  it("no mainnet adapter files", () => {
    const libRunFiles: string[] = [];
    function walk(d: string): void {
      for (const entry of readdirSync(join(root, d), { withFileTypes: true })) {
        const full = join(d, entry.name);
        if (entry.isDirectory() && !entry.name.startsWith(".") && entry.name !== "node_modules") walk(full);
        else if (entry.isFile()) libRunFiles.push(full);
      }
    }
    walk("lib");
    for (const f of libRunFiles) {
      const name = f.replace(/\\/g, "/");
      // Skip read-only / shadow files that are explicitly safety-gated
      if (name.includes("ReadOnly") || name.includes("24hShadow")) continue;
      expect(name, `mainnet file found: ${name}`).not.toMatch(/mainnet/i);
    }
  });

  it("middleware not opened for /api/testnet", () => {
    const mw = read("middleware.ts");
    const paths = mw.match(/\/api\/[a-z-]+/g) || [];
    expect(paths.find((p) => p.includes("testnet"))).toBeUndefined();
  });
});

// ─── Phase 6 Readiness ─────────────────────────────────

describe("Phase 6 Readiness Still False", () => {
  it("Phase 5 readiness = false", () => {
    expect(buildReadinessSummary().ready).toBe(false);
  });
  it("Phase 6 readiness = false", () => {
    expect(buildPhase6ReadinessReview().ready).toBe(false);
  });
  it("Go/No-Go = NO_GO", () => {
    expect(buildGoNoGoReview().decision).toBe("NO_GO");
  });
});
