/**
 * Risk Gate — pure function risk check layer.
 *
 * Evaluates whether a paper execution should be allowed based on
 * scoring result, estimated returns, current portfolio state, and
 * configurable thresholds.
 *
 * No side effects.  No network calls.  No real trading.
 */

import type { ScoreResult, RiskLevel } from "../opportunity/scoring";
import type { ExecutionEstimateResult } from "../execution/types";
import type { PaperExecution } from "../execution/types";
import type { AccountRiskContext } from "./accountRiskContext";

// ─── Config ─────────────────────────────────────────────

export type RiskGateConfig = {
  /** Minimum opportunity score (0-100) to pass. Default 50. */
  minScore: number;
  /** Maximum allowed risk level. Default "medium". */
  maxRiskLevel: RiskLevel;
  /** Minimum annualized net rate (%) to pass. Default 5. */
  minAnnualizedNetRate: number;
  /** Maximum number of concurrently open executions. Default 10. */
  maxOpenExecutions: number;
  /** Maximum total notional USD across all open executions. Default 100_000. */
  maxOpenNotionalUsd: number;
  /** Maximum single-symbol notional exposure in USD. Default 20_000. */
  maxSymbolExposureUsd: number;
  /** Risk tags that automatically block execution. */
  blockRiskTags: string[];
  /** Maximum fraction of total account value in position exposure. Default 0.5 (50%). */
  maxAccountExposurePercent: number;
  /** Maximum fraction of total account value in a single symbol. Default 0.2 (20%). */
  maxSymbolAccountExposurePercent: number;
  /** Minimum available USDT balance required. Default 1000. */
  minAvailableUsdBalance: number;
  /** Whether to perform account-level risk checks. Default false (Phase 3.6+). */
  includeAccountSnapshotRisk: boolean;
};

export const DEFAULT_RISK_GATE_CONFIG: RiskGateConfig = {
  minScore: 50,
  maxRiskLevel: "medium",
  minAnnualizedNetRate: 5,
  maxOpenExecutions: 10,
  maxOpenNotionalUsd: 100_000,
  maxSymbolExposureUsd: 20_000,
  blockRiskTags: [
    "abnormal-funding",
    "stale-data",
    "low-liquidity",
    "wide-spread",
  ],
  maxAccountExposurePercent: 0.5,
  maxSymbolAccountExposurePercent: 0.2,
  minAvailableUsdBalance: 1000,
  includeAccountSnapshotRisk: false,
};

// ─── Check detail type ──────────────────────────────────

export type GateCheck = {
  name: string;
  passed: boolean;
  severity: "info" | "warning" | "blocked";
  message: string;
};

// ─── Output ─────────────────────────────────────────────

export type RiskGateResult = {
  allowed: boolean;
  severity: "info" | "warning" | "blocked";
  reasonCodes: string[];
  messages: string[];
  checks: GateCheck[];
};

// ─── Input ──────────────────────────────────────────────

export type RiskGateInput = {
  symbol: string;
  riskTags: string[];
  /** Notional used for this single execution. */
  notionalUsd: number;
  scoringResult: ScoreResult;
  estimateResult: ExecutionEstimateResult;
  /** All currently open PaperExecutions (for exposure checks). */
  openExecutions: PaperExecution[];
  /** Account-level risk context from PrivateAccountSnapshots (optional). */
  accountRiskContext?: AccountRiskContext;
  config?: Partial<RiskGateConfig>;
};

// ─── Helpers ────────────────────────────────────────────

function totalNotional(exec: PaperExecution): number {
  return exec.legs.reduce((s, leg) => s + leg.notionalUsd, 0);
}

function symbolExposure(symbol: string, openExecs: PaperExecution[]): number {
  return openExecs
    .filter((e) => e.symbol === symbol && e.status === "opened")
    .reduce((s, e) => s + totalNotional(e), 0);
}

function riskLevelToRank(level: RiskLevel): number {
  if (level === "low") return 1;
  if (level === "medium") return 2;
  if (level === "high") return 3;
  return 3;
}

function rankToRiskLevel(rank: number): RiskLevel {
  if (rank <= 1) return "low";
  if (rank <= 2) return "medium";
  return "high";
}

// ─── Risk Gate ──────────────────────────────────────────

/**
 * Evaluate all risk checks for a single opportunity.
 *
 * Returns a RiskGateResult with per-check breakdown and overall verdict.
 * Pure function — no side effects.
 */
export function evaluateRiskGate(input: RiskGateInput): RiskGateResult {
  const cfg: RiskGateConfig = { ...DEFAULT_RISK_GATE_CONFIG, ...input.config };
  const checks: GateCheck[] = [];
  const blockedReasons: string[] = [];
  const warningMessages: string[] = [];
  const allMessages: string[] = [];

  // 1. Score check
  {
    const passed = input.scoringResult.score >= cfg.minScore;
    const s: GateCheck = {
      name: "scoreCheck",
      passed,
      severity: passed ? "info" : "blocked",
      message: passed
        ? `评分 ${input.scoringResult.score} ≥ ${cfg.minScore}`
        : `评分 ${input.scoringResult.score} < ${cfg.minScore}，未通过风控`,
    };
    checks.push(s);
    allMessages.push(s.message);
    if (!passed) blockedReasons.push(s.message);
    else if (input.scoringResult.score < cfg.minScore + 15) {
      s.severity = "warning";
      warningMessages.push(`评分接近阈值 (${input.scoringResult.score})`);
    }
  }

  // 2. Risk level check
  {
    const passed = riskLevelToRank(input.scoringResult.riskLevel) <= riskLevelToRank(cfg.maxRiskLevel);
    const s: GateCheck = {
      name: "riskLevelCheck",
      passed,
      severity: passed ? "info" : "blocked",
      message: passed
        ? `风险等级 ${input.scoringResult.riskLevel} ≤ ${cfg.maxRiskLevel}`
        : `风险等级 ${input.scoringResult.riskLevel} 高于 ${cfg.maxRiskLevel}，已拦截`,
    };
    checks.push(s);
    allMessages.push(s.message);
    if (!passed) blockedReasons.push(s.message);
    else if (input.scoringResult.riskLevel === cfg.maxRiskLevel) {
      s.severity = "warning";
      warningMessages.push(`风险等级已达上限 (${cfg.maxRiskLevel})`);
    }
  }

  // 3. Net rate check
  {
    const netRate = input.estimateResult.annualizedNetRate;
    const passed = netRate >= cfg.minAnnualizedNetRate;
    const s: GateCheck = {
      name: "netRateCheck",
      passed,
      severity: passed ? "info" : "blocked",
      message: passed
        ? `净年化 ${netRate.toFixed(1)}% ≥ ${cfg.minAnnualizedNetRate}%`
        : `净年化 ${netRate.toFixed(1)}% < ${cfg.minAnnualizedNetRate}%，收益不足`,
    };
    checks.push(s);
    allMessages.push(s.message);
    if (!passed) blockedReasons.push(s.message);
    else if (netRate < cfg.minAnnualizedNetRate + 3) {
      s.severity = "warning";
      warningMessages.push(`净年化接近阈值 (${netRate.toFixed(1)}%)`);
    }
  }

  // 4. Open count check
  {
    const passed = input.openExecutions.length < cfg.maxOpenExecutions;
    const s: GateCheck = {
      name: "openCountCheck",
      passed,
      severity: passed ? "info" : "blocked",
      message: passed
        ? `当前开仓 ${input.openExecutions.length} < ${cfg.maxOpenExecutions}`
        : `开仓数 ${input.openExecutions.length} 已达上限 ${cfg.maxOpenExecutions}`,
    };
    checks.push(s);
    allMessages.push(s.message);
    if (!passed) blockedReasons.push(s.message);
    else if (input.openExecutions.length >= cfg.maxOpenExecutions - 2) {
      s.severity = "warning";
      warningMessages.push(`开仓数接近上限 (${input.openExecutions.length}/${cfg.maxOpenExecutions})`);
    }
  }

  // 5. Total exposure check
  {
    const currentTotal = input.openExecutions.reduce((s, e) => s + totalNotional(e), 0);
    const newTotal = currentTotal + input.notionalUsd;
    const passed = newTotal <= cfg.maxOpenNotionalUsd;
    const s: GateCheck = {
      name: "totalExposureCheck",
      passed,
      severity: passed ? "info" : "blocked",
      message: passed
        ? `总敞口 ${formatUsd(currentTotal)} + ${formatUsd(input.notionalUsd)} = ${formatUsd(newTotal)} ≤ ${formatUsd(cfg.maxOpenNotionalUsd)}`
        : `总敞口 ${formatUsd(newTotal)} 超过上限 ${formatUsd(cfg.maxOpenNotionalUsd)}`,
    };
    checks.push(s);
    allMessages.push(s.message);
    if (!passed) blockedReasons.push(s.message);
    else if (newTotal >= cfg.maxOpenNotionalUsd * 0.85) {
      s.severity = "warning";
      warningMessages.push(`总敞口接近上限 (${formatUsd(newTotal)}/${formatUsd(cfg.maxOpenNotionalUsd)})`);
    }
  }

  // 6. Symbol exposure check
  {
    const currentSym = symbolExposure(input.symbol, input.openExecutions);
    const newSym = currentSym + input.notionalUsd;
    const passed = newSym <= cfg.maxSymbolExposureUsd;
    const s: GateCheck = {
      name: "symbolExposureCheck",
      passed,
      severity: passed ? "info" : "blocked",
      message: passed
        ? `单币敞口 ${input.symbol} ${formatUsd(currentSym)} + ${formatUsd(input.notionalUsd)} = ${formatUsd(newSym)} ≤ ${formatUsd(cfg.maxSymbolExposureUsd)}`
        : `单币敞口 ${input.symbol} ${formatUsd(newSym)} 超过上限 ${formatUsd(cfg.maxSymbolExposureUsd)}`,
    };
    checks.push(s);
    allMessages.push(s.message);
    if (!passed) blockedReasons.push(s.message);
    else if (newSym >= cfg.maxSymbolExposureUsd * 0.85) {
      s.severity = "warning";
      warningMessages.push(`单币敞口接近上限 (${formatUsd(newSym)}/${formatUsd(cfg.maxSymbolExposureUsd)})`);
    }
  }

  // 7. Blocked risk tags check
  {
    const hitTags = input.riskTags.filter((tag) =>
      cfg.blockRiskTags.some((blocked) => tag.toLowerCase().includes(blocked.toLowerCase())),
    );
    const passed = hitTags.length === 0;
    const s: GateCheck = {
      name: "blockedTagsCheck",
      passed,
      severity: passed ? "info" : "blocked",
      message: passed
        ? `无拦截风险标签`
        : `命中拦截标签: ${hitTags.join(", ")}`,
    };
    checks.push(s);
    allMessages.push(s.message);
    if (!passed) blockedReasons.push(s.message);
  }

  // 8-10. Account risk checks (only if includeAccountSnapshotRisk is true)
  if (cfg.includeAccountSnapshotRisk) {
    const ctx = input.accountRiskContext;

    if (!ctx) {
      // 8a. Missing context → warning only
      const s: GateCheck = {
        name: "accountSnapshotCheck",
        passed: true,
        severity: "warning",
        message: "账户快照数据缺失 — 跳过账户风控检查（Mock 数据未加载）",
      };
      checks.push(s);
      allMessages.push(s.message);
      warningMessages.push("缺少账户快照数据");
    } else if (ctx.source !== "mock") {
      // 8b. Non-mock source → blocked in Phase 3.6
      const s: GateCheck = {
        name: "accountSnapshotSourceCheck",
        passed: false,
        severity: "blocked",
        message: `账户数据来源 "${ctx.source}" 不是 Mock — 当前仅接受 Mock 账户数据`,
      };
      checks.push(s);
      allMessages.push(s.message);
      blockedReasons.push(s.message);
      blockedReasons.push("ACCOUNT_RISK: 非 Mock 账户来源被拦截");
    } else {
      // 8c. Total exposure vs total account value
      {
        const ratio = ctx.totalPositionExposureUsd / Math.max(ctx.totalUsdValue, 1);
        const passed = ratio <= cfg.maxAccountExposurePercent;
        const s: GateCheck = {
          name: "accountTotalExposureCheck",
          passed,
          severity: passed ? "info" : "blocked",
          message: passed
            ? `账户总敞口比 ${(ratio * 100).toFixed(1)}% ≤ ${(cfg.maxAccountExposurePercent * 100).toFixed(0)}%`
            : `账户总敞口比 ${(ratio * 100).toFixed(1)}% 超过 ${(cfg.maxAccountExposurePercent * 100).toFixed(0)}% 上限`,
        };
        checks.push(s);
        allMessages.push(s.message);
        if (!passed) {
          blockedReasons.push(s.message);
          blockedReasons.push("ACCOUNT_RISK: 账户总敞口过高");
        } else if (ratio >= cfg.maxAccountExposurePercent * 0.85) {
          s.severity = "warning";
          warningMessages.push(`账户总敞口接近上限 (${(ratio * 100).toFixed(1)}%)`);
        }
      }

      // 9. Symbol exposure vs total account value
      {
        const symExposure = ctx.symbolExposureUsdBySymbol[input.symbol] ?? 0;
        const newSymExposure = symExposure + input.notionalUsd;
        const ratio = newSymExposure / Math.max(ctx.totalUsdValue, 1);
        const passed = ratio <= cfg.maxSymbolAccountExposurePercent;
        const s: GateCheck = {
          name: "accountSymbolExposureCheck",
          passed,
          severity: passed ? "info" : "blocked",
          message: passed
            ? `单币敞口比 ${input.symbol} ${(ratio * 100).toFixed(1)}% ≤ ${(cfg.maxSymbolAccountExposurePercent * 100).toFixed(0)}%`
            : `单币敞口比 ${input.symbol} ${(ratio * 100).toFixed(1)}% 超过 ${(cfg.maxSymbolAccountExposurePercent * 100).toFixed(0)}% 上限`,
        };
        checks.push(s);
        allMessages.push(s.message);
        if (!passed) {
          blockedReasons.push(s.message);
          blockedReasons.push("ACCOUNT_RISK: 单币敞口过高");
        } else if (ratio >= cfg.maxSymbolAccountExposurePercent * 0.85) {
          s.severity = "warning";
          warningMessages.push(`单币敞口接近上限 (${(ratio * 100).toFixed(1)}%)`);
        }
      }

      // 10. Available USDT balance check
      {
        const passed = ctx.availableUsdBalance >= cfg.minAvailableUsdBalance;
        const s: GateCheck = {
          name: "accountBalanceCheck",
          passed,
          severity: passed ? "info" : "blocked",
          message: passed
            ? `可用 USDT $${ctx.availableUsdBalance.toLocaleString("en-US")} ≥ $${cfg.minAvailableUsdBalance.toLocaleString("en-US")}`
            : `可用 USDT $${ctx.availableUsdBalance.toLocaleString("en-US")} 不足 $${cfg.minAvailableUsdBalance.toLocaleString("en-US")}`,
        };
        checks.push(s);
        allMessages.push(s.message);
        if (!passed) {
          blockedReasons.push(s.message);
          blockedReasons.push("ACCOUNT_RISK: 可用余额不足");
        } else if (ctx.availableUsdBalance < cfg.minAvailableUsdBalance * 2) {
          s.severity = "warning";
          warningMessages.push(`可用余额接近下限 ($${ctx.availableUsdBalance.toLocaleString("en-US")})`);
        }
      }
    }
  }

  // Overall verdict
  const allowed = checks.every((c) => c.passed);
  let severity: "info" | "warning" | "blocked";
  if (!allowed) {
    severity = "blocked";
  } else if (warningMessages.length > 0) {
    severity = "warning";
  } else {
    severity = "info";
  }

  return {
    allowed,
    severity,
    reasonCodes: blockedReasons.length > 0
      ? blockedReasons.map((r) => `BLOCKED: ${r}`)
      : warningMessages.length > 0
        ? warningMessages.map((r) => `WARN: ${r}`)
        : ["PASS: 所有风控检查通过"],
    messages: allMessages,
    checks,
  };
}

// ─── Helpers ────────────────────────────────────────────

function formatUsd(value?: number): string {
  if (value === undefined || value === null) return "$0";
  return `$${value.toLocaleString("en-US")}`;
}
