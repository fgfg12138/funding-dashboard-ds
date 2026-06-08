import { mkdtemp, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  createStrategyResponse,
  deleteStrategyResponse,
  getStrategiesResponse,
  patchStrategyResponse
} from "./strategyApi";

let tempDir: string;
let strategyPath: string;

beforeEach(async () => {
  tempDir = await mkdtemp(join(tmpdir(), "strategy-api-"));
  strategyPath = join(tempDir, "strategies.json");
});

afterEach(async () => {
  await rm(tempDir, { force: true, recursive: true });
});

describe("strategyApi", () => {
  it("creates and lists strategies", async () => {
    const created = await createStrategyResponse(
      {
        name: "BTC strategy",
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
    const list = await getStrategiesResponse({ strategyPath });

    expect(created.status).toBe(201);
    expect(created.data?.id).toBe("strategy-1");
    expect(list.status).toBe(200);
    expect(list.data).toHaveLength(1);
  });

  it("patches strategy status through running, paused, and stopped", async () => {
    await createStrategyResponse(
      {
        name: "ETH strategy",
        strategyType: "CrossExchange",
        symbol: "ETH/USDT",
        longExchange: "Binance",
        shortExchange: "OKX",
        minFundingSpread: 0.0002,
        minAnnualizedSpread: 25
      },
      { idFactory: () => "strategy-1", now: 1000, strategyPath }
    );

    const running = await patchStrategyResponse("strategy-1", { status: "running" }, { now: 2000, strategyPath });
    const paused = await patchStrategyResponse("strategy-1", { status: "paused" }, { now: 3000, strategyPath });
    const stopped = await patchStrategyResponse("strategy-1", { status: "stopped" }, { now: 4000, strategyPath });

    expect(running.data?.status).toBe("running");
    expect(paused.data?.status).toBe("paused");
    expect(stopped.data?.status).toBe("stopped");
    expect(stopped.data?.updatedAt).toBe(4000);
  });

  it("deletes strategies", async () => {
    await createStrategyResponse(
      {
        name: "BTC strategy",
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

    const deleted = await deleteStrategyResponse("strategy-1", { strategyPath });
    const list = await getStrategiesResponse({ strategyPath });

    expect(deleted.status).toBe(200);
    expect(deleted.data).toEqual({ deleted: true });
    expect(list.data).toEqual([]);
  });

  it("returns validation errors for invalid payloads", async () => {
    const response = await createStrategyResponse(
      {
        name: "",
        strategyType: "SpotPerp",
        symbol: "BTC/USDT"
      },
      { strategyPath }
    );

    expect(response.status).toBe(400);
    expect(response.error).toContain("name");
  });
});
