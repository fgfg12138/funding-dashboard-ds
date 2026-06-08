# Phase 5 Testnet Route Skeleton Closure

> **Phase 5.15 — 收口验收**
> **状态：✅ 已完成 — Design-Only Skeleton**
> **下一阶段：BLOCKED — 等待代码审查和明确批准**

---

## 1. 完成模块清单 (Phase 5.9–5.14)

| Phase | 模块 | 文件 | 描述 |
|-------|------|------|------|
| 5.9 | Route Handler Skeleton | `app/api/testnet/*/route.ts` (×4) | 返回 403 blocked |
| 5.10 | Security Guard Skeleton | `lib/liveAdapters/testnetRouteSecurityGuard.ts` | 10 项安全检查纯函数 |
| 5.11 | Guard Integration | `app/api/testnet/_shared/blockedResponse.ts` | 统一 shared helper |
| 5.12 | Idempotency Store | `lib/liveAdapters/testnetIdempotencyStore.ts` | In-memory 幂等记录 |
| 5.13 | Rate Limit Store | `lib/liveAdapters/testnetRateLimitStore.ts` | In-memory 限流计数 |
| 5.14 | Audit Store | `lib/liveAdapters/testnetAuditStore.ts` | In-memory 审计事件 |

---

## 2. 当前 Server-Side Skeleton 链路

```
Client Request
     │
     ▼
┌─────────────────────────────────────────┐
│  /api/testnet/* route handler skeleton  │
│  (app/api/testnet/*/route.ts)           │
└──────────────────┬──────────────────────┘
                   │
                   ▼
┌─────────────────────────────────────────┐
│  buildGuardedBlockedResponseWithRateLimit│
│  (app/api/testnet/_shared/blockedResponse.ts)
└──────────────────┬──────────────────────┘
                   │
     ┌─────────────┼─────────────┐
     ▼             ▼             ▼
┌──────────┐ ┌──────────┐ ┌──────────┐
│  Guard   │ │Idempotency│ │Rate Limit│
│ check 10 │ │  record   │ │ check +  │
│  items   │ │  & dedup  │ │increment │
└────┬─────┘ └────┬─────┘ └────┬─────┘
     │            │            │
     └────────────┼────────────┘
                  ▼
┌─────────────────────────────────────────┐
│  Audit Events (×2-4 per request)        │
│  - route_request_received               │
│  - route_rate_limited (optional)        │
│  - route_duplicate_blocked (optional)   │
│  - route_skeleton_blocked               │
└──────────────────┬──────────────────────┘
                   │
                   ▼
       ╔══════════════════════════╗
       ║  返回 403 blocked        ║
       ║  success: false          ║
       ║  + guard / idempotency / ║
       ║    rateLimit / audit     ║
       ║    metadata              ║
       ╚══════════════════════════╝
```

---

## 3. 当前允许能力

| 能力 | 状态 |
|------|------|
| Route skeleton 返回 403 | ✅ |
| 安全检查纯函数（10 项） | ✅ |
| Idempotency 记录（in-memory） | ✅ |
| Rate limit 计数（in-memory） | ✅ |
| Audit 事件记录（in-memory） | ✅ |
| 统一 shared helper | ✅ |

---

## 4. 当前禁止能力

| 能力 | 状态 | 证明 |
|------|------|------|
| 真实 testnet 网络请求 | ❌ 禁止 | 所有 route 返回 403 |
| 真实下单 | ❌ 禁止 | 所有 route 返回 403 |
| Secret 解密 | ❌ 禁止 | 无 `decryptSecret` / `importMasterKey` 调用 |
| 签名 | ❌ 禁止 | 无 `createHmac` / `crypto.subtle.sign` |
| fetch/axios HTTP 请求 | ❌ 禁止 | 无 `fetch(` / `axios` |
| Middleware 白名单修改 | ❌ 禁止 | `middleware.ts` 无 `/api/testnet` |
| 交易所 SDK 引入 | ❌ 禁止 | 无 binance/bybit/okx SDK import |
| Route 返回 `success:true` | ❌ 禁止 | 全部返回 `success:false` + 403 |
| 存储 Secret 或 API Key | ❌ 禁止 | Store 不存明文凭据 |
| 存储 request body 原文 | ❌ 禁止 | metadata 仅含 primitives |

---

## 5. 边界证明

### No-Real-Testnet 边界
- 所有 4 个 route handler 返回 403
- 不调用 `fetch()` / `axios`
- 不连接任何交易所 API
- 响应体始终 `success: false`

### No-Signing 边界
- `testnetRouteSecurityGuard.ts` 无 `createHmac`
- `testnetIdempotencyStore.ts` 无 `crypto` import
- `testnetRateLimitStore.ts` 无签名逻辑
- `testnetAuditStore.ts` 无签名逻辑
- 所有 route handler 无签名调用

### No-Secret-Decryption 边界
- 无文件包含 `decryptSecret`
- 无文件包含 `importMasterKey`
- 无文件包含 `apiKeyStore`
- Store 不存储明文 Secret

### No-Middleware-Whitelist 边界
- `middleware.ts` allowlist 仅包含 Phase 4 路径
- `/api/testnet` 不在 allowlist 中
- 所有 testnet route 通过 middleware 请求不通过（但返回 403）

---

## 6. 进入真实 Testnet 前置条件

> **以下条件全部满足后方可进入真实 testnet 集成。**

| # | 条件 | 状态 |
|---|------|------|
| 1 | 代码审查通过 | ⏳ 待完成 |
| 2 | 独立 testnet 环境变量设计 (`EXCHANGE_ENV=testnet`) | ⏳ 待完成 |
| 3 | 单交易所真实 testnet adapter 实现 | ⏳ 待完成 |
| 4 | Server-side Secret handling 设计 | ⏳ 待完成 |
| 5 | Testnet-only middleware route 白名单 | ⏳ 待完成 |
| 6 | Fail-safe Kill Switch 自动触发 | ⏳ 待完成 |
| 7 | Testnet rollback plan | ⏳ 待完成 |
| 8 | 限流窗口正确配置 | ⏳ 待完成 |
| 9 | 审计事件可持久化 | ⏳ 待完成 |
| 10 | 合规审查 | ⏳ 待完成 |

---

## 7. 下一阶段提醒

> **⚠ 即使 Phase 5.16 开始真实 testnet 集成，也绝不能直接接主网。**

- 始终以 `EXCHANGE_ENV=testnet` 运行
- 始终 `LIVE_TRADING_ENABLED=false`
- 始终 `ALLOW_MAINNET_TRADING=false`
- 必须部署在隔离环境（staging/testnet 服务器）
- middleware 仅对 `/api/testnet` 开放 testnet 模式
- 主网触发需要额外的 Phase 6+ 安全审查

---

## 8. 测试汇总

### 单元测试

| 模块 | 测试数 | 结果 |
|------|--------|------|
| Route Security Guard | 17 | ✅ |
| Idempotency Store | 22 | ✅ |
| Rate Limit Store | 24 | ✅ |
| Audit Store | 20 | ✅ |
| **Total skeleton** | **83** | ✅ |

### 边界测试

| 测试文件 | 测试数 | 覆盖范围 |
|----------|--------|---------|
| `phase5BinanceSkeletonBoundary.test.ts` | 10 | Binance skeleton no-real-trading |
| `phase5TestnetRouteDesignBoundary.test.ts` | 30 | Route types design-only |
| `phase5TestnetRouteHandlerSkeleton.test.ts` | 20+ | Route files exist + blocked |
| `phase5TestnetRouteGuardIntegration.test.ts` | 25+ | Shared helper integration |
| `phase5TestnetRouteSkeletonClosure.test.ts` | 30+ | Closure boundary verification |
| **Total boundary** | **115+** | ✅ |

### 构建

| 项目 | 结果 |
|------|------|
| `npx vitest run` | ✅ 76/76 test files, 644/644 tests |
| `npx next build` | ✅ Build 成功 |
