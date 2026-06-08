# Real Testnet Adapter Design

> **阶段：** Phase 5.6 — Design Only
> **状态：** 架构设计文档，不包含任何真实网络请求
> **当前项目仍无 testnet/mainnet 实盘能力**

---

## 目录

1. [设计原则](#1-设计原则)
2. [只允许 Testnet，不允许 Mainnet](#2-只允许-testnet不允许-mainnet)
3. [Server-Side Secret Handling](#3-server-side-secret-handling)
4. [API Key 权限真实检测流程](#4-api-key-权限真实检测流程)
5. [IP Whitelist 要求](#5-ip-whitelist-要求)
6. [交易所 Testnet 差异](#6-交易所-testnet-差异)
7. [Testnet Adapter Factory 设计](#7-testnet-adapter-factory-设计)
8. [订单签名前置检查](#8-订单签名前置检查)
9. [Request Signing 风险](#9-request-signing-风险)
10. [Rate Limit / Retry / Idempotency](#10-rate-limit--retry--idempotency)
11. [Rollback / Cancel / Reconciliation](#11-rollback--cancel--reconciliation)
12. [Testnet-Only Middleware Route 设计](#12-testnet-only-middleware-route-设计)
13. [上线主网前阻塞条件](#13-上线主网前阻塞条件)

---

## 1. 设计原则

| 原则 | 说明 |
|------|------|
| **Testnet Only** | 第一阶段只允许 testnet，禁止任何 mainnet 代码路径 |
| **No Default Mainnet** | 环境变量默认值为 `exchangeEnv=disabled` |
| **Fail-safe by Default** | 所有操作必须先通过 Safety Gate |
| **Audit Every Step** | 每次 API 调用写入审计日志 |
| **Idempotent Requests** | 支持幂等性，防止重复下单 |
| **Rate Limited** | 遵守交易所限频规则 |

---

## 2. 只允许 Testnet，不允许 Mainnet

```
EXCHANGE_ENV=disabled (默认)
      │
      ▼ (手动修改)
EXCHANGE_ENV=sandbox  ← Phase 5.6 目标
      │
      ▼ (审查通过后)
EXCHANGE_ENV=testnet  ← 单交易所验证
      │
      ▼ (合规审查后)
EXCHANGE_ENV=mainnet  ← 禁止跳步
```

### 强制检查

- `ALLOW_MAINNET_TRADING` 默认 `false`
- 任何 mainnet 连接尝试被 Safety Gate 拦截
- testnet 环境的 API Key 与 mainnet 完全隔离
- testnet 订单标记 `source: "testnet"`，不与 mock 混淆

---

## 3. Server-Side Secret Handling

### 当前限制

- Phase 3.2 加密存储仅在客户端（localStorage AES-256-GCM）
- 真实 testnet 需要 server-side 解密和签名

### 设计方案

```
┌────────────┐     ┌────────────────┐     ┌──────────────┐
│  Frontend  │ ──→ │  Next.js API   │ ──→ │  Exchange    │
│  (CSR)     │     │  Route Handler │     │  Testnet API │
└────────────┘     └────────────────┘     └──────────────┘
                         │
                    ┌────┴────┐
                    │ 解密     │  ← 仅发生在 server-side
                    │ 签名     │
                    │ 审计日志  │
                    └─────────┘
```

### 关键要求

| 要求 | 说明 |
|------|------|
| Secret 不进前端 | API Key / Secret 仅出现在 server route handler |
| 签名在服务端 | 所有 request signing 在 server 完成 |
| 审计日志在服务端 | 所有 API 调用写入 server-side audit |
| 限频在服务端 | Rate limit 由 server route 控制 |

---

## 4. API Key 权限真实检测流程

```
步骤 1：用户提交 testnet API Key（加密后存 localStorage）
步骤 2：前端发送 key reference 到 server
步骤 3：Server 解密 key
步骤 4：Server 调用交易所权限端点
         - Binance: GET sapi/v1/account/apiRestrictions
         - OKX: GET /api/v5/account/config
         - Bybit: GET /v5/account/info
步骤 5：检查返回值
         - enableWithdrawals === false
         - 交易权限已开启 (用于 testnet)
         - IP 白名单已设置
步骤 6：返回 PermissionCheckResult
```

---

## 5. IP Whitelist 要求

| 要求 | 说明 |
|------|------|
| IP 白名单必须设置 | API Key 必须绑定服务器 IP |
| 不允许空白名单 | 防止 Key 泄露后被他人使用 |
| 白名单检测 | 启动时检查 Key 的 IP 白名单配置 |
| 动态 IP 处理 | 如果服务器 IP 变动，需更新白名单 |

---

## 6. 交易所 Testnet 差异

| 特性 | Binance Testnet | OKX Demo | Bybit Testnet |
|------|----------------|----------|---------------|
| URL | testnet.binancefuture.com | www.okx.com (Demo mode) | api-testnet.bybit.com |
| 注册 | 独立注册 | 主网账户开启 Demo | 独立注册 |
| 资金 | 自动 100 USDT | 自动分配 | 需手动申请 |
| 撮合 | 模拟 | 模拟 | 模拟 |
| API 兼容性 | 与主网基本一致 | 与主网基本一致 | 与主网基本一致 |
| 限频 | 不同 | 不同 | 不同 |
| 文档 | binance-docs.github.io | okx.com/docs-v5 | bybit-exchange.github.io |

---

## 7. Testnet Adapter Factory 设计

```typescript
interface TestnetAdapter {
  readonly exchangeId: TestnetExchangeId;
  readonly mode: TestnetAdapterMode; // "design-only"

  /** 验证 testnet 环境配置 */
  validateEnvironment(): Promise<TestnetEnvironmentValidationResult>;

  /** 真实 API Key 权限检测 */
  checkPermissions(ref: TestnetCredentialRef): Promise<TestnetPermissionCheckResult>;

  /** 提交 testnet 订单 */
  placeTestnetOrder(request: TestnetOrderRequest): Promise<TestnetOrderResult>;

  /** 撤单 */
  cancelTestnetOrder(orderId: string): Promise<boolean>;

  /** 查询订单状态 */
  getTestnetOrderStatus(orderId: string): Promise<TestnetOrderResult>;
}
```

注意：不在 `tradingAdapterTypes.ts` 存在时的接口。而是 TestnetAdapter 作为独立阶段设计，在完成 testnet 验证后再合并或替代。

---

## 8. 订单签名前置检查

提交 testnet 订单前，必须通过以下检查：

```
┌──────────────────────────────────────┐
│  订单签名前置检查                      │
├──────────────────────────────────────┤
│ 1. Environment = sandbox/testnet      │
│ 2. Secret 已解密（server-side only）  │
│ 3. API Key 权限检测通过               │
│ 4. IP 白名单已配置                    │
│ 5. Rate limit 未超限                  │
│ 6. 请求幂等性 (clientOrderId 去重)     │
│ 7. Safety Gate 通过                   │
│ 8. Kill Switch 关闭                   │
│ 9. 订单 preview 已验证                 │
└──────────────────────────────────────┘
```

---

## 9. Request Signing 风险

| 风险 | 缓解措施 |
|------|---------|
| Secret 泄露 | 仅 server-side 存储，定期轮换 |
| 签名重放 | 使用 timestamp + recvWindow |
| 签名算法不一致 | 按交易所文档实现 |
| 签名失败后重试 | 幂等性检查 |
| 签名 Key 过期 | 定期检查 Key 有效性 |

---

## 10. Rate Limit / Retry / Idempotency

### Rate Limit

| 交易所 | 限制类型 | 限制 |
|--------|---------|------|
| Binance | IP / UID | 1200 权重/分钟 |
| OKX | IP | 20 次/秒（一般） |
| Bybit | IP / UID | 50 次/秒 |

### Retry 策略

- 网络错误 → 最多重试 3 次，指数退避（1s → 2s → 4s）
- Rate limit 错误 → 等待后重试（读取 Retry-After header）
- 幂等性错误 → 不重试（clientOrderId 已存在）
- 权限错误 → 不重试

### Idempotency

- 每个订单使用唯一 `clientOrderId`
- 交易所返回订单已存在时不重复下单
- 幂等性键值使用 `previewId + legIndex`

---

## 11. Rollback / Cancel / Reconciliation

### Cancel

| 场景 | 方法 |
|------|------|
| 订单未成交 | `cancelTestnetOrder(orderId)` |
| 订单部分成交 | 不可取消部分成交 |
| 网络断开 | 启动后检查未完成订单 |

### Reconciliation

- 定时任务（每 30s）检查所有 `sandbox-submitted` 状态
- 调用 `getTestnetOrderStatus` 更新本地状态
- 不一致时记录 audit + 告警

---

## 12. Testnet-Only Middleware Route 设计

```typescript
// middleware.ts — 新增 testnet 路径白名单（Phase 5.6+）
const ALLOWED_TESTNET_PREFIXES = [
  "/api/testnet/",     // 仅 testnet 路径
];

// Phase 5.6 未实现前保持为空
// 上线 testnet 时添加路径
// 禁止添加 mainnet 路径
```

### 安全规则

- `/api/testnet/*` 路径仅允许 testnet 环境
- API Key 必须 testnet-only
- testnet 路径不允许 mainnet 请求

---

## 13. 上线主网前阻塞条件

> **Phase 5.6 只做 design，不实现 testnet。**
> **上线主网前必须满足以下条件，不可能跳过。**

- [ ] Testnet Adapter 实现 + 单元测试通过
- [ ] 至少一个交易所 testnet 集成测试通过（模拟环境 7 天无异常）
- [ ] Server-side secret handling 代码审查
- [ ] API Key 权限真实检测实现
- [ ] IP whitelist 验证通过
- [ ] Rate limit 测试通过
- [ ] Cancel / Reconciliation 测试通过
- [ ] Testnet-only middleware route 实现
- [ ] Safety Gate testnet 模式验证
- [ ] 全部边界测试通过
- [ ] 安全审查
- [ ] 合规审查

---

## 14. Phase 5.7 — Binance Testnet Adapter Skeleton

> **⚠ Binance Testnet Adapter Skeleton 不连接 Binance Testnet。**
> **所有方法返回 disabled/blocked。详见 `lib/liveAdapters/binanceTestnetAdapterSkeleton.ts`。**

### 方法行为

| 方法 | 行为 |
|------|------|
| `validateEnvironment()` | `exchangeEnv !== "testnet"` → invalid |
| `checkPermissions(ref)` | 返回 `valid=false`, `permission-check-disabled` |
| `placeTestnetOrder(request)` | 返回 `status="testnet-blocked"`, `source="testnet-skeleton"` |
| `cancelTestnetOrder(orderId)` | 返回 `false` |
| `getTestnetOrderStatus(orderId)` | 返回 `status="testnet-unknown"`, `source="testnet-skeleton"` |

### 限制
- 不发送任何网络请求
- 不解密 Secret
- 不签名
- 不引入 SDK

---

## 15. Skeleton Closure — 边界收口（Phase 5.7.1）

### 静态分析验证
- `binanceTestnetAdapterSkeleton.ts` 无 `fetch(`
- 无 `axios`
- 无 `createHmac` / `crypto.subtle.sign`
- 无 `decryptSecret` / `importMasterKey`
- 无明文 `apiSecret` / `secretKey`
- 无 SDK import

### Runtime 验证
- `placeTestnetOrder` 仅返回 `testnet-blocked` 或 `testnet-disabled`
- `cancelTestnetOrder` 返回 `false`
- middleware 未开放 `/api/testnet` 路径

### 结论
**Skeleton ≠ Real Testnet。** 可进入 Phase 5.8 设计阶段。

---

## 16. Phase 5.8 — Testnet Server Route Design（已完成）

> **⚠ Phase 5.8 只允许 server-side route design。**
> **不允许连接 Binance Testnet。**
> **不允许真实下单。**
> **不允许实现签名。**

### 16.1 结果文件

| 文件 | 说明 |
|------|------|
| `docs/TESTNET_SERVER_ROUTE_DESIGN.md` | 完整 route 设计文档（10 节） |
| `lib/liveAdapters/testnetRouteTypes.ts` | Route 请求/响应/安全/幂等/限流类型（30+ 类型） |
| `tests/phase5TestnetRouteDesignBoundary.test.ts` | 30+ 边界测试 |

### 16.2 设计覆盖

- 4 个 route: orders/preview-submit, orders/cancel, orders/:id, account/snapshot
- 安全检查清单（10 项）
- Idempotency 策略（dedup window）
- Rate Limit 策略（per exchange / per route / per session）
- Audit 事件（4 种）
- Failure Handling（timeout / partial fill / rejected / inconsistent）

---

## 17. Phase 5.9 — Testnet Route Handler Skeleton（已完成）

> **⚠ Phase 5.9 route skeleton 不连接真实 Testnet。**
> **所有 route 返回 403 blocked。**

### 17.1 新增文件

| Route | 方法 | 文件 | 行为 |
|-------|------|------|------|
| `/api/testnet/orders/preview-submit` | POST | `app/api/testnet/orders/preview-submit/route.ts` | 返回 403 `exchange-env-invalid` |
| `/api/testnet/orders/cancel` | POST | `app/api/testnet/orders/cancel/route.ts` | 返回 403 `exchange-env-invalid` |
| `/api/testnet/orders/[id]` | GET | `app/api/testnet/orders/[id]/route.ts` | 返回 403 `exchange-env-invalid` |
| `/api/testnet/account/snapshot` | GET | `app/api/testnet/account/snapshot/route.ts` | 返回 403 `exchange-env-invalid` |

### 17.2 Skeleton 行为

- 所有 route 返回 `success: false`, code: `exchange-env-invalid`
- message: `"Testnet route skeleton only — no network request, no order placement"`
- HTTP 状态码 403
- 不调用 adapter、不解密 Secret、不签名、不 fetch、不连接交易所

### 17.3 当前状态

| 事项 | 状态 |
|------|------|
| Route 目录 `app/api/testnet/*` | ✅ 存在（skeleton only） |
| Route handler 返回 blocked | ✅ |
| Middleware 修改 | ❌ 无 |
| Secret 解密 | ❌ 无 |
| 签名 | ❌ 无 |
| 网络请求 | ❌ 无 |
| 真实下单 | ❌ 无 |

---

## 18. Phase 5.10 — Testnet Route Security Guard Skeleton（已完成）

> **⚠ Security Guard Skeleton 不连接真实 Testnet。**
> **不解密 Secret、不签名、不发网络请求。**

### 18.1 新增文件

| 文件 | 说明 |
|------|------|
| `lib/liveAdapters/testnetRouteSecurityGuard.ts` | 安全检查纯函数 |
| `lib/liveAdapters/testnetRouteSecurityGuard.test.ts` | 17 个测试 |

### 18.2 Security Guard 规则

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

### 18.3 关键行为

- 纯函数，无副作用
- 输入 checklist 全部为默认 false
- 全部通过后仍 blocked（`PHASE_5_10_SKELETON_BLOCK`）
- `source` 始终 `testnet-route-skeleton`
- 集成到 `POST /api/testnet/orders/preview-submit` 但仍返回 403

### 18.4 当前状态

| 事项 | 状态 |
|------|------|
| Guard 纯函数实现 | ✅ |
| Guard 集成到 route | ✅（仍返回 403） |
| 真实 testnet 请求 | ❌ 无 |
| Secret 解密 | ❌ 无 |
| 签名 | ❌ 无 |
| Middleware 修改 | ❌ 无 |

---

## 19. Phase 5.11 — Testnet Route Guard Integration（已完成）

> **⚠ 所有 route 统一 guard 调用，但仍返回 403 blocked。**
> **不解密 Secret、不签名、不发网络请求。**

### 19.1 新增文件

| 文件 | 说明 |
|------|------|
| `app/api/testnet/_shared/blockedResponse.ts` | 共享 blocked response helper |
| `tests/phase5TestnetRouteGuardIntegration.test.ts` | 集成测试 |

### 19.2 Shared Helper 函数

| 函数 | 说明 |
|------|------|
| `buildDefaultSkeletonChecklist()` | 返回全部 false 的 TestnetRouteSecurityChecklist |
| `buildBlockedTestnetResponse(routeName, exchangeId?)` | 简单 403 阻塞（不调用 guard） |
| `buildGuardedBlockedResponse(routeName, exchangeId?)` | 调用 guard + 返回 403 |

### 19.3 统一集成

| Route | 方法 | 实现 |
|-------|------|------|
| `/api/testnet/orders/preview-submit` | POST | `buildGuardedBlockedResponse("orders-preview-submit")` |
| `/api/testnet/orders/cancel` | POST | `buildGuardedBlockedResponse("orders-cancel")` |
| `/api/testnet/orders/[id]` | GET | `buildGuardedBlockedResponse("orders-status")` |
| `/api/testnet/account/snapshot` | GET | `buildGuardedBlockedResponse("account-snapshot")` |

### 19.4 当前状态

| 事项 | 状态 |
|------|------|
| Shared helper 实现 | ✅ |
| 所有 route 统一 guard | ✅ |
| 所有 route 返回 403 | ✅ |
| 真实 testnet 请求 | ❌ 无 |
| Secret 解密 | ❌ 无 |
| 签名 | ❌ 无 |
| Middleware 修改 | ❌ 无 |

---

## 20. Phase 5.12 — Testnet Idempotency Store Skeleton（已完成）

> **⚠ 幂等层 skeleton 不存储真实 Secret 或订单数据。**
> **不解密 Secret、不签名、不发网络请求。**

### 20.1 新增文件

| 文件 | 说明 |
|------|------|
| `lib/liveAdapters/testnetIdempotencyTypes.ts` | 幂等记录类型 |
| `lib/liveAdapters/testnetIdempotencyStore.ts` | In-memory 幂等存储 |
| `lib/liveAdapters/testnetIdempotencyStore.test.ts` | 22 个测试 |

### 20.2 Store 方法

| 方法 | 说明 |
|------|------|
| `createIdempotencyRecord(input)` | 创建记录；重复 key+route 返回 isDuplicate=true |
| `findIdempotencyRecord(key, route)` | 按 key+route 查找有效记录 |
| `markDuplicateBlocked(id)` | 标记为 `duplicate-blocked` |
| `expireIdempotencyRecord(id)` | 标记为 `expired` |
| `listIdempotencyRecords()` | 列出所有记录（最新优先） |
| `clearIdempotencyRecords()` | 清空所有记录 |
| `buildRequestHash(fields)` | 确定性整数 hash（`sk-hash-` 前缀） |

### 20.3 IdempotencyRecord

| 字段 | 值 |
|------|-----|
| `status` | `recorded-blocked` / `duplicate-blocked` / `expired` |
| `source` | 始终 `testnet-route-skeleton` |
| `responseSnapshot` | 仅 blocked response（无 Secret、无完整订单） |

### 20.4 集成

- `blockedResponse.ts` 新增 `buildGuardedBlockedResponseWithIdempotency`
- 默认 idempotencyKey: `skeleton-disabled`
- 调用 store 但仍返回 403

### 20.5 当前状态

| 事项 | 状态 |
|------|------|
| Idempotency 类型定义 | ✅ |
| In-memory store 实现 | ✅ |
| 集成到 blockedResponse | ✅（仍返回 403） |
| 真实 testnet 请求 | ❌ 无 |
| Secret 解密 | ❌ 无 |
| 签名 | ❌ 无 |
| Middleware 修改 | ❌ 无 |

---

## 21. Phase 5.13 — Testnet Rate Limit Store Skeleton（已完成）

> **⚠ 限流 skeleton 不存储真实 Secret 或订单数据。**
> **不解密 Secret、不签名、不发网络请求。**

### 21.1 新增文件

| 文件 | 说明 |
|------|------|
| `lib/liveAdapters/testnetRateLimitTypes.ts` | 限流类型 |
| `lib/liveAdapters/testnetRateLimitStore.ts` | In-memory 限流存储 |
| `lib/liveAdapters/testnetRateLimitStore.test.ts` | 24 个测试 |

### 21.2 默认限流策略

| 范围 | 最大请求 | 窗口 |
|------|---------|------|
| Exchange | 10 req | 1s |
| Route | 30 req | 60s |
| Session | 60 req | 60s |

### 21.3 Store 方法

| 方法 | 说明 |
|------|------|
| `getDefaultRateLimitPolicies()` | 返回默认策略配置 |
| `buildRateLimitKey(scope, route, exchange, sessionId?)` | 生成 scope key |
| `checkRateLimit(input)` | 检查是否超限（不计数） |
| `incrementRateLimit(input)` | 计数并返回结果 |
| `resetRateLimit(scopeKey)` | 重置指定 scope 计数 |
| `listRateLimitRecords()` | 列出所有记录 |
| `clearRateLimitRecords()` | 清空所有记录 |

### 21.4 集成

- `blockedResponse.ts` 新增 `buildGuardedBlockedResponseWithRateLimit`
- 调用 guard + 幂等 + 限流（check + increment）
- 响应体包含 `rateLimit` 数组（3 个 scope 的当前计数和限制）
- 仍返回 403

### 21.5 当前状态

| 事项 | 状态 |
|------|------|
| Rate Limit 类型定义 | ✅ |
| In-memory store 实现 | ✅ |
| 集成到 blockedResponse | ✅（仍返回 403） |
| 真实 testnet 请求 | ❌ 无 |
| Secret 解密 | ❌ 无 |
| 签名 | ❌ 无 |
| Middleware 修改 | ❌ 无 |

---

## 22. Phase 5.14 — Testnet Audit Server Event Skeleton（已完成）

> **⚠ 审计 skeleton 不存储真实 Secret、API Key 或交易数据。**
> **不解密 Secret、不签名、不发网络请求。**

### 22.1 新增文件

| 文件 | 说明 |
|------|------|
| `lib/liveAdapters/testnetAuditTypes.ts` | 审计事件类型 |
| `lib/liveAdapters/testnetAuditStore.ts` | In-memory 审计存储 |
| `lib/liveAdapters/testnetAuditStore.test.ts` | 20 个测试 |

### 22.2 审计事件类型

| 事件 | 触发条件 | severity |
|------|---------|---------|
| `route_request_received` | 请求到达 skeleton | info |
| `route_skeleton_blocked` | skeleton 返回 403 | blocked |
| `route_rate_limited` | 任意 scope 超限 | warning |
| `route_duplicate_blocked` | 幂等检测到重复 | warning |

### 22.3 Store 方法

| 方法 | 说明 |
|------|------|
| `createTestnetAuditEvent(input)` | 创建审计事件 |
| `listTestnetAuditEvents()` | 列出所有事件（最新优先） |
| `filterTestnetAuditEvents(filters)` | 按 routeName/eventType/severity 过滤 |
| `countTestnetAuditEventsByType()` | 按类型统计 |
| `clearTestnetAuditEvents()` | 清空所有事件 |
| `buildTestnetRequestId(route, exchange)` | 生成 `sk-audit-{route}-{exchange}-{ts}-{seq}` |

### 22.4 集成

- `buildGuardedBlockedResponseWithRateLimit` 在每个请求周期创建 2-4 个审计事件
- 顺序：`route_request_received` → (可选 `route_rate_limited`) → (可选 `route_duplicate_blocked`) → `route_skeleton_blocked`
- 仍返回 403

### 22.5 当前状态

| 事项 | 状态 |
|------|------|
| 审计类型定义 | ✅ |
| In-memory store 实现 | ✅ |
| 集成到 blockedResponse | ✅（仍返回 403） |
| 真实 testnet 请求 | ❌ 无 |
| Secret 解密 | ❌ 无 |
| 签名 | ❌ 无 |
| Middleware 修改 | ❌ 无 |

---

## 23. Phase 5.15 — Testnet Route Skeleton Closure（已完成）

> **⚠ 收口验收文档确认所有 skeleton 模块已完成。**
> **所有 route 仍返回 403 blocked。无真实请求、无签名、无解密。**

### 23.1 新增文件

| 文件 | 说明 |
|------|------|
| `docs/PHASE_5_TESTNET_ROUTE_SKELETON_CLOSURE.md` | 收口验收文档 |
| `tests/phase5TestnetRouteSkeletonClosure.test.ts` | 54 个边界测试 |

### 23.2 Skeleton 链路

```
request → shared blockedResponse → guard → idempotency → rate limit → audit → 403
```

### 23.3 收口模块汇总

| 模块 | Phase | 状态 |
|------|-------|------|
| Route Handler Skeleton | 5.9 | ✅ |
| Security Guard | 5.10 | ✅ |
| Guard Integration | 5.11 | ✅ |
| Idempotency Store | 5.12 | ✅ |
| Rate Limit Store | 5.13 | ✅ |
| Audit Store | 5.14 | ✅ |
| Closure & Boundary | 5.15 | ✅ |

### 23.4 边界证明

| 边界 | 状态 | 证据 |
|------|------|------|
| No-Real-Testnet | ✅ | 所有 route 返回 403，无 fetch/axios |
| No-Signing | ✅ | 无 createHmac/crypto.subtle.sign |
| No-Secret-Decryption | ✅ | 无 decryptSecret/importMasterKey |
| No-Middleware-Whitelist | ✅ | middleware.ts 不含 /api/testnet |
| 不存储 Secret/API Key | ✅ | Store 仅存 primitives |

### 23.5 当前状态

| 事项 | 状态 |
|------|------|
| Closure 文档 | ✅ |
| 边界测试 | ✅（54 个） |
| 真实 testnet 请求 | ❌ 无 |
| Secret 解密 | ❌ 无 |
| 签名 | ❌ 无 |
| Middleware 修改 | ❌ 无 |

---

## 24. Phase 5.16 — Testnet Environment Config Design（已完成）

> **⚠ 环境配置设计层不读取 Secret，不解密，不启用真实 testnet。**

### 24.1 新增文件

| 文件 | 说明 |
|------|------|
| `lib/liveAdapters/testnetEnvTypes.ts` | 环境配置类型 |
| `lib/liveAdapters/testnetEnvConfig.ts` | 默认值 + 解析 + 验证纯函数 |
| `lib/liveAdapters/testnetEnvConfig.test.ts` | 26 个测试 |

### 24.2 默认配置

| 字段 | 默认值 | 说明 |
|------|--------|------|
| `exchangeEnv` | `"disabled"` | 运行模式 |
| `liveTradingEnabled` | `false` | 真实交易开关 |
| `allowMainnetTrading` | `false` | 主网交易开关 |
| `testnetRoutesEnabled` | `false` | Testnet route 访问开关 |
| `testnetOrderSubmitEnabled` | `false` | Testnet 下单开关 |

### 24.3 validate 规则

| 条件 | 结果 |
|------|------|
| `allowMainnetTrading=true` | ❌ invalid |
| `liveTradingEnabled=true` | ❌ invalid |
| `testnetOrderSubmitEnabled=true` | ❌ invalid (Phase 5.16) |
| `testnetRoutesEnabled=true` | ⚠️ warning（允许 skeleton 测试） |
| 全部默认 false | ✅ valid |

### 24.4 当前状态

| 事项 | 状态 |
|------|------|
| 类型定义 | ✅ |
| 解析/验证纯函数 | ✅ |
| 真实 testnet 请求 | ❌ 无 |
| Secret 解密 | ❌ 无 |
| 签名 | ❌ 无 |
| Middleware 修改 | ❌ 无 |

---

## 25. Phase 5.17 — Testnet Route Env Integration Skeleton（已完成）

> **⚠ env config 已接入 blockedResponse，但 route 仍返回 403 blocked。**

### 25.1 修改文件

| 文件 | 说明 |
|------|------|
| `app/api/testnet/_shared/blockedResponse.ts` | 集成 env config 解析和校验 |

### 25.2 行为

- `buildGuardedBlockedResponseWithRateLimit` 读取 `process.env` 的 5 个字段
- 调用 `parseTestnetEnvConfig` + `validateTestnetEnvConfig`
- 响应体新增 `env` 字段：`exchangeEnv`, `testnetRoutesEnabled`, `testnetOrderSubmitEnabled`, `valid`, `warnings`, `errors`
- 即使 `env.valid=true`，仍返回 403
- 不读取 Secret、不解密、不签名

### 25.3 当前状态

| 事项 | 状态 |
|------|------|
| Env config 集成到 blockedResponse | ✅ |
| 响应体包含 env metadata | ✅ |
| 所有 route 返回 403 | ✅ |
| 真实 testnet 请求 | ❌ 无 |
| Secret 解密 | ❌ 无 |
| 签名 | ❌ 无 |
| Middleware 修改 | ❌ 无 |

---

## 26. Phase 5.18 — Testnet Secret Access Policy Design（Policy Only）

> **⚠ 纯策略设计 — 不读取、不解密、不签名任何 Secret。**

### 26.1 新增文件

| 文件 | 说明 |
|------|------|
| `lib/liveAdapters/testnetSecretPolicyTypes.ts` | 策略类型 |
| `lib/liveAdapters/testnetSecretPolicy.ts` | 策略评估纯函数 |
| `lib/liveAdapters/testnetSecretPolicy.test.ts` | 12 个测试 |

### 26.2 策略规则

| # | 条件 | reasonCode |
|---|------|-----------|
| 1 | `envValidation.valid !== true` | ENV_VALIDATION_FAILED |
| 2 | `exchangeEnv !== "testnet"` | EXCHANGE_ENV_NOT_TESTNET |
| 3 | `testnetRoutesEnabled !== true` | TESTNET_ROUTES_DISABLED |
| 4 | `testnetOrderSubmitEnabled === true` | ORDER_SUBMIT_ENABLED_IN_PHASE_5_18 |
| 5 | `guardResult.allowed !== true` | GUARD_REJECTED |
| 6 | 全部通过 | PHASE_5_18_SECRET_ACCESS_BLOCKED |

### 26.3 集成

- `blockedResponse.ts` 调用 `evaluateTestnetSecretAccessPolicy`
- 响应体新增 `secretPolicy` 字段：`{ allowedToRequestSecret, severity, reasonCodes, source }`
- `source` 始终 `testnet-secret-policy-skeleton`

### 26.4 当前状态

| 事项 | 状态 |
|------|------|
| 策略类型定义 | ✅ |
| 策略评估纯函数 | ✅ |
| 集成到 blockedResponse | ✅（仍返回 403） |
| 真实 Secret 访问 | ❌ 无 |
| Secret 解密 | ❌ 无 |
| 签名 | ❌ 无 |
| Middleware 修改 | ❌ 无 |

---

## 27. Phase 5.19 — Testnet Permission Check Skeleton（已完成）

> **⚠ 权限检查 skeleton 不连接交易所，不读取 API Key，不解密 Secret。**

### 27.1 新增文件

| 文件 | 说明 |
|------|------|
| `lib/liveAdapters/testnetPermissionTypes.ts` | 权限检查类型 |
| `lib/liveAdapters/testnetPermissionCheck.ts` | 权限检查纯函数 |
| `lib/liveAdapters/testnetPermissionCheck.test.ts` | 13 个测试 |

### 27.2 规则

- `secretPolicy.allowedToRequestSecret !== true` → blocked
- 默认所有权限 false：`canRead=false`, `canTrade=false`, `canWithdraw=false`, `ipWhitelistPresent=false`
- `canWithdraw=true` → 始终 blocked
- `ipWhitelistPresent=false` → 始终 blocked
- Phase 5.19: 始终 `PHASE_5_19_PERMISSION_CHECK_DISABLED`

### 27.3 集成

- `blockedResponse.ts` 调用 `evaluateTestnetPermissionCheck`
- 响应体新增 `permission` 字段：`{ allowed, canRead, canTrade, canWithdraw, ipWhitelistPresent, source }`

### 27.4 当前状态

| 事项 | 状态 |
|------|------|
| 权限类型定义 | ✅ |
| 权限检查纯函数 | ✅ |
| 集成到 blockedResponse | ✅（仍返回 403） |
| 真实 API Key 检测 | ❌ 无 |
| Secret 解密 | ❌ 无 |
| 签名 | ❌ 无 |
| Middleware 修改 | ❌ 无 |

---

## 28. Phase 5.20 — Testnet Request Validation Skeleton（已完成）

> **⚠ 请求校验 skeleton 不提交订单、不签名、不解密。**

### 28.1 新增文件

| 文件 | 说明 |
|------|------|
| `lib/liveAdapters/testnetRequestValidationTypes.ts` | 校验类型 |
| `lib/liveAdapters/testnetRequestValidation.ts` | 校验纯函数 |
| `lib/liveAdapters/testnetRequestValidation.test.ts` | 26 个测试 |

### 28.2 校验规则

| 条件 | reasonCode |
|------|-----------|
| payload 缺失 | PAYLOAD_MISSING |
| exchangeId 缺失 | EXCHANGE_ID_MISSING |
| exchangeId 不支持 | INVALID_EXCHANGE_ID |
| symbol 缺失 | SYMBOL_MISSING |
| side 无效 | INVALID_SIDE |
| orderType 无效 | INVALID_ORDER_TYPE |
| quantity ≤ 0 | INVALID_QUANTITY |
| Limit 无 price | LIMIT_PRICE_REQUIRED |
| cancel/status 无 orderId | ORDER_ID_MISSING |
| 含敏感字段（secret/apiSecret/secretKey/password/privateKey） | SENSITIVE_FIELDS_DETECTED + 自动移除 |

### 28.3 集成

- `blockedResponse.ts` 调用 `evaluateTestnetRequestValidation`
- 响应体新增 `validation` 字段
- 仍返回 403

### 28.4 当前状态

| 事项 | 状态 |
|------|------|
| 校验类型定义 | ✅ |
| 校验纯函数 | ✅ |
| 集成到 blockedResponse | ✅（仍返回 403） |
| 真实请求提交 | ❌ 无 |
| Secret 解密 | ❌ 无 |
| 签名 | ❌ 无 |
| Middleware 修改 | ❌ 无 |
