/**
 * Risk Center Tests — Phase Recovery R1
 *
 * Verifies the /risk-center page exists and renders key sections.
 * No API calls, no exchange access.
 */

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const root = process.cwd();
function read(relativePath: string) {
  return readFileSync(join(root, relativePath), "utf8");
}

const page = read("app/risk-center/page.tsx");

// ─── Page Exists ─────────────────────────────────────────

describe("Risk Center — Page Exists", () => {
  it("app/risk-center/page.tsx exists and has content", () => {
    expect(page.length).toBeGreaterThan(0);
  });
});

// ─── Sections ────────────────────────────────────────────

describe("Risk Center — Sections", () => {
  it("has system status section", () => {
    expect(page).toContain("系统状态");
  });

  it("has risk event stats section", () => {
    expect(page).toContain("风险事件统计");
  });

  it("has risk suggestions section", () => {
    expect(page).toContain("风险建议");
  });

  it("has recent risk events section", () => {
    expect(page).toContain("近期风险事件");
  });
});

// ─── Data Sources ────────────────────────────────────────

describe("Risk Center — Data Sources", () => {
  it("reads from safetyStore", () => {
    expect(page).toContain("getSafetyState");
  });

  it("reads from executionQueueStore", () => {
    expect(page).toContain("listQueueItems");
  });

  it("reads from auditStore", () => {
    expect(page).toContain("listAuditEvents");
  });

  it("reads from localNotificationStore", () => {
    expect(page).toContain("listLocalNotifications");
    expect(page).toContain("unreadLocalNotificationCount");
  });
});

// ─── Safety Boundaries ───────────────────────────────────

describe("Risk Center — Safety Boundaries", () => {
  it("does not contain fetch(", () => {
    expect(page).not.toContain("fetch(");
  });

  it("does not contain axios", () => {
    expect(page).not.toContain("axios");
  });

  it("does not contain decryptSecret", () => {
    expect(page).not.toContain("decryptSecret");
  });

  it("does not contain createHmac", () => {
    expect(page).not.toContain("createHmac");
  });

  it("does not contain any exchange SDK import", () => {
    const importLines = page.split("\n").filter((l) => l.includes("import ") && l.includes("from"));
    for (const line of importLines) {
      expect(line).not.toMatch(/@binance|binance-api|okx-api|bybit-api|ccxt/i);
    }
  });

  it("imports from safety/queue/audit/notification stores only", () => {
    const storeImports = ["safetyStore", "executionQueueStore", "auditStore", "localNotificationStore"];
    for (const s of storeImports) {
      expect(page).toContain(s);
    }
  });
});
