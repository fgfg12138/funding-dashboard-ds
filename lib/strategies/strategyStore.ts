import { randomUUID } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import type { ExchangeName } from "../exchanges/types";
import type { CreateStrategyInput, Strategy, StrategyStatus, UpdateStrategyInput } from "./types";

const DEFAULT_STRATEGY_PATH = join(process.cwd(), ".data", "strategies.json");
const STRATEGY_STATUSES: StrategyStatus[] = ["draft", "running", "paused", "stopped"];
const EXCHANGES: ExchangeName[] = ["Binance", "OKX", "Bybit"];

export type StrategyStoreOptions = {
  strategyPath?: string;
  now?: number;
  idFactory?: () => string;
};

export async function listStrategies(options: StrategyStoreOptions = {}): Promise<Strategy[]> {
  return readStrategies(options.strategyPath);
}

export async function getStrategy(id: string, options: StrategyStoreOptions = {}): Promise<Strategy | undefined> {
  const strategies = await readStrategies(options.strategyPath);
  return strategies.find((strategy) => strategy.id === id);
}

export async function createStrategy(input: CreateStrategyInput, options: StrategyStoreOptions = {}): Promise<Strategy> {
  validateCreateInput(input);
  const now = options.now ?? Date.now();
  const strategy = buildStrategy(input, {
    id: options.idFactory?.() ?? randomUUID(),
    now
  });
  const strategies = await readStrategies(options.strategyPath);
  await writeStrategies([...strategies, strategy], options.strategyPath);
  return strategy;
}

export async function updateStrategy(
  id: string,
  input: UpdateStrategyInput,
  options: StrategyStoreOptions = {}
): Promise<Strategy | undefined> {
  const strategies = await readStrategies(options.strategyPath);
  const index = strategies.findIndex((strategy) => strategy.id === id);
  if (index === -1) {
    return undefined;
  }

  const existing = strategies[index];
  const updated = applyStrategyUpdate(existing, input, options.now ?? Date.now());
  validateStrategy(updated);
  strategies[index] = updated;
  await writeStrategies(strategies, options.strategyPath);
  return updated;
}

export async function deleteStrategy(id: string, options: StrategyStoreOptions = {}): Promise<boolean> {
  const strategies = await readStrategies(options.strategyPath);
  const next = strategies.filter((strategy) => strategy.id !== id);
  if (next.length === strategies.length) {
    return false;
  }

  await writeStrategies(next, options.strategyPath);
  return true;
}

function buildStrategy(input: CreateStrategyInput, { id, now }: { id: string; now: number }): Strategy {
  if (input.strategyType === "SpotPerp") {
    return {
      id,
      name: input.name.trim(),
      strategyType: "SpotPerp",
      symbol: normalizeSymbol(input.symbol),
      exchangePair: `${input.spotExchange} / ${input.perpExchange}`,
      createdAt: now,
      updatedAt: now,
      status: input.status ?? "draft",
      notes: input.notes,
      spotExchange: input.spotExchange,
      perpExchange: input.perpExchange,
      minFundingRate: input.minFundingRate,
      minAnnualized: input.minAnnualized,
      maxLeverage: input.maxLeverage
    };
  }

  return {
    id,
    name: input.name.trim(),
    strategyType: "CrossExchange",
    symbol: normalizeSymbol(input.symbol),
    exchangePair: `${input.longExchange} / ${input.shortExchange}`,
    createdAt: now,
    updatedAt: now,
    status: input.status ?? "draft",
    notes: input.notes,
    longExchange: input.longExchange,
    shortExchange: input.shortExchange,
    minFundingSpread: input.minFundingSpread,
    minAnnualizedSpread: input.minAnnualizedSpread
  };
}

function applyStrategyUpdate(strategy: Strategy, input: UpdateStrategyInput, now: number): Strategy {
  const base = {
    ...strategy,
    name: input.name !== undefined ? input.name.trim() : strategy.name,
    symbol: input.symbol !== undefined ? normalizeSymbol(input.symbol) : strategy.symbol,
    status: input.status ?? strategy.status,
    notes: input.notes ?? strategy.notes,
    updatedAt: now
  };

  if (strategy.strategyType === "SpotPerp") {
    const spotExchange = input.spotExchange ?? strategy.spotExchange;
    const perpExchange = input.perpExchange ?? strategy.perpExchange;
    return {
      ...base,
      strategyType: "SpotPerp",
      spotExchange,
      perpExchange,
      exchangePair: `${spotExchange} / ${perpExchange}`,
      minFundingRate: input.minFundingRate ?? strategy.minFundingRate,
      minAnnualized: input.minAnnualized ?? strategy.minAnnualized,
      maxLeverage: input.maxLeverage ?? strategy.maxLeverage
    };
  }

  const longExchange = input.longExchange ?? strategy.longExchange;
  const shortExchange = input.shortExchange ?? strategy.shortExchange;
  return {
    ...base,
    strategyType: "CrossExchange",
    longExchange,
    shortExchange,
    exchangePair: `${longExchange} / ${shortExchange}`,
    minFundingSpread: input.minFundingSpread ?? strategy.minFundingSpread,
    minAnnualizedSpread: input.minAnnualizedSpread ?? strategy.minAnnualizedSpread
  };
}

function validateCreateInput(input: CreateStrategyInput): void {
  validateStrategy(buildStrategy(input, { id: "validation", now: 0 }));
}

function validateStrategy(strategy: Strategy): void {
  if (!strategy.name.trim()) {
    throw new Error("name is required");
  }
  if (!strategy.symbol.includes("/")) {
    throw new Error("symbol must be normalized like BTC/USDT");
  }
  if (!STRATEGY_STATUSES.includes(strategy.status)) {
    throw new Error("status is invalid");
  }

  if (strategy.strategyType === "SpotPerp") {
    assertExchange(strategy.spotExchange, "spotExchange");
    assertExchange(strategy.perpExchange, "perpExchange");
    assertFinite(strategy.minFundingRate, "minFundingRate");
    assertFinite(strategy.minAnnualized, "minAnnualized");
    assertFinite(strategy.maxLeverage, "maxLeverage");
    return;
  }

  assertExchange(strategy.longExchange, "longExchange");
  assertExchange(strategy.shortExchange, "shortExchange");
  assertFinite(strategy.minFundingSpread, "minFundingSpread");
  assertFinite(strategy.minAnnualizedSpread, "minAnnualizedSpread");
}

async function readStrategies(path = DEFAULT_STRATEGY_PATH): Promise<Strategy[]> {
  try {
    const content = await readFile(path, "utf8");
    const parsed = JSON.parse(content) as unknown;
    return Array.isArray(parsed) ? parsed.filter(isStrategy) : [];
  } catch (error) {
    if (error instanceof Error && "code" in error && error.code === "ENOENT") {
      return [];
    }
    throw error;
  }
}

async function writeStrategies(strategies: Strategy[], path = DEFAULT_STRATEGY_PATH): Promise<void> {
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, `${JSON.stringify(strategies, null, 2)}\n`, "utf8");
}

function isStrategy(value: unknown): value is Strategy {
  if (!value || typeof value !== "object") {
    return false;
  }

  const item = value as { strategyType?: unknown; id?: unknown; name?: unknown; symbol?: unknown };
  return typeof item.id === "string" && typeof item.name === "string" && typeof item.symbol === "string" && (item.strategyType === "SpotPerp" || item.strategyType === "CrossExchange");
}

function assertExchange(value: unknown, field: string): asserts value is ExchangeName {
  if (!EXCHANGES.includes(value as ExchangeName)) {
    throw new Error(`${field} is invalid`);
  }
}

function assertFinite(value: unknown, field: string): asserts value is number {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw new Error(`${field} must be a number`);
  }
}

function normalizeSymbol(symbol: string): string {
  const trimmed = symbol.trim().toUpperCase();
  if (trimmed.includes("/")) {
    return trimmed;
  }

  if (trimmed.endsWith("USDT")) {
    return `${trimmed.slice(0, -4)}/USDT`;
  }

  return trimmed;
}
