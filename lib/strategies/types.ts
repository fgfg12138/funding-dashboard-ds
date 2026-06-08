import type { ExchangeName } from "../exchanges/types";

export type StrategyType = "SpotPerp" | "CrossExchange";
export type StrategyStatus = "draft" | "running" | "paused" | "stopped";

export type StrategyBase = {
  id: string;
  name: string;
  strategyType: StrategyType;
  symbol: string;
  exchangePair: string;
  createdAt: number;
  updatedAt: number;
  status: StrategyStatus;
  notes?: string;
};

export type SpotPerpStrategy = StrategyBase & {
  strategyType: "SpotPerp";
  spotExchange: ExchangeName;
  perpExchange: ExchangeName;
  minFundingRate: number;
  minAnnualized: number;
  maxLeverage: number;
};

export type CrossExchangeStrategy = StrategyBase & {
  strategyType: "CrossExchange";
  longExchange: ExchangeName;
  shortExchange: ExchangeName;
  minFundingSpread: number;
  minAnnualizedSpread: number;
};

export type Strategy = SpotPerpStrategy | CrossExchangeStrategy;

export type CreateSpotPerpStrategyInput = {
  name: string;
  strategyType: "SpotPerp";
  symbol: string;
  spotExchange: ExchangeName;
  perpExchange: ExchangeName;
  minFundingRate: number;
  minAnnualized: number;
  maxLeverage: number;
  status?: StrategyStatus;
  notes?: string;
};

export type CreateCrossExchangeStrategyInput = {
  name: string;
  strategyType: "CrossExchange";
  symbol: string;
  longExchange: ExchangeName;
  shortExchange: ExchangeName;
  minFundingSpread: number;
  minAnnualizedSpread: number;
  status?: StrategyStatus;
  notes?: string;
};

export type CreateStrategyInput = CreateSpotPerpStrategyInput | CreateCrossExchangeStrategyInput;
export type UpdateStrategyInput = Partial<Omit<CreateSpotPerpStrategyInput, "strategyType">> &
  Partial<Omit<CreateCrossExchangeStrategyInput, "strategyType">> & {
    strategyType?: StrategyType;
  };
