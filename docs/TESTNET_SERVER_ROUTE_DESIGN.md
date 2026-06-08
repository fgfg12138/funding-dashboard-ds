# Testnet Server Route Design

> **Phase 5.8 — Design Only**
> **No route implementation in Phase 5.8.**
> **No middleware changes.**
> **No real network requests.**
> **No secret decryption.**
> **No signing.**

---

## 1. 为什么 Testnet Route 必须 Server-Side

| 原因 | 说明 |
|------|------|
| Secret 保护 | API Secret 只能在 server 端解密，永远不能进入 client component |
| 签名安全 | 订单签名使用解密后的 Secret，必须在 server 完成 |
| 审计日志 | 所有下单/撤单请求必须经过 server 端审计记录 |
| Rate Limit | 真实限流需 server 端维护 per-user/per-exchange 计数器 |
| 安全关卡 | Kill Switch / Risk Gate / IP 白名单检查只能在 server 端执行 |

> **Client Component 永远不能拥有解密后的 API Secret。**
> **所有 testnet 下单请求必须由 server route handler 代理。**

## 2. 为什么 Secret 不能进入 Client Component

1. **浏览器不安全** — JS bundle 被加载后，任何 Secret 都会被浏览器 DevTools / 扩展窃取
2. **构建产物泄露** — Secret 如果通过 `NEXT_PUBLIC_*` 注入，会被打包到静态 JS 中
3. **XSS 风险** — 恶意脚本读取 `localStorage` 或内存中的 Secret
4. **签名不可审计** — 前端签名无法被 server 端 audit

> **唯一正确做法：Client → Server Route (加密 Session) → Exchange Testnet API**

## 3. Future Route Design

以下 route 是未来实现的目标，**Phase 5.8 只设计不实现**。

### 3.1 `POST /api/testnet/orders/preview-submit`

预览并提交 testnet 订单。

**Request:**

```typescript
{
  exchangeId: "binance",
  symbol: "BTCUSDT",
  side: "Buy" | "Sell",
  orderType: "Market" | "Limit",
  quantity: number,
  price?: number,
  timeInForce?: "GTC" | "IOC" | "FOK",
  reduceOnly?: boolean,
  idempotencyKey: string,       // UUID, de-duplication
  clientOrderId: string,        // User-defined order ID
}
```

**Response (Success):**

```typescript
{
  success: true,
  data: {
    orderId: string,
    clientOrderId: string,
    status: "new" | "partially_filled" | "filled",
    symbol: string,
    side: "Buy" | "Sell",
    orderType: "Market" | "Limit",
    price: number,
    quantity: number,
    filledQuantity: number,
    submittedAt: number,
  },
  auditId: string,
}
```

**Response (Blocked):**

```typescript
{
  success: false,
  error: {
    code: "exchange-env-invalid" | "live-trading-enabled" | "mainnet-allowed" | ...,
    message: string,
  },
  auditId: string,
}
```

### 3.2 `POST /api/testnet/orders/cancel`

取消 testnet 订单。

**Request:**

```typescript
{
  exchangeId: "binance",
  orderId: string,
  idempotencyKey: string,
  clientOrderId: string,
}
```

**Response:**

```typescript
{
  success: true,
  data: {
    orderId: string,
    cancelled: boolean,
  },
  auditId: string,
}
```

### 3.3 `GET /api/testnet/orders/:id`

查询 testnet 订单状态。

**Request (Query):**

```
/api/testnet/orders/:id?exchangeId=binance
```

**Response:**

```typescript
{
  success: true,
  data: {
    orderId: string,
    exchangeId: string,
    clientOrderId: string,
    symbol: string,
    side: "Buy" | "Sell",
    orderType: "Market" | "Limit",
    price: number,
    quantity: number,
    filledQuantity: number,
    status: string,
    submittedAt: number,
    filledAt?: number,
    cancelledAt?: number,
    errorMessage?: string,
  },
  auditId: string,
}
```

### 3.4 `GET /api/testnet/account/snapshot`

查询 testnet 账户快照。

**Request (Query):**

```
/api/testnet/account/snapshot?exchangeId=binance
```

**Response:**

```typescript
{
  success: true,
  data: {
    exchangeId: string,
    balances: [
      { asset: "BTC", walletBalance: 0.1, availableBalance: 0.1 },
    ],
    updatedAt: number,
  },
  auditId: string,
}
```

## 4. Route Handler 安全检查清单

每个 route handler 必须在执行前检查以下全部条目：

| # | 检查项 | 失败操作 |
|---|--------|---------|
| 1 | `EXCHANGE_ENV === "testnet"` | 返回 `exchange-env-invalid` |
| 2 | `LIVE_TRADING_ENABLED === false` (或 testnet-only flag) | 返回 `live-trading-enabled` |
| 3 | `ALLOW_MAINNET_TRADING === false` | 返回 `mainnet-allowed` |
| 4 | Kill Switch 未触发 | 返回 `kill-switch-active` |
| 5 | API Key 已验证存在 | 返回 `api-key-not-verified` |
| 6 | withdraw 权限已禁用 | 返回 `withdraw-not-disabled` |
| 7 | IP 白名单存在且非空 | 返回 `ip-whitelist-missing` |
| 8 | Risk Gate 检查通过 | 返回 `risk-gate-blocked` |
| 9 | 用户确认已存在 | 返回 `confirmation-missing` |
| 10 | 队列项未过期 | 返回 `queue-expired` |

> **安全检查失败时，必须记录 audit 事件 `route_request_blocked`。**

## 5. Idempotency 策略

| 字段 | 说明 |
|------|------|
| `idempotencyKey` | 客户端生成的 UUID，每个请求唯一 |
| `clientOrderId` | 客户端定义订单 ID，对同一个订单保持不变 |
| `dedupWindowSeconds` | 在此窗口内的重复请求返回原结果（默认 300s） |

**重复请求处理流程：**

```
1. 收到请求 → 提取 idempotencyKey
2. 查询 dedup cache (Redis / in-memory) → 是否存在此 key?
   └─ 存在 → 返回原始 response，不提交交易所
   └─ 不存在 → 继续处理
3. 处理完成后 → 将 idempotencyKey + response 写入 dedup cache (TTL=dedupWindowSeconds)
```

## 6. Rate Limit 策略

| 范围 | 限制 | 窗口 |
|------|------|------|
| Per Exchange | 按交易所限频（Binance Testnet: 10 req/s） | 1 秒 |
| Per Route | 每个 route 独立计数器（如 /orders 30 req/min） | 1 分钟 |
| Per Session | 每个用户 session 总限频 | 1 分钟 |

**Rate Limit 超出时：**

- 返回 `rate-limit-exceeded`
- 记录 audit 事件 `route_request_blocked`
- 在 Response Header 中携带 `Retry-After`

## 7. Audit 事件

| 事件类型 | 触发时机 | 包含信息 |
|---------|---------|---------|
| `route_request_received` | 每次请求到达 route handler | routeName, exchangeId, timestamp, requestId |
| `route_request_blocked` | 安全检查/Rate Limit/Idempotency 拦截 | 同上 + errorCode |
| `route_testnet_order_submitted` | 订单成功提交到交易所 testnet | 同上 + orderId |
| `route_testnet_order_failed` | 订单提交失败或被交易所拒绝 | 同上 + errorMessage |

## 8. Failure Handling

| 故障模式 | 说明 | 可重试 | 需要 Reconciliation |
|---------|------|--------|-------------------|
| Timeout | 交易所请求超时 | ✅ | ✅ |
| Partial Fill | 部分成交后状态不一致 | ❌ | ✅ |
| Rejected by Exchange | 交易所明确拒绝（余额不足/参数错误） | ❌ | ❌ |
| Inconsistent Status | 查询状态与预期不符（如 submitted 但实际不存在） | ❌ | ✅ |

**Timeout 处理：**

```
1. 请求交易所超时 (5s 默认)
2. 记录 audit: route_testnet_order_failed (timeout)
3. 返回 503 给客户端
4. 启动 reconciliation 流程：定时查询该订单状态
```

**Partial Fill 处理：**

```
1. 收到部分成交结果
2. 记录 audit: route_testnet_order_submitted (partial)
3. 返回带 filledQuantity 的 response
4. 启动 reconciliation：确认剩余数量状态
```

## 9. Phase 5.8–5.9 禁止事项

| 事项 | 说明 |
|------|------|
| ✗ 不修改 middleware | `middleware.ts` 白名单不变 |
| ✗ 不解密 Secret | 无 `decryptSecret` / `importMasterKey` |
| ✗ 不签名 | 无 `createHmac` / `crypto.subtle.sign` |
| ✗ 不 fetch | 无任何 HTTP 请求实现 |
| ✗ 不真实下单 | 无真实 exchange API 调用 |

## 10. 当前状态

### Phase 5.9 ✅ — Testnet Route Handler Skeleton（已完成）

| Route | 方法 | 状态 | 返回 |
|-------|------|------|------|
| `/api/testnet/orders/preview-submit` | POST | ✅ Skeleton | 403, `exchange-env-invalid` |
| `/api/testnet/orders/cancel` | POST | ✅ Skeleton | 403, `exchange-env-invalid` |
| `/api/testnet/orders/[id]` | GET | ✅ Skeleton | 403, `exchange-env-invalid` |
| `/api/testnet/account/snapshot` | GET | ✅ Skeleton | 403, `exchange-env-invalid` |

所有 route handler **不连接交易所、不解密 Secret、不签名、不发网络请求**。

### Phase 5.10 ✅ — Testnet Route Security Guard Skeleton（已完成）

#### 新增文件
| 文件 | 说明 |
|------|------|
| `lib/liveAdapters/testnetRouteSecurityGuard.ts` | 安全检查纯函数 |
| `lib/liveAdapters/testnetRouteSecurityGuard.test.ts` | 17 个测试 |

#### Security Guard 行为
- 输入：`TestnetRouteSecurityGuardInput`（checklist + routeName + exchangeId + phase）
- 输出：`TestnetRouteSecurityGuardResult`（allowed + severity + reasonCodes）
- 10 项检查全部失败时返回对应 errorCode
- 全部通过时仍返回 `PHASE_5_10_SKELETON_BLOCK` blocked
- `source` 始终 `testnet-route-skeleton`
- 纯函数，无网络请求、无解密、无签名

#### 集成
- `POST /api/testnet/orders/preview-submit` 调用 guard 但仍返回 403

### Phase 5.11 ✅ — Testnet Route Guard Integration（已完成）

#### 新增文件
| 文件 | 说明 |
|------|------|
| `app/api/testnet/_shared/blockedResponse.ts` | 共享 helper（3 个函数） |
| `tests/phase5TestnetRouteGuardIntegration.test.ts` | 集成测试 |

#### Shared Helper
| 函数 | 说明 |
|------|------|
| `buildDefaultSkeletonChecklist()` | 返回全部 false 的 checklist |
| `buildBlockedTestnetResponse(routeName, exchangeId?)` | 简单 403 阻塞响应 |
| `buildGuardedBlockedResponse(routeName, exchangeId?)` | 调用 guard + 返回 403 |

#### 集成效果
| Route | 方法 | 行为 |
|-------|------|------|
| `/api/testnet/orders/preview-submit` | POST | 调用 guard → 403 |
| `/api/testnet/orders/cancel` | POST | 调用 guard → 403 |
| `/api/testnet/orders/[id]` | GET | 调用 guard → 403 |
| `/api/testnet/account/snapshot` | GET | 调用 guard → 403 |

#### 当前状态
- 所有 route 统一 guard 调用
- 所有 route 仍返回 403 blocked
- 无 Secret 解密、无签名、无网络请求

### Phase 5.12 ✅ — Testnet Idempotency Store Skeleton（已完成）

#### 新增文件
| 文件 | 说明 |
|------|------|
| `lib/liveAdapters/testnetIdempotencyTypes.ts` | 幂等记录类型 |
| `lib/liveAdapters/testnetIdempotencyStore.ts` | In-memory 幂等存储 |
| `lib/liveAdapters/testnetIdempotencyStore.test.ts` | 22 个测试 |

#### Store 方法
- `createIdempotencyRecord` — 创建记录，重复 key+route 返回 duplicate
- `findIdempotencyRecord` — 按 key+route 查找有效记录
- `markDuplicateBlocked` / `expireIdempotencyRecord` — 状态变更
- `buildRequestHash` — 确定性 hash（非 crypto）
- 所有记录 `source: "testnet-route-skeleton"`

#### 集成
- `buildGuardedBlockedResponseWithIdempotency` 调用 store 但仍返回 403
- 默认 idempotencyKey: `skeleton-disabled`

### Phase 5.13 ✅ — Testnet Rate Limit Store Skeleton（已完成）

#### 新增文件
| 文件 | 说明 |
|------|------|
| `lib/liveAdapters/testnetRateLimitTypes.ts` | 限流类型 |
| `lib/liveAdapters/testnetRateLimitStore.ts` | In-memory 限流存储 |
| `lib/liveAdapters/testnetRateLimitStore.test.ts` | 24 个测试 |

#### 默认策略
| 范围 | maxRequests | windowSeconds |
|------|------------|---------------|
| exchange | 10 | 1s |
| route | 30 | 60s |
| session | 60 | 60s |

#### Store 方法
- `getDefaultRateLimitPolicies()` — 返回默认策略
- `buildRateLimitKey(scope, route, exchange, sessionId?)` — scope key
- `checkRateLimit(input)` — 检查不计数
- `incrementRateLimit(input)` — 计数并返回结果
- `resetRateLimit(scopeKey)` — 重置计数
- `listRateLimitRecords()` / `clearRateLimitRecords()`

#### 集成
- `buildGuardedBlockedResponseWithRateLimit` 调用 guard + 幂等 + 限流，仍返回 403
- 响应体包含 `rateLimit` 元数据

### Phase 5.14 ✅ — Testnet Audit Server Event Skeleton（已完成）

#### 新增文件
| 文件 | 说明 |
|------|------|
| `lib/liveAdapters/testnetAuditTypes.ts` | 审计事件类型 |
| `lib/liveAdapters/testnetAuditStore.ts` | In-memory 审计存储 |
| `lib/liveAdapters/testnetAuditStore.test.ts` | 20 个测试 |

#### 事件类型
- `route_request_received` — 每次请求到达
- `route_skeleton_blocked` — skeleton 返回 403
- `route_rate_limited` — 限流命中
- `route_duplicate_blocked` — 幂等重复

#### Store 方法
- `createTestnetAuditEvent` / `listTestnetAuditEvents` / `filterTestnetAuditEvents`
- `countTestnetAuditEventsByType` / `clearTestnetAuditEvents`
- `buildTestnetRequestId` — 生成 `sk-audit-{route}-{exchange}-{ts}-{seq}`

#### 集成
- `buildGuardedBlockedResponseWithRateLimit` 在每个请求周期中创建 2-4 个审计事件
- 仍返回 403

### Phase 5.15 ✅ — Testnet Route Skeleton Closure（已完成）

#### 新增文件
| 文件 | 说明 |
|------|------|
| `docs/PHASE_5_TESTNET_ROUTE_SKELETON_CLOSURE.md` | 收口验收文档 |
| `tests/phase5TestnetRouteSkeletonClosure.test.ts` | 54 个边界测试 |

#### Closure 验证结果
- 所有 4 个 route 文件存在并引用 shared helper
- 无 fetch/axios/decryptSecret/HMAC/adapter/apiKeyStore
- Shared helper 从不返回 `success:true`
- Middleware 白名单不含 `/api/testnet`
- 各 Store 不存储 Secret/API Key
- 文档声明 no-real-testnet / no-signing / no-secret-decryption

### Phase 5.16 ✅ — Testnet Environment Config Design（已完成）

#### 新增文件
| 文件 | 说明 |
|------|------|
| `lib/liveAdapters/testnetEnvTypes.ts` | 环境配置类型 |
| `lib/liveAdapters/testnetEnvConfig.ts` | 默认值 + 解析 + 验证 |
| `lib/liveAdapters/testnetEnvConfig.test.ts` | 26 个测试 |

#### 默认配置（全部 disabled）
- `EXCHANGE_ENV="disabled"`, `LIVE_TRADING_ENABLED=false`
- `ALLOW_MAINNET_TRADING=false`, `TESTNET_ROUTES_ENABLED=false`
- `TESTNET_ORDER_SUBMIT_ENABLED=false`

#### validate 规则
- `allowMainnetTrading=true` → invalid
- `liveTradingEnabled=true` → invalid
- `testnetOrderSubmitEnabled=true` → invalid (Phase 5.16)
- `testnetRoutesEnabled=true` → warning only
- 纯函数，无 Secret 读取/解密/签名/网络请求

### Phase 5.17 ✅ — Testnet Route Env Integration Skeleton（已完成）

#### 修改文件
- `app/api/testnet/_shared/blockedResponse.ts` — 集成 env config 解析和校验

#### 行为
- `buildGuardedBlockedResponseWithRateLimit` 读取 `process.env` 并调用 `parseTestnetEnvConfig` + `validateTestnetEnvConfig`
- 响应体新增 `env` 字段（exchangeEnv, valid, warnings, errors）
- 即使 `env.valid=true`，仍返回 403
- 不读取 Secret、不解密、不签名

### Phase 5.18 ✅ — Testnet Secret Access Policy Design（Policy Only）

#### 新增文件
| 文件 | 说明 |
|------|------|
| `lib/liveAdapters/testnetSecretPolicyTypes.ts` | 策略类型 |
| `lib/liveAdapters/testnetSecretPolicy.ts` | 策略评估纯函数 |
| `lib/liveAdapters/testnetSecretPolicy.test.ts` | 12 个测试 |

#### 策略规则（6 项）
1. `envValidation.valid !== true` → blocked
2. `exchangeEnv !== "testnet"` → blocked
3. `testnetRoutesEnabled !== true` → blocked
4. `testnetOrderSubmitEnabled === true` → blocked
5. `guardResult.allowed !== true` → blocked
6. 全部通过 → `PHASE_5_18_SECRET_ACCESS_BLOCKED`

#### 集成
- `blockedResponse.ts` 调用 `evaluateTestnetSecretAccessPolicy`
- 响应体新增 `secretPolicy` 字段
- 绝不解密/签名

### Phase 5.19 ✅ — Testnet Permission Check Skeleton（已完成）

#### 新增文件
| 文件 | 说明 |
|------|------|
| `lib/liveAdapters/testnetPermissionTypes.ts` | 权限检查类型 |
| `lib/liveAdapters/testnetPermissionCheck.ts` | 权限检查纯函数 |
| `lib/liveAdapters/testnetPermissionCheck.test.ts` | 13 个测试 |

#### 规则
- `secretPolicy.allowedToRequestSecret !== true` → blocked
- 默认 `canRead=false`, `canTrade=false`, `canWithdraw=false`, `ipWhitelistPresent=false`
- `canWithdraw=true` → 始终 blocked
- `ipWhitelistPresent=false` → 始终 blocked
- Phase 5.19: 始终 `PHASE_5_19_PERMISSION_CHECK_DISABLED`

#### 集成
- `blockedResponse.ts` 调用 `evaluateTestnetPermissionCheck`
- 响应体新增 `permission` 字段

### Phase 5.20 ✅ — Testnet Request Validation Skeleton（已完成）

#### 新增文件
| 文件 | 说明 |
|------|------|
| `lib/liveAdapters/testnetRequestValidationTypes.ts` | 校验类型 |
| `lib/liveAdapters/testnetRequestValidation.ts` | 校验纯函数 |
| `lib/liveAdapters/testnetRequestValidation.test.ts` | 26 个测试 |

#### 校验规则
- payload/exchangeId 缺失 → blocked
- exchangeId 仅允许 binance/okx/bybit
- submit: symbol, side, orderType, quantity > 0 检查
- Limit order 需要 price > 0
- cancel/status 需要 orderId
- 敏感字段（secret, apiSecret, password 等）自动检测并移除

#### 集成
- `blockedResponse.ts` 调用 `evaluateTestnetRequestValidation`
- 响应体新增 `validation` 字段

### Phase 5.21+ — 真实 Testnet 集成（阻塞于代码审查）

- API Key 解密（server-side only）
- 订单签名（server-side only）
- 真实 testnet 网络请求
- 完整 audit
- Risk Gate 真实评估
- Reconciliation 定时任务
