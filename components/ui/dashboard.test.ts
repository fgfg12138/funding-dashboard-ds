import { describe, expect, it } from "vitest";
import { APP_NAV_ITEMS } from "./dashboard";

describe("APP_NAV_ITEMS", () => {
  it("keeps the first-version navigation order and Chinese labels", () => {
    expect(APP_NAV_ITEMS).toEqual([
      { href: "/opportunities", label: "机会总览" },
      { href: "/dashboard", label: "资金费率看板" },
      { href: "/basis", label: "基差看板" },
      { href: "/alpha", label: "Alpha发现" },
      { href: "/factors", label: "因子研究" },
      { href: "/heatmap", label: "Funding热力图" },
      { href: "/research", label: "机会验证" },
      { href: "/notifications", label: "通知中心" },
      { href: "/simulation", label: "模拟回测" },
      { href: "/strategies", label: "策略管理" },
      { href: "/risk-rules", label: "风险规则" },
      { href: "/adl-monitor", label: "ADL监控" },
      { href: "/execution", label: "执行中心" },
      { href: "/paper-portfolio", label: "模拟资产" },
      { href: "/api-keys", label: "API管理" },
      { href: "/account-sync", label: "账户同步" }
    ]);
  });
});
