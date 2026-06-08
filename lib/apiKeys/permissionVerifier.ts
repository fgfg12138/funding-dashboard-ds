/**
 * API Key Permission Verifier — offline mock module.
 *
 * Simulates the permission verification process that would normally
 * be performed by querying the exchange's API Key info endpoint.
 *
 * **This is a mock verifier. It does NOT connect to any exchange.**
 * All results include the "mock-verification-only" warning flag.
 * Results MUST NOT be used as a real trading safety guarantee.
 */

import type {
  ApiKeyPermission,
  PermissionVerificationInput,
  PermissionVerificationResult,
  PermissionVerificationStatus,
  PermissionWarningFlag,
} from "./types";

// ─── Verification Logic ─────────────────────────────────

/**
 * Verify API key permissions against security requirements.
 *
 * Rules:
 * 1. permissions 不包含 "read" → rejected
 * 2. permissions 包含 "withdraw" → rejected
 * 3. permissions 包含 "trade" → warning
 * 4. 未设置 IP 白名单 → warning
 * 5. 权限未知或空 → rejected
 * 6. 所有通过 → passed
 * 7. 所有结果包含 "mock-verification-only" flag
 *
 * @param input  Permissions and metadata to verify
 * @returns PermissionVerificationResult (always includes isMock: true)
 */
export function verifyApiKeyPermissions(
  input: PermissionVerificationInput,
): PermissionVerificationResult {
  const warningFlags: PermissionWarningFlag[] = ["mock-verification-only"];
  const messages: string[] = ["⚠ 此验证为离线 Mock 结果，不连接交易所"];

  // Rule 5: empty or unknown permissions → rejected
  if (!input.permissions || input.permissions.length === 0) {
    warningFlags.push("unknown-permissions");
    messages.push("未检测到任何权限");
    return buildResult("rejected", warningFlags, messages);
  }

  // Rule 1: must have read
  if (!input.permissions.includes("read")) {
    warningFlags.push("missing-read");
    messages.push("缺少读取权限 (read)");
  }

  // Rule 2: withdraw must be absent
  if (input.permissions.includes("withdraw")) {
    warningFlags.push("withdraw-enabled");
    messages.push("提币权限已开启 — 安全风险，拒绝连接");
  }

  // Rule 3: trade → warning
  if (input.permissions.includes("trade")) {
    warningFlags.push("trade-enabled");
    messages.push("交易权限已开启 — 只读模式不应有交易权限");
  }

  // Rule 4: IP whitelist check
  if (!input.hasIpWhitelist) {
    warningFlags.push("ip-whitelist-missing");
    messages.push("未设置 IP 白名单 — 建议限制可访问 IP");
  }

  // Determine status
  const status = determineStatus(warningFlags);
  return buildResult(status, warningFlags, messages);
}

/**
 * Get a human-readable label for a verification status.
 */
export function getPermissionStatusLabel(status: PermissionVerificationStatus): string {
  switch (status) {
    case "passed":
      return "通过";
    case "warning":
      return "警告";
    case "rejected":
      return "拒绝";
  }
}

/**
 * Get human-readable warning messages for a verification result.
 */
export function getPermissionWarnings(result: PermissionVerificationResult): string[] {
  return result.messages.filter((m) => !m.startsWith("⚠"));
}

/**
 * Check whether the key is safe for read-only use.
 * Returns `true` only when status is "passed".
 */
export function isPermissionSafeForReadOnly(result: PermissionVerificationResult): boolean {
  return result.safeForReadOnly;
}

// ─── Helpers ────────────────────────────────────────────

function determineStatus(warningFlags: PermissionWarningFlag[]): PermissionVerificationStatus {
  if (warningFlags.includes("missing-read")) return "rejected";
  if (warningFlags.includes("withdraw-enabled")) return "rejected";
  if (warningFlags.includes("unknown-permissions")) return "rejected";
  if (warningFlags.length > 1) return "warning"; // multiple flags including trade, ip whitelist, etc.
  if (warningFlags.length === 1 && warningFlags[0] === "mock-verification-only") return "passed";
  return "warning";
}

function buildResult(
  status: PermissionVerificationStatus,
  warningFlags: PermissionWarningFlag[],
  messages: string[],
): PermissionVerificationResult {
  return {
    status,
    label: getPermissionStatusLabel(status),
    warningFlags: [...new Set(warningFlags)], // deduplicate
    messages,
    safeForReadOnly: status === "passed",
    isMock: true,
  };
}
