import {
  getAdlSettings,
  listAdlPositions,
  mockRefreshAdlPositions,
  updateAdlSettings,
  type AdlStoreOptions
} from "./adlStore";
import type { AdlMonitorResult, AdlMonitorSummary, AdlPosition, AdlSettings } from "./types";

export type AdlApiResponse<T> = {
  status: number;
  data?: T;
  error?: string;
};

export async function getAdlMonitorResponse(options: AdlStoreOptions = {}): Promise<AdlApiResponse<AdlMonitorResult>> {
  const [positions, settings] = await Promise.all([listAdlPositions(options), getAdlSettings(options)]);

  return {
    status: 200,
    data: {
      positions,
      summary: summarizeAdlPositions(positions),
      settings,
      mock: true
    }
  };
}

export async function mockRefreshAdlResponse(
  options: AdlStoreOptions = {}
): Promise<AdlApiResponse<{ positions: AdlPosition[]; summary: AdlMonitorSummary; mock: true }>> {
  const positions = await mockRefreshAdlPositions(options);

  return {
    status: 200,
    data: {
      positions,
      summary: summarizeAdlPositions(positions),
      mock: true
    }
  };
}

export async function getAdlSettingsResponse(options: AdlStoreOptions = {}): Promise<AdlApiResponse<AdlSettings>> {
  return {
    status: 200,
    data: await getAdlSettings(options)
  };
}

export async function patchAdlSettingsResponse(
  body: unknown,
  options: AdlStoreOptions = {}
): Promise<AdlApiResponse<AdlSettings>> {
  try {
    return {
      status: 200,
      data: await updateAdlSettings(body as Partial<AdlSettings>, options)
    };
  } catch (error) {
    return {
      status: 400,
      error: error instanceof Error ? error.message : "invalid ADL settings payload"
    };
  }
}

export function summarizeAdlPositions(positions: AdlPosition[]): AdlMonitorSummary {
  return {
    positionCount: positions.length,
    adlLevel5Count: positions.filter((position) => position.adlLevel >= 5).length,
    adlLevel4PlusCount: positions.filter((position) => position.adlLevel >= 4).length,
    maxAdlLevel: positions.reduce((max, position) => Math.max(max, position.adlLevel), 0),
    latestUpdatedAt: positions.length > 0 ? Math.max(...positions.map((position) => position.updatedAt)) : null
  };
}
