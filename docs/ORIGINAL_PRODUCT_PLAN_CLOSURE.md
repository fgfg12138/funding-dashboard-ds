# Original Product Plan Closure

> **Recovery R4 — 原始计划最终收口**
> **Status: ✅ 闭回收官 — 所有 0–10 步 100% 完成**
> **完整性评分：11/11 ✅**

---

## 1. 原始 0–10 步完成情况

| 步骤 | 目标 | 状态 | 完成阶段 |
|------|------|------|---------|
| 第 0 步 | 项目读取和现状分析 | ✅ completed | 初始 |
| 第 1 步 | `docs/ROADMAP.md` | ✅ completed | 初始 |
| 第 2 步 | `/execution` 页面 | ✅ completed | Phase 2 |
| 第 3 步 | `lib/execution/` types、store、engine | ✅ completed | Phase 2 |
| 第 4 步 | 净收益计算（PnL） | ✅ completed | Phase 2 / Phase 4 |
| 第 5 步 | 模拟开仓/平仓/历史记录 | ✅ completed | Phase 2 / Phase 4 |
| 第 6 步 | `/api-keys` 安全占位页面 | ✅ completed | Phase 3 |
| **第 7 步** | **策略模板系统** | ✅ **Recovery R2** | 新增 Template 分类/字段/Clone/Badge |
| **第 8 步** | **风险中心 `/risk-center`** | ✅ **Recovery R1** | 新增风险 Dashboard |
| 第 9 步 | `/` 产品级首页 | ✅ completed | 初始 |
| 第 10 步 | `docs/LIVE_TRADING_ARCHITECTURE.md` | ✅ completed | Phase 3 |

---

## 2. 当前核心产品能力

| 能力 | 说明 | 对应模块 |
|------|------|---------|
| **同交易所套利机会** | 资金费率套利机会发现和评分 | `/opportunities`, `lib/opportunity/` |
| **跨交易所资金费率差** | 跨交易所基差和资金费率差 | `/basis`, `lib/basis/` |
| **净收益估算** | 年化收益、PnL 计算 | `lib/execution/portfolio.ts`, `lib/simulation/` |
| **Paper Trading** | 模拟下单和持仓管理 | `/execution`, `lib/execution/` |
| **Strategy Templates** | 策略模板 — 不下单、不执行交易 | `/strategies`, `lib/strategies/` |
| **Risk Center** | 风控概览 Dashboard | `/risk-center` |
| **Product Homepage** | 项目入口和导航 | `/` |
| **Live Trading Architecture** | 实盘交易架构设计文档 | `docs/LIVE_TRADING_ARCHITECTURE.md` |

---

## 3. 当前明确不包含

| 能力 | 状态 | 证据 |
|------|------|------|
| 实盘交易 | ❌ 不包含 | 无 `submitLiveOrder` / `placeLiveOrder` |
| 主网交易 | ❌ 不包含 | 无 mainnet adapter、middleware 拦截 |
| Secret 解密 | ❌ 不包含 | 无 `decryptSecret` in 运行代码 |
| 签名 | ❌ 不包含 | 无 `createHmac` / `crypto.subtle.sign` |
| 自动下单 | ❌ 不包含 | 所有 `/api/testnet` route 返回 403 |
| Exchange SDK | ❌ 不包含 | 无 binance/okx/bybit/ccxt import |

---

## 4. Phase 6/Testnet 是支线，不是产品主线

| 主线（产品） | 支线（Testnet） |
|-------------|----------------|
| 套利机会发现 | Secret Vault Design |
| 净收益估算 | Permission Verification Design |
| Paper Trading | Signing Architecture Design |
| 策略模板 | Persistent Audit Design |
| 风险中心 | Rollback Plan Design |
| 实盘架构设计 | **Blocked: NO-GO, readyAfterPlan=false** |

> **Phase 6 当前仍为 NO-GO，不应阻塞产品主线开发。**

---

## 5. 下一阶段建议（回到套利核心能力）

| 优先级 | 建议 | 说明 |
|--------|------|------|
| 1️⃣ | **Portfolio Dashboard** | 统一的持仓和收益概览页面 |
| 2️⃣ | **Position Manager** | 管理 Paper Trading 持仓 |
| 3️⃣ | **Opportunity Ranking** | 机会排序和筛选增强 |
| 4️⃣ | **Capital Allocation** | 资金分配策略 |
| 5️⃣ | **Paper Trading Analytics** | 模拟交易统计和回测分析 |
| ❌ | 不继续 Phase 6.x | 当前 NO-GO |

---

## 6. Clone Route 安全确认

`POST /api/strategies/[id]/clone` 的安全性：

| 检查项 | 状态 | 说明 |
|--------|------|------|
| 是否涉及交易 | ❌ 否 | 只复制策略配置 JSON |
| 是否涉及 testnet | ❌ 否 | 无 testnet 调用 |
| 是否涉及 Secret | ❌ 否 | 无 Secret 读取或解密 |
| 是否涉及 exchange | ❌ 否 | 无 exchange API 调用 |
| 是否修改 middleware | ❌ 否 | clone route 使用原有策略路由 |
| 是否需要在 middleware allowlist | ❌ 否 | `/api/strategies` 已在 allowlist |

```typescript
// cloneStrategy 的行为：
// 1. 从已有策略复制所有字段
// 2. 名称追加 " (Clone)"
// 3. 重置为 draft 状态
// 4. 保存到本地 JSON 文件
// 不涉及任何网络请求、Secret、交易、testnet
```

---

## 7. 测试验证

```bash
npx vitest run
# ✅ 108/108 test files, 2468+ tests — all passed

npx next build
# ✅ Build succeeded
```
