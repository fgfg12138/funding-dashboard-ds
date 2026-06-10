import { describe, expect, it } from "vitest";
import { APP_NAV_ITEMS } from "./dashboard";

describe("APP_NAV_ITEMS", () => {
  it("keeps the first-version navigation order and Chinese labels", () => {
    expect(APP_NAV_ITEMS).toEqual([
      // 生产控制台
      { href: "/production-console", label: "生产控制台" },
      // 数据看板
      { href: "/opportunities", label: "机会总览" },
      { href: "/dashboard", label: "资金费率看板" },
      { href: "/basis", label: "基差看板" },
      { href: "/heatmap", label: "Funding热力图" },
      { href: "/alpha", label: "Alpha发现" },
      // 研究分析
      { href: "/factors", label: "因子研究" },
      { href: "/research", label: "机会验证" },
      { href: "/simulation", label: "模拟回测" },
      // 策略执行
      { href: "/strategies", label: "策略管理" },
      { href: "/risk-rules", label: "风险规则" },
      { href: "/execution", label: "执行中心" },
      { href: "/paper-portfolio", label: "模拟资产" },
      // 系统管理
      { href: "/api-keys", label: "API管理" },
      { href: "/safety", label: "安全控制" },
      { href: "/audit", label: "审计日志" },
      { href: "/notifications", label: "通知中心" },
      // 已归档
      { href: "/adl-monitor", label: "ADL监控" },
      { href: "/account-sync", label: "账户同步" },
      { href: "/execution-queue", label: "执行队列" },
      { href: "/notifications-center", label: "本地通知" },
      { href: "/sandbox-lifecycle", label: "沙盒生命周期" },
      { href: "/testnet-readiness", label: "Testnet Readiness" },
      { href: "/risk-center", label: "风险中心" }
    ]);
  });
});
