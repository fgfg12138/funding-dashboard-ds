/**
 * Phase 5 Design Boundary Tests
 *
 * Verifies that Phase 5 remains in design-only mode:
 * - No TradingAdapter implementation
 * - No real order placement functions
 * - No mainnet adapter files
 * - Environment defaults are safe
 * - Queue statuses are unchanged
 */

import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const root = process.cwd();

function read(relativePath: string) {
  return readFileSync(join(root, relativePath), "utf8");
}

/** Collect every `.ts` and `.tsx` file in `lib/` excluding test files. */
function getRunFiles(dir: string): { file: string; content: string }[] {
  function walk(d: string): string[] {
    const files: string[] = [];
    for (const entry of readdirSync(d, { withFileTypes: true })) {
      const full = join(d, entry.name);
      if (entry.isDirectory() && entry.name !== "node_modules" && !entry.name.startsWith(".")) {
        files.push(...walk(full));
      } else if (entry.isFile() && /\.(ts|tsx)$/.test(entry.name) && !entry.name.includes(".test.")) {
        files.push(full);
      }
    }
    return files;
  }
  return walk(join(root, dir)).map((f) => ({ file: f, content: readFileSync(f, "utf8") }));
}

// ─── TradingAdapter Types Only ──────────────────────────

describe("Phase 5 Design — TradingAdapter Types", () => {
  it("tradingAdapterTypes.ts contains only type/interface declarations, no implementations", () => {
    const content = read("lib/liveAdapters/tradingAdapterTypes.ts");
    // Must be type/interface only
    expect(content).toContain("interface TradingAdapter");
    expect(content).toContain("type TradingOrderRequest");
    // Must NOT contain function implementations
    const lines = content.split("\n").filter((l) => l.trim().startsWith("export function") || l.trim().startsWith("function "));
    expect(lines).toEqual([]);
  });

  it("no submitSandboxOrder implementation in lib/ (except mock adapter)", () => {
    // Check it only appears in the types file or the mock adapter
    const allLib = getRunFiles("lib");
    const found = allLib.filter(
      ({ file, content }) =>
        content.includes("submitSandboxOrder") &&
        !file.includes("tradingAdapterTypes") &&
        !file.includes("mockSandboxTradingAdapter"),
    );
    expect(found.map((f) => f.file), "submitSandboxOrder implementation found outside types/mock").toEqual([]);
  });

  it("no submitLiveOrder / placeOrder / createOrder implementation in lib/", () => {
    const allLib = getRunFiles("lib");
    // submitLiveOrder
    const liveOrders = allLib.filter(({ file, content }) => content.includes("submitLiveOrder"));
    expect(liveOrders.map((f) => f.file)).toEqual([]);
    // placeOrder (outside test files — already covered by phase3Boundary)
    // createOrder (outside test files — already covered)
  });
});

// ─── No Mainnet Adapter Files ──────────────────────────

describe("Phase 5 Design — No Mainnet Adapter Files", () => {
  it("no mainnet adapter files exist", () => {
    const libFiles: string[] = [];
    function walk(d: string): void {
      for (const entry of readdirSync(d, { withFileTypes: true })) {
        const full = join(d, entry.name);
        if (entry.isDirectory() && entry.name !== "node_modules" && !entry.name.startsWith(".")) {
          walk(full);
        } else if (entry.isFile()) {
          libFiles.push(full);
        }
      }
    }
    walk(join(root, "lib"));
    for (const f of libFiles) {
      const name = f.replace(/\\/g, "/");
      expect(name, `mainnet adapter file found: ${name}`).not.toMatch(/mainnetAdapter/i);
    }
  });
});

// ─── Environment Defaults ──────────────────────────────

describe("Phase 5 Design — Environment Defaults", () => {
  it("LIVE_TRADING_ENABLED is not default true in docs", () => {
    const doc = read("docs/SANDBOX_TESTNET_PLAN.md");
    // The doc must clearly state default is false
    expect(doc).toContain("LIVE_TRADING_ENABLED=false");
    // And the doc must state the default is disabled
    expect(doc).toContain("EXCHANGE_ENV=disabled");
  });

  it("ALLOW_MAINNET_TRADING is not default true in docs", () => {
    const doc = read("docs/SANDBOX_TESTNET_PLAN.md");
    expect(doc).toContain("ALLOW_MAINNET_TRADING=false");
  });

  it("trading environment type defaults to disabled", () => {
    // This is a compile-time check — the type must include "disabled"
    const content = read("lib/liveAdapters/tradingAdapterTypes.ts");
    expect(content).toContain('"disabled"');
    // And the first option should be "disabled"
    const firstOpt = content.match(/"disabled" \| "(sandbox|testnet)"/);
    expect(firstOpt).not.toBeNull();
  });
});

// ─── Queue Status Unchanged ────────────────────────────

describe("Phase 5 Design — Queue Status Unchanged", () => {
  it("executionQueueTypes still only has queued-preview-only / cancelled / expired", () => {
    const content = read("lib/orders/executionQueueTypes.ts");
    expect(content).toContain("queued-preview-only");
    expect(content).toContain("cancelled");
    expect(content).toContain("expired");
    // No sandbox statuses
    expect(content).not.toContain("sandbox-submitted");
    expect(content).not.toContain("sandbox-filled");
  });
});

// ─── Docs Must Prohibit Default Mainnet ─────────────────

describe("Phase 5 Design — Docs Prohibit Default Mainnet", () => {
  it("LIVE_ADAPTER_DESIGN.md explicitly states no live order capability", () => {
    const content = read("docs/LIVE_ADAPTER_DESIGN.md");
    expect(content).toContain("不包含任何实盘下单实现");
    expect(content).toContain("当前项目仍无实盘交易能力");
  });

  it("SANDBOX_TESTNET_PLAN.md prohibits default mainnet", () => {
    const content = read("docs/SANDBOX_TESTNET_PLAN.md");
    expect(content).toContain("禁止默认主网");
    expect(content).toContain("LIVE_TRADING_ENABLED=false");
  });
});

// ─── No fetch / axios / SDK in liveAdapters ────────────

describe("Phase 5 Design — No Network Calls in liveAdapters", () => {
  it("lib/liveAdapters does not contain fetch() outside comments", () => {
    const files = getRunFiles("lib/liveAdapters");
    for (const { file, content } of files) {
      const noComments = content.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");
      expect(noComments, `fetch() found in ${file}`).not.toContain("fetch(");
    }
  });
});
