import type { Metadata } from "next";
import { PageShell } from "@/components/PageShell";
import { StrategyManager } from "./StrategyManager";

export const metadata: Metadata = {
  title: "策略管理 — 资金费率套利看板",
  description: "只读策略配置管理。不接交易所、不下单、不执行策略。"
};

export const dynamic = "force-dynamic";

export default function StrategiesPage() {
  return (
    <PageShell
      activeHref="/strategies"
      description="只读策略配置管理，不接交易所、不下单、不执行策略。"
      eyebrow="策略管理"
      refreshHref="/strategies"
      title="策略管理"
    >
      <StrategyManager />
    </PageShell>
  );
}
