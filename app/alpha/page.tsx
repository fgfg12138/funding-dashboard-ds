import type { Metadata } from "next";
import Link from "next/link";
import type { ReactNode } from "react";
import { PageShell } from "@/components/PageShell";

import { queryAllFundingHistory, queryAllOpportunityHistory } from "@/lib/data/historyStore";
import { buildAlphaDiscovery, type AlphaOpportunity, type AlphaType } from "@/lib/research/alphaScore";
import { buildFundingFactorResearch } from "@/lib/research/fundingFactors";
import { applySort, buildSortQuery, parseSortState, sortIndicator, type SortOrder, type SortState } from "@/lib/tableSort/tableSort";

export const dynamic = "force-dynamic";

const WINDOW_OPTIONS = [
  { label: "1h", value: "1h", hours: 1 },
  { label: "24h", value: "24h", hours: 24 },
  { label: "7d", value: "7d", hours: 168 },
  { label: "30d", value: "30d", hours: 720 }
];

const TYPE_OPTIONS: Array<"all" | AlphaType> = ["all", "Stable Alpha", "Emerging Alpha", "Momentum Alpha", "Risky Alpha"];

type AlphaPageParams = {
  window?: string;
  type?: string;
  minAlphaScore?: string;
  limit?: string;
  order?: string;
  sort?: string;
};
type AlphaSortKey = "alphaScore" | "latestAnnualized" | "avgAnnualized" | "positiveFundingRatio" | "survival" | "decay" | "volatility" | "quality";
const ALPHA_SORTS: AlphaSortKey[] = ["alphaScore", "latestAnnualized", "avgAnnualized", "positiveFundingRatio", "survival", "decay", "volatility", "quality"];

export const metadata: Metadata = {
  title: "Alpha发现 — 资金费率套利看板",
  description: "基于 Funding 与机会历史的 Alpha 发现引擎。只读，不接 API Key，不交易。"
};

export default async function AlphaPage({
  searchParams
}: {
  searchParams: Promise<AlphaPageParams>;
}) {
  const params = await searchParams;
  const windowHours = parseWindowHours(params.window);
  const limit = parseNumberParam(params.limit) ?? 20;
  const type = parseAlphaType(params.type);
  const minAlphaScore = parseNumberParam(params.minAlphaScore);
  const sortState = parseSortState<AlphaSortKey>({
    allowedSorts: ALPHA_SORTS,
    defaultOrder: "desc",
    defaultSort: "alphaScore",
    order: params.order,
    sort: params.sort
  });
  const now = Date.now();
  const from = now - windowHours * 60 * 60_000;
  const [opportunityRows, fundingRows] = await Promise.all([
    queryAllOpportunityHistory({ from, to: now, limit: 5000 }),
    queryAllFundingHistory({ from, to: now, limit: 5000 })
  ]);
  const factors = buildFundingFactorResearch({ opportunityRows, fundingRows, now, windowHours });
  const discovery = buildAlphaDiscovery({
    samples: factors.samples,
    limit,
    filters: { type, minAlphaScore }
  });

  return (
    <PageShell
      activeHref="/alpha"
      description="基于 Funding 与机会历史的只读 Alpha 发现页面，不接 API Key，不交易。"
      eyebrow="Alpha发现引擎"
      refreshHref={buildHref(params)}
      title="Alpha发现"
      updatedAt={factors.generatedAt}
    >
      <section className="flex flex-col gap-3 border border-slate-800 bg-slate-950/40 p-3 xl:flex-row xl:items-center xl:justify-between">
        <div className="flex flex-wrap gap-2">
          {WINDOW_OPTIONS.map((item) => (
            <Link
              className={`h-8 border px-3 py-1.5 text-sm ${
                windowHours === item.hours
                  ? "border-amber-400/50 bg-amber-400/15 text-amber-100"
                  : "border-slate-700 bg-slate-950 text-slate-400 hover:text-slate-100"
              }`}
              href={buildHref({ ...params, window: item.value })}
              key={item.value}
            >
              {item.label}
            </Link>
          ))}
        </div>
        <div className="flex flex-wrap gap-2">
          {TYPE_OPTIONS.map((item) => (
            <Link
              className={`h-8 border px-3 py-1.5 text-sm ${
                type === item
                  ? "border-cyan-400/50 bg-cyan-400/15 text-cyan-100"
                  : "border-slate-700 bg-slate-950 text-slate-400 hover:text-slate-100"
              }`}
              href={buildHref({ ...params, type: item })}
              key={item}
            >
              {formatAlphaType(item)}
            </Link>
          ))}
        </div>
        <div className="flex flex-wrap gap-3 text-xs text-slate-500">
          <span>{factors.samples.length} 个样本</span>
          <span>{opportunityRows.length} 条机会快照</span>
          <span>{fundingRows.length} 条 Funding 快照</span>
        </div>
      </section>

      <section className="grid gap-2 md:grid-cols-4">
        <Stat label="最高 Alpha 评分" value={formatNumber(discovery.topAlpha[0]?.alphaScore)} tone="text-amber-300" />
        <Stat label="A+/A 数量" value={countStrongAlpha(discovery.topAlpha)} tone="text-emerald-300" />
        <Stat label="稳定数量" value={discovery.topStableAlpha.length} tone="text-cyan-300" />
        <Stat label="高风险数量" value={discovery.topRiskyAlpha.length} tone="text-rose-300" />
      </section>

      <AlphaTable params={params} rows={sortAlphaRows(discovery.topAlpha, sortState)} sortState={sortState} title="Top Alpha 机会" />
      <section className="grid gap-3 2xl:grid-cols-2">
        <AlphaTable params={params} rows={sortAlphaRows(discovery.topStableAlpha, sortState)} sortState={sortState} title="稳定 Alpha" />
        <AlphaTable params={params} rows={sortAlphaRows(discovery.topEmergingAlpha, sortState)} sortState={sortState} title="新兴 Alpha" />
        <AlphaTable params={params} rows={sortAlphaRows(discovery.topMomentumAlpha, sortState)} sortState={sortState} title="动量 Alpha" />
        <AlphaTable params={params} rows={sortAlphaRows(discovery.topRiskyAlpha, sortState)} sortState={sortState} title="高风险 Alpha" />
      </section>
    </PageShell>
  );
}

function AlphaTable({
  params,
  rows,
  sortState,
  title
}: {
  params: AlphaPageParams;
  rows: AlphaOpportunity[];
  sortState: SortState<AlphaSortKey>;
  title: string;
}) {
  return (
    <section className="border border-slate-800 bg-panel">
      <div className="flex items-center justify-between border-b border-slate-800 px-4 py-3">
        <h2 className="text-base font-semibold text-white">{title}</h2>
        <span className="text-xs text-slate-500">{rows.length} 行</span>
      </div>
      <div className="max-h-[520px] overflow-auto">
        <table className="min-w-[1320px] border-collapse text-left text-xs">
          <thead className="sticky top-0 z-10 bg-slate-950 text-slate-400">
            <tr>
              <Header>币种</Header>
              <Header>类型</Header>
              <Header>交易所组合</Header>
              <SortableHeader align="right" params={params} sort="alphaScore" sortState={sortState}>评分</SortableHeader>
              <Header>等级</Header>
              <SortableHeader align="right" params={params} sort="latestAnnualized" sortState={sortState}>最新年化</SortableHeader>
              <SortableHeader align="right" params={params} sort="avgAnnualized" sortState={sortState}>平均年化</SortableHeader>
              <SortableHeader align="right" params={params} sort="positiveFundingRatio" sortState={sortState}>正费率占比</SortableHeader>
              <SortableHeader align="right" params={params} sort="survival" sortState={sortState}>存活小时</SortableHeader>
              <SortableHeader align="right" params={params} sort="decay" sortState={sortState}>衰减</SortableHeader>
              <SortableHeader align="right" params={params} sort="volatility" sortState={sortState}>波动</SortableHeader>
              <SortableHeader align="right" params={params} sort="quality" sortState={sortState}>质量分</SortableHeader>
              <Header>原因</Header>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr className="border-b border-slate-800/70 hover:bg-slate-800/40" key={row.id}>
                <Cell><Link className="font-semibold text-cyan-200 hover:text-cyan-100" href={`/alpha/${encodeURIComponent(row.id)}`}>{row.symbol}</Link></Cell>
                <Cell>{row.alphaType}</Cell>
                <Cell>{row.exchangePair}</Cell>
                <Cell align="right">{row.alphaScore}</Cell>
                <Cell>{row.alphaGrade}</Cell>
                <Cell align="right">{formatPercent(row.latestAnnualized)}</Cell>
                <Cell align="right">{formatPercent(row.avgAnnualized)}</Cell>
                <Cell align="right">{formatPercent(row.positiveFundingRatio * 100)}</Cell>
                <Cell align="right">{formatNumber(row.survivalHours)}</Cell>
                <Cell align="right">{formatPercent(row.annualizedDecay)}</Cell>
                <Cell align="right">{formatNumber(row.fundingVolatility)}</Cell>
                <Cell align="right">{row.qualityScore}</Cell>
                <Cell><span className="line-clamp-2 max-w-[360px] text-slate-400" title={row.alphaReason}>{row.alphaReason}</span></Cell>
              </tr>
            ))}
            {rows.length === 0 ? (
              <tr>
                <td className="px-4 py-8 text-center text-sm text-slate-500" colSpan={13}>暂无符合筛选条件的 Alpha 机会。</td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function Stat({ label, tone, value }: { label: string; tone: string; value: number | string }) {
  return (
    <div className="border border-slate-800 bg-panel p-4">
      <p className="text-xs text-slate-500">{label}</p>
      <p className={`mt-2 text-2xl font-semibold ${tone}`}>{value}</p>
    </div>
  );
}

function Header({ align = "left", children }: { align?: "left" | "right"; children: ReactNode }) {
  return <th className={`whitespace-nowrap px-3 py-2 ${align === "right" ? "text-right" : "text-left"}`}>{children}</th>;
}

function SortableHeader({
  align = "left",
  children,
  params,
  sort,
  sortState
}: {
  align?: "left" | "right";
  children: ReactNode;
  params: AlphaPageParams;
  sort: AlphaSortKey;
  sortState: SortState<AlphaSortKey>;
}) {
  return (
    <th className={`whitespace-nowrap px-3 py-2 ${align === "right" ? "text-right" : "text-left"}`}>
      <Link className="text-inherit hover:text-cyan-200" href={`/alpha?${buildSortQuery(sortState, sort, buildSearchParams(params))}`}>
        {children}{sortIndicator(sortState, sort)}
      </Link>
    </th>
  );
}

function Cell({ align = "left", children }: { align?: "left" | "right"; children: ReactNode }) {
  return <td className={`px-3 py-2 align-top tabular-nums ${align === "right" ? "text-right" : "text-left"}`}>{children}</td>;
}

function buildHref(params: AlphaPageParams): string {
  const searchParams = buildSearchParams(params);
  const query = searchParams.toString();
  return query ? `/alpha?${query}` : "/alpha";
}

function buildSearchParams(params: AlphaPageParams): URLSearchParams {
  const searchParams = new URLSearchParams();
  if (params.window) searchParams.set("window", params.window);
  if (params.type && params.type !== "all") searchParams.set("type", params.type);
  if (params.minAlphaScore) searchParams.set("minAlphaScore", params.minAlphaScore);
  if (params.limit) searchParams.set("limit", params.limit);
  if (params.sort) searchParams.set("sort", params.sort);
  if (params.order) searchParams.set("order", params.order);
  return searchParams;
}

function countStrongAlpha(rows: AlphaOpportunity[]): number {
  return rows.filter((row) => row.alphaGrade === "A+" || row.alphaGrade === "A").length;
}

function parseWindowHours(value?: string): number {
  return WINDOW_OPTIONS.find((item) => item.value === value)?.hours ?? 24;
}

function parseNumberParam(value?: string): number | undefined {
  if (!value) return undefined;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function parseAlphaType(value?: string): "all" | AlphaType {
  if (value === "Stable Alpha" || value === "Emerging Alpha" || value === "Momentum Alpha" || value === "Risky Alpha") {
    return value;
  }
  return "all";
}

function formatAlphaType(value: "all" | AlphaType): string {
  if (value === "all") return "全部";
  if (value === "Stable Alpha") return "稳定 Alpha";
  if (value === "Emerging Alpha") return "新兴 Alpha";
  if (value === "Momentum Alpha") return "动量 Alpha";
  return "高风险 Alpha";
}

function formatNumber(value?: number): string {
  if (value === undefined || Number.isNaN(value)) return "-";
  return value.toFixed(2);
}

function formatPercent(value?: number): string {
  if (value === undefined || Number.isNaN(value)) return "-";
  return `${value.toFixed(2)}%`;
}

function sortAlphaRows(rows: AlphaOpportunity[], sortState: SortState<AlphaSortKey>): AlphaOpportunity[] {
  return applySort(rows, sortState, {
    alphaScore: (row) => row.alphaScore,
    avgAnnualized: (row) => row.avgAnnualized,
    decay: (row) => row.annualizedDecay,
    latestAnnualized: (row) => row.latestAnnualized,
    positiveFundingRatio: (row) => row.positiveFundingRatio,
    quality: (row) => row.qualityScore,
    survival: (row) => row.survivalHours,
    volatility: (row) => row.fundingVolatility
  });
}
