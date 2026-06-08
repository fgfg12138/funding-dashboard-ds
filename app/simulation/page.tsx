import type { Metadata } from "next";
import Link from "next/link";
import type { ReactNode } from "react";
import { SimulationRunButton } from "./SimulationRunButton";
import { PageShell } from "@/components/PageShell";
import { getSimulationAccount, getSimulationHistory } from "@/lib/simulation/simService";
import type { SimAccountSnapshot } from "@/lib/simulation/simAccount";

export const metadata: Metadata = {
  title: "模拟回测 — 资金费率套利看板",
  description: "只读模拟回测展示页。不接 API Key，不动真实仓位，不执行真实下单。"
};

export const dynamic = "force-dynamic";

const WINDOW_OPTIONS = ["1h", "24h", "7d", "30d"];

export default async function SimulationPage({
  searchParams
}: {
  searchParams: Promise<{ window?: string; symbol?: string; exchange?: string }>;
}) {
  const params = await searchParams;
  const [account, history] = await Promise.all([getSimulationAccount(), getSimulationHistory(500)]);
  const filteredHistory = filterHistory(history.slice().reverse(), params);

  return (
    <PageShell
      actions={<SimulationRunButton />}
      activeHref="/simulation"
      description="只读模拟回测展示页，不接 API Key，不动真实仓位，不执行真实下单。"
      eyebrow="模拟回测"
      refreshHref={buildSimulationHref(params)}
      title="模拟回测"
      updatedAt={account.timestamp}
    >
      <section className="flex flex-col gap-3 border border-slate-800 bg-slate-950/40 p-3 lg:flex-row lg:items-center lg:justify-between">
        <div className="inline-flex w-fit border border-slate-700 bg-slate-950 p-1">
          {WINDOW_OPTIONS.map((item) => (
            <Link
              className={`h-8 px-3 py-1.5 text-sm ${(params.window ?? "24h") === item ? "bg-emerald-400/20 text-emerald-100" : "text-slate-400 hover:text-slate-100"}`}
              href={buildSimulationHref({ ...params, window: item })}
              key={item}
            >
              {item}
            </Link>
          ))}
        </div>
        <form action="/simulation" className="flex flex-wrap items-end gap-3">
          <input name="window" type="hidden" value={params.window ?? "24h"} />
          <label className="block">
            <span className="mb-1 block text-xs text-slate-500">币种</span>
            <input className="h-9 w-32 border border-slate-700 bg-slate-950 px-3 text-sm text-slate-100 outline-none focus:border-cyan-400" defaultValue={params.symbol ?? ""} name="symbol" placeholder="BTC" />
          </label>
          <label className="block">
            <span className="mb-1 block text-xs text-slate-500">交易所</span>
            <input className="h-9 w-32 border border-slate-700 bg-slate-950 px-3 text-sm text-slate-100 outline-none focus:border-cyan-400" defaultValue={params.exchange ?? ""} name="exchange" placeholder="Bybit" />
          </label>
          <button className="h-9 border border-cyan-400/50 bg-cyan-400/10 px-3 text-sm text-cyan-100 hover:bg-cyan-400/20" type="submit">应用</button>
        </form>
        <div className="flex flex-wrap gap-3 text-xs text-slate-500">
          <span>{history.length} 条快照</span>
          <span>{account.positions.length} 个持仓</span>
        </div>
      </section>

      <section className="grid gap-2 md:grid-cols-4">
        <Stat label="当前余额" value={formatUsd(account.currentBalance)} tone="text-emerald-300" />
        <Stat label="权益" value={formatUsd(account.equity)} tone="text-cyan-300" />
        <Stat label="Funding 收益" value={formatUsd(account.fundingPnL)} tone={account.fundingPnL >= 0 ? "text-emerald-300" : "text-rose-300"} />
        <Stat label="价格收益" value={formatUsd(account.pricePnL)} tone={account.pricePnL >= 0 ? "text-emerald-300" : "text-rose-300"} />
      </section>

      <section className="grid gap-3 xl:grid-cols-2">
        <LineTable title="账户权益曲线" snapshots={filteredHistory} metric="equity" />
        <LineTable title="Funding 收益曲线" snapshots={filteredHistory} metric="fundingPnL" />
        <LineTable title="价格收益曲线" snapshots={filteredHistory} metric="pricePnL" />
        <LineTable title="仓位价值曲线" snapshots={filteredHistory} metric="positionValue" />
      </section>

      <section className="grid gap-3 xl:grid-cols-[minmax(0,1fr)_minmax(420px,0.8fr)]">
        <PositionsTable snapshot={account} />
        <TradeHistoryTable snapshot={account} />
      </section>
    </PageShell>
  );
}

function Stat({ label, tone, value }: { label: string; tone: string; value: string }) {
  return (
    <div className="border border-slate-800 bg-panel p-4">
      <p className="text-xs text-slate-500">{label}</p>
      <p className={`mt-2 text-2xl font-semibold ${tone}`}>{value}</p>
    </div>
  );
}

function LineTable({ metric, snapshots, title }: { metric: keyof Pick<SimAccountSnapshot, "equity" | "fundingPnL" | "pricePnL" | "positionValue">; snapshots: SimAccountSnapshot[]; title: string }) {
  const latest = snapshots.slice(-24);
  return (
    <section className="border border-slate-800 bg-panel">
      <div className="flex items-center justify-between border-b border-slate-800 px-4 py-3">
        <h2 className="text-base font-semibold text-white">{title}</h2>
        <span className="text-xs text-slate-500">{latest.length} 点</span>
      </div>
      <div className="max-h-[280px] overflow-auto">
        <table className="min-w-full text-xs">
          <thead className="sticky top-0 bg-slate-950 text-slate-400">
            <tr><Header>时间</Header><Header align="right">数值</Header></tr>
          </thead>
          <tbody>
            {latest.map((snapshot) => (
              <tr className="border-b border-slate-800/70" key={`${metric}:${snapshot.timestamp}`}>
                <Cell>{new Date(snapshot.timestamp).toLocaleString()}</Cell>
                <Cell align="right">{formatUsd(Number(snapshot[metric]))}</Cell>
              </tr>
            ))}
            {latest.length === 0 ? <EmptyRow colSpan={2} label="暂无模拟历史。" /> : null}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function PositionsTable({ snapshot }: { snapshot: SimAccountSnapshot }) {
  return (
    <TableCard title="当前模拟仓位" value={`${snapshot.positions.length} 个`}>
      <table className="min-w-[820px] text-xs">
        <thead className="sticky top-0 bg-slate-950 text-slate-400">
          <tr>
            <Header>币种</Header>
            <Header>交易所</Header>
            <Header>类型</Header>
            <Header align="right">数量</Header>
            <Header align="right">入场价</Header>
            <Header align="right">Alpha评分</Header>
            <Header>入场时间</Header>
          </tr>
        </thead>
        <tbody>
          {snapshot.positions.map((position) => (
            <tr className="border-b border-slate-800/70" key={`${position.symbol}:${position.exchange}:${position.entryTime}`}>
              <Cell>{position.symbol}</Cell>
              <Cell>{position.exchange}</Cell>
              <Cell>{position.type}</Cell>
              <Cell align="right">{position.quantity.toFixed(4)}</Cell>
              <Cell align="right">{formatNumber(position.entryPrice)}</Cell>
              <Cell align="right">{position.alphaScore}</Cell>
              <Cell>{new Date(position.entryTime).toLocaleString()}</Cell>
            </tr>
          ))}
          {snapshot.positions.length === 0 ? <EmptyRow colSpan={7} label="暂无模拟仓位。" /> : null}
        </tbody>
      </table>
    </TableCard>
  );
}

function TradeHistoryTable({ snapshot }: { snapshot: SimAccountSnapshot }) {
  return (
    <TableCard title="模拟交易历史" value={`${snapshot.tradeHistory.length} 笔`}>
      <table className="min-w-[720px] text-xs">
        <thead className="sticky top-0 bg-slate-950 text-slate-400">
          <tr>
            <Header>币种</Header>
            <Header>交易所</Header>
            <Header align="right">总收益</Header>
            <Header align="right">Funding收益</Header>
            <Header align="right">价格收益</Header>
            <Header>退出时间</Header>
          </tr>
        </thead>
        <tbody>
          {snapshot.tradeHistory.slice(-80).map((trade) => (
            <tr className="border-b border-slate-800/70" key={`${trade.symbol}:${trade.exchange}:${trade.exitTime}`}>
              <Cell>{trade.symbol}</Cell>
              <Cell>{trade.exchange}</Cell>
              <Cell align="right">{formatUsd(trade.pnl)}</Cell>
              <Cell align="right">{formatUsd(trade.fundingPnL)}</Cell>
              <Cell align="right">{formatUsd(trade.pricePnL)}</Cell>
              <Cell>{new Date(trade.exitTime).toLocaleString()}</Cell>
            </tr>
          ))}
          {snapshot.tradeHistory.length === 0 ? <EmptyRow colSpan={6} label="暂无模拟交易历史。" /> : null}
        </tbody>
      </table>
    </TableCard>
  );
}

function TableCard({ children, title, value }: { children: ReactNode; title: string; value: string }) {
  return (
    <section className="border border-slate-800 bg-panel">
      <div className="flex items-center justify-between border-b border-slate-800 px-4 py-3">
        <h2 className="text-base font-semibold text-white">{title}</h2>
        <span className="text-xs text-slate-500">{value}</span>
      </div>
      <div className="max-h-[520px] overflow-auto">{children}</div>
    </section>
  );
}

function Header({ align = "left", children }: { align?: "left" | "right"; children: ReactNode }) {
  return <th className={`whitespace-nowrap px-3 py-2 ${align === "right" ? "text-right" : "text-left"}`}>{children}</th>;
}

function Cell({ align = "left", children }: { align?: "left" | "right"; children: ReactNode }) {
  return <td className={`px-3 py-2 align-top tabular-nums ${align === "right" ? "text-right" : "text-left"}`}>{children}</td>;
}

function EmptyRow({ colSpan, label }: { colSpan: number; label: string }) {
  return (
    <tr>
      <td className="px-4 py-8 text-center text-sm text-slate-500" colSpan={colSpan}>{label}</td>
    </tr>
  );
}

function filterHistory(rows: SimAccountSnapshot[], params: { exchange?: string; symbol?: string; window?: string }) {
  const since = Date.now() - parseWindowMs(params.window);
  const symbol = params.symbol?.trim().toUpperCase();
  const exchange = params.exchange?.trim().toUpperCase();
  return rows
    .filter((row) => row.timestamp >= since)
    .filter((row) => (symbol ? row.positions.some((position) => position.symbol.toUpperCase().includes(symbol)) || row.tradeHistory.some((trade) => trade.symbol.toUpperCase().includes(symbol)) : true))
    .filter((row) => (exchange ? row.positions.some((position) => position.exchange.toUpperCase().includes(exchange)) || row.tradeHistory.some((trade) => trade.exchange.toUpperCase().includes(exchange)) : true));
}

function parseWindowMs(value?: string) {
  if (value === "1h") return 60 * 60_000;
  if (value === "7d") return 7 * 24 * 60 * 60_000;
  if (value === "30d") return 30 * 24 * 60 * 60_000;
  return 24 * 60 * 60_000;
}

function buildSimulationHref(params: Record<string, string | undefined>) {
  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value) query.set(key, value);
  }
  const text = query.toString();
  return text ? `/simulation?${text}` : "/simulation";
}

function formatUsd(value: number) {
  return Intl.NumberFormat("en-US", { currency: "USD", maximumFractionDigits: 2, style: "currency" }).format(value);
}

function formatNumber(value: number) {
  return value >= 100 ? value.toFixed(2) : value.toPrecision(6);
}
