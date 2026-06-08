"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { PageShell } from "@/components/PageShell";
import { ExchangeBadge, SkeletonStatCards, StatCard } from "@/components/ui/dashboard";
import type { PrivateAccountSnapshot } from "@/lib/exchangeAdapters/privateAccountTypes";
import { createPrivateAccountAdapter } from "@/lib/exchangeAdapters/privateAccountAdapter";
import { summarizeAccountSnapshots, type AccountSyncSummary } from "@/lib/exchangeAdapters/accountSnapshotSummary";

const EXCHANGES = ["Binance", "OKX", "Bybit"] as const;

export default function AccountSyncPage() {
  const [snapshots, setSnapshots] = useState<PrivateAccountSnapshot[]>([]);
  const [loading, setLoading] = useState(true);

  const loadAll = useCallback(async () => {
    setLoading(true);
    const results = await Promise.allSettled(
      EXCHANGES.map((ex) => createPrivateAccountAdapter(ex).getSnapshot()),
    );
    const snapshots = results
      .filter((r) => r.status === "fulfilled")
      .map((r) => (r as PromiseFulfilledResult<PrivateAccountSnapshot>).value);
    setSnapshots(snapshots);
    setLoading(false);
  }, []);

  useEffect(() => {
    void loadAll();
  }, [loadAll]);

  const summary = useMemo(() => summarizeAccountSnapshots(snapshots), [snapshots]);

  return (
    <PageShell
      activeHref="/account-sync"
      description="Mock 账户同步中心 — 展示模拟资产、持仓、挂单和 Funding 收益。当前全部为 Mock 数据。"
      eyebrow="Mock Account Sync — Phase 3.5"
      loading={loading}
      onRefresh={loadAll}
      title="账户同步"
      updatedAt={null}
    >
      {/* Disclaimer */}
      <section className="border border-yellow-400/30 bg-yellow-400/10 px-4 py-3 text-xs text-yellow-200">
        <p className="font-medium">⚠ 全部为 Mock 数据</p>
        <p className="mt-1">
          当前不连接交易所 · 不使用 API Key · 不解密 Secret · 不读取真实账户。
          所有数据来自 Mock PrivateAccountAdapter，<strong>不可用于真实交易决策</strong>。
        </p>
      </section>

      {/* Stat cards */}
      {loading ? (
        <SkeletonStatCards count={6} />
      ) : (
        <section className="grid gap-2 md:grid-cols-3 xl:grid-cols-6">
          <StatCard label="当前模式" value="Mock Sync" tone="slate" />
          <StatCard label="数据来源" value="Mock Adapter" tone="slate" />
          <StatCard label="API Key" value="未使用" tone="slate" />
          <StatCard label="总 Mock 资产" value={formatUsd(summary.totalUsdValue)} tone="cyan" />
          <StatCard label="Mock 持仓" value={summary.totalPositions.toLocaleString()} tone="green" />
          <StatCard label="Mock 挂单" value={summary.totalOpenOrders.toLocaleString()} tone="yellow" />
        </section>
      )}

      {/* Exchange snapshot cards */}
      {!loading && (
        <section className="grid gap-3 xl:grid-cols-3">
          {summary.byExchange.map((ex) => (
            <section className="border border-slate-800 bg-slate-950/40" key={ex.exchangeId}>
              <div className="flex items-center justify-between border-b border-slate-800 px-4 py-3">
                <h3 className="text-sm font-semibold text-white">{ex.exchangeId}</h3>
                <span className="border border-slate-700 bg-slate-900 px-2 py-0.5 text-xs text-slate-400">
                  Mock
                </span>
              </div>
              <div className="grid grid-cols-2 gap-3 p-4 text-xs">
                <StatRow label="总资产" value={formatUsd(ex.totalUsdValue)} />
                <StatRow label="币种数量" value={ex.balanceCount.toLocaleString()} />
                <StatRow label="持仓数量" value={ex.positionCount.toLocaleString()} />
                <StatRow label="挂单数量" value={ex.openOrderCount.toLocaleString()} />
                <StatRow label="Funding 记录" value={ex.fundingPaymentCount.toLocaleString()} />
              </div>
            </section>
          ))}
        </section>
      )}

      {/* Balances Table */}
      <Section title="资产余额" count={snapshots.reduce((s, snap) => s + snap.balances.assets.length, 0)}>
        <table className="min-w-[800px] border-collapse text-left text-xs">
          <thead className="sticky top-0 z-10 bg-slate-950 text-slate-400">
            <tr>
              <Th>交易所</Th>
              <Th>币种</Th>
              <Th align="right">可用</Th>
              <Th align="right">冻结</Th>
              <Th align="right">总计</Th>
              <Th align="right">USD 估值</Th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-800">
            {snapshots.flatMap((snap) =>
              snap.balances.assets.map((asset) => (
                <tr className="hover:bg-slate-900/70" key={`${snap.exchangeId}:${asset.asset}`}>
                  <Td><ExchangeBadge label={snap.exchangeId} /></Td>
                  <Td><span className="font-semibold text-slate-100">{asset.asset}</span></Td>
                  <Td align="right">{formatCount(asset.free)}</Td>
                  <Td align="right">{formatCount(asset.locked)}</Td>
                  <Td align="right">{formatCount(asset.total)}</Td>
                  <Td align="right">{formatUsd(asset.usdValue)}</Td>
                </tr>
              )),
            )}
            {snapshots.length === 0 && (
              <tr>
                <td className="px-4 py-8 text-center text-sm text-slate-500" colSpan={6}>
                  暂无数据。
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </Section>

      {/* Positions Table */}
      <Section title="持仓" count={snapshots.reduce((s, snap) => s + snap.positions.length, 0)}>
        <table className="min-w-[1100px] border-collapse text-left text-xs">
          <thead className="sticky top-0 z-10 bg-slate-950 text-slate-400">
            <tr>
              <Th>交易所</Th>
              <Th>币种</Th>
              <Th>类型</Th>
              <Th>方向</Th>
              <Th align="right">名义本金</Th>
              <Th align="right">开仓价</Th>
              <Th align="right">标记价</Th>
              <Th align="right">未实现 PnL</Th>
              <Th align="right">杠杆</Th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-800">
            {snapshots.flatMap((snap) =>
              snap.positions.map((pos) => (
                <tr className="hover:bg-slate-900/70" key={`${snap.exchangeId}:${pos.symbol}:${pos.side}`}>
                  <Td><ExchangeBadge label={snap.exchangeId} /></Td>
                  <Td><span className="font-semibold text-slate-100">{pos.symbol}</span></Td>
                  <Td>{pos.marketType}</Td>
                  <Td><SideBadge side={pos.side} /></Td>
                  <Td align="right">{formatUsd(pos.notionalUsd)}</Td>
                  <Td align="right">{formatPrice(pos.entryPrice)}</Td>
                  <Td align="right">{formatPrice(pos.markPrice)}</Td>
                  <Td align="right">
                    <span className={pos.unrealizedPnl >= 0 ? "text-emerald-300" : "text-rose-300"}>
                      {formatUsd(pos.unrealizedPnl)}
                    </span>
                  </Td>
                  <Td align="right">{pos.leverage}x</Td>
                </tr>
              )),
            )}
            {snapshots.every((s) => s.positions.length === 0) && (
              <tr>
                <td className="px-4 py-8 text-center text-sm text-slate-500" colSpan={9}>
                  暂无持仓。
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </Section>

      {/* Open Orders Table */}
      <Section title="挂单" count={snapshots.reduce((s, snap) => s + snap.openOrders.length, 0)}>
        <table className="min-w-[900px] border-collapse text-left text-xs">
          <thead className="sticky top-0 z-10 bg-slate-950 text-slate-400">
            <tr>
              <Th>交易所</Th>
              <Th>币种</Th>
              <Th>方向</Th>
              <Th align="right">价格</Th>
              <Th align="right">数量</Th>
              <Th>状态</Th>
              <Th>创建时间</Th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-800">
            {snapshots.flatMap((snap) =>
              snap.openOrders.map((ord) => (
                <tr className="hover:bg-slate-900/70" key={ord.orderId}>
                  <Td><ExchangeBadge label={snap.exchangeId} /></Td>
                  <Td><span className="font-semibold text-slate-100">{ord.symbol}</span></Td>
                  <Td><SideBadge side={ord.side} /></Td>
                  <Td align="right">{formatPrice(ord.price)}</Td>
                  <Td align="right">{ord.quantity}</Td>
                  <Td><OrderStatusBadge status={ord.status} /></Td>
                  <Td>{formatTime(ord.createdAt)}</Td>
                </tr>
              )),
            )}
            {snapshots.every((s) => s.openOrders.length === 0) && (
              <tr>
                <td className="px-4 py-8 text-center text-sm text-slate-500" colSpan={7}>
                  暂无挂单。
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </Section>

      {/* Funding Payments Table */}
      <Section title="Funding 收益" count={snapshots.reduce((s, snap) => s + snap.fundingPayments.length, 0)}>
        <table className="min-w-[800px] border-collapse text-left text-xs">
          <thead className="sticky top-0 z-10 bg-slate-950 text-slate-400">
            <tr>
              <Th>交易所</Th>
              <Th>币种</Th>
              <Th align="right">金额 (USD)</Th>
              <Th align="right">资金费率</Th>
              <Th>支付时间</Th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-800">
            {snapshots.flatMap((snap) =>
              snap.fundingPayments.map((fp, i) => (
                <tr className="hover:bg-slate-900/70" key={`${snap.exchangeId}:${fp.symbol}:${i}`}>
                  <Td><ExchangeBadge label={snap.exchangeId} /></Td>
                  <Td><span className="font-semibold text-slate-100">{fp.symbol}</span></Td>
                  <Td align="right">
                    <span className={fp.amountUsd >= 0 ? "text-emerald-300" : "text-rose-300"}>
                      {formatUsd(fp.amountUsd)}
                    </span>
                  </Td>
                  <Td align="right">{(fp.fundingRate * 100).toFixed(4)}%</Td>
                  <Td>{formatTime(fp.paidAt)}</Td>
                </tr>
              )),
            )}
            {snapshots.every((s) => s.fundingPayments.length === 0) && (
              <tr>
                <td className="px-4 py-8 text-center text-sm text-slate-500" colSpan={5}>
                  暂无 Funding 记录。
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </Section>
    </PageShell>
  );
}

/* ── Components ───────────────────────────────────────── */

function Section({ children, count, title }: { children: React.ReactNode; count: number; title: string }) {
  return (
    <section className="border border-slate-800 bg-slate-950/40">
      <div className="flex items-center justify-between border-b border-slate-800 px-4 py-3">
        <h2 className="text-base font-semibold text-white">{title}</h2>
        <span className="text-xs text-slate-500">{count} 条</span>
      </div>
      <div className="max-h-[400px] overflow-auto">{children}</div>
    </section>
  );
}

function Th({ align = "left", children }: { align?: "left" | "right"; children: React.ReactNode }) {
  return <th className={`whitespace-nowrap px-3 py-2 ${align === "right" ? "text-right" : "text-left"}`}>{children}</th>;
}

function Td({ align = "left", children }: { align?: "left" | "right"; children: React.ReactNode }) {
  return <td className={`px-3 py-2 align-top tabular-nums ${align === "right" ? "text-right" : "text-left"}`}>{children}</td>;
}

function StatRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-slate-500">{label}</span>
      <span className="font-medium text-slate-100">{value}</span>
    </div>
  );
}

function SideBadge({ side }: { side: string }) {
  const cls = side === "long" || side === "buy"
    ? "border-emerald-400/40 bg-emerald-400/10 text-emerald-200"
    : "border-rose-400/40 bg-rose-400/10 text-rose-200";
  return <span className={`border px-2 py-0.5 text-xs ${cls}`}>{side}</span>;
}

function OrderStatusBadge({ status }: { status: string }) {
  const cls = status === "open"
    ? "border-cyan-400/40 bg-cyan-400/10 text-cyan-200"
    : "border-yellow-400/40 bg-yellow-400/10 text-yellow-100";
  return <span className={`border px-2 py-0.5 text-xs ${cls}`}>{status === "open" ? "挂单中" : "部分成交"}</span>;
}

function formatTime(value?: number | null) {
  if (!value) return "-";
  return new Date(value).toLocaleString();
}

function formatUsd(value?: number) {
  if (value === undefined || value === null || Number.isNaN(value)) return "-";
  return Intl.NumberFormat("en-US", { currency: "USD", maximumFractionDigits: 2, minimumFractionDigits: 2, style: "currency" }).format(value);
}

function formatPrice(value?: number) {
  if (value === undefined || Number.isNaN(value)) return "-";
  return value.toFixed(2);
}

function formatCount(value?: number) {
  if (value === undefined || Number.isNaN(value)) return "-";
  return value.toLocaleString("en-US", { maximumFractionDigits: 4 });
}
