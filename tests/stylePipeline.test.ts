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
      "机会总览",
      "资金费率看板",
      "基差看板",
      "Alpha发现",
      "因子研究",
      "Funding热力图",
      "机会验证",
      "通知中心",
      "模拟回测",
      "策略管理",
      "风险规则",
      "ADL监控",
      "执行中心",
      "模拟资产",
      "API管理",
      "账户同步",
      "审计日志",
      "执行队列",
      "安全控制",
      "本地通知",
      "沙盒生命周期"
    ]);
  });
});
