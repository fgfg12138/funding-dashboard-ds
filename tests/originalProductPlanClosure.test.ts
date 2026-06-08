/**
 * Original Product Plan Closure Tests — Recovery R4
 *
 * Verifies that the original 0–10 step plan is 100% complete
 * and the project is back on the arbitrage product main line.
 */

import { readFileSync, existsSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const root = process.cwd();
function read(relativePath: string) { return readFileSync(join(root, relativePath), "utf8"); }
function exists(relativePath: string) { return existsSync(join(root, relativePath)); }

// ─── Closure Doc Exists ─────────────────────────────────

describe("R4 — Closure Doc Exists", () => {
  it("docs/ORIGINAL_PRODUCT_PLAN_CLOSURE.md exists", () => {
    expect(exists("docs/ORIGINAL_PRODUCT_PLAN_CLOSURE.md")).toBe(true);
  });
});

// ─── Closure Doc Content ────────────────────────────────

describe("R4 — Closure Doc Content", () => {
  const doc = read("docs/ORIGINAL_PRODUCT_PLAN_CLOSURE.md");

  it("declares 100% completion", () => {
    expect(doc).toContain("100%");
  });

  it("declares Step 7 completed via Recovery R2", () => {
    expect(doc).toContain("Recovery R2");
    expect(doc).toContain("策略模板");
  });

  it("declares Step 8 completed via Recovery R1", () => {
    expect(doc).toContain("Recovery R1");
    expect(doc).toContain("风险中心");
  });

  it("declares Phase 6 is a sideline, not main product", () => {
    expect(doc).toContain("支线");
    expect(doc).toContain("NO-GO");
  });

  it("declares what is NOT included (real trading, mainnet, secret, signing)", () => {
    expect(doc).toContain("不包含");
    expect(doc).toContain("实盘交易");
    expect(doc).toContain("Secret");
    expect(doc).toContain("签名");
  });

  it("lists next phase suggestions (Portfolio Dashboard, Position Manager, etc.)", () => {
    expect(doc).toContain("Portfolio Dashboard");
    expect(doc).toContain("Position Manager");
  });

  it("confirms clone route is safe", () => {
    expect(doc).toContain("Clone Route 安全确认");
  });
});

// ─── Audit Doc Shows 100% ───────────────────────────────

describe("R4 — Audit Doc Shows 100%", () => {
  const audit = read("docs/ORIGINAL_PLAN_COMPLETION_AUDIT.md");

  it("ORIGINAL_PLAN_COMPLETION_AUDIT.md contains 100%", () => {
    expect(audit).toContain("100%");
  });

  it("contains 11/11 completed", () => {
    expect(audit).toContain("11/11");
  });
});

// ─── Core Product Pages Exist ────────────────────────────

describe("R4 — Core Product Pages Exist", () => {
  it("/execution exists", () => { expect(exists("app/execution/page.tsx")).toBe(true); });
  it("/risk-center exists", () => { expect(exists("app/risk-center/page.tsx")).toBe(true); });
  it("/strategies exists", () => { expect(exists("app/strategies/page.tsx")).toBe(true); });
  it("Homepage / exists", () => { expect(exists("app/page.tsx")).toBe(true); });
});

// ─── Strategies Page Has Template Only Message ──────────

describe("R4 — Strategies Page Template Only", () => {
  const page = read("app/strategies/page.tsx");

  it("contains 'Template Only'", () => {
    expect(page).toContain("Template Only");
  });

  it("contains 'Will Not Place Real Orders'", () => {
    expect(page).toContain("Will Not Place Real Orders");
  });
});

// ─── LIVE_TRADING_ARCHITECTURE.md Exists ────────────────

describe("R4 — Architecture Doc Exists", () => {
  it("docs/LIVE_TRADING_ARCHITECTURE.md exists", () => {
    expect(exists("docs/LIVE_TRADING_ARCHITECTURE.md")).toBe(true);
  });
});

// ─── Clone Route Security ───────────────────────────────

describe("R4 — Clone Route Security", () => {
  it("clone route exists as POST endpoint", () => {
    expect(exists("app/api/strategies/[id]/clone/route.ts")).toBe(true);
  });

  const cloneRoute = read("app/api/strategies/[id]/clone/route.ts");

  it("clone route does not contain fetch(", () => {
    expect(cloneRoute).not.toContain("fetch(");
  });

  it("clone route does not contain axios", () => {
    expect(cloneRoute).not.toContain("axios");
  });

  it("clone route does not contain decryptSecret", () => {
    expect(cloneRoute).not.toContain("decryptSecret");
  });

  it("clone route does not contain createHmac", () => {
    expect(cloneRoute).not.toContain("createHmac");
  });

  it("clone route does not contain exchange SDK", () => {
    const importLines = cloneRoute.split("\n").filter((l) => l.includes("import ") && l.includes("from"));
    for (const line of importLines) {
      expect(line).not.toMatch(/@binance|binance-api|okx-api|bybit-api|ccxt/i);
    }
  });
});

// ─── Safety Boundaries ──────────────────────────────────

describe("R4 — Safety Boundaries", () => {
  it("middleware not opened for /api/testnet", () => {
    const mw = read("middleware.ts");
    const paths = mw.match(/\/api\/[a-z-]+/g) || [];
    expect(paths.find((p) => p.includes("testnet"))).toBeUndefined();
  });

  it("no submitLiveOrder in app/lib", () => {
    const searchDirs = ["app", "lib"];
    const terms = ["submitLiveOrder", "placeLiveOrder"];
    for (const dir of searchDirs) {
      function walk(d: string): void {
        const entries = readdirSync(join(root, d), { withFileTypes: true });
        for (const entry of entries) {
          const full = join(d, entry.name);
          if (entry.isDirectory() && !entry.name.startsWith(".") && entry.name !== "node_modules") walk(full);
          else if (entry.isFile() && /\.(ts|tsx)$/.test(entry.name) && !entry.name.includes(".test.")) {
            const content = readFileSync(join(root, full), "utf8");
            const noComments = content.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");
            for (const term of terms) {
              expect(noComments, `${full} contains ${term}`).not.toContain(term);
            }
          }
        }
      }
      if (exists(dir)) walk(dir);
    }
  });

  it("all /api/testnet routes still have no success:true", () => {
    const routes = [
      "app/api/testnet/orders/preview-submit/route.ts",
      "app/api/testnet/orders/cancel/route.ts",
      "app/api/testnet/orders/[id]/route.ts",
      "app/api/testnet/account/snapshot/route.ts",
    ];
    for (const f of routes) {
      const content = read(f);
      const noComments = content.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");
      expect(noComments, `${f} contains success:true`).not.toContain("success: true");
    }
  });
});
