import type { ExchangeName } from "../exchanges/types";

export type RiskRuleType =
  | "FundingNegative"
  | "AnnualizedBelowThreshold"
  | "PriceSpreadAboveThreshold"
  | "AdlLevelAtThreshold"
  | "VolumeBelowThreshold"
  | "OpenInterestBelowThreshold";

export type RiskRuleAction = "Alert" | "PauseStrategy" | "StopStrategy" | "MarkRisk";

export type RiskRule = {
  id: string;
  name: string;
  ruleType: RiskRuleType;
  action: RiskRuleAction;
  enabled: boolean;
  threshold: number;
  createdAt: number;
  updatedAt: number;
  symbol?: string;
  exchange?: ExchangeName;
  strategyId?: string;
  notes?: string;
};

export type CreateRiskRuleInput = {
  name: string;
  ruleType: RiskRuleType;
  action: RiskRuleAction;
  enabled?: boolean;
  threshold: number;
  symbol?: string;
  exchange?: ExchangeName;
  strategyId?: string;
  notes?: string;
};

export type UpdateRiskRuleInput = Partial<CreateRiskRuleInput>;
