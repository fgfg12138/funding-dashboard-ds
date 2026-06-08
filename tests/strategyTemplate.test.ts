/**
 * Strategy Template Tests — Recovery R2
 */

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { cloneStrategy } from "@/lib/strategies/strategyStore";

const root = process.cwd();
function read(relativePath: string) {
  return readFileSync(join(root, relativePath), "utf8");
}

// ─── Types include template fields ─────────────────────

describe("Strategy Types — Template Fields", () => {
  const types = read("lib/strategies/types.ts");

  it("defines StrategyTemplateCategory", () => {
    expect(types).toContain("StrategyTemplateCategory");
  });

  it("includes templateCategory in StrategyBase", () => {
    expect(types).toContain("templateCategory?: StrategyTemplateCategory");
  });

  it("includes maxPositionUsd", () => {
    expect(types).toContain("maxPositionUsd?");
  });

  it("includes maxCapitalUsagePercent", () => {
    expect(types).toContain("maxCapitalUsagePercent?");
  });

  it("includes minNetRate", () => {
    expect(types).toContain("minNetRate?");
  });

  it("includes stopLossPercent", () => {
    expect(types).toContain("stopLossPercent?");
  });

  it("includes takeProfitPercent", () => {
    expect(types).toContain("takeProfitPercent?");
  });

  it("includes autoCloseWhenFundingBelow", () => {
    expect(types).toContain("autoCloseWhenFundingBelow?");
  });

  it("includes enabledPaperTrading", () => {
    expect(types).toContain("enabledPaperTrading?");
  });
});

// ─── Clone Function in Store ─────────────────────────────

describe("Strategy Store — cloneStrategy", () => {
  const store = read("lib/strategies/strategyStore.ts");

  it("exports cloneStrategy function", () => {
    expect(store).toContain("cloneStrategy");
  });

  it("appends (Clone) to name", () => {
    expect(store).toContain("(Clone)");
  });

  it("resets status to draft", () => {
    expect(store).toContain('status: "draft"');
  });
});

// ─── UI Contains Template Elements ─────────────────────

describe("StrategyManager UI — Template Elements", () => {
  const ui = read("app/strategies/StrategyManager.tsx");

  it("contains Template Only message", () => {
    expect(ui).toContain("Template Only");
    expect(ui).toContain("Will Not Place Real Orders");
  });

  it("contains template category selector", () => {
    expect(ui).toContain("模板分类");
    expect(ui).toContain("funding-arbitrage");
    expect(ui).toContain("basis-trade");
    expect(ui).toContain("cross-exchange");
    expect(ui).toContain("custom");
  });

  it("contains Template badge", () => {
    expect(ui).toContain("🧩 Template");
  });

  it("contains Clone button icon", () => {
    expect(ui).toContain("Copy");
  });

  it("contains clone strategy function", () => {
    expect(ui).toContain("cloneStrategyAction");
  });

  it("contains template field inputs", () => {
    expect(ui).toContain("maxPositionUsd");
    expect(ui).toContain("stopLossPercent");
    expect(ui).toContain("takeProfitPercent");
    expect(ui).toContain("minNetRate");
  });
});

// ─── Page Metadata ─────────────────────────────────────

describe("Strategies Page — Metadata", () => {
  const page = read("app/strategies/page.tsx");

  it("contains Will Not Place Real Orders", () => {
    expect(page).toContain("Will Not Place Real Orders");
  });

  it("contains Template Only", () => {
    expect(page).toContain("Template Only");
  });
});

// ─── Safety Boundaries ─────────────────────────────────

describe("Strategy Template — Safety Boundaries", () => {
  const files = ["app/strategies/StrategyManager.tsx", "app/strategies/page.tsx"];

  for (const f of files) {
    const content = read(f);
    it(`${f} does not contain fetch to exchange`, () => {
      const imports = content.split("\n").filter((l) => l.includes("import ") && l.includes("from"));
      for (const line of imports) {
        expect(line).not.toMatch(/@binance|binance-api|okx-api|bybit-api|ccxt/i);
      }
    });
  }
});
