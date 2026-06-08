import {
  createRiskRule,
  deleteRiskRule,
  listRiskRules,
  updateRiskRule,
  type RiskRuleStoreOptions
} from "./riskRuleStore";
import type { CreateRiskRuleInput, RiskRule, UpdateRiskRuleInput } from "./types";

export type RiskRuleApiResponse<T> = {
  status: number;
  data?: T;
  error?: string;
};

export async function getRiskRulesResponse(options: RiskRuleStoreOptions = {}): Promise<RiskRuleApiResponse<RiskRule[]>> {
  return {
    status: 200,
    data: await listRiskRules(options)
  };
}

export async function createRiskRuleResponse(
  body: unknown,
  options: RiskRuleStoreOptions = {}
): Promise<RiskRuleApiResponse<RiskRule>> {
  try {
    return {
      status: 201,
      data: await createRiskRule(body as CreateRiskRuleInput, options)
    };
  } catch (error) {
    return {
      status: 400,
      error: getErrorMessage(error)
    };
  }
}

export async function patchRiskRuleResponse(
  id: string,
  body: unknown,
  options: RiskRuleStoreOptions = {}
): Promise<RiskRuleApiResponse<RiskRule>> {
  try {
    const rule = await updateRiskRule(id, body as UpdateRiskRuleInput, options);
    if (!rule) {
      return {
        status: 404,
        error: "risk rule not found"
      };
    }

    return {
      status: 200,
      data: rule
    };
  } catch (error) {
    return {
      status: 400,
      error: getErrorMessage(error)
    };
  }
}

export async function deleteRiskRuleResponse(
  id: string,
  options: RiskRuleStoreOptions = {}
): Promise<RiskRuleApiResponse<{ deleted: boolean }>> {
  const deleted = await deleteRiskRule(id, options);
  if (!deleted) {
    return {
      status: 404,
      error: "risk rule not found"
    };
  }

  return {
    status: 200,
    data: { deleted: true }
  };
}

function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "invalid risk rule payload";
}
