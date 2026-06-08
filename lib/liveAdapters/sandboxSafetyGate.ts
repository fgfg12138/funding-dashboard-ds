/**
 * Sandbox Safety Gate — pure function safety check layer.
 *
 * Evaluates whether a queue item can be promoted to a Mock Sandbox Lifecycle.
 * All checks must pass before any sandbox mock order can be created.
 *
 * No network calls, no API Key access, no real order placement.
 */

import type { ExecutionQueueItem } from "../orders/executionQueueTypes";
import type { SafetyState } from "../safety/safetyTypes";

// ─── Types ──────────────────────────────────────────────

export type SandboxEnvironment = {
  exchangeEnv: "disabled" | "sandbox" | "testnet";
  liveTradingEnabled: boolean;
  allowMainnetTrading: boolean;
};

export const DEFAULT_SAFE_ENVIRONMENT: SandboxEnvironment = {
  exchangeEnv: "disabled",
  liveTradingEnabled: false,
  allowMainnetTrading: false,
};

export type SandboxGateCheck = {
  name: string;
  passed: boolean;
  severity: "info" | "warning" | "blocked";
  message: string;
};

export type SandboxSafetyGateResult = {
  allowed: boolean;
  severity: "info" | "warning" | "blocked";
  reasonCodes: string[];
  messages: string[];
  checks: SandboxGateCheck[];
};

export type SandboxSafetyGateInput = {
  queueItem: ExecutionQueueItem;
  safetyState: SafetyState;
  now?: number;
  environment?: Partial<SandboxEnvironment>;
};

// ─── Gate ───────────────────────────────────────────────

export function evaluateSandboxSafetyGate(input: SandboxSafetyGateInput): SandboxSafetyGateResult {
  const now = input.now ?? Date.now();
  const env: SandboxEnvironment = { ...DEFAULT_SAFE_ENVIRONMENT, ...input.environment };
  const checks: SandboxGateCheck[] = [];
  const blockedReasons: string[] = [];
  const warningMessages: string[] = [];
  const allMessages: string[] = [];
  const qi = input.queueItem;

  // 1. Kill Switch check
  {
    const passed = !input.safetyState.killSwitchEnabled;
    const s: SandboxGateCheck = {
      name: "killSwitchCheck",
      passed,
      severity: passed ? "info" : "blocked",
      message: passed ? "Kill Switch 已关闭" : "Kill Switch 已启用 — 阻止沙盒操作",
    };
    checks.push(s);
    allMessages.push(s.message);
    if (!passed) blockedReasons.push(s.message);
  }

  // 2. Queue status check
  {
    const passed = qi.status === "queued-preview-only";
    const s: SandboxGateCheck = {
      name: "queueStatusCheck",
      passed,
      severity: passed ? "info" : "blocked",
      message: passed ? "队列状态正常 (queued-preview-only)" : `队列状态为 ${qi.status} — 不可提交沙盒`,
    };
    checks.push(s);
    allMessages.push(s.message);
    if (!passed) blockedReasons.push(s.message);
  }

  // 3. Queue expiration check
  {
    const passed = now <= qi.expiresAt;
    const s: SandboxGateCheck = {
      name: "queueExpirationCheck",
      passed,
      severity: passed ? "info" : "blocked",
      message: passed ? `未过期 (${new Date(qi.expiresAt).toLocaleString()})` : "队列项目已过期",
    };
    checks.push(s);
    allMessages.push(s.message);
    if (!passed) blockedReasons.push(s.message);
  }

  // 4. Confirmation check
  {
    const passed = qi.confirmationSnapshot !== undefined && qi.confirmationSnapshot !== null;
    const s: SandboxGateCheck = {
      name: "confirmationCheck",
      passed,
      severity: passed ? "info" : "blocked",
      message: passed ? "确认记录存在" : "缺少确认记录 (confirmationSnapshot)",
    };
    checks.push(s);
    allMessages.push(s.message);
    if (!passed) blockedReasons.push(s.message);
  }

  // 5. Preview submittable check
  {
    const preview = qi.previewSnapshot;
    const passed = preview !== undefined && preview !== null && preview.submittable === true;
    const s: SandboxGateCheck = {
      name: "previewSubmittableCheck",
      passed,
      severity: passed ? "info" : "blocked",
      message: passed ? "Preview 可提交" : "Preview 不可提交 (submittable=false)",
    };
    checks.push(s);
    allMessages.push(s.message);
    if (!passed) blockedReasons.push(s.message);
  }

  // 6. RiskGate check
  {
    const preview = qi.previewSnapshot;
    const passed = preview !== undefined && preview !== null && preview.riskGateResult?.allowed === true;
    const s: SandboxGateCheck = {
      name: "riskGateCheck",
      passed,
      severity: passed ? "info" : "blocked",
      message: passed ? "风控检查通过" : "风控检查未通过",
    };
    checks.push(s);
    allMessages.push(s.message);
    if (!passed) blockedReasons.push(s.message);
  }

  // 7. Source check
  {
    const passed = qi.source === "local";
    const s: SandboxGateCheck = {
      name: "sourceCheck",
      passed,
      severity: passed ? "info" : "blocked",
      message: passed ? `来源正常 (${qi.source})` : `来源异常 (${qi.source}) — 仅接受 local`,
    };
    checks.push(s);
    allMessages.push(s.message);
    if (!passed) blockedReasons.push(s.message);
  }

  // 8. Environment — exchangeEnv
  {
    const passed = env.exchangeEnv === "disabled";
    const s: SandboxGateCheck = {
      name: "environmentCheck",
      passed,
      severity: passed ? "info" : "warning",
      message: passed
        ? "环境已禁用 (disabled) — 安全"
        : `环境为 ${env.exchangeEnv} — 当前阶段仅允许 disabled`,
    };
    checks.push(s);
    allMessages.push(s.message);
    if (!passed) {
      warningMessages.push(`exchangeEnv 为 ${env.exchangeEnv} — 不允许真实连接`);
    }
  }

  // 9. liveTradingEnabled check
  {
    const passed = !env.liveTradingEnabled;
    const s: SandboxGateCheck = {
      name: "liveTradingCheck",
      passed,
      severity: passed ? "info" : "blocked",
      message: passed ? "实盘交易已禁用" : "liveTradingEnabled=true — 当前阶段不允许",
    };
    checks.push(s);
    allMessages.push(s.message);
    if (!passed) blockedReasons.push(s.message);
  }

  // 10. allowMainnetTrading check
  {
    const passed = !env.allowMainnetTrading;
    const s: SandboxGateCheck = {
      name: "mainnetCheck",
      passed,
      severity: passed ? "info" : "blocked",
      message: passed ? "主网交易已禁用" : "allowMainnetTrading=true — 禁止",
    };
    checks.push(s);
    allMessages.push(s.message);
    if (!passed) blockedReasons.push(s.message);
  }

  // Overall verdict
  const anyBlocked = checks.some((c) => c.severity === "blocked" && !c.passed);
  const allowed = !anyBlocked;
  const reasonCodes: string[] = [];

  if (allowed) {
    reasonCodes.push("MOCK_SANDBOX_ONLY: 所有安全检查通过 — 仅 Mock Sandbox");
    if (warningMessages.length > 0) {
      reasonCodes.push(...warningMessages.map((w) => `WARN: ${w}`));
    }
  } else {
    reasonCodes.push(...blockedReasons.map((r) => `BLOCKED: ${r}`));
  }

  let severity: "info" | "warning" | "blocked";
  if (!allowed) severity = "blocked";
  else if (warningMessages.length > 0) severity = "warning";
  else severity = "info";

  return {
    allowed,
    severity,
    reasonCodes: [...new Set(reasonCodes)],
    messages: allMessages,
    checks,
  };
}
