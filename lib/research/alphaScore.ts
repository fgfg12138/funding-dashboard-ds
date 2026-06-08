import type { FundingFactorSample } from "./fundingFactors";

export type AlphaGrade = "A+" | "A" | "B" | "C" | "D";
export type AlphaType = "Stable Alpha" | "Emerging Alpha" | "Momentum Alpha" | "Risky Alpha";

export type AlphaDiscoveryFilters = {
  type?: "all" | AlphaType;
  minAlphaScore?: number;
};

export type AlphaDiscoveryOptions = {
  samples: FundingFactorSample[];
  limit?: number;
  filters?: AlphaDiscoveryFilters;
};

export type AlphaApiQuery = {
  get(name: string): string | null;
};

export type AlphaOpportunity = FundingFactorSample & {
  alphaScore: number;
  alphaGrade: AlphaGrade;
  alphaType: AlphaType;
  alphaReason: string;
  exchangePair: string;
};

export type AlphaDiscoveryResult = {
  topAlpha: AlphaOpportunity[];
  topStableAlpha: AlphaOpportunity[];
  topEmergingAlpha: AlphaOpportunity[];
  topMomentumAlpha: AlphaOpportunity[];
  topRiskyAlpha: AlphaOpportunity[];
};

export function buildAlphaDiscovery(options: AlphaDiscoveryOptions): AlphaDiscoveryResult {
  const limit = normalizeLimit(options.limit);
  const rows = options.samples
    .map(toAlphaOpportunity)
    .filter((row) => options.filters?.type === undefined || options.filters.type === "all" || row.alphaType === options.filters.type)
    .filter((row) => options.filters?.minAlphaScore === undefined || row.alphaScore >= options.filters.minAlphaScore)
    .sort(sortByAlphaScore);

  return {
    topAlpha: rows.slice(0, limit),
    topStableAlpha: topByType(rows, "Stable Alpha", limit),
    topEmergingAlpha: topByType(rows, "Emerging Alpha", limit),
    topMomentumAlpha: topByType(rows, "Momentum Alpha", limit),
    topRiskyAlpha: topByType(rows, "Risky Alpha", limit)
  };
}

export function buildAlphaApiPayload(samples: FundingFactorSample[], query: AlphaApiQuery): AlphaDiscoveryResult {
  return buildAlphaDiscovery({
    samples,
    limit: parseNumberParam(query.get("limit")) ?? 20,
    filters: {
      type: parseAlphaType(query.get("type")),
      minAlphaScore: parseNumberParam(query.get("minAlphaScore"))
    }
  });
}

export function calculateAlphaScore(sample: FundingFactorSample): number {
  const latestAnnualizedScore = clamp(sample.latestAnnualized / 120) * 25;
  const avgAnnualizedScore = clamp(sample.avgAnnualized / 90) * 15;
  const positiveFundingScore = clamp(sample.positiveFundingRatio) * 15;
  const survivalScore = clamp(sample.survivalHours / 24) * 15;
  const decayScore = clamp(1 - Math.max(sample.annualizedDecay, 0) / 80) * 15;
  const qualityScore = clamp(sample.qualityScore / 100) * 10;
  const volatilityScore = clamp(1 - sample.fundingVolatility / 100) * 5;

  return Math.round(
    latestAnnualizedScore +
      avgAnnualizedScore +
      positiveFundingScore +
      survivalScore +
      decayScore +
      qualityScore +
      volatilityScore
  );
}

export function gradeAlphaScore(score: number): AlphaGrade {
  if (score >= 85) return "A+";
  if (score >= 75) return "A";
  if (score >= 60) return "B";
  if (score >= 40) return "C";
  return "D";
}

export function classifyAlpha(sample: FundingFactorSample): AlphaType {
  if (sample.fundingVolatility >= 80 || sample.annualizedDecay >= 50) {
    return "Risky Alpha";
  }
  if (sample.survivalHours >= 8 && sample.annualizedDecay <= 15) {
    return "Stable Alpha";
  }
  if (sample.survivalHours <= 4 && sample.annualizedDecay <= -10) {
    return "Emerging Alpha";
  }
  if (sample.positiveFundingRatio >= 0.8 && sample.avgAnnualized >= 30) {
    return "Momentum Alpha";
  }

  return sample.fundingVolatility >= 60 || sample.annualizedDecay >= 35 ? "Risky Alpha" : "Momentum Alpha";
}

export function parseAlphaWindowHours(value: string | null | undefined): number {
  if (value === "1" || value === "1h") return 1;
  if (value === "7d" || value === "168") return 168;
  if (value === "30d" || value === "720") return 720;
  return 24;
}

function toAlphaOpportunity(sample: FundingFactorSample): AlphaOpportunity {
  const alphaScore = calculateAlphaScore(sample);
  const alphaType = classifyAlpha(sample);

  return {
    ...sample,
    alphaScore,
    alphaGrade: gradeAlphaScore(alphaScore),
    alphaType,
    alphaReason: buildAlphaReason(alphaType),
    exchangePair: getExchangePair(sample)
  };
}

function buildAlphaReason(alphaType: AlphaType): string {
  if (alphaType === "Stable Alpha") {
    return "\u0046\u0075\u006e\u0064\u0069\u006e\u0067\u8fde\u7eed\u4fdd\u6301\u6b63\u503c\uff0c\u7a97\u53e3\u5185\u8870\u51cf\u8f83\u5c0f\uff0c\u5386\u53f2\u5b58\u6d3b\u65f6\u95f4\u957f\u3002";
  }
  if (alphaType === "Emerging Alpha") {
    return "\u5e74\u5316\u5feb\u901f\u4e0a\u5347\uff0c\u4f46\u4ecd\u9700\u89c2\u5bdf\u540e\u7eed\u7a33\u5b9a\u6027\u3002";
  }
  if (alphaType === "Momentum Alpha") {
    return "\u6301\u7eed\u9ad8\u0046\u0075\u006e\u0064\u0069\u006e\u0067\u4e14\u6b63\u8d39\u7387\u5360\u6bd4\u8f83\u9ad8\u3002";
  }

  return "\u5e74\u5316\u6216\u4ef7\u5dee\u673a\u4f1a\u4ecd\u5b58\u5728\uff0c\u4f46\u6ce2\u52a8\u548c\u8870\u51cf\u8f83\u9ad8\u3002";
}

function topByType(rows: AlphaOpportunity[], type: AlphaType, limit: number): AlphaOpportunity[] {
  return rows.filter((row) => row.alphaType === type).slice(0, limit);
}

function sortByAlphaScore(a: AlphaOpportunity, b: AlphaOpportunity): number {
  return b.alphaScore - a.alphaScore || b.latestAnnualized - a.latestAnnualized || a.symbol.localeCompare(b.symbol);
}

function getExchangePair(sample: FundingFactorSample): string {
  const [, , firstExchange, secondExchange] = sample.id.split(":");
  if (!firstExchange || !secondExchange || firstExchange === "-" || secondExchange === "-") {
    return "-";
  }

  return sample.type === "cross-exchange" ? `${firstExchange} / ${secondExchange}` : `${firstExchange} spot / ${secondExchange} perp`;
}

function normalizeLimit(limit: number | undefined): number {
  if (!Number.isFinite(limit) || limit === undefined || limit <= 0) {
    return 20;
  }

  return Math.floor(limit);
}

function parseAlphaType(value: string | null): AlphaDiscoveryFilters["type"] {
  if (value === "Stable Alpha" || value === "Emerging Alpha" || value === "Momentum Alpha" || value === "Risky Alpha") {
    return value;
  }

  return "all";
}

function parseNumberParam(value: string | null): number | undefined {
  if (!value) return undefined;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function clamp(value: number): number {
  if (!Number.isFinite(value)) {
    return 0;
  }

  return Math.min(1, Math.max(0, value));
}
