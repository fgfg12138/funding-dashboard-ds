# Phase 5 Testnet Preflight Skeleton Closure

> **Phase 5.21 — 收口验收**
> **状态：✅ 已完成 — Preflight Skeleton**
> **下一阶段：Phase 5.22 — BLOCKED — 等待代码审查通过和明确批准**

---

## 1. 完成模块清单 (Phase 5.16–5.20)

| Phase | 模块 | 文件 | 描述 |
|-------|------|------|------|
| 5.16 | Env Config Design | `lib/liveAdapters/testnetEnvTypes.ts` + `testnetEnvConfig.ts` | 默认配置/解析/验证 |
| 5.17 | Env Integration | `app/api/testnet/_shared/blockedResponse.ts` | env 解析接入 response |
| 5.18 | Secret Access Policy | `lib/liveAdapters/testnetSecretPolicy.ts` | Secret 访问前置策略 |
| 5.19 | Permission Check | `lib/liveAdapters/testnetPermissionCheck.ts` | 权限检查骨架 |
| 5.20 | Request Validation | `lib/liveAdapters/testnetRequestValidation.ts` | 请求参数校验 |

---

## 2. 当前完整 Preflight Skeleton 链路

```
request → env → guard → secretPolicy → permissionCheck → validation → idempotency → rateLimit → audit → 403
```

响应体包含：

```typescript
{
  success: false,                              // 始终 false
  error: { code, message },                    // blocked 原因
  env: { exchangeEnv, valid, warnings, errors },
  guard: { allowed, reasonCodes, source },
  secretPolicy: { allowedToRequestSecret, severity, reasonCodes, source },
  permission: { allowed, canRead, canTrade, canWithdraw, ipWhitelistPresent, source },
  validation: { valid, severity, reasonCodes, source },
  idempotency: { isDuplicate, status, recordId },
  rateLimit: [{ allowed, currentCount, maxRequests, retryAfterSeconds }],
  audit: { requestId },
  auditId: string,
}
```

---

## 3. 当前允许能力

| 能力 | 状态 |
|------|------|
| 返回 403 blocked | ✅ |
| Env config 读取与校验 | ✅ |
| Guard 安全检查（10 项） | ✅ |
| Secret 访问策略评估 | ✅ |
| 权限检查结果模拟 | ✅ |
| 请求参数校验（含敏感字段检测） | ✅ |
| Idempotency 记录 | ✅ |
| Rate limit 计数 | ✅ |
| Audit 事件记录 | ✅ |
| 统一 shared helper | ✅ |

---

## 4. 当前禁止能力

| 能力 | 状态 | 证明 |
|------|------|------|
| 真实 testnet 网络请求 | ❌ 禁止 | 所有 route 返回 403 |
| 真实 API Key 权限检测 | ❌ 禁止 | 不调用 exchange API |
| Secret 解密 | ❌ 禁止 | 无 `decryptSecret` / `importMasterKey` |
| Secret 读取 | ❌ 禁止 | 无 `apiKeyStore` 调用 |
| 签名 | ❌ 禁止 | 无 `createHmac` / `crypto.subtle.sign` |
| fetch/axios HTTP 请求 | ❌ 禁止 | 无 `fetch(` / `axios` |
| Middleware 白名单修改 | ❌ 禁止 | `middleware.ts` 无 `/api/testnet` |
| Route 返回 `success:true` | ❌ 禁止 | 全部返回 `success:false` + 403 |

---

## 5. 边界证明

### No-Real-Testnet
- 所有 4 个 route handler 返回 403
- 不调用 `fetch()` / `axios`
- 不连接任何交易所 API
- 响应体始终 `success: false`

### No-Secret-Access
- `testnetSecretPolicy.ts` 不读取 API Key
- `testnetPermissionCheck.ts` 不调用 `apiKeyStore`
- `testnetRequestValidation.ts` 检测并移除敏感字段
- 所有 skeleton 文件无 `decryptSecret` / `importMasterKey`

### No-Secret-Decryption
- 无文件包含 `decryptSecret`
- 无文件包含 `importMasterKey`
- 无文件调用加密解密函数

### No-Signing
- 无文件包含 `createHmac` / `crypto.subtle.sign`
- 无签名逻辑实现

### No-Fetch
- 所有 liveAdapters 文件无 `fetch(`
- 所有 route handler 文件无 `fetch(`
- 所有 shared helper 文件无 `fetch(`

### No-Middleware-Change
- `middleware.ts` allowlist 仅包含 Phase 4 路径
- `/api/testnet` 未加入 middleware mutation allowlist
- POST 类 testnet mutation 请求会被 middleware 拦截
- GET 类请求即使到达 route handler 也只返回 403 blocked

---

## 6. 进入 Phase 5.22 前置条件

> **Phase 5.22 只能做 Code Review Fixes，不允许真实请求。**

| # | 条件 | 状态 |
|---|------|------|
| 1 | 代码审查通过 | ⏳ 待完成 |
| 2 | 修复审查发现的边界问题 | ⏳ Phase 5.22 |
| 3 | 确认所有 route 仍返回 403 | ✅ 已验证 |
| 4 | 确认无真实 testnet 请求 | ✅ 已验证 |
| 5 | 确认无 Secret 解密 | ✅ 已验证 |
| 6 | 确认无签名 | ✅ 已验证 |
| 7 | 确认 middleware 未修改 | ✅ 已验证 |

---

## 7. 下一阶段提醒

> **⚠ Phase 5.22 仅限于代码审查修复。**
> **不允许新增功能、不允许真实 testnet 请求、不允许签名、不允许 Secret 解密。**
> **Phase 5.23+ 才考虑真实 testnet 集成，且绝不能直接接主网。**

---

## 8. 测试汇总

### Preflight 单元测试

| 模块 | 测试数 | 结果 |
|------|--------|------|
| Env Config | 26 | ✅ |
| Secret Policy | 12 | ✅ |
| Permission Check | 13 | ✅ |
| Request Validation | 26 | ✅ |
| Route Handler Skeleton | 20+ | ✅ |
| Guard + Idempotency + RateLimit + Audit | 83 | ✅ |
| **Total** | **180+** | ✅ |

### 边界测试

| 测试文件 | 测试数 | 覆盖 |
|----------|--------|------|
| `phase5TestnetRouteSkeletonClosure.test.ts` | 54 | Phase 5.9–5.15 |
| `phase5TestnetPreflightClosure.test.ts` | 40+ | Phase 5.16–5.21 |
| **Total boundary** | **94+** | ✅ |

### 构建

| 项目 | 结果 |
|------|------|
| `npx vitest run` | ✅ 82/82 test files, 795/795 tests |
| `npx next build` | ✅ Build 成功 |
