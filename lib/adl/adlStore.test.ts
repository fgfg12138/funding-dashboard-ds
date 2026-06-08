import { mkdtemp, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  getAdlSettings,
  listAdlPositions,
  mockRefreshAdlPositions,
  updateAdlSettings,
  writeAdlPositions
} from "./adlStore";

let tempDir: string;
let adlPositionsPath: string;
let adlSettingsPath: string;

beforeEach(async () => {
  tempDir = await mkdtemp(join(tmpdir(), "adl-store-"));
  adlPositionsPath = join(tempDir, "adl-positions.json");
  adlSettingsPath = join(tempDir, "adl-settings.json");
});

afterEach(async () => {
  await rm(tempDir, { force: true, recursive: true });
});

describe("adlStore", () => {
  it("writes and reads ADL positions", async () => {
    await writeAdlPositions(
      [
        {
          id: "adl-1",
          exchange: "Binance",
          symbol: "BTC/USDT",
          side: "LONG",
          adlLevel: 5,
          quantity: 0.5,
          notionalUsd: 50_000,
          markPrice: 100_000,
          updatedAt: 1000,
          strategyId: "strategy-1",
          notes: "mock high risk"
        }
      ],
      { adlPositionsPath }
    );

    expect(await listAdlPositions({ adlPositionsPath })).toEqual([
      {
        id: "adl-1",
        exchange: "Binance",
        symbol: "BTC/USDT",
        side: "LONG",
        adlLevel: 5,
        quantity: 0.5,
        notionalUsd: 50_000,
        markPrice: 100_000,
        updatedAt: 1000,
        strategyId: "strategy-1",
        notes: "mock high risk"
      }
    ]);
  });

  it("returns default settings and persists setting updates", async () => {
    expect(await getAdlSettings({ adlSettingsPath })).toMatchObject({
      enabled: true,
      alertLevelThreshold: 5,
      repeatAlertMinutes: 30,
      pollingIntervalSeconds: 3,
      exchanges: {
        Binance: true,
        OKX: true,
        Bybit: true
      }
    });

    const updated = await updateAdlSettings(
      {
        enabled: false,
        alertLevelThreshold: 4,
        exchanges: { Binance: true, OKX: false, Bybit: true }
      },
      { adlSettingsPath }
    );

    expect(updated).toMatchObject({
      enabled: false,
      alertLevelThreshold: 4,
      exchanges: { Binance: true, OKX: false, Bybit: true }
    });
    expect(await getAdlSettings({ adlSettingsPath })).toEqual(updated);
  });

  it("mock refresh generates persisted simulated ADL positions", async () => {
    const positions = await mockRefreshAdlPositions({
      adlPositionsPath,
      now: 2000,
      idFactory: (index) => `mock-${index}`
    });

    expect(positions.length).toBeGreaterThan(0);
    expect(positions.every((position) => position.notes?.includes("mock"))).toBe(true);
    expect(positions.some((position) => position.adlLevel === 5)).toBe(true);
    expect(await listAdlPositions({ adlPositionsPath })).toEqual(positions);
  });
});
