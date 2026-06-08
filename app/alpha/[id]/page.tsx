import type { Metadata } from "next";
import Link from "next/link";
import { queryAllFundingHistory, queryAllOpportunityHistory } from "@/lib/data/historyStore";

export const metadata: Metadata = {
  title: "Alpha下钻 — 资金费率套利看板",
  description: "单币种 Alpha 评分下钻页面。只读历史 Funding 分析，不交易。"
};

import {
  buildAlphaDrilldown,
  type AlphaComparisonRow,
  type AlphaScoreBreakdownItem,
  type AlphaTimelinePoint
} from "@/lib/research/alphaDrilldown";
import { parseAlphaWindowHours } from "@/lib/research/alphaScore";

export const dynamic = "force-dynamic";

const WINDOW_OPTIONS = [
  { label: "1h", value: "1h", hours: 1 },
  { label: "24h", value: "24h", hours: 24 },
  { label: "7d", value: "7d", hours: 168 },
  { label: "30d", value: "30d", hours: 720 }
];

type AlphaDrilldownParams = {
  id: string;
};

type AlphaDrilldownSearchParams = {
  window?: string;
  compare?: string;
};

export default async function AlphaDrilldownPage({
  params,
  searchParams
}: {
  params: Promise<AlphaDrilldownParams>;
  searchParams: Promise<AlphaDrilldownSearchParams>;
}) {
  const [{ id }, query] = await Promise.all([params, searchParams]);
  const decodedId = decodeURIComponent(id);
  const windowHours = parseAlphaWindowHours(query.window);
  const now = Date.now();
  const from = now - windowHours * 60 * 60_000;
  const [opportunityRows, fundingRows] = await Promise.all([
    queryAllOpportunityHistory({ from, to: now, limit: 5000 }),
    queryAllFundingHistory({ from, to: now, limit: 5000 })
  ]);
  const drilldown = buildAlphaDrilldown({
    id: decodedId,
    opportunityRows,
    fundingRows,
    now,
    windowHours,
    compareSymbols: parseCompareSymbols(query.compare)
  });
  const alpha = drilldown.alpha;

  return (
    <main className="min-h-screen bg-surface px-4 py-5 text-slate-100 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-[1800px] space-y-5">
        <header className="flex flex-col gap-3 border-b border-slate-800 pb-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p className="text-xs uppercase tracking-[0.2em] text-amber-300">Alpha Drilldown Engine</p>
            <h1 className="mt-2 text-2xl font-semibold text-white">{alpha?.symbol ?? "Alpha not found"}</h1>
            <p className="mt-1 text-sm text-slate-400">只读 Alpha explanation. 无 API Key, 不执行, 不交易.</p>
          </div>
          <div className="flex gap-3 text-sm">
            <Link className="text-cyan-300 hover:text-cyan-100" href="/alpha">
              Alpha
            </Link>
            <Link className="text-cyan-300 hover:text-cyan-100" href="/dashboard">
              Dashboard
            </Link>
          </div>
        </header>

        <section className="flex flex-col gap-3 border-y border-slate-800 bg-slate-950/40 py-4 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex flex-wrap gap-2">
            {WINDOW_OPTIONS.map((item) => (
              <Link
                className={`h-8 rounded border px-3 py-1.5 text-sm ${
                  windowHours === item.hours
                    ? "border-amber-400/50 bg-amber-400/15 text-amber-100"
                    : "border-slate-700 bg-slate-950 text-slate-400 hover:text-slate-100"
                }`}
                href={buildHref(decodedId, { ...query, window: item.value })}
                key={item.value}
              >
                {item.label}
              </Link>
            ))}
          </div>
          <div className="flex flex-wrap gap-3 text-xs text-slate-500">
            <span>{opportunityRows.length} opportunity snapshots</span>
            <span>{fundingRows.length} funding snapshots</span>
            <span>更新时间 {new Date(now).toLocaleTimeString()}</span>
          </div>
        </section>

        {alpha ? (
          <>
            <section className="grid gap-3 md:grid-cols-4">
              <Stat label="Alpha Score" value={alpha.alphaScore} tone="text-amber-300" />
              <Stat label="Alpha Grade" value={alpha.alphaGrade} tone="text-emerald-300" />
              <Stat label="Alpha Type" value={alpha.alphaType} tone="text-cyan-300" />
              <Stat label="Exchange Pair" value={alpha.exchangePair} tone="text-slate-100" />
            </section>

            <section className="rounded border border-slate-800 bg-panel px-4 py-3">
              <h2 className="text-base font-semibold text-white">Alpha Reason</h2>
              <p className="mt-2 text-sm text-slate-300">{alpha.alphaReason}</p>
            </section>

            <section className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_minmax(420px,0.7fr)]">
              <ScoreBreakdownTable items={drilldown.breakdown?.items ?? []} totalScore={drilldown.breakdown?.totalScore ?? 0} />
              <AlphaTimeline points={drilldown.timeline} />
            </section>

            <AlphaComparisonTable rows={drilldown.comparison} />
          </>
        ) : (
          <section className="rounded border border-slate-800 bg-panel px-4 py-10 text-center text-slate-400">
            No Alpha record found for this id in the selected window.
          </section>
        )}
      </div>
    </main>
  );
}

function ScoreBreakdownTable({ items, totalScore }: { items: AlphaScoreBreakdownItem[]; totalScore: number }) {
  return (
    <section className="rounded border border-slate-800 bg-panel">
      <div className="flex items-center justify-between border-b border-slate-800 px-4 py-3">
        <h2 className="text-base font-semibold text-white">Score Breakdown</h2>
        <span className="text-xs text-amber-300">Total {totalScore}</span>
      </div>
      <div className="overflow-x-auto">
        <table className="min-w-full border-collapse text-left text-xs">
          <thead className="bg-slate-950 text-slate-400">
            <tr>
              <Header>Factor</Header>
              <Header>Value</Header>
              <Header>Contribution</Header>
              <Header>Max</Header>
            </tr>
          </thead>
          <tbody>
            {items.map((item) => (
              <tr className="border-b border-slate-800/70 hover:bg-slate-800/40" key={item.factor}>
                <Cell strong>{item.factor}</Cell>
                <Cell>{formatValue(item)}</Cell>
                <Cell className="text-amber-300">{item.contribution.toFixed(2)}</Cell>
                <Cell>{item.maxContribution}</Cell>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function AlphaTimeline({ points }: { points: AlphaTimelinePoint[] }) {
  return (
    <section className="rounded border border-slate-800 bg-panel">
      <div className="flex items-center justify-between border-b border-slate-800 px-4 py-3">
        <h2 className="text-base font-semibold text-white">Alpha Timeline</h2>
        <span className="text-xs text-slate-500">{points.length} points</span>
      </div>
      <div className="px-4 py-4">
        {points.length > 0 ? <TimelineSvg points={points} /> : <p className="py-12 text-center text-sm text-slate-500">No timeline yet.</p>}
      </div>
      <div className="max-h-48 overflow-auto border-t border-slate-800">
        <table className="min-w-full border-collapse text-left text-xs">
          <thead className="bg-slate-950 text-slate-400">
            <tr>
              <Header>Time</Header>
              <Header>Score</Header>
              <Header>Grade</Header>
              <Header>最新年化</Header>
              <Header>质量分</Header>
            </tr>
          </thead>
          <tbody>
            {points.map((point) => (
              <tr className="border-b border-slate-800/70" key={point.timestamp}>
                <Cell>{new Date(point.timestamp).toLocaleString()}</Cell>
                <Cell className="text-amber-300">{point.alphaScore}</Cell>
                <Cell>{point.alphaGrade}</Cell>
                <Cell>{point.latestAnnualized.toFixed(2)}%</Cell>
                <Cell>{point.qualityScore.toFixed(0)}</Cell>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function AlphaComparisonTable({ rows }: { rows: AlphaComparisonRow[] }) {
  return (
    <section className="rounded border border-slate-800 bg-panel">
      <div className="flex items-center justify-between border-b border-slate-800 px-4 py-3">
        <h2 className="text-base font-semibold text-white">Alpha Comparison</h2>
        <span className="text-xs text-slate-500">BTC vs ETH supported via compare query</span>
      </div>
      <div className="overflow-x-auto">
        <table className="min-w-full border-collapse text-left text-xs">
          <thead className="bg-slate-950 text-slate-400">
            <tr>
              <Header>Symbol</Header>
              <Header>Score</Header>
              <Header>Grade</Header>
              <Header>Type</Header>
              <Header>存活率</Header>
              <Header>衰减率</Header>
              <Header>质量分</Header>
              <Header>波动率</Header>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr className="border-b border-slate-800/70 hover:bg-slate-800/40" key={row.id}>
                <Cell strong>{row.symbol}</Cell>
                <Cell className="text-amber-300">{row.alphaScore}</Cell>
                <Cell>{row.alphaGrade}</Cell>
                <Cell>{row.alphaType}</Cell>
                <Cell>{row.survivalHours.toFixed(1)}h</Cell>
                <Cell>{row.annualizedDecay.toFixed(2)}%</Cell>
                <Cell>{row.qualityScore.toFixed(0)}</Cell>
                <Cell>{row.fundingVolatility.toFixed(2)}%</Cell>
              </tr>
            ))}
            {rows.length === 0 && (
              <tr>
                <td className="px-3 py-8 text-center text-slate-500" colSpan={8}>
                  No comparison samples in this window.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function TimelineSvg({ points }: { points: AlphaTimelinePoint[] }) {
  const width = 520;
  const height = 180;
  const padding = 20;
  const sorted = points.slice().sort((a, b) => a.timestamp - b.timestamp);
  const minTime = sorted[0].timestamp;
  const maxTime = sorted[sorted.length - 1].timestamp;
  const xRange = Math.max(maxTime - minTime, 1);
  const path = sorted
    .map((point, index) => {
      const x = padding + ((point.timestamp - minTime) / xRange) * (width - padding * 2);
      const y = height - padding - (point.alphaScore / 100) * (height - padding * 2);
      return `${index === 0 ? "M" : "L"} ${x.toFixed(2)} ${y.toFixed(2)}`;
    })
    .join(" ");

  return (
    <svg className="h-44 w-full" preserveAspectRatio="none" viewBox={`0 0 ${width} ${height}`} role="img" aria-label="Alpha Score timeline">
      <line stroke="#334155" x1={padding} x2={width - padding} y1={height - padding} y2={height - padding} />
      <line stroke="#334155" x1={padding} x2={padding} y1={padding} y2={height - padding} />
      <path d={path} fill="none" stroke="#f59e0b" strokeLinecap="round" strokeLinejoin="round" strokeWidth="3" />
      {sorted.map((point) => {
        const x = padding + ((point.timestamp - minTime) / xRange) * (width - padding * 2);
        const y = height - padding - (point.alphaScore / 100) * (height - padding * 2);
        return <circle cx={x} cy={y} fill="#22d3ee" key={point.timestamp} r="3" />;
      })}
    </svg>
  );
}

function Stat({ label, value, tone }: { label: string; value: React.ReactNode; tone: string }) {
  return (
    <div className="rounded border border-slate-800 bg-panel px-4 py-3">
      <p className="text-xs uppercase tracking-[0.16em] text-slate-500">{label}</p>
      <p className={`mt-2 text-xl font-semibold ${tone}`}>{value}</p>
    </div>
  );
}

function Header({ children }: { children: React.ReactNode }) {
  return <th className="whitespace-nowrap border-b border-slate-800 px-3 py-2 font-medium">{children}</th>;
}

function Cell({
  children,
  className = "",
  strong = false
}: {
  children: React.ReactNode;
  className?: string;
  strong?: boolean;
}) {
  return <td className={`whitespace-nowrap px-3 py-2 ${strong ? "font-medium text-white" : "text-slate-200"} ${className}`}>{children}</td>;
}

function buildHref(id: string, params: AlphaDrilldownSearchParams): string {
  const searchParams = new URLSearchParams();
  if (params.window) searchParams.set("window", params.window);
  if (params.compare) searchParams.set("compare", params.compare);
  const query = searchParams.toString();
  return query ? `/alpha/${encodeURIComponent(id)}?${query}` : `/alpha/${encodeURIComponent(id)}`;
}

function parseCompareSymbols(value?: string): string[] | undefined {
  if (!value) return undefined;
  const symbols = value
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);

  return symbols.length ? symbols : undefined;
}

function formatValue(item: AlphaScoreBreakdownItem): string {
  if (item.factor === "positiveFundingRatio") return `${(item.value * 100).toFixed(0)}%`;
  if (item.factor === "survivalHours") return `${item.value.toFixed(1)}h`;
  return `${item.value.toFixed(2)}${item.factor === "qualityScore" ? "" : "%"}`;
}
