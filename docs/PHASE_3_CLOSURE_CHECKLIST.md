# Phase 3 Closure Checklist — API Key Management & Mock Account Infrastructure

> **阶段命名：** API Key Management & Mock Account Infrastructure
> **状态：✅ 已完成（Phase 3.1 – 3.7）**
> **当前项目：** Phase 2 (Paper Trading) + Phase 3 (API Key Mgmt Infrastructure)
> **下一阶段：** Phase 4 — 半自动交易（用户逐笔确认）

---

## 1. Phase 3 已完成模块清单

| 子阶段 | 模块 | 文件 | 测试数 |
|--------|------|------|--------|
| 3.1 | API Key 管理占位页面 | `app/api-keys/page.tsx` | — |
| 3.2 | AES-256-GCM 加密模块 | `lib/apiKeys/crypto.ts` | 11 |
| 3.2 | localStorage 加密存储 | `lib/apiKeys/apiKeyStore.ts` | 7 |
| 3.3 | Mock 权限检测器 | `lib/apiKeys/permissionVerifier.ts` | 12 |
| 3.4 | PrivateAccountAdapter 接口 + Mock | `lib/exchangeAdapters/` | 10 |
| 3.5 | 账户同步中心 Mock 页面 | `app/account-sync/page.tsx` | 4 |
| 3.6 | Mock Account Risk 接入 Risk Gate | `lib/risk/accountRiskContext.ts` | 12 + 7 |
| 3.7 | Phase 3 收口验收 + 边界测试 | `tests/phase3Boundary.test.ts` | 见文档 |

---

## 2. 当前允许能力

### ✅ 允许
- 读取 Binance / OKX / Bybit **公开行情**（Phase 1 遗留）
- 计算并展示**三类套利机会**（跨所费率差 / 现货+永续 / Basis）
- **Paper Trading 模拟执行**：开仓/平仓仅存 localStorage，不下真实订单
- **Opportunity Scoring**：评分 0-100 + Grade + RiskLevel
- **Risk Gate**：7 项 Paper 风控 + 3 项 Mock 账户风控
- **Strategy Template**：3 个模板影响模拟参数
- **API Key UI 占位**：展示交易所连接入口、安全要求，按钮始终 disabled
- **AES-256-GCM 加密**：纯函数加密解密，用于存储（未开放 UI）
- **Mock 权限检测**：离线模拟权限检查，所有结果包含 `mock-verification-only`
- **Mock PrivateAccountAdapter**：返回固定 dummy 数据，`source: "mock"`
- **Mock 账户同步页面**：展示模拟资产/持仓/挂单/Funding
- **Mock 账户风控**：Risk Gate 接入 Mock 快照做账户级检查

### ❌ 当前禁止
- ✗ **不保存 API Secret** — 无 UI 输入，不解密，不传输
- ✗ **不连接交易所私有接口** — PrivateAccountAdapter 仅 mock 实现
- ✗ **不下真实订单** — 无 `placeOrder` / `createOrder` / `marketOrder` 等函数
- ✗ **不开放真实权限检测** — `permissionVerifier` 是离线 mock
- ✗ **不给 middleware 增加交易类白名单** — 白名单仅限本地配置端点
- ✗ **不把 Mock 数据标成真实资产** — 所有 mock 数据标注 `source: "mock"`

---

## 3. 边界定义

### 3.1 No-Secret 边界

| 检查项 | 状态 | 说明 |
|--------|------|------|
| 明文 Secret 是否保存在 localStorage？ | ❌ 否 | 加密后才能存储 |
| 明文 Secret 是否出现在 console.log？ | ❌ 否 | `crypto.ts` 无 console.log |
| 明文 Secret 是否出现在前端 bundle？ | ❌ 否 | 仅通过加密函数处理 |
| UI 是否接受 Secret 输入？ | ❌ 否 | 所有按钮 disabled |
| 解密函数能否被前端直接调用？ | ✅ 是 | `decryptSecret()` 存在但需 CryptoKey |

### 3.2 No-Private-API 边界

| 检查项 | 状态 | 说明 |
|--------|------|------|
| 是否有 `fetch()` 到交易所私有端点？ | ❌ 否 | 全部是公开 REST API |
| PrivateAccountAdapter 是否发起网络请求？ | ❌ 否 | 仅 mock 实现 |
| 是否有 API Key 认证的 HTTP 请求？ | ❌ 否 | 无 `Authorization` header |
| 是否有 `binancePrivateAdapter.ts` 等文件？ | ❌ 否 | 不存在 |
| 是否有 `/api/keys` 等 POST API？ | ❌ 否 | 不存在 |

### 3.3 No-Live-Trading 边界

| 检查项 | 状态 | 说明 |
|--------|------|------|
| 是否存在 `placeOrder()` 函数？ | ❌ 否 | 搜索无结果 |
| 是否存在 `createOrder()` 函数？ | ❌ 否 | 搜索无结果 |
| 是否存在 `marketOrder()` 函数？ | ❌ 否 | 搜索无结果 |
| 是否存在 TradingAdapter 实现？ | ❌ 否 | 仅 `PrivateAccountAdapter` |
| middleware 是否拦截非 GET 请求？ | ✅ 是 | 6 条白名单 |
| middleware 白名单是否包含交易类路径？ | ❌ 否 | 只有本地配置端点 |

### 3.4 Mock-Only 账户数据说明

| 检查项 | 状态 | 说明 |
|--------|------|------|
| `/account-sync` 数据来源 | Mock | `source: "mock"` |
| `/execution` 账户风控来源 | Mock | `buildAccountRiskContext()` 来自 Mock 快照 |
| Mock 数据能否设置真实资金 | ❌ 否 | 硬编码 dummy 值 |
| 页面是否标注 Mock | ✅ 是 | 黄色横幅标注 |

---

## 4. 已知遗留问题

| 问题 | 说明 | 归属 |
|------|------|------|
| Mock 数据不够多样 | 所有交易所返回相似数据 | 可改进 |
| 无 API Key 权限真实检测 | 需要交易所 API 查询权限端点数 | Phase 3.7+ |
| 无真实账户同步 | 需要 PrivateAccountAdapter 真实实现 | Phase 3.7+ |
| PermissionVerifier 是离线 Mock | 不能代替真实交易所权限检查 | Phase 3.7+ |

---

## 5. 进入 Phase 4 的前置条件

### ✅ 必须满足
- [x] Phase 2 Paper Trading 闭环完成
- [x] Opportunity Scoring + Risk Gate + Strategy Template 集成
- [x] LIVE_TRADING_ARCHITECTURE.md 完成
- [x] Phase 3 API Key UI 占位（无 Secret 输入）
- [x] Phase 3 加密存储基础层（AES-256-GCM）
- [x] Phase 3 Mock 权限检测器
- [x] Phase 3 PrivateAccountAdapter 接口 + Mock
- [x] Phase 3 Mock Account Sync 页面
- [x] Phase 3 Mock Account Risk 接入 Risk Gate
- [x] Phase 3 验收文档（本文档）

### ⏳ Phase 4 本身的前置条件（进入后完成）
- [ ] 订单预览 UI 组件
- [ ] 用户确认弹窗组件
- [ ] Order Preview + User Confirmation 流程
- [ ] 半自动交易只读文档更新
- [ ] 安全审查

---

## 6. Phase 4 边界说明

> **Phase 4 是半自动交易（用户逐笔确认），不是全自动交易。**
> 全自动交易是 Phase 5。

### Phase 4 允许
- 系统根据信号生成交易建议（Order Preview）
- 用户必须在 UI 上手动确认后，系统才发送到交易所
- 订单执行状态实时反馈
- 风控规则自动拦截超阈值订单

### Phase 4 不允许
- ✗ 自动执行（无用户确认不下单）
- ✗ 策略自动开平仓
- ✗ 批量/高频交易
- ✗ 无风控门槛的订单
- ✗ 无审计日志的执行

---

## 7. 总结

```
Phase 3 已完成 7 个子阶段：
  3.1 API Key UI 占位          ✅
  3.2 加密存储基础层            ✅
  3.3 Mock 权限检测器           ✅
  3.4 PrivateAccountAdapter     ✅
  3.5 Mock Account Sync 页面    ✅
  3.6 Mock Account Risk 接入    ✅
  3.7 收口验收 + 边界测试       ✅

Phase 3 验收结论：
  ┌─────────────────────────────────────────────┐
  │  项目仍保持 read-only / paper-only /        │
  │  mock-only / no-secret / no-private-api /   │
  │  no-live-trading 边界。                     │
  │                                             │
  │  可以进入 Phase 4 半自动交易设计。           │
  └─────────────────────────────────────────────┘
```
