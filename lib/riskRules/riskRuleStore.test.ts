import { mkdtemp, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  createRiskRule,
  deleteRiskRule,
  getRiskRule,
  listRiskRules,
  updateRiskRule
} from "./riskRuleStore";

let tempDir: string;
let riskRulePath: string;

beforeEach(async () => {
  tempDir = await mkdtemp(join(tmpdir(), "risk-rule-store-"));
  riskRulePath = join(tempDir, "risk-rules.json");
});

afterEach(async () => {
  await rm(tempDir, { force: true, recursive: true });
});

describe("riskRuleStore", () => {
  it("creates and persists risk rules", async () => {
    const created = await createRiskRule(
      {
        name: "Funding turns negative",
        ruleType: "FundingNegative",
        action: "Alert",
        enabled: true,
        symbol: "BTC/USDT",
        exchange: "Bybit",
        threshold: 0,
        notes: "research only"
      },
      { idFactory: () => "rule-1", now: 1000, riskRulePath }
    );

    expect(created).toMatchObject({
      id: "rule-1",
      name: "Funding turns negative",
      ruleType: "FundingNegative",
      action: "Alert",
      enabled: true,
      createdAt: 1000,
      updatedAt: 1000
    });

    expect(await listRiskRules({ riskRulePath })).toEqual([created]);
  });

  it("updates rule fields and enables or disables rules", async () => {
    await createRiskRule(
      {
        name: "Annualized floor",
        ruleType: "AnnualizedBelowThreshold",
        action: "PauseStrategy",
        enabled: true,
        threshold: 20
      },
      { idFactory: () => "rule-1", now: 1000, riskRulePath }
    );

    const updated = await updateRiskRule(
      "rule-1",
      {
        enabled: false,
        threshold: 30,
        action: "MarkRisk",
        notes: "disabled during review"
      },
      { now: 2000, riskRulePath }
    );

    expect(updated).toMatchObject({
      id: "rule-1",
      enabled: false,
      threshold: 30,
      action: "MarkRisk",
      notes: "disabled during review",
      updatedAt: 2000
    });
  });

  it("deletes rules", async () => {
    await createRiskRule(
      {
        name: "Low OI",
        ruleType: "OpenInterestBelowThreshold",
        action: "StopStrategy",
        enabled: true,
        threshold: 1_000_000
      },
      { idFactory: () => "rule-1", now: 1000, riskRulePath }
    );

    expect(await deleteRiskRule("rule-1", { riskRulePath })).toBe(true);
    expect(await getRiskRule("rule-1", { riskRulePath })).toBeUndefined();
    expect(await listRiskRules({ riskRulePath })).toEqual([]);
  });
});
