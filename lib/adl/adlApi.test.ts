import { mkdtemp, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  getAdlMonitorResponse,
  getAdlSettingsResponse,
  mockRefreshAdlResponse,
  patchAdlSettingsResponse
} from "./adlApi";
import { writeAdlPositions } from "./adlStore";

let tempDir: string;
let adlPositionsPath: string;
let adlSettingsPath: string;

beforeEach(async () => {
  tempDir = await mkdtemp(join(tmpdir(), "adl-api-"));
  adlPositionsPath = join(tempDir, "adl-positions.json");
  adlSettingsPath = join(tempDir, "adl-settings.json");
});

afterEach(async () => {
  await rm(tempDir, { force: true, recursive: true });
});

describe("adlApi", () => {
  it("returns ADL monitor positions and summary", async () => {
    await writeAdlPositions(
      [
        {
          id: "adl-1",
          exchange: "Bybit",
          symbol: "BTC/USDT",
          side: "SHORT",
          adlLevel: 5,
          quantity: 1,
          notionalUsd: 100_000,
          markPrice: 100_000,
          updatedAt: 3000
        },
        {
          id: "adl-2",
          exchange: "OKX",
          symbol: "ETH/USDT",
          side: "LONG",
          adlLevel: 4,
          quantity: 10,
          notionalUsd: 30_000,
          markPrice: 3000,
          updatedAt: 2000
        }
      ],
      { adlPositionsPath }
    );

    const response = await getAdlMonitorResponse({ adlPositionsPath });

    expect(response.status).toBe(200);
    expect(response.data?.summary).toMatchObject({
      positionCount: 2,
      adlLevel5Count: 1,
      adlLevel4PlusCount: 2,
      maxAdlLevel: 5,
      latestUpdatedAt: 3000
    });
  });

  it("gets and patches settings", async () => {
    const initial = await getAdlSettingsResponse({ adlSettingsPath });
    const patched = await patchAdlSettingsResponse(
      {
        enabled: false,
        repeatAlertMinutes: 45,
        pollingIntervalSeconds: 5,
        exchanges: { Binance: false, OKX: true, Bybit: true }
      },
      { adlSettingsPath }
    );

    expect(initial.data?.alertLevelThreshold).toBe(5);
    expect(patched.status).toBe(200);
    expect(patched.data).toMatchObject({
      enabled: false,
      repeatAlertMinutes: 45,
      pollingIntervalSeconds: 5,
      exchanges: { Binance: false, OKX: true, Bybit: true }
    });
  });

  it("mock refresh returns simulated positions", async () => {
    const response = await mockRefreshAdlResponse({
      adlPositionsPath,
      now: 4000,
      idFactory: (index) => `mock-${index}`
    });

    expect(response.status).toBe(200);
    expect(response.data?.mock).toBe(true);
    expect(response.data?.positions.length).toBeGreaterThan(0);
    expect(response.data?.positions[0].updatedAt).toBe(4000);
  });
});
