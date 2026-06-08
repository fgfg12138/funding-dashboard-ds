import type { Metadata } from "next";
import Link from "next/link";
import type { ReactNode } from "react";
import { PageShell } from "@/components/PageShell";
import { queryAllFundingHistory, queryAllOpportunityHistory } from "@/lib/data/historyStore";

export const metadata: Metadata = {
  title: "因子研究 — 资金费率套利看板",
  description: "Funding 四分位因子统计。只读历史数据分析，不接 API Key，不交易。"
};

import {
  buildFundingFactorResearch,
  type FundingFactorBucket,
  type FundingFactorResearchResult
} from "@/lib/research/fundingFactors";
import { applySort, buildSortQuery, parseSortState, sortIndicator, type SortOrder, type SortState } from "@/lib/tableSort/tableSort";

export const dynamic = "force-dynamic";

const WINDOW_OPTIONS = [
  { label: "1h", hours: 1 },
  { label: "24h", hours: 24 },
  { label: "7d", hours: 168 },
  { label: "30d", hours: 720 }
];
type FactorSortKey = "samples" | "min" | "avg" | "max";
const FACTOR_SORTS: FactorSortKey[] = ["samples", "min", "avg", "max"];

export default async function FactorsPage({
  searchParams
}: {
  searchParams: Promise<{ order?: string; sort?: string; window?: string; limit?: string }>;
}) {
  const params = await searchParams;
  const windowHours = parseWindowHours(params.window);
  const displayLimit = parsePositiveInt(params.limit) ?? 50;
  const sortState = parseSortState<FactorSortKey>({
    allowedSorts: FACTOR_SORTS,
    defaultOrder: "desc",
    defaultSort: "samples",
    order: params.order,
    sort: params.sort
  });
  const now = Date.now();
  const from = now - windowHours * 60 * 60_000;
  const [opportunityRows, fundingRows] = await Promise.all([
    queryAllOpportunityHistory({ from, to: now, limit: 5000 }),
    queryAllFundingHistory({ from, to: now, limit: 5000 })
  ]);
  const research = buildFundingFactorResearch({ opportunityRows, fundingRows, now, windowHours });
  const allBuckets = sortBuckets(Object.values(research.bucketsByFactor).flat(), sortState);
  const displayedBuckets = allBuckets.slice(0, displayLimit);

  return (
    <PageShell
      activeHref="/factors"
      description="只读四分位因子统计，用历史 Funding 与机会快照观察存活、衰减和质量分。"
      eyebrow="Funding 因子研究"
      refreshHref={`/factors?window=${params.window ?? "24h"}`}
      title="因子研究"
      updatedAt={research.generatedAt}
    >
      <section className="flex flex-col gap-3 border border-slate-800 bg-slate-950/40 p-3 lg:flex-row lg:items-center lg:justify-between">
        <div className="inline-flex w-fit border border-slate-700 bg-slate-950 p-1">
          {WINDOW_OPTIONS.map((item) => (
            <Link
              className={`h-8 px-3 py-1.5 text-sm ${windowHours === item.hours ? "bg-cyan-400/20 text-cyan-100" : "text-slate-400 hover:text-slate-100"}`}
              href={`/factors?window=${item.label}`}
              key={item.label}
            >
              {item.label}
            </Link>
          ))}
        </div>
        <div className="flex flex-wrap gap-3 text-xs text-slate-500">
          <span>{research.samples.length} 个因子样本</span>
          <span>{opportunityRows.length} 条机会快照</span>
          <span>{fundingRows.length} 条 Funding 快照</span>
        </div>
      </section>

      <FactorSummaryTable params={params} research={research} sortState={sortState} />

      <section className="grid gap-3 xl:grid-cols-3">
        <BucketTable buckets={displayedBuckets} metric="avgSurvivalHours" title="按因子分桶看存活时间" />
        <BucketTable buckets={displayedBuckets} metric="avgAnnualizedDecay" title="按因子分桶看年化衰减" />
        <BucketTable buckets={displayedBuckets} metric="avgQualityScore" title="按因子分桶看质量分" />
      </section>
      <div className="flex items-center justify-between border border-slate-800 bg-slate-950/40 px-4 py-2 text-xs text-slate-500">
        <span>
          显示 {Math.min(displayedBuckets.length, displayLimit)} 条 / 共 {allBuckets.length} 条
          {allBuckets.length > displayLimit ? "（可通过 ?limit=N 调整）" : ""}
        </span>
      </div>
    </PageShell>
  );
}

function FactorSummaryTable({
  params,
  research,
  sortState
}: {
  params: { order?: string; sort?: string; window?: string };
  research: FundingFactorResearchResult;
  sortState: SortState<FactorSortKey>;
}) {
  const rows = sortFactorSummaries(research.factorSummaries, sortState);

  return (
    <section className="border border-slate-800 bg-panel">
      <div className="flex items-center justify-between border-b border-slate-800 px-4 py-3">
        <h2 className="text-base font-semibold text-white">因子汇总表</h2>
        <span className="text-xs text-slate-500">{research.factorSummaries.length} 个因子</span>
      </div>
      <div className="max-h-[520px] overflow-auto">
        <table className="min-w-[980px] border-collapse text-left text-xs">
          <thead className="sticky top-0 z-10 bg-slate-950 text-slate-400">
            <tr>
              <Header>因子</Header>
              <SortableHeader align="right" params={params} sort="samples" sortState={sortState}>样本数</SortableHeader>
              <SortableHeader align="right" params={params} sort="min" sortState={sortState}>最小值</SortableHeader>
              <SortableHeader align="right" params={params} sort="avg" sortState={sortState}>平均值</SortableHeader>
              <SortableHeader align="right" params={params} sort="max" sortState={sortState}>最大值</SortableHeader>
              <Header>最佳存活桶</Header>
              <Header>最低衰减桶</Header>
              <Header>最佳质量桶</Header>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr className="border-b border-slate-800/70 hover:bg-slate-800/40" key={row.factor}>
                <Cell>{row.factor}</Cell>
                <Cell align="right">{row.sampleCount}</Cell>
                <Cell align="right">{formatNumber(row.minValue)}</Cell>
                <Cell align="right">{formatNumber(row.avgValue)}</Cell>
                <Cell align="right">{formatNumber(row.maxValue)}</Cell>
                <Cell>{row.bestSurvivalBucket ?? "-"}</Cell>
                <Cell>{row.lowestDecayBucket ?? "-"}</Cell>
                <Cell>{row.bestQualityBucket ?? "-"}</Cell>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
function BucketTable({
  buckets,
  metric,
  title
}: {
  buckets: FundingFactorBucket[];
  metric: "avgSurvivalHours" | "avgAnnualizedDecay" | "avgQualityScore";
  title: string;
}) {
  return (
    <section className="border border-slate-800 bg-panel">
      <div className="flex items-center justify-between border-b border-slate-800 px-4 py-3">
        <h2 className="text-base font-semibold text-white">{title}</h2>
        <span className="text-xs text-slate-500">{buckets.length} 个分桶</span>
      </div>
      <div className="max-h-[520px] overflow-auto">
        <table className="min-w-[620px] border-collapse text-left text-xs">
          <thead className="sticky top-0 z-10 bg-slate-950 text-slate-400">
            <tr>
              <Header>因子</Header>
              <Header>分桶</Header>
              <Header>范围</Header>
              <Header align="right">样本数</Header>
              <Header align="right">指标值</Header>
            </tr>
          </thead>
          <tbody>
            {buckets.map((row) => (
              <tr className="border-b border-slate-800/70 hover:bg-slate-800/40" key={`${title}:${row.factor}:${row.bucket}`}>
                <Cell>{row.factor}</Cell>
                <Cell>{row.bucket}</Cell>
                <Cell>{formatNumber(row.minValue)} - {formatNumber(row.maxValue)}</Cell>
                <Cell align="right">{row.sampleCount}</Cell>
                <Cell align="right">{formatMetric(row[metric], metric)}</Cell>
              </tr>
            ))}
            {buckets.length === 0 ? (
              <tr>
                <td className="px-4 py-8 text-center text-sm text-slate-500" colSpan={5}>暂无历史样本。</td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
    </section>
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
  params: { order?: string; sort?: string; window?: string };
  sort: FactorSortKey;
  sortState: SortState<FactorSortKey>;
}) {
  return (
    <th className={`whitespace-nowrap px-3 py-2 ${align === "right" ? "text-right" : "text-left"}`}>
      <Link className="text-inherit hover:text-cyan-200" href={`/factors?${buildSortQuery(sortState, sort, buildSearchParams(params))}`}>
        {children}{sortIndicator(sortState, sort)}
      </Link>
    </th>
  );
}

function Cell({ align = "left", children }: { align?: "left" | "right"; children: ReactNode }) {
  return <td className={`px-3 py-2 align-top tabular-nums ${align === "right" ? "text-right" : "text-left"}`}>{children}</td>;
}

function parseWindowHours(value?: string): number {
  return WINDOW_OPTIONS.find((item) => item.label === value)?.hours ?? 24;
}

function parsePositiveInt(value?: string): number | undefined {
  if (!value) return undefined;
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) return undefined;
  return Math.floor(parsed);
}

function formatMetric(value: number, metric: "avgSurvivalHours" | "avgAnnualizedDecay" | "avgQualityScore") {
  if (metric === "avgAnnualizedDecay") return `${formatNumber(value)}%`;
  if (metric === "avgSurvivalHours") return `${formatNumber(value)}h`;
  return formatNumber(value);
}

function formatNumber(value?: number): string {
  if (value === undefined || Number.isNaN(value)) return "-";
  return value.toFixed(2);
}

function buildSearchParams(params: { order?: string; sort?: string; window?: string }): URLSearchParams {
  const searchParams = new URLSearchParams();
  if (params.window) searchParams.set("window", params.window);
  if (params.sort) searchParams.set("sort", params.sort);
  if (params.order) searchParams.set("order", params.order);
  return searchParams;
}

function sortFactorSummaries(
  rows: FundingFactorResearchResult["factorSummaries"],
  sortState: SortState<FactorSortKey>
): FundingFactorResearchResult["factorSummaries"] {
  return applySort(rows, sortState, {
    avg: (row) => row.avgValue,
    max: (row) => row.maxValue,
    min: (row) => row.minValue,
    samples: (row) => row.sampleCount
  });
}

function sortBuckets(rows: FundingFactorBucket[], sortState: SortState<FactorSortKey>): FundingFactorBucket[] {
  return applySort(rows, sortState, {
    avg: (row) => row.avgQualityScore,
    max: (row) => row.maxValue,
    min: (row) => row.minValue,
    samples: (row) => row.sampleCount
  });
}
