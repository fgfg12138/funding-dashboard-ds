import {
  createStrategy,
  deleteStrategy,
  listStrategies,
  updateStrategy,
  type StrategyStoreOptions
} from "./strategyStore";
import type { CreateStrategyInput, Strategy, UpdateStrategyInput } from "./types";

export type StrategyApiResponse<T> = {
  status: number;
  data?: T;
  error?: string;
};

export async function getStrategiesResponse(options: StrategyStoreOptions = {}): Promise<StrategyApiResponse<Strategy[]>> {
  return {
    status: 200,
    data: await listStrategies(options)
  };
}

export async function createStrategyResponse(
  body: unknown,
  options: StrategyStoreOptions = {}
): Promise<StrategyApiResponse<Strategy>> {
  try {
    const strategy = await createStrategy(body as CreateStrategyInput, options);
    return {
      status: 201,
      data: strategy
    };
  } catch (error) {
    return {
      status: 400,
      error: getErrorMessage(error)
    };
  }
}

export async function patchStrategyResponse(
  id: string,
  body: unknown,
  options: StrategyStoreOptions = {}
): Promise<StrategyApiResponse<Strategy>> {
  try {
    const strategy = await updateStrategy(id, body as UpdateStrategyInput, options);
    if (!strategy) {
      return {
        status: 404,
        error: "strategy not found"
      };
    }

    return {
      status: 200,
      data: strategy
    };
  } catch (error) {
    return {
      status: 400,
      error: getErrorMessage(error)
    };
  }
}

export async function deleteStrategyResponse(
  id: string,
  options: StrategyStoreOptions = {}
): Promise<StrategyApiResponse<{ deleted: boolean }>> {
  const deleted = await deleteStrategy(id, options);
  if (!deleted) {
    return {
      status: 404,
      error: "strategy not found"
    };
  }

  return {
    status: 200,
    data: { deleted: true }
  };
}

function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "invalid strategy payload";
}
