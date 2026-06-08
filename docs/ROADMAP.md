# Roadmap — 资金费率套利平台长期路线图

本路线图定义了项目从只读看板逐步演进为全功能套利平台的阶段性计划。
**当前项目处于 Phase 4（半自动交易）已完成 — 下一阶段 Phase 5（实盘自动交易设计）。** 每个阶段都设置了明确的边界和前置条件，
不能跳过中间阶段直接进入自动交易。

---

## Phase 1 — 只读行情与套利机会发现（✅ Current）

> **状态：✅ 已发布 (V1)**
> **阶段命名：Read-Only Dashboard**

### 包含
- 读取 Binance / OKX / Bybit 公开行情（funding rate、mark price、index price、24h volume、open interest）
- 计算三类套利机会：跨交易所费率差、现货+永续、Basis
- 统一机会看板，支持筛选、排序、评分
- 历史快照本地 JSONL 存储
- Alpha 发现引擎、因子研究、热力图、机会验证等只读研究模块
- 通知引擎（仅 in-app 日志）
- 模拟回测引擎（虚拟账户，纯本地模拟）
- 策略配置 CRUD（仅配置，不执行）
- 风险规则配置 CRUD
- Mock ADL 监控
- **只读 Middleware 守卫**：拦截所有非 GET 请求，仅白名单内的本地配置端点例外

### 不包含
- ✗ 交易所 API Key 存储或连接
- ✗ 任何形式的实盘下单
- ✗ 自动或半自动执行
- ✗ 纸上交易 / 模拟执行（下一阶段）
- ✗ 真实账户数据读取

### 风险边界
- 所有数据来自公开 REST API，无认证、无私密信息
- 本地数据仅有历史快照和用户配置，无敏感金融信息
- Middleware 层在路由入口拦截修改请求，API 层不需要额外防护

---

## Phase 2 — 纸上交易 / 模拟执行（✅ Current）

> **状态：✅ 已发布**
> **阶段命名：Paper Trading**

### 包含
- 基于当前模拟回测引擎扩展为「纸上交易」模式
- 用户在 UI 上点击「开仓」/「平仓」后，系统记录虚拟委托但不发往交易所
- 纸上交易持仓与只读看板分离显示
- 纸上交易盈亏汇总（基于历史 snapshot 数据回溯计算）
- 纸上交易日志：开仓、平仓、滑点模拟、手续费模拟
- 执行中心 (/execution)
- PaperExecution 模型层 (lib/execution/)
- 净收益估算 (executionEngine.ts)
- Paper Portfolio 模拟资产统计 (/paper-portfolio)
- Opportunity Scoring Engine (lib/opportunity/scoring.ts)
- Risk Gate 风控门禁 (lib/risk/riskGate.ts)
- Strategy Template 接入 Paper Trading (paperStrategyTypes.ts)

### 不包含
- ✗ 真实交易所 API 交互
- ✗ API Key 存储
- ✗ 自动执行（仍需用户手动操作）
- ✗ 任何形式的实盘资金流动

### 为什么不能省略
纸上交易是连接「看数据」和「做交易」之间的关键验证环节：
1. 验证套利信号的实操可行性（流动性、滑点、执行延迟）
2. 验证 UI 操作流程和仓位管理
3. 让用户在零风险环境中熟悉系统
4. 不依赖任何交易所私有接口

---

## Phase 3 — 用户 API Key 管理（默认只读）

> **状态：✅ 全部完成（Phase 3.1 – 3.7），下一阶段 Phase 4**
> **阶段命名：API Key Management & Mock Account Infrastructure**

### Phase 3.1 — API Key UI 占位（✅ 已完成）

> 新增 API Key 管理页面 `/api-keys`，展示未来交易所连接入口、安全边界和权限要求。

#### 包含
- API Key 管理占位页面 (`/api-keys`)
- 导航栏「API管理」入口
- 三个交易所卡片（Binance / OKX / Bybit），每张显示：连接状态、Key 状态、权限要求
- 所有提交按钮标记为 disabled，明文标注「占位页面」
- 安全要求列表：禁止提币权限、子账户建议、IP 白名单、不保存 Secret

#### 不包含
- ✗ 真实的 API Key 表单提交
- ✗ Secret 保存、加密或传输
- ✗ 交易所私有接口连接
- ✗ 任何下单功能
- ✗ 权限检测逻辑

### Phase 3.2 — API Key 加密存储基础层（✅ 已完成）

> 新增 AES-256-GCM 加密模块和 localStorage 加密存储。

#### 包含
- `lib/apiKeys/types.ts` — ApiKeyRecord / ExchangeId / ApiKeyStatus / EncryptedSecretPayload 类型
- `lib/apiKeys/crypto.ts` — AES-256-GCM 加密/解密、密钥导入、PBKDF2 派生、API Key 掩码
- `lib/apiKeys/apiKeyStore.ts` — localStorage 加密存储，保存 masked key + 加密密文，不保存明文 Secret
- SSR-safe（try/catch 模式）
- 18 个单元测试全部通过

#### 不包含
- ✗ 实际的 API Key 输入表单（仍在占位 UI 中 disabled）
- ✗ 交易所权限检测网络请求
- ✗ 任何下单功能

### Phase 3.3 — Mock 权限检测验证器（✅ 已完成）

> 新增离线 Mock 权限检测模块，用于模拟交易所 API Key 权限检查流程。

#### 包含
- `lib/apiKeys/permissionVerifier.ts` — `verifyApiKeyPermissions()` 纯函数 + 4 个辅助导出
- 12 个单元测试全部通过
- Api-keys 页面新增 Mock 检测器状态展示
- 三条 Mock 示例覆盖：只读通过、交易权限警告、提币权限拒绝
- 所有结果包含 `mock-verification-only` 标记

#### 不包含
- ✗ 真实的交易所网络请求
- ✗ 实际的 API Key 输入表单（仍在占位 UI 中 disabled）
- ✗ 任何下单功能

### Phase 3.4 — Mock 只读账户适配器接口（✅ 已完成）

> 新增 PrivateAccountAdapter 接口和 Mock 实现，为未来账户同步做准备。

#### 包含
- `lib/exchangeAdapters/privateAccountTypes.ts` — AccountAsset / AccountPosition / AccountOpenOrder / AccountFundingPayment / PrivateAccountSnapshot 类型
- `lib/exchangeAdapters/privateAccountAdapter.ts` — `createPrivateAccountAdapter()` 工厂函数
- `lib/exchangeAdapters/mockPrivateAccountAdapter.ts` — Mock 实现，返回固定数据
- 所有数据标记 `source: "mock"`，不连接交易所
- 10 个单元测试全部通过

#### 不包含
- ✗ 真实交易所私有接口连接
- ✗ API Secret 解密
- ✗ 任何下单功能
- ✗ UI 展示真实资产（仍在占位状态）

### Phase 3.5 — 账户同步中心 Mock 页面（✅ 已完成）

> 新增账户同步中心页面 `/account-sync`，展示 Mock 账户资产、持仓、挂单、Funding 收益。

#### 包含
- 账户同步中心页面 (`/account-sync`)
- 导航栏「账户同步」入口
- `lib/exchangeAdapters/accountSnapshotSummary.ts` — 多交易所聚合汇总纯函数
- 使用 Mock PrivateAccountAdapter 展示 Binance / OKX / Bybit 模拟数据
- 所有数据标记 `source: "mock"`，页面明确标注不连接交易所

#### 不包含
- ✗ 真实交易所私有接口连接
- ✗ API Secret 解密
- ✗ 任何下单功能
- ✗ 真实账户资产展示

### Phase 3.6 — Mock 账户数据接入 Paper 风控（✅ 已完成）

> 扩展 Risk Gate，接入 Mock 账户快照数据用于账户级风控检查。

#### 包含
- `lib/risk/accountRiskContext.ts` — buildAccountRiskContext + 6 个计算函数
- RiskGateConfig 新增 4 个字段：maxAccountExposurePercent / maxSymbolAccountExposurePercent / minAvailableUsdBalance / includeAccountSnapshotRisk
- RiskGate 新增 3 个账户风控检查（总敞口比、单币敞口比、可用余额）
- /execution 页面加载 Mock 账户快照并传入 Risk Gate
- 页面顶部显示 Mock 账户总资产、可用 USDT、持仓敞口
- 19 个新增单元测试全部通过

#### 不包含
- ✗ 真实账户数据接入
- ✗ API Secret 解密
- ✗ 任何下单功能

### Phase 3.7 — Phase 3 收口验收与边界测试（✅ 已完成）

> 新增验收文档和边界测试，确保项目保持 read-only / mock-only / no-secret / no-live-trading 边界。

#### 包含
- `docs/PHASE_3_CLOSURE_CHECKLIST.md` — 完整验收文档
- `tests/phase3Boundary.test.ts` — 13 项边界测试（无下单/无交易/无 withdraw/middleware 安全/Mock 标注）
- 边界测试覆盖：placeOrder / createOrder / marketOrder / TradingAdapter / withdraw / middleware 白名单 / API Key 页面 disabled / Mock source / permissionVerifier mock 标记

### Phase 4 — 半自动交易（用户逐笔确认）（✅ 已完成）

> **状态：✅ 全部完成（Phase 4.1 – 4.8），下一阶段 Phase 5**
> **阶段命名：Semi-Automated Trading**

#### 包含
- Order Preview（`lib/orders/orderPreviewBuilder.ts`）
- User Confirmation（`lib/orders/orderConfirmationStore.ts`）
- Execution Audit（`lib/audit/auditStore.ts`）
- Local Execution Queue（`lib/orders/executionQueueStore.ts`）
- Kill Switch / Safety Controls（`lib/safety/safetyStore.ts`）
- Local Notification（`lib/notifications/localNotificationStore.ts`）
- Queue Recovery / Expiration（`lib/orders/executionQueueRecovery.ts`）
- Phase 4 收口验收 + 边界测试

#### 半自动交易链路
```
Opportunity → Scoring → Estimate → RiskGate → Preview → Confirm → Queue → Audit → Notification → Safety
```

#### 不包含
- ✗ 真实下单 — 无 submitOrder / placeOrder / createOrder / marketOrder 实现
- ✗ 交易所私有接口连接 — 无 PrivateAccountAdapter live 实现
- ✗ 外部通知 — 无 Telegram / Email / Webhook
- ✗ 队列自动执行 — 所有操作需用户手动触发

#### 风险边界
- 所有按钮受 Kill Switch 控制
- 预览标记 Preview Only
- 确认需勾选风险 + 免责声明
- 队列仅本地存储，不发送交易所

#### 前置条件
- ✅ Phase 2 Paper Trading 闭环
- ✅ Phase 3 API Key Mock 基础设施
- ✅ Phase 4 半自动交易链路完整

---

## Phase 5 — 实盘自动交易（完整风控）

> **状态：进行中 — Phase 5.0 Live Adapter Design + Sandbox Plan 已完成**
> **阶段命名：Fully Automated Trading**

> **⚠ 进入 Phase 5 前必须完成：Live Adapter Design 文档 + 至少一个交易所的沙盒/测试网接入。**
> **⚠ Phase 5 不允许直接在主网实现下单代码 — 必须先通过沙盒验证。**
> **⚠ EXCHANGE_ENV 默认值为 "disabled"，LIVE_TRADING_ENABLED 默认值为 false。**

### Phase 5.0 — Live Adapter Design + Sandbox/Testnet 设计（✅ 已完成）

#### 包含
- `docs/LIVE_ADAPTER_DESIGN.md` — TradingAdapter 接口设计、订单生命周期、三层架构
- `docs/SANDBOX_TESTNET_PLAN.md` — 沙盒/测试网接入计划、环境变量设计、安全默认值
- `lib/liveAdapters/tradingAdapterTypes.ts` — TradingAdapter interface（仅类型，无实现）
- 12 项 Phase 5 边界测试（tradingAdapterTypes 无实现、无 mainnet 文件、环境变量默认 safe 等）

#### 不包含
- ✗ TradingAdapter 的实现代码
- ✗ 真实的交易所连接
- ✗ 任何下单功能
- ✗ SDK 引入或 fetch 调用

### Phase 5.1+ — 后续阶段

- **5.1**: Mock Sandbox TradingAdapter（✅ 已完成）
- **5.2**: Sandbox 集成测试（连接真实测试网）
- **5.3**: 主网适配器（需沙盒验证通过）
- **5.4**: 策略自动执行（Kill Switch + 风控集成）
- **5.5**: 合规审查 + 上线

### Phase 5.1 — Mock Sandbox TradingAdapter（✅ 已完成）

#### 包含
- `lib/liveAdapters/mockSandboxTradingAdapter.ts` — Mock 实现，不发送任何网络请求
- 所有结果标记 `source: "mock-sandbox"`
- validateEnvironment / validatePermissions 通过但标记 Mock
- submitSandboxOrder 返回 `sandbox-submitted` 状态
- 10 个单元测试全部通过
- boundary 测试确认 executionQueueTypes 未被修改

#### 不包含
- ✗ 真实的 sandbox/testnet 网络请求
- ✗ API Key 读取或解密
- ✗ 任何下单功能
- ✗ SDK 引入或 fetch 调用

### Phase 5.2 — Sandbox Order Lifecycle Store（✅ 已完成）

#### 包含
- `lib/liveAdapters/sandboxOrderLifecycleTypes.ts` — SandboxOrderLifecycleRecord 类型
- `lib/liveAdapters/sandboxOrderLifecycleStore.ts` — localStorage 生命周期存储
- 支持状态流转：sandbox-ready → submitted → filled / cancelled / failed
- 集成 /execution-queue 页面，每行显示「Mock 沙盒」按钮
- 10 个单元测试全部通过
- 不修改 executionQueueTypes

#### 不包含
- ✗ 真实的 sandbox/testnet 网络请求
- ✗ API Key 读取或解密
- ✗ 任何下单功能
- ✗ SDK 引入或 fetch 调用

### Phase 5.3 — Sandbox Lifecycle 页面（✅ 已完成）

#### 包含
- `app/sandbox-lifecycle/page.tsx` — Mock Sandbox 生命周期查看页面
- 统计卡片：总记录 / 就绪 / 已提交 / 已成交 / 已取消 / 已失败
- 状态筛选器 + 清空操作
- 表格展示全部生命周期字段，支持标记取消和失败
- 标记操作写入 audit event + local notification
- 页面明确标注「Mock 数据，不代表真实交易」

#### 不包含
- ✗ 真实的 sandbox/testnet 网络请求
- ✗ 任何下单功能
- ✗ API Key 读取或解密

### Phase 5.4 — Sandbox Safety Gate（✅ 已完成）

#### 包含
- `lib/liveAdapters/sandboxSafetyGate.ts` — 10 项安全检查纯函数
- 覆盖：Kill Switch / 队列状态 / 过期 / Confirmation / Preview / RiskGate / Source / Environment / LiveTrading / Mainnet
- /execution-queue 页面集成：点击 Mock 沙盒前先过 Safety Gate
- 拦截时写入 `sandbox_safety_blocked` audit event + notification
- 13 个单元测试全部通过

#### 不包含
- ✗ 真实的 sandbox/testnet 网络请求
- ✗ 任何下单功能
- ✗ API Key 读取或解密

### Phase 5.5 — Mock Sandbox Closure 收口验收（✅ 已完成）

#### 包含
- `docs/PHASE_5_MOCK_SANDBOX_CLOSURE_CHECKLIST.md` — 完整验收文档
- `tests/phase5MockSandboxBoundary.test.ts` — 17 项边界测试
- 覆盖：no-fetch / no-axios / no-SDK / no-mainnet / source=mock-sandbox / env defaults safe / status isolation / page text / no secret decryption / doc assertions

#### 不包含
- ✗ 真实 testnet 网络请求
- ✗ 任何下单功能
- ✗ API Key 读取或解密

### Phase 5.6 — Real Testnet Adapter Design（✅ 已完成）

> 新增设计文档和 TestnetAdapter 类型接口。不包含实现。

### Phase 5.7 — Binance Testnet Adapter Skeleton（✅ 已完成）

#### 包含
- `lib/liveAdapters/binanceTestnetAdapterSkeleton.ts` — Binance Testnet Skeleton 适配器
- 所有方法返回 disabled/blocked，不连接 Binance
- validateEnvironment 检查 exchangeEnv / liveTradingEnabled / allowMainnetTrading
- checkPermissions 返回 permission-check-disabled
- placeTestnetOrder 返回 testnet-blocked
- 11 个单元测试全部通过

#### 不包含
- ✗ 真实 testnet 网络请求
- ✗ 任何下单功能
- ✗ API Key 解密或签名
- ✗ Binance SDK 引入

### Phase 5.7.1 — Binance Skeleton 审查收口（✅ 已完成）

#### 包含
- `tests/phase5BinanceSkeletonBoundary.test.ts` — 新增边界测试
- 静态分析验证：无 fetch / axios / HMAC / decryptSecret / SDK
- Runtime 验证：placeTestnetOrder 仅返回 testnet-blocked/disabled
- 文档更新明确 skeleton ≠ real testnet

### Phase 5.8 — Testnet Server Route Design（✅ 已完成 — Design Only）

#### 包含
- `docs/TESTNET_SERVER_ROUTE_DESIGN.md` — 完整 route 设计文档（10 节）
- `lib/liveAdapters/testnetRouteTypes.ts` — route 请求/响应/安全/幂等/限流类型
- `tests/phase5TestnetRouteDesignBoundary.test.ts` — 30+ 边界测试

#### 设计覆盖
- POST /api/testnet/orders/preview-submit
- POST /api/testnet/orders/cancel
- GET  /api/testnet/orders/:id
- GET  /api/testnet/account/snapshot
- 安全检查清单（10 项）
- Idempotency 策略（dedup window）
- Rate Limit 策略（per exchange / per route / per session）
- Audit 事件（4 种）
- Failure Handling（timeout / partial fill / rejected / inconsistent）

#### 不包含
- ✗ 无 API route 实现
- ✗ 无 middleware 修改
- ✗ 无 Secret 解密
- ✗ 无签名
- ✗ 无 fetch
- ✗ 无真实下单

### Phase 5.9 — Testnet Route Handler Skeleton（✅ 已完成 — Skeleton Only）

#### 包含
- `app/api/testnet/orders/preview-submit/route.ts` — POST, 返回 403 blocked
- `app/api/testnet/orders/cancel/route.ts` — POST, 返回 403 blocked
- `app/api/testnet/orders/[id]/route.ts` — GET, 返回 403 blocked
- `app/api/testnet/account/snapshot/route.ts` — GET, 返回 403 blocked
- `tests/phase5TestnetRouteHandlerSkeleton.test.ts` — 边界测试

#### Skeleton 行为
- 所有 route 返回 `success: false`, code: `exchange-env-invalid`
- 消息: "Testnet route skeleton only — no network request, no order placement"
- HTTP 状态码 403
- 不调用 adapter、不解密 Secret、不签名、不 fetch、不连接交易所

#### 不包含
- ✗ 真实 testnet 网络请求
- ✗ Secret 解密
- ✗ 签名
- ✗ 真实下单
- ✗ middleware 白名单修改

### Phase 5.10 — Testnet Route Security Guard Skeleton（✅ 已完成 — Skeleton Only）

#### 包含
- `lib/liveAdapters/testnetRouteSecurityGuard.ts` — 安全检查纯函数
- `lib/liveAdapters/testnetRouteSecurityGuard.test.ts` — 17 个测试
- 集成到 `app/api/testnet/orders/preview-submit/route.ts` — 调用 guard 但仍返回 403

#### Security Guard 规则（10 项）
| # | 检查项 | 失败 → errorCode |
|---|--------|-----------------|
| 1 | exchangeEnvValid | exchange-env-invalid |
| 2 | liveTradingBlocked | live-trading-enabled |
| 3 | mainnetBlocked | mainnet-allowed |
| 4 | killSwitchDisabled | kill-switch-active |
| 5 | apiKeyVerified | api-key-not-verified |
| 6 | withdrawPermissionDisabled | withdraw-not-disabled |
| 7 | ipWhitelistPresent | ip-whitelist-missing |
| 8 | riskGatePassed | risk-gate-blocked |
| 9 | confirmationExists | confirmation-missing |
| 10 | queueItemNotExpired | queue-expired |

- 全部通过后仍 blocked（reasonCode: `PHASE_5_10_SKELETON_BLOCK`）
- `source` 始终 `testnet-route-skeleton`

#### 不包含
- ✗ 真实 testnet 网络请求
- ✗ Secret 解密
- ✗ 签名
- ✗ 真实下单
- ✗ middleware 白名单修改

### Phase 5.11 — Testnet Route Guard Integration（✅ 已完成）

#### 包含
- `app/api/testnet/_shared/blockedResponse.ts` — 共享 helper（3 个函数）
- 所有 4 个 route 统一使用 `buildGuardedBlockedResponse`

#### Shared Helper
| 函数 | 说明 |
|------|------|
| `buildDefaultSkeletonChecklist()` | 返回全部 false 的 checklist |
| `buildBlockedTestnetResponse(routeName, exchangeId?)` | 简单 403 阻塞响应 |
| `buildGuardedBlockedResponse(routeName, exchangeId?)` | 调用 guard + 返回 403 |

所有 route 统一：
- 调用 `buildGuardedBlockedResponse(routeName, "binance")`
- 仍返回 403
- 响应体包含 `success: false` + `guard` 字段（allowed, reasonCodes, source）

#### 不包含
- ✗ 真实 testnet 网络请求
- ✗ Secret 解密
- ✗ 签名
- ✗ 真实下单
- ✗ middleware 白名单修改

### Phase 5.12 — Testnet Idempotency Store Skeleton（✅ 已完成）

#### 包含
- `lib/liveAdapters/testnetIdempotencyTypes.ts` — 幂等记录类型
- `lib/liveAdapters/testnetIdempotencyStore.ts` — In-memory 幂等存储（SSR-safe）
- `lib/liveAdapters/testnetIdempotencyStore.test.ts` — 22 个测试
- `app/api/testnet/_shared/blockedResponse.ts` — 新增 `buildGuardedBlockedResponseWithIdempotency`

#### IdempotencyRecord 结构
| 字段 | 说明 |
|------|------|
| `idempotencyKey` | 客户端幂等 Key |
| `clientOrderId` | 客户端订单 ID |
| `routeName` | 路由名称 |
| `requestHash` | 确定性 hash（非 crypto） |
| `responseSnapshot` | blocked response 快照 |
| `status` | `recorded-blocked` / `duplicate-blocked` / `expired` |
| `source` | 始终 `testnet-route-skeleton` |

#### Store 方法
| 方法 | 说明 |
|------|------|
| `createIdempotencyRecord(input)` | 创建记录；重复 key+route 返回 duplicate |
| `findIdempotencyRecord(key, route)` | 查找有效记录 |
| `markDuplicateBlocked(id)` | 标记为重复 |
| `expireIdempotencyRecord(id)` | 标记为过期 |
| `listIdempotencyRecords()` | 列出所有记录 |
| `clearIdempotencyRecords()` | 清空记录 |
| `buildRequestHash(fields)` | 确定性 hash（`sk-hash-` 前缀） |

#### 集成
- `buildGuardedBlockedResponseWithIdempotency` 调用 store 但仍返回 403
- 默认 idempotencyKey 为 `skeleton-disabled`
- 不解析 body Secret

#### 不包含
- ✗ 真实 testnet 网络请求
- ✗ Secret 解密
- ✗ 签名
- ✗ 真实下单
- ✗ middleware 白名单修改
- ✗ crypto hash（使用简单整数 hash）

### Phase 5.13 — Testnet Rate Limit Store Skeleton（✅ 已完成）

#### 包含
- `lib/liveAdapters/testnetRateLimitTypes.ts` — 限流类型
- `lib/liveAdapters/testnetRateLimitStore.ts` — In-memory 限流存储
- `lib/liveAdapters/testnetRateLimitStore.test.ts` — 24 个测试
- `app/api/testnet/_shared/blockedResponse.ts` — 新增 `buildGuardedBlockedResponseWithRateLimit`

#### 默认限流策略
| 范围 | 最大请求 | 窗口 |
|------|---------|------|
| Exchange（按交易所） | 10 req | 1s |
| Route（按路由） | 30 req | 60s |
| Session（按会话） | 60 req | 60s |

#### Store 方法
| 方法 | 说明 |
|------|------|
| `getDefaultRateLimitPolicies()` | 返回默认策略配置 |
| `buildRateLimitKey(scope, route, exchange, sessionId?)` | 确定性的 scope key |
| `checkRateLimit(input)` | 检查是否超限（不计数） |
| `incrementRateLimit(input)` | 计数并返回检查结果 |
| `resetRateLimit(scopeKey)` | 重置指定 scope 的计数 |
| `listRateLimitRecords()` | 列出所有记录 |
| `clearRateLimitRecords()` | 清空所有记录 |

#### 集成
- `buildGuardedBlockedResponseWithRateLimit` 调用限流 + 幂等 + guard，仍返回 403
- 响应体包含 `rateLimit` 数组（3 个 scope 的当前计数和限制）

#### 不包含
- ✗ 真实 testnet 网络请求
- ✗ Secret 解密
- ✗ 签名
- ✗ 真实下单
- ✗ middleware 白名单修改

### Phase 5.14 — Testnet Audit Server Event Skeleton（✅ 已完成）

#### 包含
- `lib/liveAdapters/testnetAuditTypes.ts` — 审计事件类型
- `lib/liveAdapters/testnetAuditStore.ts` — In-memory 审计存储
- `lib/liveAdapters/testnetAuditStore.test.ts` — 20 个测试
- `app/api/testnet/_shared/blockedResponse.ts` — 集成审计事件到 `buildGuardedBlockedResponseWithRateLimit`

#### 审计事件类型
| 事件 | 触发条件 | 严重度 |
|------|---------|--------|
| `route_request_received` | 每次请求到达 skeleton | info |
| `route_skeleton_blocked` | skeleton 返回 403 | blocked |
| `route_rate_limited` | 任意 scope 超限 | warning |
| `route_duplicate_blocked` | 幂等检测到重复 | warning |

#### Store 方法
| 方法 | 说明 |
|------|------|
| `createTestnetAuditEvent(input)` | 创建审计事件 |
| `listTestnetAuditEvents()` | 列出所有事件（最新优先） |
| `filterTestnetAuditEvents(filters)` | 按 routeName/eventType/severity 过滤 |
| `countTestnetAuditEventsByType()` | 按类型统计 |
| `clearTestnetAuditEvents()` | 清空所有事件 |
| `buildTestnetRequestId(route, exchange)` | 生成请求 ID |

#### 集成
- `buildGuardedBlockedResponseWithRateLimit` 在响应周期中创建 2-4 个审计事件：
  1. `route_request_received`（每次）
  2. `route_rate_limited`（如果限流命中）
  3. `route_duplicate_blocked`（如果幂等重复）
  4. `route_skeleton_blocked`（每次）
- 仍返回 403

#### 不包含
- ✗ 真实 testnet 网络请求
- ✗ Secret 解密
- ✗ 签名
- ✗ 真实下单（不在审计中记录交易数据）
- ✗ middleware 白名单修改

### Phase 5.15 — Testnet Route Skeleton Closure（✅ 已完成）

#### 包含
- `docs/PHASE_5_TESTNET_ROUTE_SKELETON_CLOSURE.md` — 收口验收文档
- `tests/phase5TestnetRouteSkeletonClosure.test.ts` — 54 个边界测试

#### Skeleton 链路
```
request → shared blockedResponse → guard → idempotency → rate limit → audit → 403
```

#### 收口模块汇总
| 模块 | Phase | 状态 |
|------|-------|------|
| Route Handler Skeleton | 5.9 | ✅ |
| Security Guard | 5.10 | ✅ |
| Guard Integration | 5.11 | ✅ |
| Idempotency Store | 5.12 | ✅ |
| Rate Limit Store | 5.13 | ✅ |
| Audit Store | 5.14 | ✅ |
| Closure & Boundary | 5.15 | ✅ |

#### 不包含
- ✗ 真实 testnet 网络请求
- ✗ Secret 解密
- ✗ 签名
- ✗ 真实下单
- ✗ middleware 白名单修改

### Phase 5.16 — Testnet Environment Config Design（✅ 已完成 — Design Only）

#### 包含
- `lib/liveAdapters/testnetEnvTypes.ts` — 环境配置类型
- `lib/liveAdapters/testnetEnvConfig.ts` — 默认值 + 解析 + 验证纯函数
- `lib/liveAdapters/testnetEnvConfig.test.ts` — 26 个测试

#### 默认配置
| 字段 | 默认值 |
|------|--------|
| `exchangeEnv` | `"disabled"` |
| `liveTradingEnabled` | `false` |
| `allowMainnetTrading` | `false` |
| `testnetRoutesEnabled` | `false` |
| `testnetOrderSubmitEnabled` | `false` |

#### validate 规则
| 条件 | 结果 |
|------|------|
| `allowMainnetTrading=true` | ❌ invalid |
| `liveTradingEnabled=true` | ❌ invalid |
| `testnetOrderSubmitEnabled=true` | ❌ invalid (Phase 5.16) |
| `testnetRoutesEnabled=true` | ⚠️ warning（允许 skeleton 测试） |
| 全部默认 false | ✅ valid |

#### 不包含
- ✗ Secret 读取/解密
- ✗ 签名
- ✗ fetch/axios
- ✗ middleware 修改
- ✗ route 返回 success:true

### Phase 5.17 — Testnet Route Env Integration Skeleton（✅ 已完成）

#### 包含
- `app/api/testnet/_shared/blockedResponse.ts` — 集成 env config 解析和校验
- `tests/phase5TestnetEnvIntegration.test.ts` — 12 个测试

#### env integration 行为
- `buildGuardedBlockedResponseWithRateLimit` 在响应周期中解析 `process.env`
- 读取：`EXCHANGE_ENV`, `LIVE_TRADING_ENABLED`, `ALLOW_MAINNET_TRADING`, `TESTNET_ROUTES_ENABLED`, `TESTNET_ORDER_SUBMIT_ENABLED`
- 调用 `parseTestnetEnvConfig` + `validateTestnetEnvConfig`
- 响应体增加 `env` 字段：
  ```typescript
  env: {
    exchangeEnv, testnetRoutesEnabled, testnetOrderSubmitEnabled,
    valid, warnings, errors,
  }
  ```
- 即使 `env.valid=true`，仍返回 403
- 不读取 Secret、不解密、不签名

#### 不包含
- ✗ 真实 testnet 网络请求
- ✗ Secret 解密
- ✗ 签名
- ✗ 真实下单
- ✗ middleware 白名单修改

### Phase 5.18 — Testnet Secret Access Policy Design（✅ 已完成 — Policy Only）

#### 包含
- `lib/liveAdapters/testnetSecretPolicyTypes.ts` — 策略类型
- `lib/liveAdapters/testnetSecretPolicy.ts` — 策略评估纯函数
- `lib/liveAdapters/testnetSecretPolicy.test.ts` — 12 个测试
- `app/api/testnet/_shared/blockedResponse.ts` — 集成 secretPolicy 到响应体

#### 策略规则
| # | 条件 | 结果 |
|---|------|------|
| 1 | `envValidation.valid !== true` | ❌ ENV_VALIDATION_FAILED |
| 2 | `exchangeEnv !== "testnet"` | ❌ EXCHANGE_ENV_NOT_TESTNET |
| 3 | `testnetRoutesEnabled !== true` | ❌ TESTNET_ROUTES_DISABLED |
| 4 | `testnetOrderSubmitEnabled === true` | ❌ ORDER_SUBMIT_ENABLED_IN_PHASE_5_18 |
| 5 | `guardResult.allowed !== true` | ❌ GUARD_REJECTED |
| 6 | 全部通过 | ❌ PHASE_5_18_SECRET_ACCESS_BLOCKED |

- `source` 始终 `testnet-secret-policy-skeleton`
- 响应体新增 `secretPolicy` 字段
- **绝不调用 decryptSecret / importMasterKey / apiKeyStore**

#### 不包含
- ✗ 真实 Secret 访问
- ✗ 解密
- ✗ 签名
- ✗ 真实 testnet 请求
- ✗ middleware 修改

### Phase 5.19 — Testnet Permission Check Skeleton（✅ 已完成）

#### 包含
- `lib/liveAdapters/testnetPermissionTypes.ts` — 权限检查类型
- `lib/liveAdapters/testnetPermissionCheck.ts` — 权限检查纯函数
- `lib/liveAdapters/testnetPermissionCheck.test.ts` — 13 个测试
- `app/api/testnet/_shared/blockedResponse.ts` — 集成 permission 到响应体

#### PermissionCheck 规则
| # | 条件 | 结果 |
|---|------|------|
| 1 | `secretPolicy.allowedToRequestSecret !== true` | ❌ blocked |
| 2 | 默认 `canRead=false`, `canTrade=false` | ❌ disabled |
| 3 | `canWithdraw=true` | ❌ 始终 blocked |
| 4 | `ipWhitelistPresent=false` | ❌ 始终 blocked |
| 5 | Phase 5.19 | ❌ `PHASE_5_19_PERMISSION_CHECK_DISABLED` |

- `source` 始终 `testnet-permission-skeleton`
- 调用 `evaluateTestnetPermissionCheck`，响应体新增 `permission` 字段
- 不调用 apiKeyStore / decryptSecret

#### 不包含
- ✗ 真实 API Key 权限检测
- ✗ Secret 读取/解密
- ✗ 签名
- ✗ 真实 testnet 请求
- ✗ middleware 修改

### Phase 5.20+ — 后续阶段（BLOCKED — 等待明确批准）

> **⚠ 后续阶段需要先通过代码审查，获得明确批准后方可开始。**
> **仍不允许真实网络请求、签名、Secret 解密。**

#### 前置条件
- ✅ Phase 5.0–5.19 Mock Sandbox + Skeleton + Route Design + Route Handler + Security Guard + Guard Integration + Idempotency Store + Rate Limit Store + Audit Store + Closure + Env Config + Env Integration + Secret Policy + Permission Check 链路完整
- ⏳ 代码审查（待完成）
- ⏳ 独立 testnet 环境变量设计
- ⏳ 单交易所 testnet adapter 实现
- ⏳ Server-side Secret handling 设计
- ⏳ Testnet-only middleware route
- ⏳ Fail-safe Kill Switch 自动触发
- ⏳ Testnet rollback plan

---

## 为什么不能直接从只读跳到自动交易

```
只读看板 ──────────────────────────────┐
        │                                │
        ▼                                │
  纸上交易（验证信号 + 熟悉操作）        │
        │                                │
        ▼                                │
  API Key 管理（私有数据只读接入）       │
        │                                │
        ▼                                │
  半自动交易（人工确认 + 风控初验）      │
        │                                │
        ▼                                │
  ╔══════════════════════════════════╗   │
  ║     实盘自动交易（完整风控）     ║   │
  ╚══════════════════════════════════╝   │
                                          │
  跳过中间任一阶段的风险：                 │
  - 信号未经验证 → 策略亏损               │
  - 操作流程未经测试 → 误操作             │
  - API Key 权限管理不当 → 资金风险       │
  - 风控未经实战 → 放大亏损               │
  - 用户未经培训 → 恐慌性决策             │
  ────────────────────────────────────────┘
```

每个阶段解决一个特定的风险维度：
| Phase | 解决的风险 | 需要的技能 |
|-------|-----------|-----------|
| 1 只读看板 | 数据不可见、无研究工具 | 市场理解 |
| 2 纸上交易 | 信号可行性未知 | UI 操作 |
| 3 API Key 管理 | 私有数据不接入 | 安全管理 |
| 4 半自动 | 未经确认的执行 | 风控意识 |
| 5 全自动 | 高频执行风险 | 系统信任 |

---

## 阶段时间线（预估）

| Phase | 名称 | 前置条件 | 预估周期 |
|-------|------|---------|---------|
| 1 | 只读看板 | — | ✅ 已完成 |
| 2 | 纸上交易 | Phase 1 稳定 | ✅ 已完成 |
| 3 | API Key 管理 | Phase 2 + LIVE_TRADING_ARCHITECTURE.md | ✅ 已完成 |
| 4 | 半自动交易 | Phase 3 验收完成 | ✅ 已完成 |
| 5 | 全自动交易 | Phase 4 + Live Adapter Design + Sandbox | TBD（设计阶段） |

> **注意**：以上时间线为初步预估，每个阶段的推进需要前一个阶段验证通过和安全审查通过后，经项目决策确认方可进入下一阶段。
