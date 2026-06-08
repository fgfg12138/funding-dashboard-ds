/**
 * NO-GO Remediation Plan Tests — Phase 6.9
 */

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { buildNoGoRemediationPlan } from "./noGoRemediationPlan";

// ─── Structure ───────────────────────────────────────────

describe("buildNoGoRemediationPlan", () => {
  const plan = buildNoGoRemediationPlan();

  it("has exactly 11 items", () => {
    expect(plan.total).toBe(11);
  });

  it("source is phase-6-9-no-go-remediation-plan", () => {
    expect(plan.source).toBe("phase-6-9-no-go-remediation-plan");
  });

  it("decision is NO_GO", () => {
    expect(plan.decision).toBe("NO_GO");
  });

  it("readyAfterPlan is false", () => {
    expect(plan.readyAfterPlan).toBe(false);
  });

  it("all items have unique ids", () => {
    const ids = plan.items.map((i) => i.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("all items reference valid blockerIds", () => {
    for (const item of plan.items) {
      expect(item.blockerId).toBeTruthy();
    }
  });

  it("critical + high + medium = total", () => {
    expect(plan.critical + plan.high + plan.medium).toBe(plan.total);
  });
});

// ─── Critical Blockers ───────────────────────────────────

describe("critical blockers", () => {
  const plan = buildNoGoRemediationPlan();
  const critical = plan.items.filter((i) => i.priority === "critical");

  it("includes secret retrieval", () => {
    expect(critical.some((i) => i.domain === "Secret Retrieval")).toBe(true);
  });

  it("includes permission verification", () => {
    expect(critical.some((i) => i.domain === "Permission Verification")).toBe(true);
  });

  it("includes signing implementation", () => {
    expect(critical.some((i) => i.domain === "Signing Implementation")).toBe(true);
  });

  it("includes middleware allowlist", () => {
    expect(critical.some((i) => i.domain === "Middleware Testnet Allowlist")).toBe(true);
  });

  it("includes real adapter", () => {
    expect(critical.some((i) => i.domain === "Real Binance Testnet Adapter")).toBe(true);
  });
});

// ─── Forbidden Actions ───────────────────────────────────

describe("forbidden actions", () => {
  const plan = buildNoGoRemediationPlan();

  for (const item of plan.items) {
    it(`${item.id} has at least one forbiddenAction`, () => {
      expect(item.forbiddenActions.length).toBeGreaterThan(0);
    });
  }
});

// ─── Acceptance Criteria ─────────────────────────────────

describe("acceptance criteria", () => {
  const plan = buildNoGoRemediationPlan();

  for (const item of plan.items) {
    it(`${item.id} has at least one acceptanceCriteria`, () => {
      expect(item.acceptanceCriteria.length).toBeGreaterThan(0);
    });
  }
});

// ─── Allowed Phase ───────────────────────────────────────

describe("allowed phase", () => {
  const plan = buildNoGoRemediationPlan();

  for (const item of plan.items) {
    it(`${item.id} has allowedPhase`, () => {
      expect(item.allowedPhase).toBeTruthy();
    });
  }
});

// ─── Static Analysis ─────────────────────────────────────

describe("noGoRemediationPlan — static analysis", () => {
  const files = ["noGoRemediationPlan.ts", "noGoRemediationTypes.ts"];

  for (const file of files) {
    const content = readFileSync(join(__dirname, file), "utf8");
    const noComments = content.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");

    it(`${file} no fetch(`, () => expect(noComments).not.toContain("fetch("));
    it(`${file} no axios`, () => expect(content).not.toContain("axios"));
    it(`${file} no decryptSecret`, () => expect(content).not.toContain("decryptSecret"));
    it(`${file} no importMasterKey`, () => expect(content).not.toContain("importMasterKey"));
    it(`${file} no createHmac`, () => expect(content).not.toContain("createHmac"));
    it(`${file} no crypto.subtle.sign`, () => expect(content).not.toContain("crypto.subtle.sign"));
  }
});
