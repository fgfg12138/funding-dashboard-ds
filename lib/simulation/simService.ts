import { queryAllFundingHistory, queryAllOpportunityHistory } from "../data/historyStore";
import { buildAlphaDiscovery, parseAlphaWindowHours } from "../research/alphaScore";
import { buildFundingFactorResearch } from "../research/fundingFactors";
import { SimAccount, type SimAccountSnapshot, type SimMarketData } from "./simAccount";
import { runSimulationRound, type SimEngineConfig, type SimulationRoundResult } from "./simEngine";
import { appendSimSnapshot, querySimSnapshots, readSimAccountState, writeSimAccountState } from "./simStore";

const DEFAULT_INITIAL_BALANCE = 100_000;

export type SimulationRunOptions = {
  window?: string | null;
  now?: number;
  config?: SimEngineConfig;
};

export async function getSimulationAccount(): Promise<SimAccountSnapshot> {
  const account = await loadAccount();
  return account.getAccountSnapshot(Date.now());
}

export async function getSimulationHistory(limit = 500): Promise<SimAccountSnapshot[]> {
  return querySimSnapshots({ limit });
}

export async function runSimulation(options: SimulationRunOptions = {}): Promise<SimulationRoundResult> {
  const now = options.now ?? Date.now();
  const windowHours = parseAlphaWindowHours(options.window);
  const from = now - windowHours * 60 * 60_000;
  const [opportunityRows, fundingRows] = await Promise.all([
    queryAllOpportunityHistory({ from, to: now, limit: 5000 }),
    queryAllFundingHistory({ from, to: now, limit: 5000 })
  ]);
  const factorResearch = buildFundingFactorResearch({ opportunityRows, fundingRows, now, windowHours });
  const alphaRows = buildAlphaDiscovery({ samples: factorResearch.samples, limit: factorResearch.samples.length }).topAlpha;
  const account = await loadAccount();
  const result = runSimulationRound({
    account,
    alphaRows,
    marketData: buildSimulationMarketData(fundingRows),
    now,
    config: options.config
  });

  await Promise.all([writeSimAccountState(account.toState()), appendSimSnapshot(result.snapshot)]);

  return result;
}

async function loadAccount(): Promise<SimAccount> {
  const state = await readSimAccountState();
  return new SimAccount(state ?? { initialBalance: DEFAULT_INITIAL_BALANCE });
}

function buildSimulationMarketData(rows: Awaited<ReturnType<typeof queryAllFundingHistory>>): SimMarketData[] {
  const latest = new Map<string, (typeof rows)[number]>();
  for (const row of rows) {
    const key = `${row.exchange}:${row.symbol}`;
    const existing = latest.get(key);
    if (!existing || row.timestamp > existing.timestamp) {
      latest.set(key, row);
    }
  }

  return Array.from(latest.values()).map((row) => ({
    symbol: row.symbol,
    exchange: row.exchange,
    markPrice: row.markPrice,
    fundingRate: row.fundingRate,
    timestamp: row.timestamp
  }));
}
