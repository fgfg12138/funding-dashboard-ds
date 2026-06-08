import { randomUUID } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import type { ExchangeName } from "../exchanges/types";
import type { CreateRiskRuleInput, RiskRule, RiskRuleAction, RiskRuleType, UpdateRiskRuleInput } from "./types";

const DEFAULT_RISK_RULE_PATH = join(process.cwd(), ".data", "risk-rules.json");
const RULE_TYPES: RiskRuleType[] = [
  "FundingNegative",
  "AnnualizedBelowThreshold",
  "PriceSpreadAboveThreshold",
  "AdlLevelAtThreshold",
  "VolumeBelowThreshold",
  "OpenInterestBelowThreshold"
];
const ACTIONS: RiskRuleAction[] = ["Alert", "PauseStrategy", "StopStrategy", "MarkRisk"];
const EXCHANGES: ExchangeName[] = ["Binance", "OKX", "Bybit"];

export type RiskRuleStoreOptions = {
  riskRulePath?: string;
  now?: number;
  idFactory?: () => string;
};

export async function listRiskRules(options: RiskRuleStoreOptions = {}): Promise<RiskRule[]> {
  return readRiskRules(options.riskRulePath);
}

export async function getRiskRule(id: string, options: RiskRuleStoreOptions = {}): Promise<RiskRule | undefined> {
  const rules = await readRiskRules(options.riskRulePath);
  return rules.find((rule) => rule.id === id);
}

export async function createRiskRule(input: CreateRiskRuleInput, options: RiskRuleStoreOptions = {}): Promise<RiskRule> {
  validateCreateInput(input);
  const now = options.now ?? Date.now();
  const rule: RiskRule = {
    id: options.idFactory?.() ?? randomUUID(),
    name: input.name.trim(),
    ruleType: input.ruleType,
    action: input.action,
    enabled: input.enabled ?? true,
    threshold: input.threshold,
    createdAt: now,
    updatedAt: now,
    symbol: input.symbol ? normalizeSymbol(input.symbol) : undefined,
    exchange: input.exchange,
    strategyId: input.strategyId,
    notes: input.notes
  };
  const rules = await readRiskRules(options.riskRulePath);
  await writeRiskRules([...rules, rule], options.riskRulePath);
  return rule;
}

export async function updateRiskRule(
  id: string,
  input: UpdateRiskRuleInput,
  options: RiskRuleStoreOptions = {}
): Promise<RiskRule | undefined> {
  const rules = await readRiskRules(options.riskRulePath);
  const index = rules.findIndex((rule) => rule.id === id);
  if (index === -1) {
    return undefined;
  }

  const existing = rules[index];
  const updated: RiskRule = {
    ...existing,
    name: input.name !== undefined ? input.name.trim() : existing.name,
    ruleType: input.ruleType ?? existing.ruleType,
    action: input.action ?? existing.action,
    enabled: input.enabled ?? existing.enabled,
    threshold: input.threshold ?? existing.threshold,
    symbol: input.symbol !== undefined ? normalizeSymbol(input.symbol) : existing.symbol,
    exchange: input.exchange ?? existing.exchange,
    strategyId: input.strategyId ?? existing.strategyId,
    notes: input.notes ?? existing.notes,
    updatedAt: options.now ?? Date.now()
  };

  validateRiskRule(updated);
  rules[index] = updated;
  await writeRiskRules(rules, options.riskRulePath);
  return updated;
}

export async function deleteRiskRule(id: string, options: RiskRuleStoreOptions = {}): Promise<boolean> {
  const rules = await readRiskRules(options.riskRulePath);
  const next = rules.filter((rule) => rule.id !== id);
  if (next.length === rules.length) {
    return false;
  }

  await writeRiskRules(next, options.riskRulePath);
  return true;
}

function validateCreateInput(input: CreateRiskRuleInput): void {
  validateRiskRule({
    id: "validation",
    name: input.name,
    ruleType: input.ruleType,
    action: input.action,
    enabled: input.enabled ?? true,
    threshold: input.threshold,
    createdAt: 0,
    updatedAt: 0,
    symbol: input.symbol,
    exchange: input.exchange,
    strategyId: input.strategyId,
    notes: input.notes
  });
}

function validateRiskRule(rule: RiskRule): void {
  if (!rule.name.trim()) {
    throw new Error("name is required");
  }
  if (!RULE_TYPES.includes(rule.ruleType)) {
    throw new Error("ruleType is invalid");
  }
  if (!ACTIONS.includes(rule.action)) {
    throw new Error("action is invalid");
  }
  if (typeof rule.enabled !== "boolean") {
    throw new Error("enabled must be boolean");
  }
  if (typeof rule.threshold !== "number" || !Number.isFinite(rule.threshold)) {
    throw new Error("threshold must be a number");
  }
  if (rule.exchange && !EXCHANGES.includes(rule.exchange)) {
    throw new Error("exchange is invalid");
  }
}

async function readRiskRules(path = DEFAULT_RISK_RULE_PATH): Promise<RiskRule[]> {
  try {
    const content = await readFile(path, "utf8");
    const parsed = JSON.parse(content) as unknown;
    return Array.isArray(parsed) ? parsed.filter(isRiskRule) : [];
  } catch (error) {
    if (error instanceof Error && "code" in error && error.code === "ENOENT") {
      return [];
    }
    throw error;
  }
}

async function writeRiskRules(rules: RiskRule[], path = DEFAULT_RISK_RULE_PATH): Promise<void> {
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, `${JSON.stringify(rules, null, 2)}\n`, "utf8");
}

function isRiskRule(value: unknown): value is RiskRule {
  if (!value || typeof value !== "object") {
    return false;
  }

  const item = value as { id?: unknown; name?: unknown; ruleType?: unknown; action?: unknown };
  return typeof item.id === "string" && typeof item.name === "string" && RULE_TYPES.includes(item.ruleType as RiskRuleType) && ACTIONS.includes(item.action as RiskRuleAction);
}

function normalizeSymbol(symbol: string): string {
  const trimmed = symbol.trim().toUpperCase();
  if (!trimmed) {
    return undefined as never;
  }
  if (trimmed.includes("/")) {
    return trimmed;
  }
  if (trimmed.endsWith("USDT")) {
    return `${trimmed.slice(0, -4)}/USDT`;
  }
  return trimmed;
}
