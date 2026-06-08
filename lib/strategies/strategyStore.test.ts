import { mkdtemp, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  createStrategy,
  deleteStrategy,
  getStrategy,
  listStrategies,
  updateStrategy
} from "./strategyStore";

let tempDir: string;
let strategyPath: string;

beforeEach(async () => {
  tempDir = await mkdtemp(join(tmpdir(), "strategy-store-"));
  strategyPath = join(tempDir, "strategies.json");
});

afterEach(async () => {
  await rm(tempDir, { force: true, recursive: true });
});

describe("strategyStore", () => {
  it("creates and persists a SpotPerp strategy", async () => {
    const created = await createStrategy(
      {
        name: "BTC spot perp",
        strategyType: "SpotPerp",
        symbol: "BTC/USDT",
        spotExchange: "Binance",
        perpExchange: "Bybit",
        minFundingRate: 0.0001,
        minAnnualized: 30,
        maxLeverage: 2,
        notes: "read only config"
      },
      { idFactory: () => "strategy-1", now: 1000, strategyPath }
    );

    expect(created).toMatchObject({
      id: "strategy-1",
      name: "BTC spot perp",
      strategyType: "SpotPerp",
      symbol: "BTC/USDT",
      exchangePair: "Binance / Bybit",
      status: "draft",
      createdAt: 1000,
      updatedAt: 1000
    });

    const fromDisk = await listStrategies({ strategyPath });
    expect(fromDisk).toEqual([created]);
  });

  it("creates and persists a CrossExchange strategy", async () => {
    const created = await createStrategy(
      {
        name: "ETH cross exchange",
        strategyType: "CrossExchange",
        symbol: "ETH/USDT",
        longExchange: "Binance",
        shortExchange: "OKX",
        minFundingSpread: 0.0002,
        minAnnualizedSpread: 25
      },
      { idFactory: () => "strategy-2", now: 2000, strategyPath }
    );

    expect(created).toMatchObject({
      strategyType: "CrossExchange",
      exchangePair: "Binance / OKX",
      status: "draft"
    });
  });

  it("updates status and editable fields", async () => {
    await createStrategy(
      {
        name: "BTC spot perp",
        strategyType: "SpotPerp",
        symbol: "BTC/USDT",
        spotExchange: "Binance",
        perpExchange: "Bybit",
        minFundingRate: 0.0001,
        minAnnualized: 30,
        maxLeverage: 2
      },
      { idFactory: () => "strategy-1", now: 1000, strategyPath }
    );

    const updated = await updateStrategy(
      "strategy-1",
      {
        status: "paused",
        notes: "paused for review",
        minAnnualized: 45
      },
      { now: 3000, strategyPath }
    );

    expect(updated).toMatchObject({
      id: "strategy-1",
      status: "paused",
      notes: "paused for review",
      minAnnualized: 45,
      updatedAt: 3000
    });
  });

  it("deletes strategies", async () => {
    await createStrategy(
      {
        name: "BTC spot perp",
        strategyType: "SpotPerp",
        symbol: "BTC/USDT",
        spotExchange: "Binance",
        perpExchange: "Bybit",
        minFundingRate: 0.0001,
        minAnnualized: 30,
        maxLeverage: 2
      },
      { idFactory: () => "strategy-1", now: 1000, strategyPath }
    );

    expect(await deleteStrategy("strategy-1", { strategyPath })).toBe(true);
    expect(await getStrategy("strategy-1", { strategyPath })).toBeUndefined();
    expect(await listStrategies({ strategyPath })).toEqual([]);
  });
});
