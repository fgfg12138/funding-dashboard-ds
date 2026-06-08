export type DashboardModule = "spot-perp" | "cross";

export type DashboardModuleConfig = {
  href: string;
  label: string;
  table: DashboardModule;
  title: string;
  subtitle: string;
};

export const DASHBOARD_MODULES: DashboardModuleConfig[] = [
  {
    href: "/dashboard?module=spot-perp",
    label: "现货 + 永续",
    table: "spot-perp",
    title: "现货 + 永续合约资金费率套利",
    subtitle: "买现货 + 开空正资金费率永续，仅展示数据"
  },
  {
    href: "/dashboard?module=cross",
    label: "跨交易所费率差",
    table: "cross",
    title: "跨交易所合约费率差套利",
    subtitle: "空高正费率一边，多低费率或负费率一边"
  }
];

export function parseDashboardModule(value: string | null | undefined): DashboardModule {
  return value === "cross" ? "cross" : "spot-perp";
}

export function getDashboardModuleConfig(value: string | null | undefined): DashboardModuleConfig {
  const module = parseDashboardModule(value);
  return DASHBOARD_MODULES.find((item) => item.table === module) ?? DASHBOARD_MODULES[0];
}
