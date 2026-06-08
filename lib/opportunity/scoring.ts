/**
 * Opportunity Scoring Engine — pure function module.
 *
 * Scores an arbitrage opportunity on 0-100 based on return, cost,
 * liquidity, risk, and data confidence.  Outputs are used by the
 * /execution page for sorting and display.
 *
 * No side effects.  No network calls.  No real trading.
 */

// ─── Input ──────────────────────────────────────────────

export type ScorableOpportunity = {
  id: string;
  symbol: string;
  /** Gross annualized rate as a percentage (e.g. 21.5 = 21.5 %). */
  annualizedRate: number;
  /** Funding rate as decimal (e.g. 0.001 = 0.1 %). */
  fundingRate?: number;
  /** Estimated net annualized rate (after fees and slippage), as a percentage. */
  estimatedNetRate?: number;
  /** 24h volume in USD. */
  volume24h?: number;
  /** Open interest in USD. */
  openInterestUsd?: number;
  /** Risk tags inherited from the opportunity. */
  riskTags: string[];
  /** Whether the opportunity has secondary exchange (for cross-exchange type). */
  hasSecondaryExchange?: boolean;
};

// ─── Output ─────────────────────────────────────────────

export type ScoringComponents = {
  returnScore: number;
  costScore: number;
  liquidityScore: number;
  riskPenalty: number;
  confidenceScore: number;
};

export type ScoreGrade = "A" | "B" | "C" | "D";
export type RiskLevel = "low" | "medium" | "high";

export type ScoreResult = {
  /** Final score 0-100. */
  score: number;
  grade: ScoreGrade;
  riskLevel: RiskLevel;
  reasonCodes: string[];
  warnings: string[];
  components: ScoringComponents;
};

// ─── Constants ──────────────────────────────────────────

const HIGH_RETURN_WARN_THRESHOLD = 100; // annualized % — warn above this

const RISK_TAG_PENALTIES: Record<string, number> = {
  "低流动性": 15,
  "low-liquidity": 15,
  "wide-spread": 10,
  "wide-spread-bps": 10,
  "abnormal-funding": 12,
  "stale-data": 8,
  "高风险": 10,
  "基础差": 8,
};

const SEVERE_RISK_TAGS = new Set(["低流动性", "low-liquidity", "abnormal-funding"]);

// ─── Weights ────────────────────────────────────────────

const W_RETURN = 0.35;
const W_COST = 0.20;
const W_LIQUIDITY = 0.20;
const W_CONFIDENCE = 0.15;
const W_RISK_PENALTY = 0.10;

// ─── Scoring Functions ──────────────────────────────────

/**
 * Return score (0-100).
 *
 * Higher net annualized rate → higher score.
 * Uses estimatedNetRate if available, otherwise falls back to annualizedRate.
 * Extremely high returns (>100%) trigger a warning.
 */
function calcReturnScore(opp: ScorableOpportunity): { score: number; warnings: string[] } {
  const warnings: string[] = [];
  const rate = opp.estimatedNetRate ?? opp.annualizedRate;

  // Cap at 200% for scoring
  const capped = Math.min(rate, 200);

  // Score: 0 at 0%, 100 at ≥30%, linear in between
  const capRate = 30;
  let score = (capped / capRate) * 100;
  score = Math.max(0, Math.min(100, score));

  if (rate > HIGH_RETURN_WARN_THRESHOLD) {
    warnings.push(`异常高收益 (${rate.toFixed(1)}%)，请核实数据源`);
  }

  return { score, warnings };
}

/**
 * Cost score (0-100).
 *
 * Based on funding rate spread quality.  Lower funding rate is better (less cost to short).
 * When no fundingRate is available, give a neutral score with a warning.
 */
function calcCostScore(opp: ScorableOpportunity): { score: number; warnings: string[] } {
  const warnings: string[] = [];

  if (opp.fundingRate === undefined || opp.fundingRate === null) {
    warnings.push("缺少 fundingRate 数据，成本评分使用中性值");
    return { score: 50, warnings };
  }

  // Lower absolute funding rate = lower cost = higher score
  // fundingRate 0.001 (0.1%) → score ~75
  // fundingRate 0.005 (0.5%) → score ~50
  // fundingRate 0.01+  (1%+) → score low
  const absFunding = Math.abs(opp.fundingRate);
  let score = 100 - absFunding * 10_000;
  score = Math.max(0, Math.min(100, score));

  return { score, warnings };
}

/**
 * Liquidity score (0-100).
 *
 * Uses volume24h and openInterestUsd.  Higher liquidity → higher score.
 * Missing data yields a neutral score (50) with a warning.
 */
function calcLiquidityScore(opp: ScorableOpportunity): { score: number; warnings: string[] } {
  const warnings: string[] = [];
  let score = 50; // default neutral

  const hasVolume = opp.volume24h !== undefined && opp.volume24h !== null;
  const hasOI = opp.openInterestUsd !== undefined && opp.openInterestUsd !== null;

  if (!hasVolume && !hasOI) {
    warnings.push("缺少流动性数据 (volume / openInterest)");
    return { score: 40, warnings };
  }

  // Volume score (max 100)
  let volScore = 0;
  if (hasVolume) {
    const vol = opp.volume24h!;
    if (vol >= 1_000_000_000) volScore = 100;
    else if (vol >= 100_000_000) volScore = 80;
    else if (vol >= 10_000_000) volScore = 60;
    else if (vol >= 1_000_000) volScore = 40;
    else {
      volScore = 20;
      warnings.push("24h成交量较低 (< $1M)");
    }
  }

  // OI score (max 100)
  let oiScore = 0;
  if (hasOI) {
    const oi = opp.openInterestUsd!;
    if (oi >= 1_000_000_000) oiScore = 100;
    else if (oi >= 100_000_000) oiScore = 80;
    else if (oi >= 10_000_000) oiScore = 60;
    else {
      oiScore = 40;
      warnings.push("持仓量较低");
    }
  }

  // Average vol and oi contributions
  const count = (hasVolume ? 1 : 0) + (hasOI ? 1 : 0);
  score = (volScore + oiScore) / count;

  return { score, warnings };
}

/**
 * Risk penalty (0-100).
 *
 * Each known risk tag subtracts from the penalty.
 * Severe tags push the penalty high enough to flag riskLevel="high".
 */
function calcRiskPenalty(opp: ScorableOpportunity): { penalty: number; warnings: string[] } {
  const warnings: string[] = [];
  let penalty = 0;

  for (const tag of opp.riskTags) {
    const p = RISK_TAG_PENALTIES[tag];
    if (p !== undefined) {
      penalty += p;
    } else {
      // Unknown tags — treat as mild risk
      penalty += 3;
      warnings.push(`识别到未知风险标签: "${tag}"`);
    }
  }

  return { penalty: Math.min(100, penalty), warnings };
}

/**
 * Confidence score (0-100).
 *
 * Based on how many key fields are present.
 */
function calcConfidenceScore(opp: ScorableOpportunity): { score: number; warnings: string[] } {
  const warnings: string[] = [];
  let present = 0;
  const total = 5;

  if (opp.annualizedRate !== undefined && opp.annualizedRate !== null) present++;
  else warnings.push("缺少 annualizedRate");

  if (opp.fundingRate !== undefined && opp.fundingRate !== null) present++;
  if (opp.volume24h !== undefined && opp.volume24h !== null) present++;
  if (opp.openInterestUsd !== undefined && opp.openInterestUsd !== null) present++;
  if (opp.riskTags !== undefined) present++;

  const score = (present / total) * 100;
  return { score, warnings };
}

// ─── Public API ─────────────────────────────────────────

/**
 * Score a single opportunity.
 *
 * Returns a ScoreResult with breakdown, grade, risk level, and warnings.
 * Pure function — no side effects.
 */
export function scoreOpportunity(opp: ScorableOpportunity): ScoreResult {
  const allWarnings: string[] = [];
  const allReasons: string[] = [];

  const { score: returnScore, warnings: returnWarnings } = calcReturnScore(opp);
  allWarnings.push(...returnWarnings);
  allReasons.push(`returnScore=${returnScore.toFixed(1)}`);

  const { score: costScore, warnings: costWarnings } = calcCostScore(opp);
  allWarnings.push(...costWarnings);
  allReasons.push(`costScore=${costScore.toFixed(1)}`);

  const { score: liquidityScore, warnings: liquidityWarnings } = calcLiquidityScore(opp);
  allWarnings.push(...liquidityWarnings);
  allReasons.push(`liquidityScore=${liquidityScore.toFixed(1)}`);

  const { penalty: riskPenalty, warnings: riskWarnings } = calcRiskPenalty(opp);
  allWarnings.push(...riskWarnings);
  allReasons.push(`riskPenalty=${riskPenalty.toFixed(1)}`);

  const { score: confidenceScore, warnings: confidenceWarnings } = calcConfidenceScore(opp);
  allWarnings.push(...confidenceWarnings);
  allReasons.push(`confidenceScore=${confidenceScore.toFixed(1)}`);

  // Final weighted score
  let score = returnScore * W_RETURN
            + costScore * W_COST
            + liquidityScore * W_LIQUIDITY
            + confidenceScore * W_CONFIDENCE
            - riskPenalty * W_RISK_PENALTY;

  // Clamp to 0-100
  score = Math.max(0, Math.min(100, score));

  // Grade
  let grade: ScoreGrade;
  if (score >= 80) grade = "A";
  else if (score >= 65) grade = "B";
  else if (score >= 50) grade = "C";
  else grade = "D";

  // Risk level
  let riskLevel: RiskLevel;
  if (riskPenalty >= 20 || opp.riskTags.some((tag) => SEVERE_RISK_TAGS.has(tag))) {
    riskLevel = "high";
  } else if (riskPenalty >= 10 || opp.riskTags.length > 0) {
    riskLevel = "medium";
  } else {
    riskLevel = "low";
  }

  return {
    score: Math.round(score),
    grade,
    riskLevel,
    reasonCodes: allReasons,
    warnings: allWarnings,
    components: {
      returnScore: Math.round(returnScore),
      costScore: Math.round(costScore),
      liquidityScore: Math.round(liquidityScore),
      riskPenalty: Math.round(riskPenalty),
      confidenceScore: Math.round(confidenceScore),
    },
  };
}
