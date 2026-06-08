# Server Secret Vault Design

> **Phase 6.2 — Design Only**
> **No secret reading. No decryption. No signing. No real requests.**

---

## 1. 为什么 Secret 不能进入 Client Component

| 风险 | 说明 |
|------|------|
| 浏览器 DevTools | Any JS variable can be inspected |
| Build 产物泄露 | `NEXT_PUBLIC_*` 被打包到静态 JS 中 |
| XSS 攻击 | 恶意脚本读取内存或 localStorage |
| 签名不可审计 | Client 签名无法被 server audit |
| 密钥复用 | Client 泄露后影响 server 安全 |

> **唯一正确做法：Secret 仅在 Server Route Handler 中解密和使用，永远不进入 Client Component。**

---

## 2. Server-Only Secret Boundary

```
Client Component (浏览器)
     │  POST /api/testnet/orders/preview-submit (不含 Secret)
     ▼
Server Route Handler
     │
     ├── Secret Vault (解密 API Key)
     │   └── 仅在 server 进程内
     ├── Request Signing (签名订单)
     │   └── 仅在 server 进程内
     ├── Submit to Exchange Testnet
     └── Audit (不含 Secret)
     │
     ▼
Exchange Testnet API
```

---

## 3. 支持环境

| 环境 | Vault Provider | 说明 |
|------|---------------|------|
| 本地开发 | `disabled` / `mock` | 无真实 Secret 访问 |
| Staging Testnet | `env-encrypted` | 加密环境变量 + server-side 解密 |
| 生产 | `managed-kms` | 托管 KMS 服务 |

---

## 4. 禁止存储

| 禁止行为 | 原因 |
|---------|------|
| Raw secret in localStorage | 持久化泄露风险 |
| Secret in client bundle | 可被提取 |
| Secret in logs | 日志泄露 |
| Secret in audit metadata | 审计日志泄露 |
| Secret in URL params | 请求日志泄露 |
| Secret in error messages | 错误信息泄露 |

---

## 5. Vault Provider 设计

### 5.1 `disabled` (本地开发)

```typescript
{
  provider: "disabled",
  canRead: false,
  canDecrypt: false,
  description: "No secret access — development mode",
}
```

### 5.2 `env-encrypted` (Staging Testnet)

```typescript
{
  provider: "env-encrypted",
  canRead: true,
  canDecrypt: true,
  encryptionMethod: "AES-256-GCM",
  keySource: "environment-variable",
  description: "Encrypted API Key stored in env, decrypted in-memory",
}
```

### 5.3 `managed-kms` (生产)

```typescript
{
  provider: "managed-kms",
  canRead: true,
  canDecrypt: true,
  encryptionMethod: "AES-256-GCM",
  keySource: "kms",
  description: "Managed KMS — key never leaves HSM",
}
```

---

## 6. Secret Access 前置条件

| # | 条件 | 说明 |
|---|------|------|
| 1 | `EXCHANGE_ENV === "testnet"` | 环境必须为 testnet |
| 2 | `TESTNET_ROUTES_ENABLED === true` | Testnet route 已启用 |
| 3 | Secret policy allowed | `testnetSecretPolicy.ts` 通过 |
| 4 | Permission check planned | `testnetPermissionCheck.ts` 通过 |
| 5 | **Audit persistence ready** | 审计持久化已完成 |
| 6 | **Kill Switch disabled** | Kill Switch 未触发 |

> **Phase 6.2 即使全部通过，仍 `allowedToAccessVault=false`。**

---

## 7. Rotation / Revocation

| 操作 | 说明 |
|------|------|
| Key Rotation | 定期更换加密密钥（推荐 90 天） |
| Emergency Revocation | Kill Switch 触发时立即吊销所有 Secret |
| API Key Rotation | 用户可通过 UI 更新 API Key，旧 Key 自动过期 |

---

## 8. Emergency Wipe

| 场景 | 操作 |
|------|------|
| Kill Switch 触发 | 立即清除所有 in-memory 解密 Secret |
| Security breach | 清除所有 vault 内容 + 记录 audit |
| Deployment rollback | 回滚到未启用 vault 的版本 |

---

## 9. 当前阶段限制

| 事项 | 状态 |
|------|------|
| 读取 Secret | ❌ 禁止 |
| 解密 Secret | ❌ 禁止 |
| 签名 | ❌ 禁止 |
| 数据库连接 | ❌ 禁止 |
| Middleware 修改 | ❌ 禁止 |
| Route 返回 success:true | ❌ 禁止 |
| 真实 testnet 请求 | ❌ 禁止 |
