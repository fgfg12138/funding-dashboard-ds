import { describe, expect, it } from "vitest";
import { getDashboardModuleConfig, parseDashboardModule } from "./dashboardModule";

describe("dashboard module tabs", () => {
  it("defaults to spot-perp when module query is missing", () => {
    expect(parseDashboardModule(null)).toBe("spot-perp");
  });

  it("uses cross when module query is cross", () => {
    expect(parseDashboardModule("cross")).toBe("cross");
    expect(getDashboardModuleConfig("cross").table).toBe("cross");
  });

  it("uses spot-perp when module query is spot-perp", () => {
    expect(parseDashboardModule("spot-perp")).toBe("spot-perp");
    expect(getDashboardModuleConfig("spot-perp").table).toBe("spot-perp");
  });

  it("falls back to spot-perp for invalid module query values", () => {
    expect(parseDashboardModule("unknown")).toBe("spot-perp");
    expect(getDashboardModuleConfig("unknown").table).toBe("spot-perp");
  });
});
