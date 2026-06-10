/**
 * Phase 5.6 Real Testnet Design Boundary Tests
 *
 * Verifies that Phase 5.6 remains in design-only mode:
 * - No testnet adapter implementation
 * - No fetch/axios/SDK
 * - No signing implementation
 * - No secret decrypt
 * - No mainnet adapter
 * - Middleware not opened for testnet routes
 * - Docs state testnet-only and no-mainnet
 */

import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const root = process.cwd();

function read(relativePath: string) {
  return readFileSync(join(root, relativePath), "utf8");
}

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

const liveAdapterFiles = getRunFiles("lib/liveAdapters");

describe("Phase 5.6 Design — No Testnet Implementation", () => {
  it("testnetAdapterTypes.ts contains only interface declarations, no implementations", () => {
    const content = read("lib/liveAdapters/testnetAdapterTypes.ts");
    expect(content).toContain("interface TestnetAdapter");
    const exportFnLines = content.split("\n").filter((l) => /^export function/.test(l.trim()));
    expect(exportFnLines).toEqual([]);
  });

  it("no testnet adapter implementation file exists", () => {
    for (const { file } of liveAdapterFiles) {
      const name = file.replace(/\\/g, "/");
      // Allow only the types file
      if (name.includes("testnetAdapter") && !name.includes("Types")) {
        expect(name, `testnet implementation found: ${name}`).toBe("no-testnet-file");
      }
    }
  });
});

describe("Phase 5.6 Design — No Network Calls", () => {
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
});

describe("Phase 5.6 Design — No Signing", () => {
  it("liveAdapters run code does not contain signing implementation", () => {
    for (const { file, content } of liveAdapterFiles) {
      const noComments = content.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");
      expect(noComments, `sign found in ${file}`).not.toContain("sign("); // function call
      expect(noComments, `hmac found in ${file}`).not.toContain("hmac");
    }
  });
});

describe("Phase 5.6 Design — No Secret Decrypt", () => {
  it("liveAdapters run code does not call decryptSecret", () => {
    for (const { file, content } of liveAdapterFiles) {
      expect(content, `decryptSecret found in ${file}`).not.toContain("decryptSecret");
    }
  });
});

describe("Phase 5.6 Design — No Mainnet Adapter", () => {
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
      if (name.includes("ReadOnly") || name.includes("24hShadow") || name.includes("7DayShadow") || name.includes("DryRun") || name.includes("SemiAutoLive") || name.includes("FilledOrder") || name.includes("PositionLifecycle")) continue;
      expect(name, `mainnet file found: ${name}`).not.toMatch(/mainnet/i);
    }
  });
});

describe("Phase 5.6 Design — Middleware", () => {
  it("middleware has not opened testnet route", () => {
    const content = read("middleware.ts");
    // The allowlist should not contain /api/testnet in Phase 5.6
    const allowlistMatch = content.match(/\/api\/[a-z-]+/g);
    if (allowlistMatch) {
      const testnetRoute = allowlistMatch.find((p) => p.includes("testnet"));
      expect(testnetRoute, "middleware allowlist contains /api/testnet route").toBeUndefined();
    }
  });
});

describe("Phase 5.6 Design — Docs", () => {
  it("REAL_TESTNET_ADAPTER_DESIGN.md states testnet-only and no-mainnet", () => {
    const content = read("docs/REAL_TESTNET_ADAPTER_DESIGN.md");
    expect(content).toContain("Testnet Only");
    expect(content).toContain("不允许 Mainnet");
    expect(content).toContain("No Default Mainnet");
  });
});
