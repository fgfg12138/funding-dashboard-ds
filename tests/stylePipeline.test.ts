import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { APP_NAV_ITEMS } from "../components/ui/dashboard";

const root = process.cwd();

function read(relativePath: string) {
  return readFileSync(join(root, relativePath), "utf8");
}

describe("style pipeline", () => {
  it("loads global Tailwind CSS from the root layout", () => {
    expect(read("app/layout.tsx")).toContain('import "./globals.css"');
  });

  it("keeps Tailwind directives and stable base styles", () => {
    const css = read("app/globals.css");

    expect(css).toContain("@tailwind base;");
    expect(css).toContain("@tailwind components;");
    expect(css).toContain("@tailwind utilities;");
    expect(css).toContain("background: #050816;");
    expect(css).toContain("text-decoration: none;");
  });

  it("scans app, components, and lib files for Tailwind classes", () => {
    const config = read("tailwind.config.ts");

    expect(config).toContain("./app/**/*.{js,ts,jsx,tsx,mdx}");
    expect(config).toContain("./components/**/*.{js,ts,jsx,tsx,mdx}");
    expect(config).toContain("./lib/**/*.{js,ts,jsx,tsx,mdx}");
  });

  it("renders the unified Chinese navigation items", () => {
    expect(APP_NAV_ITEMS.map((item) => item.label)).toEqual([
      // 生产控制台
      "生产控制台",
      "本地测试指南",
      // 数据看板
      "机会总览",
      "资金费率看板",
      "基差看板",
      "Funding热力图",
      "Alpha发现",
      // 研究分析
      "因子研究",
      "机会验证",
      "模拟回测",
      // 策略执行
      "策略管理",
      "风险规则",
      "执行中心",
      "模拟资产",
      // 系统管理
      "API管理",
      "安全控制",
      "审计日志",
      "通知中心",
      // 已归档
      "ADL监控",
      "账户同步",
      "执行队列",
      "本地通知",
      "沙盒生命周期",
      "Testnet Readiness",
      "风险中心"
    ]);
  });
});
