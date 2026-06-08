import { calculateAnnualizedRate } from "../arbitrage/calculations";
import type { FundingMarket, SpotMarket } from "../exchanges/types";
import type { BasisOpportunity } from "./types";

const LOW_LIQUIDITY = "低流动性";
const MISSING_OPEN_INTEREST = "持仓量缺失";
const WIDE_BASIS = "基差过大";
const HIGH_FUNDING_RATE = "高费率";
const ABNORMAL_FUNDING_RATE = "异常费率";
const NEAR_SETTLEMENT = "结算临近";

export type BasisQualityInput = {
  annualizedFundingRate: number;
  estimatedCarryAnnualized: number;
  basisPercent: number;
  volume24h?: number;
  openInterestUsd?: number;
};

export type BasisRiskInput = {
  annualizedFundingRate: number;
  basisPercent: number;
  volume24h?: number;
  openInterestUsd?: number;
  nextFundingTime: number;
  now?: number;
};

export function calculateBasisPercent(perpPrice: number, spotPrice: number): number {
  if (!Number.isFinite(perpPrice) || !Number.isFinite(spotPrice) || spotPrice <= 0) {
    return 0;
  }

  return ((perpPrice - spotPrice) / spotPrice) * 100;
}

export function calculateEstimatedCarryAnnualized(annualizedFundingRate: number, basisPercent: number): number {
  if (!Number.isFinite(annualizedFundingRate) || !Number.isFinite(basisPercent)) {
    return 0;
  }

  return annualizedFundingRate - Math.abs(basisPercent);
}

export function calculateBasisScore(input: BasisQualityInput): number {
  const annualizedScore = scoreAnnualized(input.annualizedFundingRate) * 0.35;
  const carryScore = scoreAnnualized(Math.max(0, input.estimatedCarryAnnualized)) * 0.25;
  const volumeScore = clamp((input.volume24h ?? 0) / 100_000_000) * 15;
  const openInterestScore = clamp((input.openInterestUsd ?? 0) / 100_000_000) * 15;
  const basisScore = clamp(1 - Math.abs(input.basisPercent) / 2) * 10;

  return Math.round(clamp(annualizedScore + carryScore + volumeScore + openInterestScore + basisScore, 0, 100));
}

export function getBasisRiskTags(input: BasisRiskInput): string[] {
  const tags: string[] = [];
  const now = input.now ?? Date.now();

  if ((input.volume24h ?? 0) < 1_000_000) {
    tags.push(LOW_LIQUIDITY);
  }
  if (!input.openInterestUsd || input.openInterestUsd <= 0) {
    tags.push(MISSING_OPEN_INTEREST);
  }
  if (Math.abs(input.basisPercent) >= 1) {
    tags.push(WIDE_BASIS);
  }
  if (input.annualizedFundingRate >= 90) {
    tags.push(HIGH_FUNDING_RATE);
  }
  if (input.annualizedFundingRate >= 300) {
    tags.push(ABNORMAL_FUNDING_RATE);
  }
  if (input.nextFundingTime > now && input.nextFundingTime - now <= 30 * 60_000) {
    tags.push(NEAR_SETTLEMENT);
  }

  return tags;
}

export function calculateBasisOpportunity(spot: SpotMarket, perp: FundingMarket, now = Date.now()): BasisOpportunity | null {
  if (spot.exchange !== perp.exchange || spot.symbol !== perp.symbol || perp.fundingRate <= 0) {
    return null;
  }

  const basisPercent = calculateBasisPercent(perp.markPrice, spot.price);
  const annualizedFundingRate = calculateAnnualizedRate(perp.fundingRate, perp.fundingIntervalHours);
  const estimatedCarryAnnualized = calculateEstimatedCarryAnnualized(annualizedFundingRate, basisPercent);
  const volume24h = Math.max(spot.volume24h ?? 0, perp.volume24h ?? 0) || undefined;
  const qualityInput = {
    annualizedFundingRate,
    estimatedCarryAnnualized,
    basisPercent,
    volume24h,
    openInterestUsd: perp.openInterestUsd
  };

  return {
    symbol: spot.symbol,
    base: spot.base,
    quote: spot.quote,
    spotExchange: spot.exchange,
    perpExchange: perp.exchange,
    spotPrice: spot.price,
    perpPrice: perp.markPrice,
    basisPercent,
    fundingRate: perp.fundingRate,
    annualizedFundingRate,
    estimatedCarryAnnualized,
    volume24h,
    openInterestUsd: perp.openInterestUsd,
    nextFundingTime: perp.nextFundingTime,
    score: calculateBasisScore(qualityInput),
    riskTags: getBasisRiskTags({
      ...qualityInput,
      nextFundingTime: perp.nextFundingTime,
      now
    }),
    opportunityReason: describeBasisOpportunity(perp.exchange, basisPercent, annualizedFundingRate, estimatedCarryAnnualized, volume24h, perp.openInterestUsd)
  };
}

export function buildBasisOpportunities(spots: SpotMarket[], perps: FundingMarket[], now = Date.now()): BasisOpportunity[] {
  const spotByExchangeSymbol = new Map<string, SpotMarket>();

  for (const spot of spots) {
    const key = `${spot.exchange}:${spot.symbol}`;
    const existing = spotByExchangeSymbol.get(key);
    if (!existing || (spot.volume24h ?? 0) > (existing.volume24h ?? 0)) {
      spotByExchangeSymbol.set(key, spot);
    }
  }

  return perps
    .map((perp) => {
      const spot = spotByExchangeSymbol.get(`${perp.exchange}:${perp.symbol}`);
      return spot ? calculateBasisOpportunity(spot, perp, now) : null;
    })
    .filter((item): item is BasisOpportunity => Boolean(item))
    .sort((a, b) => b.score - a.score || b.estimatedCarryAnnualized - a.estimatedCarryAnnualized);
}

function describeBasisOpportunity(
  exchange: string,
  basisPercent: number,
  annualizedFundingRate: number,
  estimatedCarryAnnualized: number,
  volume24h: number | undefined,
  openInterestUsd: number | undefined
): string {
  return `${exchange} 买现货 / 空永续；基差 ${basisPercent.toFixed(2)}%，年化资金费率 ${annualizedFundingRate.toFixed(2)}%，估算 Carry ${estimatedCarryAnnualized.toFixed(2)}%；${describeLiquidity(volume24h)}，${describeOpenInterest(openInterestUsd)}。`;
}

function describeLiquidity(volume24h: number | undefined): string {
  return (volume24h ?? 0) >= 1_000_000 ? "24h成交量充足" : "24h成交量偏低";
}

function describeOpenInterest(openInterestUsd: number | undefined): string {
  return openInterestUsd && openInterestUsd > 0 ? "持仓量正常" : "持仓量缺失";
}

function scoreAnnualized(value: number): number {
  if (!Number.isFinite(value) || value <= 0) {
    return 0;
  }
  if (value <= 30) {
    return (value / 30) * 30;
  }
  if (value <= 90) {
    return 30 + ((value - 30) / 60) * 30;
  }
  if (value <= 300) {
    return 60 + ((value - 90) / 210) * 25;
  }

  return 85;
}

function clamp(value: number, min = 0, max = 1): number {
  if (!Number.isFinite(value)) {
    return min;
  }

  return Math.min(max, Math.max(min, value));
}
