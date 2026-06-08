# Live Trading Architecture

## 实盘交易架构设计文档

> **⚠ 免责声明**：本文档为架构设计参考，不包含任何实盘交易代码实现。
> 当前项目处于 **Phase 2 (Paper Trading)**，不保存 API Key，不连接交易所私有接口，不发送真实订单。
> 以下内容定义了未来 Phase 3/4/5 的架构目标和安全边界。

---

## 目录

1. [当前状态说明](#1-当前状态说明)
2. [Phase 3：API Key 管理（默认只读）](#2-phase-3api-key-管理默认只读)
3. [Phase 4：半自动交易](#3-phase-4半自动交易)
4. [Phase 5：实盘自动交易](#4-phase-5实盘自动交易)
5. [交易所适配器设计](#5-交易所适配器设计)
6. [API Key 安全设计](#6-api-key-安全设计)
7. [下单前检查流程](#7-下单前检查流程)
8. [仓位同步流程](#8-仓位同步流程)
9. [审计日志设计](#9-审计日志设计)
10. [为什么不能直接从 Paper Trading 改成 Live Trading](#10-为什么不能直接从-paper-trading-改成-live-trading)

---

## 1. 当前状态说明

### 已实现（Phase 1 + Phase 2）

| 模块 | 状态 | 说明 |
|------|------|------|
| 公开行情读取 | ✅ | Binance / OKX / Bybit 公开 REST API |
| 套利机会计算 | ✅ | 跨所费率差 / 现货+永续 / Basis |
| 统一机会看板 | ✅ | 筛选、排序、评分、风险标签 |
| 历史快照 | ✅ | 本地 JSONL 存储 |
| 研究模块 | ✅ | Alpha / 因子 / 热力图 / 验证 |
| 通知引擎 | ✅ | 仅 in-app 日志 |
| 模拟回测 | ✅ | 虚拟账户 + 模拟开平仓引擎 |
| Paper Trading | ✅ | 执行中心 + PaperExecution 模型 |
| 净收益估算 | ✅ | 三类套利的收益计算 |
| Paper Portfolio | ✅ | 模拟资产统计 |
| Opportunity Scoring | ✅ | 0-100 评分 + Grade + RiskLevel |
| Risk Gate | ✅ | 7 项风控检查 |
| Strategy Templates | ✅ | 3 个默认模板 + 启用/停用 |

### 未实现（Phase 3+）

| 模块 | 状态 | 说明 |
|------|------|------|
| API Key 存储 | ❌ | 未设计、未实现 |
| 交易所私有接口 | ❌ | 未连接 |
| 实盘下单 | ❌ | 代码路径不存在 |
| 自动执行 | ❌ | 代码路径不存在 |
| 半自动执行 | ❌ | 代码路径不存在 |
| 审计日志系统 | ❌ | 未设计 |
| 仓位同步 | ❌ | 未设计 |

---

## 2. Phase 3：API Key 管理（默认只读）

### Phase 3.1 — API Key UI 占位（已完成）

> 当前先新增 `/api-keys` 占位页面，用于展示未来交易所连接入口、安全边界和权限要求。
> **在 Phase 3.2 之前，不保存任何 API Secret，不连接任何交易所私有接口。**

#### 占位边界
- `/api-keys` 页面中所有表单按钮处于 disabled 状态
- 页面文案明确标注「占位页面 — 不可用」
- 不接收、不保存、不传输任何 API Key 或 Secret
- 不发起任何需要认证的 HTTP 请求
- 页面仅展示 UI 布局和安全要求说明

### Phase 3.2 — API Key 加密存储基础层（已完成）

> AES-256-GCM 加密模块和 localStorage 加密存储已就绪。
> 详见 `lib/apiKeys/crypto.ts` 和 `lib/apiKeys/apiKeyStore.ts`。
> **UI 仍未开放输入** — 表单按钮保持 disabled，等待 Phase 3.3 权限检测。

#### 已实现
- `lib/apiKeys/types.ts` — 完整的 Key 记录类型定义
- `lib/apiKeys/crypto.ts` — AES-256-GCM 加密/解密、密钥导入、API Key 掩码
- `lib/apiKeys/apiKeyStore.ts` — localStorage 加密存储，仅保存 masked key + 加密密文
- 18 个单元测试
- SSR 安全（try/catch 模式，无 `typeof window` 依赖）

#### 未实现
- ✗ UI 输入表单（保持在 Phase 3.1 占位状态）
- ✗ 交易所权限检测网络请求
- ✗ 任何下单功能

### Phase 3.3 — Mock 权限检测验证器（已完成）

> 新增离线 Mock 权限检测模块，模拟交易所 API Key 权限检查流程。
> 当前仍不连接交易所，不保存 API Secret。

#### 已实现
- `lib/apiKeys/permissionVerifier.ts` — `verifyApiKeyPermissions()` 纯函数
- 规则：read → 必须 / withdraw → 拒绝 / trade → 警告 / IP 白名单 → 建议
- 所有结果包含 `mock-verification-only` 标记
- 12 个单元测试
- /api-keys 页面新增 Mock 检测器状态展示

#### 未实现
- ✗ 真实的交易所网络请求
- ✗ 实际权限检测（Phase 3.4 实现）
- ✗ UI 输入表单（保持在 Phase 3.1 占位状态）

> **⚠ Mock 结果不能作为真实交易安全依据。** 真实权限检测需要 Phase 3.5 连接交易所 API 权限查询端点。

### Phase 3.4 — Mock 只读账户适配器接口（已完成）

> 新增 PrivateAccountAdapter 接口和 Mock 实现，为未来 Phase 3.5+ 账户同步做准备。
> 当前仍不连接交易所，不解密 API Secret。

#### 已实现
- `lib/exchangeAdapters/privateAccountTypes.ts` — AccountAsset / AccountPosition / AccountOpenOrder / AccountFundingPayment / PrivateAccountSnapshot
- `lib/exchangeAdapters/privateAccountAdapter.ts` — `createPrivateAccountAdapter(exchangeId, mode)` 工厂函数
- `lib/exchangeAdapters/mockPrivateAccountAdapter.ts` — Mock 实现，返回固定 dummy 数据
- 所有数据标记 `source: "mock"`，明确不可用于真实交易
- 10 个单元测试

#### 未实现
- ✗ 真实交易所私有接口连接
- ✗ API Secret 解密
- ✗ 任何下单功能
- ✗ UI 展示真实资产（Phase 3.5+ 实现）

### Phase 3.5 — 账户同步中心 Mock 页面（已完成）

> 新增 `/account-sync` 页面，使用 Mock PrivateAccountAdapter 展示模拟账户数据。
> 当前仍不连接交易所，不解密 API Secret。

#### 已实现
- `/account-sync` 页面 — 5 个区域：状态卡片、交易所卡片、资产表、持仓表、挂单表、Funding 表
- `lib/exchangeAdapters/accountSnapshotSummary.ts` — 多交易所聚合汇总
- 导航栏「账户同步」入口
- 页面明确标注「全部为 Mock 数据」

#### 未实现
- ✗ 真实交易所私有接口连接
- ✗ API Secret 解密
- ✗ 真实账户数据展示
- ✗ 任何下单功能

### Phase 3.6 — Mock 账户数据接入 Paper 风控（已完成）

> Risk Gate 扩展，接入 Mock PrivateAccountSnapshot 用于账户级风控检查。
> 当前仍不连接交易所，不解密 API Secret。

#### 已实现
- `lib/risk/accountRiskContext.ts` — buildAccountRiskContext + 6 个计算纯函数
- RiskGateConfig 新增 4 个字段：maxAccountExposurePercent / maxSymbolAccountExposurePercent / minAvailableUsdBalance / includeAccountSnapshotRisk
- RiskGate 新增 3 个检查：总敞口比、单币敞口比、可用余额
- /execution 页面加载 Mock 快照并传入 Risk Gate
- 19 个相关测试

#### 未实现
- ✗ 真实账户数据接入
- ✗ API Secret 解密
- ✗ 任何下单功能

### Phase 3.7 — Phase 3 收口验收与边界测试（已完成）

> 新增验收文档和边界测试项目，确保项目保持 read-only / paper-only / mock-only / no-secret / no-private-api / no-live-trading 边界。
> 详见 [PHASE_3_CLOSURE_CHECKLIST.md](./PHASE_3_CLOSURE_CHECKLIST.md)。

#### 已实现
- `docs/PHASE_3_CLOSURE_CHECKLIST.md` — 完整验收文档（已实现能力 / 禁止能力 / 边界定义 / Phase 4 前置条件）
- `tests/phase3Boundary.test.ts` — 13 项边界测试
  - 无 placeOrder/createOrder/marketOrder 函数
  - 无 TradingAdapter 实盘实现
  - middleware 拦截非 GET 请求 + 白名单不交易
  - API Key 页面按钮 disabled
  - Mock adapter source = "mock"
  - permissionVerifier 标记 mock-verification-only
  - withdraw 仅出现在类型定义中
  - 无 POST /api/keys 端点

### Phase 4 — 半自动交易（用户逐笔确认）（✅ 已完成）

> **Phase 4 已完成 — 8 个子阶段（4.1 – 4.8）。详见 [PHASE_4_CLOSURE_CHECKLIST.md](./PHASE_4_CLOSURE_CHECKLIST.md)。**
> **Phase 4 确认项目仍无 submitOrder / placeOrder / live trading adapter 实现。**
> **下一阶段是 Phase 5 实盘自动交易设计，但必须先完成 Live Adapter Design + Sandbox/Testnet。**

### API Key 加密存储方案

```
用户输入 Key (前端表单)
  │
  ▼
前端加密（可选，防浏览器缓存泄露）
  │
  ▼
POST /api/keys → 服务端接收
  │
  ▼
服务端加密 (AES-256-GCM + 应用密钥)
  │
  ▼
加密密文存入服务端数据库或文件 (.data/encrypted-keys.json)
  │
  ▼
内存中仅保留解密后的 Key (定时刷新)
```

### 禁止提币权限检查

连接 Key 后的启动流程：

```
1. 加载加密 Key
2. 解密
3. 用 Key 查询交易所 API 权限信息
   - Binance: GET /sapi/v1/account/apiRestrictions → ipRestrict, enableWithdrawals, enableMargin, enableSpotAndMarginTrading
   - OKX: 检查 API Key 标签或权限集
   - Bybit: 检查 API Key 信息
4. 如果 enableWithdrawals == true → 拒绝此 Key
5. 如果交易权限开放 → 拒绝此 Key
6. 只有读取权限 → 通过
7. 通过后将 Key 缓存
```

### 只读权限优先

- 所有 Key 操作按「最低权限原则」设计
- 系统启动时校验 Key 权限集
- 权限不满足的 Key 标记为 `invalid` 并告警
- 不允许降级（如果 Key 有交易权限，不允许选择「只使用读取部分」）

### 私有账户数据读取范围

| 数据类型 | 接口 | 用途 |
|---------|------|------|
| 账户余额 | 交易所资产接口 | 验证可用资金 |
| 当前持仓 | 持仓列表接口 | 仓位同步 |
| 未实现盈亏 | 持仓详情接口 | P&L 计算 |
| 历史委托 | 订单历史接口 | 审计对账 |
| 成交记录 | 成交历史接口 | 审计对账 |

### 不允许下单

- Phase 3 没有下单代码路径
- POST /orders 不存在
- 所有交易按钮保持 disabled
- UI 中显示「只读模式 — 不交易」

---

## 3. Phase 4：半自动交易

### 目标

系统根据套利信号生成交易建议，用户在 UI 上逐笔确认后，系统才向交易所发送订单。
**不允许无人值守自动执行。**

### 交易流程

```
机会出现
  │
  ▼
Step 1: Opportunity Scoring（引擎计算评分）
  │
  ▼
Step 2: Return Estimate（测算净收益）
  │
  ▼
Step 3: Risk Gate（风控 7 项检查）
  │
  ▼
Step 4: Strategy Template（检查策略匹配）
  │
  ▼
Step 5: Account Balance Check（账户余额是否充足）
  │
  ▼
Step 6: Position Exposure Check（避免重复开仓）
  │
  ▼
Step 7: User Confirmation（用户确认）
  │
  ▼
Step 8: Order Preview（订单预览 + 二次确认）
  │
  ▼
Step 9: Final Submit → 发送至交易所
  │
  ▼
Step 10: 订单状态轮询 → 成交 / 失败 → 更新本地记录
```

### 二次确认机制

- **第一次**：UI 弹窗显示「确认执行此套利机会？」
- 显示：机会详情、预估年化、风控结果、最大损失估算
- **第二次**：订单预览弹窗
- 显示：买卖方向、数量、价格、交易所、手续费预估
- 用户必须勾选「我已确认风险和参数」后才能提交

### 风控检查附加条件

在 Risk Gate 基础上，Phase 4 增加：

| 检查项 | 条件 |
|--------|------|
| 账户可用余额 | 余额充足 |
| 交易所最大杠杆 | 不超过设定值 |
| 单笔最大损失 | 不超过 $X |
| 日报文限额 | 不超过日交易量上限 |
| 交易所状态 | 非维护中 |

### 失败回滚与告警

- 订单失败 → 本地记录失败状态
- 部分成交 → 标记部分成交，等待后续处理
- 全失败 → 显示失败原因，提供「重试」按钮
- 告警：失败后通知用户

---

## 4. Phase 5：实盘自动交易

### 目标

策略可设置为自动执行模式，系统自动监控信号、自动开平仓。
**必须有 Kill Switch、仓位限制、亏损限制、审计日志。**

### 完整 Risk Gate

确保每一笔自动交易都通过以下检查：

```
┌─────────────────────────────┐
│   Risk Gate (Phase 2 已有)  │  ← score / riskLevel / netRate / 敞口
├─────────────────────────────┤
│   + 账户余额检查             │  ← 余额 >= 名义本金 × 保证金率
├─────────────────────────────┤
│   + 最大亏损限制             │  ← 日亏损 / 周亏损上限
├─────────────────────────────┤
│   + 最大回撤限制             │  ← 当前回撤 % 超出则暂停
├─────────────────────────────┤
│   + 交易所健康度             │  ← API 响应正常 / 非维护
├─────────────────────────────┤
│   + 限频检查                 │  ← 每秒 / 每分钟最大订单数
├─────────────────────────────┤
│   + Kill Switch 状态         │  ← 用户未关闭开关
└─────────────────────────────┘
```

### Kill Switch

| 功能 | 说明 |
|------|------|
| 一键暂停 | 所有自动交易立即停止 |
| 紧急平仓 | 关闭所有持仓（仅限紧急情况） |
| 恢复条件 | 用户手动恢复 |
| 过期自动暂停 | 连续运行超过 24h 自动暂停 |

### 最大仓位限制

| 限制类型 | 默认值 | 说明 |
|---------|--------|------|
| 最大开仓数 | 10 | 同一时间最多开仓数 |
| 最大总敞口 | $200K | 所有仓位名义本金总和上限 |
| 单币种最大敞口 | $50K | 同一币种所有仓位总和上限 |
| 交易所最大敞口 | $100K | 同一交易所所有仓位总和上限 |
| 最大杠杆 | 3x | 不使用高杠杆 |

### 最大亏损限制

| 限制类型 | 默认值 | 说明 |
|---------|--------|------|
| 日最大亏损 | $1K | 日亏损超过后自动暂停 |
| 周最大亏损 | $3K | 周亏损超过后自动暂停 |
| 最大回撤 | 15% | 账户回撤超过后自动暂停 |
| 单笔最大亏损 | $200 | 单笔交易亏损超过后停止该币种 |

### 审计日志

```
每条记录包含：
  - timestamp
  - userId (将来扩展)
  - strategyId
  - opportunityId
  - 风控结果 (passed / blocked)
  - 用户确认 (confirmed / auto)
  - 订单ID (交易所返回)
  - 订单状态 (submitted / filled / cancelled / failed)
  - 成交数量 / 价格
  - 手续费
```

### 异常熔断

| 条件 | 行为 |
|------|------|
| 连续 3 笔订单失败 | 暂停该交易所交易 30 分钟 |
| API 连续 5 次超时 | 降级为只读模式 |
| 交易所返回错误码 >= 5 次 | 暂停该交易所交易 1 小时 |
| 策略连续亏损 3 笔 | 暂停该策略 |

---

## 5. 交易所适配器设计

### 为什么要把 public / private / trading 分开

```
ExchangeAdapter (接口)
├── PublicMarketDataAdapter    ← Phase 1 已实现 (只读公开行情)
├── PrivateAccountAdapter      ← Phase 3 需要实现 (只读私有数据)
└── TradingAdapter             ← Phase 4/5 需要实现 (下单)
```

**分离原因：**

| 原因 | 说明 |
|------|------|
| **权限分离** | Public 不需要 Key，Private 只需要读取权限，Trading 需要交易权限 |
| **测试隔离** | Public 可以用真实数据测试，Private 需要 mock Key，Trading 需要沙盒环境 |
| **编译隔离** | Trading 代码可以编译时排除，确保未到达 Phase 4/5 时无下单代码 |
| **安全审计** | 只有 TradingAdapter 能发订单，审计时可聚焦 |
| **降级策略** | 如果 Trading 异常，系统可降级为 Private-only 或 Public-only |

### ExchangeAdapter 接口

```ts
// 基础接口 — 所有适配器实现
interface ExchangeAdapter {
  readonly exchange: ExchangeName;
  readonly health: () => Promise<ExchangeHealth>;
}

// 公开行情 — 无需 Key
interface PublicMarketDataAdapter extends ExchangeAdapter {
  fetchFundingMarkets(): Promise<FundingMarket[]>;
  fetchSpotMarkets(): Promise<SpotMarket[]>;
}

// 私有数据 — 需要 Read-Only Key
interface PrivateAccountAdapter extends ExchangeAdapter {
  fetchBalances(): Promise<Balance[]>;
  fetchPositions(): Promise<Position[]>;
  fetchOpenOrders(): Promise<Order[]>;
  fetchOrderHistory(since: number): Promise<Order[]>;
  fetchTradeHistory(since: number): Promise<Trade[]>;
}

// 交易接口 — 需要 Trading Key
interface TradingAdapter extends ExchangeAdapter {
  placeOrder(input: PlaceOrderInput): Promise<OrderResult>;
  cancelOrder(orderId: string): Promise<boolean>;
  amendOrder(orderId: string, input: AmendOrderInput): Promise<OrderResult>;
}
```

### 实现策略

- **PublicMarketDataAdapter** → Phase 1 现有 `binanceAdapter.ts` / `bybitAdapter.ts` / `okxAdapter.ts`
- **PrivateAccountAdapter** → Phase 3 新增 `binancePrivateAdapter.ts` / 等
- **TradingAdapter** → Phase 4/5 新增 `binanceTradingAdapter.ts` / 等

**关键规则**：TradingAdapter 在 Phase 4 之前**不导入、不编译、不存在于包中**。

---

## 6. API Key 安全设计

### 加密

| 层 | 方案 |
|---|------|
| 传输加密 | HTTPS |
| 存储加密 | AES-256-GCM，应用密钥从环境变量读取 |
| 内存保护 | 使用后主动清除，避免日志泄露 |
| 前端暂存 | 仅存在于 React state，不入 localStorage |

### 环境隔离

| 环境 | API Key 策略 |
|------|-------------|
| 本地开发 | 使用测试网 Key 或无 Key |
| 测试环境 | 使用测试网 Key，无资金 |
| 生产环境 | 严格 Key 管理，仅主网只读 Key |

### 禁止日志打印 Secret

```ts
// ❌ 错误
console.log("API Key:", apiKey);

// ✅ 正确
console.log("API Key configured:", maskKey(apiKey));

function maskKey(key: string): string {
  if (key.length < 8) return "****";
  return key.slice(0, 4) + "****" + key.slice(-4);
}
```

### 禁止前端直接持有 Secret

- API Key 必须经过后端中转
- 前端仅持有临时的会话 token（如果需要）
- Secret 不出现在前端 JavaScript bundle 中
- 所有交易所请求由后端发起

### 禁止提币权限

- 系统启动时检查 Key 权限
- 拒绝任何 enableWithdrawals = true 的 Key
- 拒绝任何交易权限开放的 Key
- 拒绝未知权限集的 Key

### Key Rotation

- 建议用户每 90 天轮换一次 Key
- 系统在 Key 过期前 7 天发出通知
- 支持同时配置新旧 Key 的过渡期（双 Key 模式）

### 用户删除 Key

- 提供「立即删除 Key」功能
- 删除时清除所有缓存中的 Key 密文
- 删除后系统降级为 Public-only 模式

---

## 7. 下单前检查流程

### 完整检查链

```
机会出现
  │
  ├─ 1. Opportunity Scoring ───────────── 评分 >= minScore
  │
  ├─ 2. Return Estimate ───────────────── 净年化 >= minAnnualizedNetRate
  │
  ├─ 3. Strategy Template ─────────────── 模板已启用 + 类型匹配
  │
  ├─ 4. Risk Gate ─────────────────────── score/riskLevel/敞口/标签
  │
  ├─ 5. Account Balance Check ─────────── 可用余额 >= 所需保证金
  │
  ├─ 6. Position Exposure Check ───────── 无重复仓 + 不超过单币敞口
  │
  ├─ 7. [Phase 4] User Confirmation ───── 用户逐笔确认
  │     ├── 显示风险提示
  │     └── 用户勾选「已确认」
  │
  ├─ 8. Order Preview ─────────────────── 预览买卖/数量/价格/费用
  │
  ├─ 9. Final Submit ──────────────────── 发送至交易所
  │
  └─ 10. Result Handling ──────────────── 成功 / 部分成交 / 失败
```

### 检查流程图

```
                     ┌──────────┐
                     │ 机会出现  │
                     └────┬─────┘
                          │
                    ┌─────▼──────┐
                    │ Scoring    │── no ──→ 丢弃
                    └─────┬──────┘
                          │ yes
                    ┌─────▼──────┐
                    │ Estimate   │── no ──→ 丢弃
                    └─────┬──────┘
                          │ yes
                    ┌─────▼──────┐
                    │ Risk Gate  │── blocked ──→ 记录+丢弃
                    └─────┬──────┘
                          │ passed
                    ┌─────▼──────────┐
                    │ Balance Check  │── insufficient ──→ 记录+丢弃
                    └─────┬──────────┘
                          │ ok
                    ┌─────▼──────────┐
                    │ Exposure Check │── over limit ──→ 记录+丢弃
                    └─────┬──────────┘
                          │ ok
                    ┌─────▼──────────────┐
                    │ [Phase 4] 用户确认  │
                    └─────┬──────────────┘
                          │ confirmed
                    ┌─────▼──────────────┐
                    │ 订单预览 + 二次确认  │
                    └─────┬──────────────┘
                          │ confirmed
                    ┌─────▼──────────┐
                    │ 发送至交易所    │
                    └─────┬──────────┘
                          │
                    ┌─────▼──────────┐
                    │ 轮询订单状态    │
                    └─────┬──────────┘
                          │
               ┌──────────┼──────────┐
               │          │          │
          ┌────▼───┐ ┌───▼────┐ ┌───▼────┐
          │ 成交   │ │ 部分   │ │ 失败   │
          └────┬───┘ └───┬────┘ └───┬────┘
               │         │          │
          ┌────▼───┐ ┌───▼────┐     │
          │ 更新   │ │ 更新   │     │
          │ 持仓   │ │ 等待   │     │
          └────────┘ └────────┘     │
                               ┌────▼────┐
                               │ 重试/告警│
                               └─────────┘
```

---

## 8. 仓位同步流程

### 同步模型

```
本地数据库                       交易所
┌──────────────┐            ┌──────────────┐
│ 本地订单记录  │  ←──────→  │ 交易所委托    │
│ 本地持仓     │  ←──────→  │ 交易所持仓    │
│ 本地成交记录  │  ←──────→  │ 交易所成交    │
│ 本地资金余额  │  ←──────→  │ 交易所余额    │
└──────────────┘            └──────────────┘
```

### 同步流程

```
定时同步 (每 30 秒)
  │
  ├─ 1. 获取交易所持仓列表
  │
  ├─ 2. 与本地持仓对比
  │     ├── 匹配 → 更新本地 P&L
  │     ├── 本地有/交易所无 → 标记为已平仓
  │     └── 本地无/交易所新 → 新增到本地
  │
  ├─ 3. 获取交易所未成交委托
  │     └── 与本地未成交订单对比
  │
  ├─ 4. 获取最近成交
  │     └── 补充本地成交记录
  │
  └─ 5. 更新本地余额
```

### 异常不一致处理

| 不一致情况 | 处理方式 |
|-----------|---------|
| 本地有持仓，交易所无 | 标记为「待确认」并告警 |
| 交易所持仓与本地不符 | 以交易所为准，记录差异日志 |
| 未成交订单在交易所已不存在 | 标记为 cancelled |
| 本地订单 ID 不存在 | 检查交易所历史 |

### Funding 收益同步

- 定期拉取交易所 funding 历史或通过监听 funding 事件
- 本地记录每次 funding 结算
- 用于计算真实 P&L

---

## 9. 审计日志设计

### 日志记录字段

```ts
type AuditLogEntry = {
  id: string;
  timestamp: number;

  // 执行主体
  userId?: string;             // 将来多用户时使用
  source: "manual" | "strategy" | "system";

  // 策略信息
  strategyId?: string;
  strategyName?: string;

  // 机会信息
  opportunityId: string;
  symbol: string;
  opportunityType: string;
  sideDescription: string;
  exchanges: string[];

  // 决策过程
  scoringResult: {
    score: number;
    grade: string;
    riskLevel: string;
  };
  estimateResult: {
    grossReturn: number;
    netReturn: number;
    annualizedNetRate: number;
  };
  riskGateResult: {
    allowed: boolean;
    severity: string;
    checks: Array<{ name: string; passed: boolean; message: string }>;
  };

  // 用户确认 (Phase 4)
  userConfirmed: boolean;
  userConfirmedAt?: number;

  // 订单执行
  orderId?: string;
  orderStatus: "submitted" | "filled" | "partially_filled" | "cancelled" | "failed";
  submittedAt?: number;
  filledAt?: number;
  filledPrice?: number;
  filledQuantity?: number;
  fee?: number;

  // 失败信息
  errorMessage?: string;
};
```

### 日志存储

- 本地 JSONL 文件（延续 `.data/history` 模式）
- 按日期分片：`audit-2026-01-01.jsonl`
- 保留 90 天
- 不包含 API Key 或其他敏感信息

### 日志查询

- 按时间范围
- 按币种
- 按策略
- 按执行结果（success / failed / blocked）

---

## 10. 为什么不能直接从 Paper Trading 改成 Live Trading

### 风险拆解

| 风险 | 说明 | 需要 Phase |
|------|------|-----------|
| **API Key 泄露** | 硬编码 / 日志泄露 / 前端暴露 Key | Phase 3 |
| **权限失控** | Key 有提币权限 / 交易权限未限制 | Phase 3 |
| **余额不足** | 未检查可用余额直接下单 | Phase 4 |
| **重复开仓** | Paper 和 Live 仓位混淆 | Phase 4 |
| **滑点失控** | 没有滑点估算就下单 | Phase 4 |
| **仓位不同步** | 本地和交易所持仓不一致 | Phase 4 |
| **风控绕行** | 没有 Risk Gate 直接发订单 | Phase 4 |
| **用户误操作** | 一键下单没有确认流程 | Phase 4 |
| **高频执行** | 策略循环过快消耗资金 | Phase 5 |
| **回撤失控** | 没有 Kill Switch 持续亏损 | Phase 5 |
| **法律合规** | 未审查自动交易合规性 | Phase 5 |

### 从 Paper Trading 到 Live Trading 的跳跃距离

```
Paper Trading ───────────────────────────────────────────────────┐
    │                                                             │
    │  缺少以下模块才能安全过渡到 Live Trading:                    │
    │                                                             │
    ├── API Key 加密存储 (Phase 3)                                │
    ├── 交易所权限校验 (Phase 3)                                  │
    ├── PrivateAccountAdapter (Phase 3)                           │
    ├── 余额检查 + 仓位同步 (Phase 4)                             │
    ├── 用户确认流程 (Phase 4)                                    │
    ├── 订单预览 + 二次确认 (Phase 4)                             │
    ├── 失败回滚 + 告警 (Phase 4)                                 │
    ├── 完整风控 + 杠杆限制 (Phase 4)                             │
    ├── Kill Switch (Phase 5)                                     │
    ├── 最大亏损限制 (Phase 5)                                    │
    ├── 异常熔断机制 (Phase 5)                                    │
    ├── 审计日志系统 (Phase 5)                                    │
    └── 法律合规审查 (Phase 5)                                    │
    │                                                             │
    ▼                                                             │
Live Trading ────────────────────────────────────────────────────┘

跳过任一模块的后果:
  - 无加密 → Key 泄露 → 账户被盗
  - 无权限校验 → Key 被滥用 → 资金损失
  - 无余额检查 → 下单失败 → 错过时机
  - 无仓位同步 → 重复开仓 → 超敞口
  - 无用户确认 → 误操作 → 不可挽回
  - 无 Kill Switch → 持续亏损 → 无法停止
  - 无审计日志 → 无法追责 → 合规风险
```

### 最小可行过渡条件

从 Paper Trading 安全过渡到 Live Trading 的最小前置条件：

1. ✅ Phase 2 闭环完成（已满足）
2. ✅ LIVE_TRADING_ARCHITECTURE.md 完成（本文档）
3. ❌ API Key 加密存储方案实现
4. ❌ 交易所权限校验实现
5. ❌ PrivateAccountAdapter 实现
6. ❌ 余额检查集成
7. ❌ 基础仓位同步
8. ❌ 用户确认 UI 流程

> **以上条件全部满足前，不允许向交易所发送任何真实订单。**

---

## 附录

### A. 术语定义

| 术语 | 说明 |
|------|------|
| Paper Trading | 模拟交易，不涉及真实资金 |
| Live Trading | 实盘交易，使用真实资金 |
| Kill Switch | 紧急停止开关 |
| Risk Gate | 风控门禁，检查交易是否允许 |
| Slack | 滑点，实际成交价与预期价的差异 |
| Notional | 名义本金，仓位价值 |
| Drawdown | 回撤，账户最高点到最低点的跌幅 |

### B. 参考文档

- [ROADMAP.md](./ROADMAP.md) — 项目长期路线图
- [V1_SCOPE.md](./V1_SCOPE.md) — 当前只读范围定义
- Binance API 文档: https://binance-docs.github.io/apidocs/
- OKX API 文档: https://www.okx.com/docs-v5/
- Bybit API 文档: https://bybit-exchange.github.io/docs/
