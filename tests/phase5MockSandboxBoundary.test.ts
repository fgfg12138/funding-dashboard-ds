/**
 * Phase 5 Mock Sandbox Boundary Tests
 *
 * Verifies Phase 5 mock sandbox infrastructure maintains safe boundaries:
 * - No real testnet network requests
 * - No mainnet adapter files
 * - No secret decryption in liveAdapters
 * - Queue / lifecycle statuses are strictly isolated
 * - Page text clearly states mock-only
 */

import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const root = process.cwd();

function read(relativePath: string) {
  return readFileSync(join(root, relativePath), "utf8");
}

/** Collect run files (excluding tests) from a directory. */
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

// ─── No Real Network Requests ──────────────────────────

describe("Phase 5 Boundary — No Real Network Requests", () => {
  const liveAdapterFiles = getRunFiles("lib/liveAdapters");

  it("liveAdapters run code does not contain fetch(", () => {
    for (const { file, content } of liveAdapterFiles) {
      const noComments = content.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");
      expect(noComments, `fetch( found in ${file}`).not.toContain("fetch(");
    }
  });

  it("liveAdapters run code does not contain axios", () => {
    for (const { file, content } of liveAdapterFiles) {
      const noComments = content.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");
      expect(noComments, `axios found in ${file}`).not.toContain("axios");
    }
  });

  it("liveAdapters run code does not import exchange SDKs", () => {
    for (const { file, content } of liveAdapterFiles) {
      const noComments = content.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");
      const importPatterns = ["binance", "okx", "bybit"].map((ex) => `from.*${ex}`);
      for (const pattern of importPatterns) {
        const importLines = noComments.split("\n").filter((l) => new RegExp(pattern, "i").test(l));
        for (const line of importLines) {
          expect(line, `SDK import found in ${file}: ${line.trim()}`).not.toMatch(/@binance|binance-api|ccxt|okx-api|bybit-api/i);
        }
      }
    }
  });
});

// ─── No Mainnet Adapter Files ──────────────────────────

describe("Phase 5 Boundary — No Mainnet Adapter Files", () => {
  it("no mainnet adapter files exist in lib/", () => {
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
      // Skip read-only / shadow files that are explicitly safety-gated
      if (name.includes("ReadOnly") || name.includes("24hShadow") || name.includes("7DayShadow") || name.includes("DryRun") || name.includes("SemiAutoLive") || name.includes("FilledOrder") || name.includes("PositionLifecycle") || name.includes("FundingValidation") || name.includes("PostTrade") || name.includes("CapabilityMatrix") || name.includes("ExecutionPreflight") || name.includes("TestnetWaiver")) continue;
      expect(name, `mainnet file found: ${name}`).not.toMatch(/mainnet/i);
    }
  });
});

// ─── Mock Source Verification ──────────────────────────

describe("Phase 5 Boundary — Mock Source", () => {
  const mockContent = read("lib/liveAdapters/mockSandboxTradingAdapter.ts");
  const safetyContent = read("lib/liveAdapters/sandboxSafetyGate.ts");
  const lifecycleTypes = read("lib/liveAdapters/sandboxOrderLifecycleTypes.ts");
  const lifecycleStore = read("lib/liveAdapters/sandboxOrderLifecycleStore.ts");

  it("mockSandboxTradingAdapter marks source as mock-sandbox", () => {
    const sources = mockContent.match(/source:\s*["'](.*?)["']/g);
    expect(sources).not.toBeNull();
    for (const s of sources!) {
      expect(s).toContain("mock-sandbox");
    }
  });

  it("lifecycle types default source to mock-sandbox", () => {
    expect(lifecycleTypes).toContain('"mock-sandbox"');
  });

  it("lifecycle store creates records with mock-sandbox source", () => {
    expect(lifecycleStore).toContain('"mock-sandbox"');
  });

  it("safety gate uses disabled environment by default", () => {
    expect(safetyContent).toContain('"disabled"');
    expect(safetyContent).toContain("liveTradingEnabled: false");
    expect(safetyContent).toContain("allowMainnetTrading: false");
  });
});

// ─── Queue / Lifecycle Status Isolation ────────────────

describe("Phase 5 Boundary — Status Isolation", () => {
  it("executionQueueTypes does not contain sandbox statuses", () => {
    const content = read("lib/orders/executionQueueTypes.ts");
    expect(content).not.toContain("sandbox-submitted");
    expect(content).not.toContain("sandbox-filled");
    expect(content).not.toContain("sandbox-cancelled");
    expect(content).not.toContain("sandbox-failed");
    expect(content).not.toContain("sandbox-ready");
  });

  it("tradingAdapterTypes does not contain queue statuses", () => {
    const content = read("lib/liveAdapters/tradingAdapterTypes.ts");
    expect(content).not.toContain("queued-preview-only");
  });
});

// ─── Page Text Verification ────────────────────────────

describe("Phase 5 Boundary — Page Text", () => {
  it("sandbox-lifecycle page states mock data", () => {
    const content = read("app/sandbox-lifecycle/page.tsx");
    expect(content).toContain("Mock");
    expect(content).toContain("不代表真实");
  });
});

// ─── No Secret Decryption in liveAdapters ───────────────

describe("Phase 5 Boundary — No Secret Decryption", () => {
  const liveAdapterFiles = getRunFiles("lib/liveAdapters");

  it("liveAdapters do not call decryptSecret", () => {
    for (const { file, content } of liveAdapterFiles) {
      expect(content, `decryptSecret found in ${file}`).not.toContain("decryptSecret");
    }
  });

  it("liveAdapters do not call importMasterKey", () => {
    for (const { file, content } of liveAdapterFiles) {
      expect(content, `importMasterKey found in ${file}`).not.toContain("importMasterKey");
    }
  });
});

// ─── Docs Assertions ───────────────────────────────────

describe("Phase 5 Boundary — Docs", () => {
  it("SANDBOX_TESTNET_PLAN.md prohibits default mainnet", () => {
    const content = read("docs/SANDBOX_TESTNET_PLAN.md");
    expect(content).toContain("禁止默认主网");
  });

  it("PHASE_5_MOCK_SANDBOX_CLOSURE_CHECKLIST.md states no-real-testnet", () => {
    const content = read("docs/PHASE_5_MOCK_SANDBOX_CLOSURE_CHECKLIST.md");
    expect(content).toContain("no-real-testnet");
    expect(content).toContain("no-mainnet");
    expect(content).toContain("no-secret-decryption");
    expect(content).toContain("no-live-trading");
  });
});
