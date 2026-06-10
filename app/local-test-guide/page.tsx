"use client";

import { PageShell } from "@/components/PageShell";

export default function LocalTestGuidePage() {
  return (
    <PageShell
      activeHref="/local-test-guide"
      title="本地测试指南"
      description="面向测试者：系统状态说明、页面导航指引、安全注意事项"
    >
      {/* ═══ 当前状态 ═══ */}
      <section className="border border-slate-800 bg-slate-950/60">
        <div className="border-b border-slate-800 px-4 py-2">
          <h2 className="text-sm font-semibold text-white">系统概述</h2>
        </div>
        <div className="space-y-2 p-4 text-sm text-slate-300">
          <p>本系统是一个 <strong className="text-cyan-300">只读资金费率套利看板 + 已通过生产验证的 Binance 单交易所微额交易框架</strong>。</p>
          <p className="mt-2">当前状态：</p>
          <ul className="ml-4 mt-1 list-disc space-y-1 text-slate-400">
            <li>📊 公开行情数据 — 实时可读</li>
            <li>🔬 Binance 主网已通过 $6 微额 Filled-Order 验证</li>
            <li>⚠️ <strong className="text-yellow-200">当前不会自动交易</strong> — 所有执行按钮默认禁用</li>
            <li>🔒 Kill Switch 默认启用 — 阻断所有非允许操作</li>
            <li>🛡️ API Key/Secret 不在 UI 或日志中显示</li>
          </ul>
        </div>
      </section>

      {/* ═══ 已验证内容 ═══ */}
      <section className="border border-slate-800 bg-slate-950/60">
        <div className="border-b border-slate-800 px-4 py-2">
          <h2 className="text-sm font-semibold text-emerald-200">✅ 已完成验证</h2>
        </div>
        <div className="grid gap-2 p-4 sm:grid-cols-2">
          {[
            ["Testnet Connectivity", "Binance 测试网连接与订单生命周期"],
            ["24h Shadow Run", "24 小时主网只读数据持续采集"],
            ["7-Day Stability Run", "7 天主网数据稳定性验证"],
            ["Mainnet ReadOnly Shadow", "主网只读管道验证"],
            ["Mainnet Filled-Order", "$6 SOLUSDT 真实 LIMIT 开平仓成交"],
            ["Position Lifecycle", "仓位从开到关的完整追踪"],
            ["Funding Validation", "Funding/Income 数据归因验证"],
            ["Post-Trade Audit", "交易后完整审计（一致性、孤儿检查）"],
            ["Production Readiness", "10 场景故障恢复验证"],
            ["Multi-Exchange Foundation", "Binance/Bybit/OKX/Bitget/Gate/Hyperliquid 抽象层"],
          ].map(([title, desc]) => (
            <div key={title} className="border border-emerald-800/40 bg-emerald-950/20 px-3 py-2">
              <p className="text-xs font-semibold text-emerald-200">{title}</p>
              <p className="mt-0.5 text-xs text-slate-400">{desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* ═══ 未开放内容 ═══ */}
      <section className="border border-slate-800 bg-slate-950/60">
        <div className="border-b border-slate-800 px-4 py-2">
          <h2 className="text-sm font-semibold text-amber-200">⛔ 未开放 / 不可用</h2>
        </div>
        <div className="grid gap-2 p-4 sm:grid-cols-2">
          {[
            ["自动实盘", "所有执行按钮默认禁用，不会自动下单"],
            ["Bybit/OKX/Gate 等真实交易", "仅 Exchange Foundation 层，无真实 API"],
            ["多交易所套利执行", "基金费率引擎尚未构建"],
            ["策略自动触发", "策略管理仅为展示，不触发订单"],
            ["自动放大资金", "maxPositionUsd ≤ $6 硬限制"],
            ["后台无人交易", "所有操作需手动确认"],
            ["API Key 管理", "仅 API 管理页面可配置，不读取 Key"],
            ["MARKET 订单", "系统强制 LIMIT GTC 订单"],
          ].map(([title, desc]) => (
            <div key={title} className="border border-amber-800/30 bg-amber-950/10 px-3 py-2">
              <p className="text-xs font-semibold text-amber-200">{title}</p>
              <p className="mt-0.5 text-xs text-slate-500">{desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* ═══ 页面阅读指南 ═══ */}
      <section className="border border-slate-800 bg-slate-950/60">
        <div className="border-b border-slate-800 px-4 py-2">
          <h2 className="text-sm font-semibold text-white">📖 页面阅读指南</h2>
        </div>
        <div className="space-y-4 p-4 text-sm">
          <div>
            <h3 className="font-semibold text-cyan-200">机会总览（/opportunities）</h3>
            <ul className="ml-4 mt-1 list-disc space-y-1 text-slate-400">
              <li>展示所有交易所的资金费率与基差机会</li>
              <li><strong className="text-slate-200">评分</strong> = 综合机会评分（0-100）</li>
              <li><strong className="text-slate-200">交易所列</strong> = 显示交易所名称 + 验证层级（✅ 主网验证 / Foundation）</li>
              <li><strong className="text-slate-200">覆盖交易所</strong> = 该机会涉及的交易所数量</li>
              <li>仅展示公开行情数据，不下单</li>
            </ul>
          </div>
          <div>
            <h3 className="font-semibold text-cyan-200">生产控制台（/production-console）</h3>
            <ul className="ml-4 mt-1 list-disc space-y-1 text-slate-400">
              <li>系统状态面板 = 环境、API、Futures、Kill Switch 摘要</li>
              <li>交易所验证状态 = 各交易所验证层级</li>
              <li>审计状态 = 已完成的生产验证步骤</li>
              <li>测试者检查清单 = 确认基本安全项</li>
            </ul>
          </div>
          <div>
            <h3 className="font-semibold text-cyan-200">系统顶部 Banner</h3>
            <ul className="ml-4 mt-1 list-disc space-y-1 text-slate-400">
              <li>显示当前 commit、API Key 状态、DryRun/Live 模式、Kill Switch 状态</li>
              <li>始终显示「只读 / 不交易」</li>
            </ul>
          </div>
        </div>
      </section>

      {/* ═══ 截图反馈指引 ═══ */}
      <section className="border border-slate-800 bg-slate-950/60">
        <div className="border-b border-slate-800 px-4 py-2">
          <h2 className="text-sm font-semibold text-white">📸 反馈指引</h2>
        </div>
        <div className="space-y-2 p-4 text-sm text-slate-300">
          <p>以下情况请截图反馈：</p>
          <ul className="ml-4 mt-1 list-disc space-y-1 text-slate-400">
            <li>页面加载失败或白屏</li>
            <li>数据显示异常（负分、NaN、infinity）</li>
            <li>交易所列显示错误</li>
            <li>系统 Banner 显示预期之外的状态</li>
            <li>任何按钮在未满足条件时可用（应立即禁用）</li>
            <li>出现 API Key/Secret 在页面中</li>
          </ul>
          <p className="mt-3 text-xs text-slate-500">截图时建议包含浏览器地址栏，便于定位页面。</p>
        </div>
      </section>

      {/* ═══ 安全边界 ═══ */}
      <section className="border border-slate-800 border-amber-800/50 bg-slate-950/60">
        <div className="border-b border-amber-800/30 px-4 py-2">
          <h2 className="text-sm font-semibold text-amber-200">⚠️ 安全边界 — 这些按钮不能碰</h2>
        </div>
        <div className="space-y-2 p-4 text-sm">
          <div className="border border-red-800/30 bg-red-950/10 px-3 py-2">
            <p className="font-semibold text-red-200">以下操作不会触发真实交易（安全门已锁定），但请勿随意点击执行类按钮：</p>
            <ul className="ml-4 mt-1 list-disc space-y-1 text-slate-400">
              <li><strong>API 管理页面</strong> — 显示 disabled API 输入框，不可编辑</li>
              <li><strong>策略管理</strong> — 仅展示与模拟，不触发订单</li>
              <li><strong>执行中心</strong> — 只读展示，无触发按钮</li>
              <li><strong>生产控制台 → Tiny Trade</strong> — 需要手动确认字符串，否则禁用</li>
            </ul>
          </div>
          <p className="mt-2 text-xs text-cyan-300">✅ 所有执行路径均经过：Risk Engine → Kill Switch → TinyTradeGuard 三重验证。</p>
        </div>
      </section>

      {/* ═══ 反馈模板 ═══ */}
      <section className="border border-slate-800 bg-slate-950/60">
        <div className="border-b border-slate-800 px-4 py-2">
          <h2 className="text-sm font-semibold text-white">📝 反馈模板（供参考）</h2>
        </div>
        <div className="p-4 text-sm">
          <pre className="overflow-x-auto border border-slate-800 bg-slate-950 px-4 py-3 text-xs text-slate-400">
{`## 反馈

**页面**: /opportunities
**类型**: 显示异常 / 功能缺失 / UI 问题 / 安全问题
**严重程度**: 低 / 中 / 高 / 严重
**描述**: 
（请描述你看到的问题）

**截图**: □ 已截图
**浏览器**: Chrome / Edge / Safari
**时间**: ${new Date().toISOString().slice(0, 10)}`}
          </pre>
        </div>
      </section>
    </PageShell>
  );
}
