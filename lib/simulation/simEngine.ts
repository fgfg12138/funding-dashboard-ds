import type { AlphaOpportunity } from "../research/alphaScore";
import { SimAccount, type SimAccountSnapshot, type SimMarketData, type SimPosition, type SimTrade } from "./simAccount";

export type SimEngineConfig = {
  maxPositionFraction?: number;
  minOpenAlphaScore?: number;
  closeAlphaScoreThreshold?: number;
  maxHoldingHours?: number;
  closeOnFundingReversal?: boolean;
  maxOpenPositions?: number;
};

export type SimulationRoundInput = {
  account: SimAccount;
  alphaRows: AlphaOpportunity[];
  marketData: SimMarketData[];
  now?: number;
  config?: SimEngineConfig;
};

export type SimulationRoundResult = {
  snapshot: SimAccountSnapshot;
  opened: SimPosition[];
  closed: SimTrade[];
};

const DEFAULT_CONFIG: Required<SimEngineConfig> = {
  maxPositionFraction: 0.1,
  minOpenAlphaScore: 80,
  closeAlphaScoreThreshold: 60,
  maxHoldingHours: 24,
  closeOnFundingReversal: true,
  maxOpenPositions: 5
};

export function runSimulationRound(input: SimulationRoundInput): SimulationRoundResult {
  const now = input.now ?? Date.now();
  const config = { ...DEFAULT_CONFIG, ...compactConfig(input.config) };
  input.account.updateMarkets(input.marketData);
  const alphaBySymbol = new Map(input.alphaRows.map((row) => [row.symbol, row]));
  const marketBySymbol = getBestMarketBySymbol(input.marketData);
  const closed = closePositions(input.account, alphaBySymbol, marketBySymbol, config, now);
  const opened = openPositions(input.account, input.alphaRows, marketBySymbol, config, now);

  return {
    opened,
    closed,
    snapshot: input.account.getAccountSnapshot(now)
  };
}

function compactConfig(config: SimEngineConfig | undefined): SimEngineConfig {
  if (!config) {
    return {};
  }

  return Object.fromEntries(Object.entries(config).filter(([, value]) => value !== undefined)) as SimEngineConfig;
}

function closePositions(
  account: SimAccount,
  alphaBySymbol: Map<string, AlphaOpportunity>,
  marketBySymbol: Map<string, SimMarketData>,
  config: Required<SimEngineConfig>,
  now: number
): SimTrade[] {
  const closed: SimTrade[] = [];

  for (const position of account.positions.slice()) {
    const alpha = alphaBySymbol.get(position.symbol);
    const market = marketBySymbol.get(position.symbol);
    const holdingHours = (now - position.entryTime) / 60 / 60_000;
    const shouldClose =
      !alpha ||
      alpha.alphaScore < config.closeAlphaScoreThreshold ||
      holdingHours >= config.maxHoldingHours ||
      Boolean(config.closeOnFundingReversal && market && market.fundingRate < 0);

    if (shouldClose) {
      const trade = account.closePosition(position.symbol, position.exchange, position.type, now);
      if (trade) {
        closed.push(trade);
      }
    }
  }

  return closed;
}

function openPositions(
  account: SimAccount,
  alphaRows: AlphaOpportunity[],
  marketBySymbol: Map<string, SimMarketData>,
  config: Required<SimEngineConfig>,
  now: number
): SimPosition[] {
  const opened: SimPosition[] = [];
  const candidates = alphaRows
    .filter((row) => row.alphaScore >= config.minOpenAlphaScore)
    .filter((row) => row.alphaType !== "Risky Alpha")
    .slice()
    .sort((a, b) => b.alphaScore - a.alphaScore || b.qualityScore - a.qualityScore);

  for (const alpha of candidates) {
    if (account.positions.length >= config.maxOpenPositions) {
      break;
    }

    const market = marketBySymbol.get(alpha.symbol);
    if (!market || market.markPrice <= 0) {
      continue;
    }
    if (account.hasPosition(alpha.symbol, market.exchange, alpha.type)) {
      continue;
    }

    const notional = account.currentBalance * config.maxPositionFraction;
    const quantity = notional / market.markPrice;
    opened.push(account.openPosition(alpha.symbol, market.exchange, alpha.type, quantity, alpha.alphaScore, now));
  }

  return opened;
}

function getBestMarketBySymbol(markets: SimMarketData[]): Map<string, SimMarketData> {
  const best = new Map<string, SimMarketData>();
  for (const market of markets) {
    const existing = best.get(market.symbol);
    if (!existing || market.timestamp > existing.timestamp) {
      best.set(market.symbol, market);
    }
  }

  return best;
}
