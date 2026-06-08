# Real Permission Verification Design

> **Phase 6.3 — Design Only**
> **No exchange API calls. No secret reading. No decryption. No signing.**

---

## 1. 为什么必须真实检测 API Key 权限

| 风险 | 不检测的后果 |
|------|-------------|
| Withdraw 权限未禁用 | 资金可被转移 |
| Trade 权限不足 | 下单被拒，订单状态不一致 |
| Read 权限不存在 | 无法获取账户余额和持仓 |
| IP 白名单未设置 | API Key 可能被滥用 |
| API Key 过期/无效 | 请求全部失败，无明确原因 |

> **在启用真实 testnet 下单前，必须调用交易所权限端点验证 API Key 的实际权限。**

---

## 2. 权限规则

| 权限 | 要求 | 说明 |
|------|------|------|
| Withdraw | **❌ 必须禁用** | Testnet 不允许提现 |
| Trade (Spot / Futures) | **✅ 必须存在** | Testnet 交易需要 trade 权限 |
| Read (Account / Balance) | **✅ 必须存在** | 获取账户数据 |
| IP Whitelist | **✅ 必须设置** | 不允许空白名单 |

---

## 3. 交易所权限差异

### 3.1 Binance Testnet

| 端点 | 说明 |
|------|------|
| `GET /sapi/v1/account/apiRestrictions` | 获取 API Key 权限 |
| `GET /fapi/v1/apiTradingStatus` | 获取交易状态 |
| IP 白名单 | Binance 强制要求 IP 白名单 |

### 3.2 OKX Demo

| 端点 | 说明 |
|------|------|
| `GET /api/v5/account/config` | 获取账户配置 |
| IP 白名单 | OKX 支持 IP 白名单，建议设置 |

### 3.3 Bybit Testnet

| 端点 | 说明 |
|------|------|
| `GET /v5/user/query-api` | 获取 API Key 信息 |
| IP 白名单 | Bybit 支持 IP 白名单，建议设置 |

---

## 4. 权限检测前置条件

| # | 条件 | 说明 |
|---|------|------|
| 1 | Vault policy allowed | Secret Vault 允许访问 |
| 2 | Server-only secret boundary | Secret 仅在 server 端解密 |
| 3 | `EXCHANGE_ENV === "testnet"` | 环境必须为 testnet |
| 4 | `ALLOW_MAINNET_TRADING === false` | 主网禁止 |
| 5 | Audit persistence ready | 审计持久化已完成 |
| 6 | **Kill Switch disabled** | Kill Switch 未触发 |

> **Phase 6.3 即使全部通过，仍 `allowedToVerify=false`。**

---

## 5. 权限检测结果模型

```typescript
{
  exchangeId: string,
  valid: boolean,
  canRead: boolean,
  canTrade: boolean,
  canWithdraw: boolean,
  ipWhitelist: string[],
  hasIpWhitelist: boolean,
  errors: string[],
  checkedAt: number,
  expiresAt: number,   // cache TTL
}
```

---

## 6. 权限缓存和过期策略

| 策略 | 说明 |
|------|------|
| 缓存时间 | 5 分钟（300 秒） |
| 过期行为 | 过期后重新检测 |
| 强制刷新 | Kill Switch 触发时强制刷新 |
| 缓存位置 | Server-side in-memory |
| 缓存大小 | 最多 10 个交易所 Key 的缓存 |

---

## 7. 当前阶段限制

| 事项 | 状态 |
|------|------|
| 真实权限检测请求 | ❌ 禁止 |
| Secret 读取 | ❌ 禁止 |
| Secret 解密 | ❌ 禁止 |
| 签名 | ❌ 禁止 |
| 数据库连接 | ❌ 禁止 |
| Middleware 修改 | ❌ 禁止 |
| Route 返回 success:true | ❌ 禁止 |
