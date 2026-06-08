import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import type { ExchangeName } from "../exchanges/types";
import type { AdlLevel, AdlPosition, AdlSettings } from "./types";

const DEFAULT_ADL_POSITIONS_PATH = join(process.cwd(), ".data", "adl-positions.json");
const DEFAULT_ADL_SETTINGS_PATH = join(process.cwd(), ".data", "adl-settings.json");
const EXCHANGES: ExchangeName[] = ["Binance", "OKX", "Bybit"];
const ADL_LEVELS: AdlLevel[] = [1, 2, 3, 4, 5];

export type AdlStoreOptions = {
  adlPositionsPath?: string;
  adlSettingsPath?: string;
  now?: number;
  idFactory?: (index: number) => string;
};

export const DEFAULT_ADL_SETTINGS: AdlSettings = {
  enabled: true,
  alertLevelThreshold: 5,
  repeatAlertMinutes: 30,
  pollingIntervalSeconds: 3,
  exchanges: {
    Binance: true,
    OKX: true,
    Bybit: true
  }
};

export async function listAdlPositions(options: AdlStoreOptions = {}): Promise<AdlPosition[]> {
  return readJson<AdlPosition[]>(options.adlPositionsPath ?? DEFAULT_ADL_POSITIONS_PATH, []);
}

export async function writeAdlPositions(positions: AdlPosition[], options: AdlStoreOptions = {}): Promise<void> {
  for (const position of positions) {
    validateAdlPosition(position);
  }
  await writeJson(options.adlPositionsPath ?? DEFAULT_ADL_POSITIONS_PATH, positions);
}

export async function getAdlSettings(options: AdlStoreOptions = {}): Promise<AdlSettings> {
  const settings = await readJson<AdlSettings | undefined>(options.adlSettingsPath ?? DEFAULT_ADL_SETTINGS_PATH, undefined);
  return normalizeSettings(settings);
}

export async function updateAdlSettings(input: Partial<AdlSettings>, options: AdlStoreOptions = {}): Promise<AdlSettings> {
  const current = await getAdlSettings(options);
  const next = normalizeSettings({
    ...current,
    ...input,
    exchanges: {
      ...current.exchanges,
      ...(input.exchanges ?? {})
    }
  });
  await writeJson(options.adlSettingsPath ?? DEFAULT_ADL_SETTINGS_PATH, next);
  return next;
}

export async function mockRefreshAdlPositions(options: AdlStoreOptions = {}): Promise<AdlPosition[]> {
  const now = options.now ?? Date.now();
  const positions = buildMockPositions(now, options.idFactory);
  await writeAdlPositions(positions, options);
  return positions;
}

function buildMockPositions(now: number, idFactory: ((index: number) => string) | undefined): AdlPosition[] {
  const rows: Array<Omit<AdlPosition, "id" | "updatedAt">> = [
    {
      exchange: "Binance",
      symbol: "BTC/USDT",
      side: "LONG",
      adlLevel: 5,
      quantity: 0.42,
      notionalUsd: 42_000,
      markPrice: 100_000,
      strategyId: "mock-strategy-btc",
      notes: "mock ADL data, not a real exchange position"
    },
    {
      exchange: "Bybit",
      symbol: "ETH/USDT",
      side: "SHORT",
      adlLevel: 4,
      quantity: 8,
      notionalUsd: 28_800,
      markPrice: 3_600,
      strategyId: "mock-strategy-eth",
      notes: "mock ADL data, not a real exchange position"
    },
    {
      exchange: "OKX",
      symbol: "SOL/USDT",
      side: "LONG",
      adlLevel: 3,
      quantity: 120,
      notionalUsd: 18_000,
      markPrice: 150,
      notes: "mock ADL data, not a real exchange position"
    },
    {
      exchange: "Binance",
      symbol: "XRP/USDT",
      side: "SHORT",
      adlLevel: 2,
      quantity: 10_000,
      notionalUsd: 6_000,
      markPrice: 0.6,
      notes: "mock ADL data, not a real exchange position"
    }
  ];

  return rows.map((row, index) => ({
    ...row,
    id: idFactory?.(index) ?? `mock-adl-${index + 1}`,
    updatedAt: now
  }));
}

function normalizeSettings(settings: AdlSettings | undefined): AdlSettings {
  const merged: AdlSettings = {
    ...DEFAULT_ADL_SETTINGS,
    ...(settings ?? {}),
    exchanges: {
      ...DEFAULT_ADL_SETTINGS.exchanges,
      ...(settings?.exchanges ?? {})
    }
  };

  return {
    enabled: Boolean(merged.enabled),
    alertLevelThreshold: toAdlLevel(merged.alertLevelThreshold),
    repeatAlertMinutes: normalizePositiveNumber(merged.repeatAlertMinutes, DEFAULT_ADL_SETTINGS.repeatAlertMinutes),
    pollingIntervalSeconds: normalizePositiveNumber(merged.pollingIntervalSeconds, DEFAULT_ADL_SETTINGS.pollingIntervalSeconds),
    exchanges: {
      Binance: Boolean(merged.exchanges.Binance),
      OKX: Boolean(merged.exchanges.OKX),
      Bybit: Boolean(merged.exchanges.Bybit)
    }
  };
}

function validateAdlPosition(position: AdlPosition): void {
  if (!EXCHANGES.includes(position.exchange)) throw new Error("exchange is invalid");
  if (!position.symbol.includes("/")) throw new Error("symbol must be normalized");
  if (position.side !== "LONG" && position.side !== "SHORT") throw new Error("side is invalid");
  if (!ADL_LEVELS.includes(position.adlLevel)) throw new Error("adlLevel is invalid");
  if (!Number.isFinite(position.quantity)) throw new Error("quantity must be a number");
  if (!Number.isFinite(position.notionalUsd)) throw new Error("notionalUsd must be a number");
  if (!Number.isFinite(position.markPrice)) throw new Error("markPrice must be a number");
}

async function readJson<T>(path: string, fallback: T): Promise<T> {
  try {
    return JSON.parse(await readFile(path, "utf8")) as T;
  } catch (error) {
    if (error instanceof Error && "code" in error && error.code === "ENOENT") {
      return fallback;
    }
    throw error;
  }
}

async function writeJson(path: string, value: unknown): Promise<void> {
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

function toAdlLevel(value: number): AdlLevel {
  const rounded = Math.round(value);
  if (rounded < 1) return 1;
  if (rounded > 5) return 5;
  return rounded as AdlLevel;
}

function normalizePositiveNumber(value: number, fallback: number): number {
  return Number.isFinite(value) && value > 0 ? value : fallback;
}
