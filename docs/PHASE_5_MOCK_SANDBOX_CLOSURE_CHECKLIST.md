# Phase 5 Mock Sandbox Closure Checklist

> **阶段命名：** Mock Sandbox Infrastructure (Adapter → Lifecycle → Safety Gate → UI)
> **状态：** ✅ 已完成（Phase 5.0 – 5.5）
> **当前项目仍无真实 testnet 网络请求、无真实下单能力**
> **下一阶段：** Phase 5.6 — Real Testnet Adapter Design（需代码审查通过）

---

## 1. Phase 5 已完成模块清单

| 子阶段 | 模块 | 文件 | 测试数 |
|--------|------|------|--------|
| 5.0 | Live Adapter Design 文档 | `docs/LIVE_ADAPTER_DESIGN.md`, `docs/SANDBOX_TESTNET_PLAN.md` | — |
| 5.0 | TradingAdapter 类型接口 | `lib/liveAdapters/tradingAdapterTypes.ts` | — |
| 5.1 | Mock Sandbox TradingAdapter | `lib/liveAdapters/mockSandboxTradingAdapter.ts` | 10 |
| 5.2 | Sandbox Order Lifecycle Store | `lib/liveAdapters/sandboxOrderLifecycleStore.ts` | 10 |
| 5.3 | Sandbox Lifecycle 页面 | `app/sandbox-lifecycle/page.tsx` | — |
| 5.4 | Sandbox Safety Gate | `lib/liveAdapters/sandboxSafetyGate.ts` | 13 |
| 5.5 | 收口验收 + 边界测试 | `tests/phase5MockSandboxBoundary.test.ts` | 见文档 |

---

## 2. Mock Sandbox 链路

```
Local Queue (queued-preview-only)
  │
  ▼
Sandbox Safety Gate (10 项检查) ← Phase 5.4
  │
  ▼
Mock Sandbox TradingAdapter ← Phase 5.1
  │
  ▼
Sandbox Order Lifecycle Store ← Phase 5.2
  │  sandbox-ready → submitted → filled / cancelled / failed
  ▼
Audit Log + Local Notification ← Phase 4.3 + 4.6
  │
  ▼
Sandbox Lifecycle 页面 ← Phase 5.3
```

**所有步骤均为本地 Mock 操作，不发送任何网络请求。**

---

## 3. 当前允许能力

### ✅ 允许
- **TradingAdapter 接口设计** — 完整的类型定义
- **Mock Sandbox Adapter** — 实现接口但不发网络请求，`source: "mock-sandbox"`
- **Sandbox Lifecycle Store** — 记录 mock 订单生命周期状态流转
- **Sandbox Safety Gate** — 10 项安全检查，确保安全后才能创建 lifecycle
- **Sandbox Lifecycle 页面** — 查看 mock 生命周期记录
- **Phase 5 边界测试** — 确保仍无真实网络请求、无 mainnet、无 fetch/SDK

### ❌ 当前禁止
- ✗ **不连接真实 testnet** — 无任何 fetch/axios/SDK 调用
- ✗ **不连接主网** — `ALLOW_MAINNET_TRADING=false`，无 mainnet 适配器文件
- ✗ **不解密 API Secret** — 无 Secret 输入、解密或传输
- ✗ **不下真实订单** — 无 `placeOrder` / `createOrder` / `submitLiveOrder`
- ✗ **不修改 executionQueueTypes** — sandbox 状态与 queue 状态严格隔离
- ✗ **不修改 middleware 白名单** — 白名单不包含交易类路径

---

## 4. 边界定义

### 4.1 No-Real-Testnet 边界

| 检查项 | 方法 | 状态 |
|--------|------|------|
| liveAdapters 是否包含 `fetch()` 运行代码？ | `grep -r "fetch(" lib/liveAdapters/ --include="*.ts" \| grep -v ".test."` | ❌ 无 |
| liveAdapters 是否包含 `axios`？ | `grep -r "axios" lib/liveAdapters/ --include="*.ts"` | ❌ 无 |
| liveAdapters 是否包含 `import` SDK？ | `grep -r "from.*(binance|okx|bybit)" lib/liveAdapters/` | ❌ 无 |
| mockSandboxTradingAdapter source 是否为 "mock-sandbox"？ | 静态检查 | ✅ 是 |
| Safety Gate 默认 environment 是否 safe？ | exchangeEnv=disabled, both flags=false | ✅ 是 |

### 4.2 No-Mainnet 边界

| 检查项 | 状态 |
|--------|------|
| lib/ 是否包含 `mainnet` 文件？ | ❌ 无 |
| allowMainnetTrading 默认值是否为 false？ | ✅ 是 |
| Safety Gate 是否拦截 allowMainnetTrading=true？ | ✅ 是 |

### 4.3 No-Secret-Decryption 边界

| 检查项 | 状态 |
|--------|------|
| liveAdapters 是否读取 API Key？ | ❌ 无 |
| liveAdapters 是否调用 `decryptSecret`？ | ❌ 无 |
| liveAdapters 是否调用 `importMasterKey`？ | ❌ 无 |

### 4.4 Queue / Lifecycle 状态隔离

| 类型 | 状态集合 | 文件 |
|------|---------|------|
| ExecutionQueueItem.status | `queued-preview-only` / `cancelled` / `expired` | `lib/orders/executionQueueTypes.ts` |
| TradingOrderSandboxStatus | `sandbox-ready` / `sandbox-submitted` / `sandbox-filled` / `sandbox-cancelled` / `sandbox-partial` / `sandbox-failed` | `lib/liveAdapters/tradingAdapterTypes.ts` |

**两个状态集合严格隔离，不互通。**

---

## 5. 已知限制

| 限制 | 说明 | 归属 |
|------|------|------|
| Mock Sandbox Adapter 不返回真实撮合结果 | 仅适用固定 mock 数据 | Phase 5.6+ |
| Safety Gate 使用默认 safe 环境 | exchangeEnv 未从 env var 读取 | Phase 5.6 |
| 无 server-side Secret 解密 | 所有操作在客户端 | Phase 5.6+ |
| 无真实 testnet API 兼容性验证 | 未连接任何测试网 | Phase 5.6 |
| 无交易所限频/Rate Limit 测试 | 未验证实际 API 限频 | Phase 5.6+ |

---

## 6. 进入真实 Testnet 的前置条件

### ⚠ 必须满足

- [x] 5.0 Live Adapter Design 文档完成
- [x] 5.1 Mock TradingAdapter 接口验证
- [x] 5.2 Sandbox Lifecycle Store 完成
- [x] 5.3 Sandbox Lifecycle 页面完成
- [x] 5.4 Sandbox Safety Gate 完成
- [x] 5.5 收口验收 + 边界测试

### ⏳ 进入真实 testnet 前必须完成

- [ ] **独立 testnet 环境变量** — `EXCHANGE_ENV=sandbox` 从 env 读取
- [ ] **单交易所 testnet adapter** — 例如 `binanceTestnetAdapter.ts`
- [ ] **Server-side Secret handling** — API Key 不留在前端
- [ ] **API Key 权限真实检测** — 调用交易所权限端点
- [ ] **IP 白名单验证** — 测试网 IP 限制
- [ ] **Testnet-only middleware route** — 仅 testnet 路径允许 POST
- [ ] **Fail-safe Kill Switch** — 自动触发条件
- [ ] **Testnet rollback plan** — 回滚和恢复方案
- [ ] **代码审查通过** — 至少一次 peer review

### ⚠ 真实 testnet 不能直接接主网

```
┌─────────────┐     ┌──────────────┐     ┌────────────┐
│  Mock       │     │  Real Testnet│     │  Mainnet   │
│  (Phase 5)  │ ──→ │  (Phase 5.6) │ ──→ │  (Phase 6) │
└─────────────┘     └──────────────┘     └────────────┘
                          │                     │
                    必须经过:              必须经过:
                    - 独立代码审查          - 全部 testnet 验证
                    - Safety Gate 验证      - 安全审查
                    - 环境变量隔离          - 合规审查
                    - IP 白名单验证         - 至少 7 天 testnet 运行
```

---

## 7. 总结

```
Phase 5 Mock Sandbox 已完成 6 个子阶段：
  5.0 Live Adapter Design 文档     ✅
  5.1 Mock Sandbox TradingAdapter  ✅
  5.2 Sandbox Order Lifecycle Store ✅
  5.3 Sandbox Lifecycle 页面       ✅
  5.4 Sandbox Safety Gate          ✅
  5.5 收口验收 + 边界测试          ✅

验收结论：
  ┌──────────────────────────────────────────────┐
  │  Mock Sandbox 链路完整：                       │
  │  Queue → Safety Gate → Mock Adapter →         │
  │  Lifecycle Store → Audit → UI.                │
  │                                               │
  │  项目仍保持 no-real-testnet / no-mainnet /    │
  │  no-secret-decryption / no-live-trading 边界.  │
  │                                               │
  │  可以进入代码审查阶段。                        │
  │  审查通过后才能进入 Phase 5.6 真实 testnet.    │
  └──────────────────────────────────────────────┘
```
