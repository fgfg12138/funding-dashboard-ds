import type { ExchangeName } from "../exchanges/types";

export type AdlSide = "LONG" | "SHORT";
export type AdlLevel = 1 | 2 | 3 | 4 | 5;

export type AdlPosition = {
  id: string;
  exchange: ExchangeName;
  symbol: string;
  side: AdlSide;
  adlLevel: AdlLevel;
  quantity: number;
  notionalUsd: number;
  markPrice: number;
  updatedAt: number;
  strategyId?: string;
  notes?: string;
};

export type AdlSettings = {
  enabled: boolean;
  alertLevelThreshold: AdlLevel;
  repeatAlertMinutes: number;
  pollingIntervalSeconds: number;
  exchanges: Record<ExchangeName, boolean>;
};

export type AdlMonitorSummary = {
  positionCount: number;
  adlLevel5Count: number;
  adlLevel4PlusCount: number;
  maxAdlLevel: number;
  latestUpdatedAt: number | null;
};

export type AdlMonitorResult = {
  positions: AdlPosition[];
  summary: AdlMonitorSummary;
  settings: AdlSettings;
  mock: true;
};
