# Live Adapter Design — TradingAdapter 实盘适配器设计

> **阶段：** Phase 5.0 — Design Only
> **状态：** 架构设计文档，不包含任何实盘下单实现
> **当前项目仍无实盘交易能力**

---

## 目录

1. [Adapter 分层架构](#1-adapter-分层架构)
2. [TradingAdapter Interface](#2-tradingadapter-interface)
3. [支持交易所](#3-支持交易所)
4. [下单前置条件](#4-下单前置条件)
5. [订单生命周期](#5-订单生命周期)
6. [为什么 live adapter 必须独立于 mock adapter](#6-为什么-live-adapter-必须独立于-mock-adapter)
7. [已有 Adapter 回顾](#7-已有-adapter-回顾)

---

## 1. Adapter 分层架构

```
ExchangeAdapter (概念层)
├── PublicMarketDataAdapter  ← Phase 1 已实现（无 Key 需求）
│   ├── binanceAdapter.ts
│   ├── okxAdapter.ts
│   └── bybitAdapter.ts
│
├── PrivateAccountAdapter   ← Phase 3 已设计（需 Read-Only Key）
│   ├── mockPrivateAccountAdapter.ts（Phase 3 Mock）
│   └── [future] binancePrivateAdapter.ts（Phase 3.7+）
│
└── TradingAdapter          ← Phase 5 设计（需 Trading Key）
    ├── tradingAdapterTypes.ts（Phase 5.0 类型定义 ✅）
    ├── [future] binanceTradingAdapter.ts（Phase 5.2+）
    ├── [future] okxTradingAdapter.ts（Phase 5.2+）
    └── [future] bybitTradingAdapter.ts（Phase 5.2+）
```

### 分层原因

| 层 | 所需权限 | 当前状态 | 依赖 |
|---|---------|---------|------|
| PublicMarketDataAdapter | 无需 Key | ✅ Phase 1 完成 | 无 |
| PrivateAccountAdapter | Read-Only Key | ✅ Phase 3 接口 + Mock | 无 |
| TradingAdapter | Trading Key | 🔒 Phase 5 设计阶段 | Sandbox 环境可用 |

---

## 2. TradingAdapter Interface

> **⚠ 以下为 interface 类型设计，不包含任何实现。**

### TradingOrderRequest

```typescript
type TradingOrderRequest = {
  exchangeId: ExchangeName;
  symbol: string;
  marketType: "spot" | "perp";
  intent: "open" | "close" | "reduce";
  side: "buy" | "sell" | "long" | "short";
  orderType: "market" | "limit";
  quantity: number;
  price?: number;        // required for limit orders
  notionalUsd?: number;  // for market orders with notional
  reduceOnly: boolean;
  clientOrderId: string;
  // Reference to the preview/confirmation chain
  previewId?: string;
  confirmationId?: string;
  queueItemId?: string;
};
```

### TradingOrderResult

```typescript
type TradingOrderResult = {
  exchangeId: ExchangeName;
  orderId: string;
  clientOrderId: string;
  symbol: string;
  side: string;
  orderType: string;
  price: number;
  quantity: number;
  filledQuantity: number;
  status: "sandbox-submitted" | "sandbox-filled" | "sandbox-cancelled" | "sandbox-failed" | "sandbox-partial";
  fee?: number;
  filledPrice?: number;
  submittedAt: number;
  filledAt?: number;
  errorMessage?: string;
};
```

### TradingAdapter Interface

```typescript
interface TradingAdapter {
  readonly exchangeId: ExchangeName;
  readonly mode: TradingAdapterMode; // "design-only"

  /** Validate that sandbox/testnet environment is properly configured. */
  validateEnvironment(): Promise<EnvironmentValidationResult>;

  /** Validate API Key permissions for trading. */
  validatePermissions(): Promise<PermissionValidationResult>;

  /** Build an order request from preview/confirmation data. */
  buildSandboxOrderRequest(preview: OrderPreview, confirmation: ConfirmationRecord): TradingOrderRequest;

  /** Submit an order to the sandbox/testnet exchange. */
  submitSandboxOrder(request: TradingOrderRequest): Promise<TradingOrderResult>;

  /** Cancel a sandbox order. */
  cancelSandboxOrder(orderId: string): Promise<boolean>;

  /** Get the current status of a sandbox order. */
  getSandboxOrderStatus(orderId: string): Promise<TradingOrderResult>;
}
```

### 设计原则

1. **所有方法返回 Promise** — 异步适配器模式
2. **所有方法名含 Sandbox** — 默认仅沙盒模式
3. **无 Live/Production 提交方法** — Live 提交是 Phase 5.3+ 的独立扩展
4. **validateEnvironment / validatePermissions** — 下订单前必须检查
5. **buildSandboxOrderRequest** — 将内部模型转为交易所请求格式

---

## 3. 支持交易所

| 交易所 | Sandbox/Testnet | 文档 | 注意 |
|--------|----------------|------|------|
| **Binance** | [Binance Testnet](https://testnet.binancefuture.com/) | [API Docs](https://binance-docs.github.io/apidocs/) | 独立的 Testnet API Key，与主网隔离 |
| **OKX** | [OKX Demo Trading](https://www.okx.com/docs-v5/#trading-account-rest-api-get-real-time-account) | [API Docs](https://www.okx.com/docs-v5/) | Demo Trading 模式，需独立 API Key |
| **Bybit** | [Bybit Testnet](https://testnet.bybit.com/) | [API Docs](https://bybit-exchange.github.io/docs/) | 独立的 Testnet 账户和 API Key |

### 测试网特点

| 特性 | Binance Testnet | OKX Demo | Bybit Testnet |
|------|----------------|----------|---------------|
| 是否需要独立注册 | ✅ 是 | ✅ 是 | ✅ 是 |
| 是否有虚拟资金 | ✅ 是（自动充值） | ✅ 是 | ✅ 是（需手动申请） |
| 是否模拟真实撮合 | ✅ 是 | ✅ 是 | ✅ 是 |
| 是否影响主网 | ❌ 不影响 | ❌ 不影响 | ❌ 不影响 |
| API 是否与主网一致 | ✅ 大部分一致 | ✅ 大部分一致 | ✅ 大部分一致 |

---

## 4. 下单前置条件

在 `submitSandboxOrder()` 被调用前，必须通过以下所有检查：

```
┌──────────────────────────────────────────┐
│              下单前置条件                  │
├──────────────────────────────────────────┤
│ 1. API Key 已验证 (permissionVerifier)   │
│ 2. 提币权限已关闭 (withdraw disabled)    │
│ 3. Kill Switch 已关闭                    │
│ 4. Risk Gate 通过 (allowed=true)         │
│ 5. User Confirmation 已创建              │
│ 6. Order Preview 已生成                  │
│ 7. Queue 项目未过期                      │
│ 8. Sandbox 模式已启用                     │
│ 9. 环境变量验证: LIVE_TRADING_ENABLED    │
│    = false, EXCHANGE_ENV=sandbox         │
│ 10. 账户余额检查（future Phase 5.2+）     │
└──────────────────────────────────────────┘
```

**关键规则**：所有条件不满足时，系统必须拒绝提交并给出明确错误信息。

---

## 5. 订单生命周期

```
preview (Phase 4.1)
  │
  ▼
confirmed (Phase 4.2)
  │
  ▼
queued-preview-only (Phase 4.4)
  │
  ▼  ← 以下状态为 Future Design，当前不加入 executionQueueTypes
  │
  ├── sandbox-ready        ← 已满足所有前置条件，可提交
  ├── sandbox-submitted    ← 已发送至交易所沙盒
  ├── sandbox-filled       ← 沙盒订单已成交
  ├── sandbox-cancelled    ← 沙盒订单已取消
  ├── sandbox-partial      ← 沙盒订单部分成交
  └── sandbox-failed       ← 沙盒订单失败
```

### ⚠ 重要限制

> **以上 `sandbox-*` 状态当前仅为设计文档中的概念。**
> **不允许将 `sandbox-submitted` / `sandbox-filled` 等状态加入 `executionQueueTypes.ts`。**
> **这些状态将在 Phase 5.2+ 实现 TradingAdapter 时才引入。**

---

## 8. Phase 5.1 — Mock Sandbox Contract

### 文件
`lib/liveAdapters/mockSandboxTradingAdapter.ts`

### 行为

| 方法 | 行为 |
|------|------|
| `validateEnvironment()` | 返回 `{ valid: true, environment: "sandbox" }` + Mock 警告 |
| `validatePermissions()` | 返回 `{ valid: true, canTrade: true, canWithdraw: false }` + Mock 警告 |
| `buildSandboxOrderRequest(preview, confirmation)` | 从 Preview legs 构造 TradingOrderRequest |
| `submitSandboxOrder(request)` | 返回 `source: "mock-sandbox"`, `status: "sandbox-submitted"` |
| `cancelSandboxOrder(orderId)` | 返回 `true` |
| `getSandboxOrderStatus(orderId)` | 返回 `source: "mock-sandbox"`, `status: "sandbox-filled"` |

### 限制
- 不发送任何网络请求
- 不需要 API Key
- 不解密 Secret
- 所有结果标记 `source: "mock-sandbox"`
- 10 个单元测试

### Phase 5.2 — Sandbox Order Lifecycle Store（✅ 已完成）

> 新增 localStorage 生命周期存储模块，记录 TradingOrderRequest → TradingOrderResult 的完整状态流转。
> 详见 `lib/liveAdapters/sandboxOrderLifecycleStore.ts`。

#### 行为
- `createSandboxLifecycleRecord(input)` → `sandbox-ready`
- `appendSandboxOrderResult(recordId, result)` → 更新 `currentStatus`
- `markSandboxCancelled(recordId, reason)` → `sandbox-cancelled`
- `markSandboxFailed(recordId, reason)` → `sandbox-failed`
- 所有记录 `source: "mock-sandbox"`

#### /execution-queue 集成
- 每行 `queued-preview-only` 项目显示「Mock 沙盒」按钮
- 点击后自动创建 lifecycle record + 提交 mock order
- 生成 audit event + local notification
- 页面明确标注「不是真实提交」

### Phase 5.3 — Sandbox Lifecycle 页面（✅ 已完成）

> 新增 `/sandbox-lifecycle` 页面，展示所有 Mock Sandbox 生命周期记录。
> 详见 `app/sandbox-lifecycle/page.tsx`。

#### 功能
- 统计卡片和状态筛选
- 表格展示生命周期字段：状态、来源、时间戳、结果历史数量
- 操作：标记取消、标记失败、清空记录
- 所有操作写入 audit event + local notification

### Phase 5.4 — Sandbox Safety Gate（✅ 已完成）

> 新增纯函数安全检查门禁，在创建 Mock Sandbox Lifecycle 前执行 10 项检查。
> 详见 `lib/liveAdapters/sandboxSafetyGate.ts`。

#### 检查项
1. Kill Switch 关闭
2. 队列状态 = queued-preview-only
3. 队列未过期
4. Confirmation 存在
5. Preview submittable
6. RiskGate 通过
7. Source = local
8. exchangeEnv = disabled
9. liveTradingEnabled = false
10. allowMainnetTrading = false

### Phase 5.5 — Mock Sandbox Closure（✅ 已完成）

> 新增验收文档和 17 项边界测试。确认 Mock Sandbox 链路完整，仍无真实网络请求。
> 详见 [PHASE_5_MOCK_SANDBOX_CLOSURE_CHECKLIST.md](./PHASE_5_MOCK_SANDBOX_CLOSURE_CHECKLIST.md)。

### 下一步
Phase 5.6 将设计真实 Testnet Adapter，但需要先通过代码审查。

---

## 9. 已有 Adapter 回顾

| 状态 | 说明 |
|------|------|
| `queued-preview-only` | 已确认预览，等待处理 |
| `cancelled` | 用户取消 |
| `expired` | 超过 24h 自动过期 |

---

## 6. 为什么 live adapter 必须独立于 mock adapter

| 原因 | 说明 |
|------|------|
| **权限隔离** | Mock 不需要 Key，Live 需要 Trading Key |
| **编译隔离** | Live adapter 代码可以条件编译，确保未启用时无下单代码 |
| **测试隔离** | Mock 用于单元测试，Live 需要集成测试和沙盒 |
| **降级策略** | Live 异常时可降级为只读模式，不影响 Mock 功能 |
| **审计跟踪** | Live 适配器的所有操作必须记录审计日志 |
| **安全审查** | Live 适配器代码需要额外的安全审查流程 |

### 文件隔离策略

```
lib/
├── exchangeAdapters/          ← Phase 1-3 (已有)
│   ├── mockPrivateAccountAdapter.ts  ← Mock 实现
│   └── privateAccountAdapter.ts      ← 工厂函数
├── liveAdapters/              ← Phase 5 (新增)
│   ├── tradingAdapterTypes.ts        ← 仅类型定义
│   ├── [future] binanceTradingAdapter.ts  ← Phase 5.2+
│   ├── [future] sandboxValidator.ts       ← Phase 5.2+
│   └── [future] tradingAdapterFactory.ts   ← Phase 5.2+
```

---

## 7. 已有 Adapter 回顾

| 适配器 | 文件 | 类型 | 状态 |
|--------|------|------|------|
| Public — Binance | `lib/exchanges/binanceAdapter.ts` | 公开行情 | ✅ 已实现 |
| Public — OKX | `lib/exchanges/okxAdapter.ts` | 公开行情 | ✅ 已实现 |
| Public — Bybit | `lib/exchanges/bybitAdapter.ts` | 公开行情 | ✅ 已实现 |
| Private — Mock | `lib/exchangeAdapters/mockPrivateAccountAdapter.ts` | Mock 私有数据 | ✅ 已实现 |
| Private — Interface | `lib/exchangeAdapters/privateAccountTypes.ts` | 接口定义 | ✅ 已设计 |
| **Trading — Interface** | **`lib/liveAdapters/tradingAdapterTypes.ts`** | **接口定义** | **✅ Phase 5.0** |
| **Trading — Mock Sandbox** | **`lib/liveAdapters/mockSandboxTradingAdapter.ts`** | **Mock 沙盒** | **✅ Phase 5.1** |
| **Trading — Implementation** | *待实现* | 实盘适配器 | **🔒 Phase 5.2+** |
