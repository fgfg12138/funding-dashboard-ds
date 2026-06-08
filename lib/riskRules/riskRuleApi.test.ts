import { mkdtemp, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  createRiskRuleResponse,
  deleteRiskRuleResponse,
  getRiskRulesResponse,
  patchRiskRuleResponse
} from "./riskRuleApi";

let tempDir: string;
let riskRulePath: string;

beforeEach(async () => {
  tempDir = await mkdtemp(join(tmpdir(), "risk-rule-api-"));
  riskRulePath = join(tempDir, "risk-rules.json");
});

afterEach(async () => {
  await rm(tempDir, { force: true, recursive: true });
});

describe("riskRuleApi", () => {
  it("creates and lists risk rules", async () => {
    const created = await createRiskRuleResponse(
      {
        name: "Spread too wide",
        ruleType: "PriceSpreadAboveThreshold",
        action: "Alert",
        enabled: true,
        threshold: 1
      },
      { idFactory: () => "rule-1", now: 1000, riskRulePath }
    );
    const list = await getRiskRulesResponse({ riskRulePath });

    expect(created.status).toBe(201);
    expect(created.data?.id).toBe("rule-1");
    expect(list.status).toBe(200);
    expect(list.data).toHaveLength(1);
  });

  it("patches rule enabled state and action", async () => {
    await createRiskRuleResponse(
      {
        name: "ADL guard",
        ruleType: "AdlLevelAtThreshold",
        action: "MarkRisk",
        enabled: true,
        threshold: 3
      },
      { idFactory: () => "rule-1", now: 1000, riskRulePath }
    );

    const disabled = await patchRiskRuleResponse("rule-1", { enabled: false }, { now: 2000, riskRulePath });
    const stopped = await patchRiskRuleResponse("rule-1", { action: "StopStrategy" }, { now: 3000, riskRulePath });

    expect(disabled.data?.enabled).toBe(false);
    expect(stopped.data?.action).toBe("StopStrategy");
    expect(stopped.data?.updatedAt).toBe(3000);
  });

  it("deletes rules", async () => {
    await createRiskRuleResponse(
      {
        name: "Volume guard",
        ruleType: "VolumeBelowThreshold",
        action: "PauseStrategy",
        enabled: true,
        threshold: 1_000_000
      },
      { idFactory: () => "rule-1", now: 1000, riskRulePath }
    );

    const deleted = await deleteRiskRuleResponse("rule-1", { riskRulePath });
    const list = await getRiskRulesResponse({ riskRulePath });

    expect(deleted.status).toBe(200);
    expect(deleted.data).toEqual({ deleted: true });
    expect(list.data).toEqual([]);
  });

  it("returns validation errors for invalid payloads", async () => {
    const response = await createRiskRuleResponse(
      {
        name: "",
        ruleType: "FundingNegative",
        action: "Alert",
        enabled: true
      },
      { riskRulePath }
    );

    expect(response.status).toBe(400);
    expect(response.error).toContain("name");
  });
});
