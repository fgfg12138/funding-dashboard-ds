import { describe, expect, it } from "vitest";
import {
  getPermissionStatusLabel,
  getPermissionWarnings,
  isPermissionSafeForReadOnly,
  verifyApiKeyPermissions,
} from "./permissionVerifier";

describe("verifyApiKeyPermissions", () => {
  it("read only → passed", () => {
    const result = verifyApiKeyPermissions({ permissions: ["read"], hasIpWhitelist: true });
    expect(result.status).toBe("passed");
    expect(result.safeForReadOnly).toBe(true);
    expect(result.isMock).toBe(true);
  });

  it("read only without IP whitelist → warning (no reject)", () => {
    const result = verifyApiKeyPermissions({ permissions: ["read"], hasIpWhitelist: false });
    expect(result.status).toBe("warning");
    expect(result.safeForReadOnly).toBe(false);
    expect(result.warningFlags).toContain("ip-whitelist-missing");
  });

  it("missing read → rejected", () => {
    const result = verifyApiKeyPermissions({ permissions: ["trade"], hasIpWhitelist: true });
    expect(result.status).toBe("rejected");
    expect(result.safeForReadOnly).toBe(false);
    expect(result.warningFlags).toContain("missing-read");
  });

  it("withdraw enabled → rejected", () => {
    const result = verifyApiKeyPermissions({
      permissions: ["read", "withdraw"],
      hasIpWhitelist: true,
    });
    expect(result.status).toBe("rejected");
    expect(result.warningFlags).toContain("withdraw-enabled");
  });

  it("trade enabled → warning", () => {
    const result = verifyApiKeyPermissions({
      permissions: ["read", "trade"],
      hasIpWhitelist: true,
    });
    expect(result.status).toBe("warning");
    expect(result.warningFlags).toContain("trade-enabled");
  });

  it("no IP whitelist → warning", () => {
    const result = verifyApiKeyPermissions({ permissions: ["read"], hasIpWhitelist: false });
    expect(result.warningFlags).toContain("ip-whitelist-missing");
  });

  it("unknown/empty permissions → rejected", () => {
    const result = verifyApiKeyPermissions({ permissions: [], hasIpWhitelist: true });
    expect(result.status).toBe("rejected");
    expect(result.warningFlags).toContain("unknown-permissions");
  });

  it("result always includes mock-verification-only", () => {
    const passed = verifyApiKeyPermissions({ permissions: ["read"], hasIpWhitelist: true });
    expect(passed.warningFlags).toContain("mock-verification-only");

    const rejected = verifyApiKeyPermissions({ permissions: [], hasIpWhitelist: false });
    expect(rejected.warningFlags).toContain("mock-verification-only");
  });

  it("withdraw + trade → rejected (withdraw takes precedence)", () => {
    const result = verifyApiKeyPermissions({
      permissions: ["read", "trade", "withdraw"],
      hasIpWhitelist: true,
    });
    expect(result.status).toBe("rejected");
    expect(result.warningFlags).toContain("withdraw-enabled");
    expect(result.warningFlags).toContain("trade-enabled");
  });
});

describe("getPermissionStatusLabel", () => {
  it("returns Chinese labels", () => {
    expect(getPermissionStatusLabel("passed")).toBe("通过");
    expect(getPermissionStatusLabel("warning")).toBe("警告");
    expect(getPermissionStatusLabel("rejected")).toBe("拒绝");
  });
});

describe("getPermissionWarnings", () => {
  it("filters out the mock-verification prefix", () => {
    const result = verifyApiKeyPermissions({
      permissions: ["read", "trade"],
      hasIpWhitelist: false,
    });
    const warnings = getPermissionWarnings(result);
    // Should have trade and IP whitelist warnings, but not the ⚠ prefix one
    expect(warnings.some((w) => w.includes("交易权限"))).toBe(true);
    expect(warnings.some((w) => w.includes("IP 白名单"))).toBe(true);
  });
});

describe("isPermissionSafeForReadOnly", () => {
  it("returns true only for passed", () => {
    const passed = verifyApiKeyPermissions({ permissions: ["read"], hasIpWhitelist: true });
    expect(isPermissionSafeForReadOnly(passed)).toBe(true);

    const warning = verifyApiKeyPermissions({ permissions: ["read", "trade"], hasIpWhitelist: true });
    expect(isPermissionSafeForReadOnly(warning)).toBe(false);

    const rejected = verifyApiKeyPermissions({ permissions: [], hasIpWhitelist: true });
    expect(isPermissionSafeForReadOnly(rejected)).toBe(false);
  });
});
