# Phase 4 Closure Checklist — 半自动交易链路

> **阶段命名：** Semi-Automated Trading (Preview → Confirm → Queue → Audit → Safety)
> **状态：✅ 已完成（Phase 4.1 – 4.8）**
> **当前项目：** Phase 2 (Paper Trading) + Phase 3 (API Key Mock Infrastructure) + Phase 4 (Semi-Automated Trading UI)
> **下一阶段：** Phase 5 — 实盘自动交易（需先完成 Live Adapter Design + Sandbox/Testnet）

---

## 1. Phase 4 已完成模块清单

| 子阶段 | 模块 | 文件 | 测试数 |
|--------|------|------|--------|
| 4.1 | Order Preview 预览层 | `lib/orders/orderPreviewTypes.ts`, `orderPreviewBuilder.ts` | 11 |
| 4.2 | User Confirmation 用户确认 | `lib/orders/orderConfirmationTypes.ts`, `orderConfirmationStore.ts` | 8 |
| 4.3 | Execution Audit 审计日志 | `lib/audit/auditTypes.ts`, `auditStore.ts` | 11 |
| 4.4 | Local Execution Queue 执行队列 | `lib/orders/executionQueueTypes.ts`, `executionQueueStore.ts` | 11 |
| 4.5 | Kill Switch / Safety Controls 安全控制 | `lib/safety/safetyTypes.ts`, `safetyStore.ts` | 8 |
| 4.6 | 本地通知中心 | `lib/notifications/localNotificationTypes.ts`, `localNotificationStore.ts` | 7 |
| 4.7 | Queue Recovery / Expiration 队列恢复 | `lib/orders/executionQueueRecovery.ts` | 12 |
| 4.8 | Phase 4 收口验收 + 边界测试 | `tests/phase4Boundary.test.ts` | 见文档 |

---

## 2. 半自动交易链路

```
Opportunity (机会出现)
  │
  ▼
Step 1: Opportunity Scoring (评分引擎)
  │  lib/opportunity/scoring.ts → score + grade + riskLevel
  ▼
Step 2: Return Estimate (收益估算)
  │  lib/execution/executionEngine.ts → annualizedNetRate
  ▼
Step 3: Risk Gate (风控检查)
  │  lib/risk/riskGate.ts → 7+3 项检查 → allowed / blocked
  ▼
Step 4: Order Preview (订单预览) ← Phase 4.1
  │  lib/orders/orderPreviewBuilder.ts → OrderPreview
  ▼
Step 5: User Confirmation (用户确认) ← Phase 4.2
  │  lib/orders/orderConfirmationStore.ts → ConfirmationRecord
  ▼
Step 6: Local Execution Queue (执行队列) ← Phase 4.4
  │  lib/orders/executionQueueStore.ts → Enqueue
  ▼
Step 7: Queue Recovery / Expiration (过期管理) ← Phase 4.7
  │  lib/orders/executionQueueRecovery.ts → 过期/恢复
  ▼
Step 8: Audit Log (审计日志) ← Phase 4.3
  │  lib/audit/auditStore.ts → 所有事件记录
  ▼
Step 9: Local Notification (本地通知) ← Phase 4.6
  │  lib/notifications/localNotificationStore.ts → 提醒
  ─────────────────────────────────────────────
  Safety: Kill Switch ← Phase 4.5
    lib/safety/safetyStore.ts → 全局开关，阻断 Step 4-6
```

**关键限制：** 所有步骤均为本地操作，不发送任何交易所请求。

---

## 3. 当前允许能力

### ✅ 允许
- **Order Preview** — 基于 scoring / estimate / riskGate 生成订单预览
- **User Confirmation** — 用户勾选风险确认和免责声明后记录确认
- **Local Execution Queue** — 已确认预览可加入本地队列
- **Queue Health / Expiration** — 检测到期、即将到期、可恢复项目
- **Execution Audit** — 7 种事件类型记录所有关键操作
- **Local Notification** — risk / confirmation / queue / safety 事件提醒
- **Kill Switch** — 全局安全开关，阻断预览/确认/入队操作
- **Safety Controls 页面** — 查看状态、开启/关闭、输入原因
- **Phase 4 边界测试** — 确保仍无真实下单、外部通知、交易 API

### ❌ 当前禁止
- ✗ **不真实下单** — 无 `submitOrder` / `placeOrder` / `createOrder` / `marketOrder` 实现
- ✗ **不连接交易所私有接口** — 无 PrivateAccountAdapter live 实现
- ✗ **不发送外部通知** — 无 Telegram / Email / Webhook
- ✗ **队列不自动执行** — 用户必须手动点击入队，入队后仍不执行
- ✗ **不新增 POST API** — middleware 白名单不变
- ✗ **Kill Switch 不撤真实订单** — 仅控制本地 preview/confirmation/queue

---

## 4. 边界定义

### 4.1 No-Live-Trading 边界

| 检查项 | 方法 | 状态 |
|--------|------|------|
| 项目运行代码是否包含 `submitOrder` 实现？ | `grep -r "submitOrder" lib/ app/ components/` | ❌ 无 |
| 项目运行代码是否包含 `placeOrder` 实现？ | `grep -r "placeOrder" lib/ app/ components/` | ❌ 无（仅在类型名中出现） |
| 项目运行代码是否包含 `createOrder` 作为函数实现？ | `grep -r "createOrder" lib/ app/ components/` | ❌ 无 |
| 项目运行代码是否包含 `marketOrder`？ | `grep -r "marketOrder" lib/ app/ components/` | ❌ 无 |
| 是否存在 TradingAdapter live 实现？ | `grep -r "TradingAdapter" lib/` | ❌ 仅 interface |
| Queue 状态是否包含 submitted / executed / filled？ | `grep -r "submitted\|executed\|filled" lib/orders/executionQueueTypes.ts` | ❌ 无 |

### 4.2 No-Private-API 边界

| 检查项 | 状态 |
|--------|------|
| exchangeAdapters 运行代码是否包含 `fetch(`？ | ❌ 无（mock 实现无网络请求） |
| exchangeAdapters 运行代码是否包含 `Authorization`？ | ❌ 无 |
| 是否存在 `binancePrivateAdapter.ts` / `okxPrivateAdapter.ts`？ | ❌ 无 |

### 4.3 No-External-Notification 边界

| 检查项 | 状态 |
|--------|------|
| localNotificationStore 是否包含 `fetch(`？ | ❌ 无 |
| localNotificationStore 是否包含 `telegram`？ | ❌ 无 |
| localNotificationStore 是否包含 `email`？ | ❌ 无 |
| localNotificationStore 是否包含 `webhook`？ | ❌ 无 |

### 4.4 Kill Switch 范围

| 功能 | Kill Switch 开启时 |
|------|-------------------|
| Order Preview 按钮 | ❌ 禁用 |
| Confirm 按钮 | ❌ 禁用 |
| 加入队列按钮 | ❌ 隐藏 |
| 查看/取消队列 | ✅ 正常 |
| 审计日志 | ✅ 正常 |
| 本地通知 | ✅ 正常 |
| 是否声称能撤真实订单 | ❌ 不可声称 |

---

## 5. 进入 Phase 5 的前置条件

### ✅ 必须满足（已满足）
- [x] Phase 2 Paper Trading 闭环
- [x] Phase 3 API Key Mock 基础设施
- [x] Phase 4 半自动交易链路（Preview → Confirm → Queue → Audit → Safety）
- [x] LIVE_TRADING_ARCHITECTURE.md 架构文档
- [x] Phase 4 边界测试通过
- [x] 项目仍无真实下单能力

### ⏳ 进入 Phase 5 前必须完成
- [ ] **Live Adapter Design** — 实盘交易所适配器设计文档
- [ ] **Sandbox/Testnet 环境** — 至少一个交易所的测试网 / 沙盒可用
- [ ] **Sandbox 安全边界文档** — 沙盒不允许访问主网
- [ ] **TradingAdapter 接口设计评审** — 下单/撤单/查询接口
- [ ] **Phase 5 安全审查** — Kill Switch + 最大亏损 + 回撤 + 熔断

---

## 6. Phase 5 边界说明

> **Phase 5 是实盘自动交易，但必须先经过 Live Adapter Design + Sandbox/Testnet 验证。**
> **Phase 5 不允许直接跳过适配器设计直接实现下单。**

### Phase 5 允许（最终目标）
- 策略自动监控信号
- 系统自动开平仓（经过完整风控）
- Kill Switch + 最大仓位 + 最大亏损 + 熔断
- 审计日志记录每一笔自动操作

### Phase 5 仍不允许
- ✗ 无风控的自动执行
- ✗ 无审计日志的交易
- ✗ 绕过 Kill Switch 的操作
- ✗ 主网直接交易（必须先通沙盒验证）

---

## 7. 总结

```
Phase 4 已完成 8 个子阶段：
  4.1 Order Preview         ✅
  4.2 User Confirmation     ✅
  4.3 Execution Audit       ✅
  4.4 Local Execution Queue ✅
  4.5 Kill Switch           ✅
  4.6 Local Notification    ✅
  4.7 Queue Recovery        ✅
  4.8 收口验收 + 边界测试   ✅

Phase 4 验收结论：
  ┌──────────────────────────────────────────────┐
  │  半自动交易链路完整（Opportunity → Preview → │
  │  Confirm → Queue → Audit → Safety）。          │
  │                                               │
  │  项目仍保持 no-live-trading / no-private-api  │
  │  / no-external-notification 边界。            │
  │                                               │
  │  可以进入 Phase 5 设计阶段——                     │
  │  必须先完成 Live Adapter Design + Sandbox。    │
  └──────────────────────────────────────────────┘
```
