/**
 * Funding Spread Engine — Cross-Exchange Funding Spread Engine
 *
 * Detects cross-exchange funding rate arbitrage opportunities using
 * mock (or real) ExchangeConnectors. Pure functions — no real API calls.
 */

import type { ExchangeConnector } from "../connectors/connectorTypes";
import type { FundingInfo } from "../connectors/fundingInfo";
import type {
  FundingSpreadOpportunity,
  FundingSpreadLeg,
  FundingSpreadConfig,
} from "./fundingSpreadTypes";
import { DEFAULT_SPREAD_CONFIG } from "./fundingSpreadTypes";
import { getFundingInterval, getFeeModel } from "../exchangeRegistry/exchangeRegistry";

// ─── Constants ─────────────────────────────────────────

/** Hours per year for APY calculation. */
const HOURS_PER_YEAR = 365.25 * 24;

// ─── 1. Get funding rates from all connectors ─────────

export async function getFundingRatesFromConnectors(
  connectors: Record<string, ExchangeConnector>,
  symbols: string[],
): Promise<FundingInfo[]> {
  const results: FundingInfo[] = [];

  for (const [name, connector] of Object.entries(connectors)) {
    for (const symbol of symbols) {
      try {
        const info = await connector.getFundingInfo(symbol);
        if (info) {
          results.push(info);
        }
      } catch {
        // Skip connectors that fail for a particular symbol
      }
    }
  }

  return results;
}

// ─── 2. Calculate spread between two funding infos ────

export function calculateFundingSpread(
  shortInfo: FundingInfo,
  longInfo: FundingInfo,
  config: FundingSpreadConfig = DEFAULT_SPREAD_CONFIG,
): FundingSpreadOpportunity | null {
  const shortInterval = getFundingIntervalHours(shortInfo.exchangeId, 8);
  const longInterval = getFundingIntervalHours(longInfo.exchangeId, 8);

  const spreadRate = shortInfo.lastFundingRate - longInfo.lastFundingRate;

  if (spreadRate < config.minSpreadRate) {
    return null;
  }

  // Average interval for APY calculation
  const avgIntervalHours = (shortInterval + longInterval) / 2;
  const intervalsPerYear = HOURS_PER_YEAR / avgIntervalHours;
  const spreadApy = spreadRate * intervalsPerYear * 100; // Convert to percentage

  if (spreadApy < config.minSpreadApy) {
    return null;
  }

  // Net APY after fees
  const feeCostPct = config.includeFees
    ? (config.takerFeePercent + config.makerFeePercent + config.slippagePercent)
    : 0;
  const netSpreadApy = spreadApy - feeCostPct;

  // Estimated funding per interval (positionSizeUsd * spreadRate)
  const estimatedFundingUsdPerInterval = config.positionSizeUsd * spreadRate;

  // Build legs
  const shortLeg: FundingSpreadLeg = {
    exchangeId: shortInfo.exchangeId,
    canonicalSymbol: shortInfo.canonicalSymbol,
    exchangeSymbol: shortInfo.exchangeSymbol,
    fundingRate: shortInfo.lastFundingRate,
    intervalHours: shortInterval,
    markPrice: shortInfo.markPrice,
    side: "short",
    expectedFundingDirection: shortInfo.lastFundingRate > 0 ? "receive" : "pay",
  };

  const longLeg: FundingSpreadLeg = {
    exchangeId: longInfo.exchangeId,
    canonicalSymbol: longInfo.canonicalSymbol,
    exchangeSymbol: longInfo.exchangeSymbol,
    fundingRate: longInfo.lastFundingRate,
    intervalHours: longInterval,
    markPrice: longInfo.markPrice,
    side: "long",
    expectedFundingDirection: longInfo.lastFundingRate > 0 ? "pay" : "receive",
  };

  const reasons: string[] = [
    `Short ${shortInfo.canonicalSymbol} on ${shortInfo.exchangeId} (funding=${(shortInfo.lastFundingRate * 100).toFixed(4)}%)`,
    `Long ${longInfo.canonicalSymbol} on ${longInfo.exchangeId} (funding=${(longInfo.lastFundingRate * 100).toFixed(4)}%)`,
    `Spread rate: ${(spreadRate * 100).toFixed(4)}% every ${avgIntervalHours}h`,
    `Estimated APY: ${spreadApy.toFixed(2)}% (net: ${netSpreadApy.toFixed(2)}%)`,
  ];

  const opportunityId = `${shortInfo.canonicalSymbol}-${shortInfo.exchangeId}-${longInfo.exchangeId}`.toLowerCase();

  return {
    id: opportunityId,
    canonicalSymbol: shortInfo.canonicalSymbol,
    shortExchangeId: shortInfo.exchangeId,
    longExchangeId: longInfo.exchangeId,
    shortLeg,
    longLeg,
    spreadRate,
    spreadApy,
    netSpreadApy,
    estimatedFundingUsdPerInterval,
    score: scoreFundingSpreadOpportunity(spreadApy, netSpreadApy),
    reasons,
    createdAt: Date.now(),
  };
}

// ─── 3. Score an opportunity ─────────────────────────

export function scoreFundingSpreadOpportunity(
  spreadApy: number,
  netSpreadApy: number,
): number {
  // Score 0-100 based on net APY, capped at 100
  const apyScore = Math.min(60, Math.max(0, netSpreadApy * 2));
  // Bonus for net being close to gross (good efficiency)
  const efficiencyRatio = spreadApy > 0 ? netSpreadApy / spreadApy : 0;
  const efficiencyScore = Math.min(40, efficiencyRatio * 40);

  return Math.round(apyScore + efficiencyScore);
}

// ─── 4. Find all cross-exchange funding spreads ──────

export async function findCrossExchangeFundingSpreads(
  connectors: Record<string, ExchangeConnector>,
  symbols: string[],
  config: FundingSpreadConfig = DEFAULT_SPREAD_CONFIG,
): Promise<FundingSpreadOpportunity[]> {
  const infos = await getFundingRatesFromConnectors(connectors, symbols);

  // Group by canonical symbol
  const bySymbol = new Map<string, FundingInfo[]>();
  for (const info of infos) {
    const list = bySymbol.get(info.canonicalSymbol) ?? [];
    list.push(info);
    bySymbol.set(info.canonicalSymbol, list);
  }

  const opportunities: FundingSpreadOpportunity[] = [];

  for (const [, group] of bySymbol) {
    if (group.length < 2) continue;

    // Sort by funding rate descending
    group.sort((a, b) => b.lastFundingRate - a.lastFundingRate);

    for (let i = 0; i < group.length; i++) {
      for (let j = i + 1; j < group.length; j++) {
        const shortInfo = group[i];  // Higher funding rate → short
        const longInfo = group[j];   // Lower funding rate → long

        // Skip same exchange
        if (shortInfo.exchangeId === longInfo.exchangeId) continue;

        // Filter by allowed exchanges
        if (config.allowedExchanges && config.allowedExchanges.length > 0) {
          if (!config.allowedExchanges.includes(shortInfo.exchangeId) ||
              !config.allowedExchanges.includes(longInfo.exchangeId)) {
            continue;
          }
        }

        const opp = calculateFundingSpread(shortInfo, longInfo, config);
        if (opp) {
          opportunities.push(opp);
        }
      }
    }
  }

  return rankFundingSpreadOpportunities(opportunities);
}

// ─── 5. Rank opportunities ──────────────────────────

export function rankFundingSpreadOpportunities(
  opportunities: FundingSpreadOpportunity[],
): FundingSpreadOpportunity[] {
  return [...opportunities].sort((a, b) => b.score - a.score);
}

// ─── Helper: get funding interval hours ───────────────

function getFundingIntervalHours(exchangeId: string, defaultHours: number): number {
  try {
    const interval = getFundingInterval(exchangeId);
    return interval.intervalHours;
  } catch {
    return defaultHours;
  }
}
