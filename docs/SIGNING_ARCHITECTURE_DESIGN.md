# Signing Architecture Design

> **Phase 6.4 — Design Only**
> **No HMAC implementation. No secret reading. No decryption. No exchange requests.**

---

## 1. 为什么签名必须 Server-Side

| 风险 | 说明 |
|------|------|
| Secret 泄露 | 客户端签名需要明文 API Secret |
| 签名不可审计 | 客户端签名无法被 server 记录 |
| 重放攻击 | 客户端 nonce 不可信 |
| 密钥复用 | 客户端泄露后影响整个账户 |

> **唯一正确做法：签名仅在 Server Route Handler 中完成，Client 只发送请求参数。**

---

## 2. 为什么 Client 永远不能签名

1. 浏览器 DevTools 可以提取任何 JS 变量
2. Build 产物包含 Secret（`NEXT_PUBLIC_*`）
3. XSS 攻击可以读取内存
4. 签名无法被 server 端 audit
5. Nonce 无法保证唯一性

---

## 3. 交易所签名差异

| 交易所 | 算法 | Header | 说明 |
|--------|------|--------|------|
| Binance | HMAC SHA256 | `X-MBX-APIKEY` + `signature` query param | `signature = HMAC-SHA256(query_string, secret)` |
| OKX | HMAC SHA256 | `OK-ACCESS-KEY` + `OK-ACCESS-SIGN` + `OK-ACCESS-TIMESTAMP` + `OK-ACCESS-PASSPHRASE` | `sign = HMAC-SHA256(timestamp + method + requestPath + body, secret)` |
| Bybit | HMAC SHA256 | `X-BAPI-API-KEY` + `X-BAPI-SIGN` + `X-BAPI-TIMESTAMP` + `X-BAPI-RECV-WINDOW` | `sign = HMAC-SHA256(timestamp + apiKey + recvWindow + body, secret)` |

---

## 4. 签名前置条件

| # | 条件 | 说明 |
|---|------|------|
| 1 | Vault access allowed | Secret Vault 允许访问 |
| 2 | Real permission verification passed | 权限检测通过 |
| 3 | `EXCHANGE_ENV === "testnet"` | 环境必须为 testnet |
| 4 | `ALLOW_MAINNET_TRADING === false` | 主网禁止 |
| 5 | Kill switch disabled | Kill Switch 未触发 |
| 6 | Audit persistence ready | 审计持久化已完成 |
| 7 | Request validation passed | 请求参数校验通过 |
| 8 | Idempotency checked | 幂等性已确认 |

> **Phase 6.4 即使全部通过，仍 `allowedToSign=false`。**

---

## 5. 签名输入/输出设计

```typescript
// Input
{
  exchangeId: "binance" | "okx" | "bybit";
  method: "GET" | "POST";
  requestPath: string;
  queryString?: string;
  body?: string;
  timestamp: number;
  apiSecret: string;  // 仅在 server 内存中
}

// Output
{
  signature: string;  // hex-encoded HMAC SHA256
  timestamp: number;
  headers?: Record<string, string>;
}
```

---

## 6. Nonce / Timestamp 设计

| 策略 | 说明 |
|------|------|
| Timestamp | Unix millisecond timestamp |
| RecvWindow | Binance: 5000ms, OKX: 5000ms, Bybit: 5000ms |
| Nonce 唯一性 | 由 idempotency key 保证 |
| 时钟偏移保护 | Server 端 NTP 同步，偏移超过 1000ms 拒绝 |

---

## 7. Replay Attack 防护

| 防护层 | 说明 |
|--------|------|
| Timestamp + RecvWindow | 5 秒窗口内有效 |
| Idempotency Key | 相同 key 的请求只执行一次 |
| Nonce 递增 | 拒绝旧 nonce |
| Audit 记录 | 所有签名请求记录到 audit |

---

## 8. Signed Payload 保护

| 禁止行为 | 原因 |
|---------|------|
| Signature 进入日志 | 可被 replay |
| Signed payload 进入 audit metadata | 审计泄露 |
| Signature 进入 error message | 错误信息泄露 |

---

## 9. Error Handling

| 错误 | 处理 |
|------|------|
| Secret 缺失 | 返回 vault access error |
| HMAC 计算失败 | 返回 internal error |
| Timestamp 过期 | 返回 timestamp invalid |
| RecvWindow 超限 | 返回 recvWindow exceeded |
| Exchange 签名不匹配 | 记录 audit + 返回 signature error |

---

## 10. 当前阶段限制

| 事项 | 状态 |
|------|------|
| HMAC 实现 | ❌ 禁止 |
| Secret 读取 | ❌ 禁止 |
| Secret 解密 | ❌ 禁止 |
| 真实 testnet 请求 | ❌ 禁止 |
| Middleware 修改 | ❌ 禁止 |
| Route 返回 success:true | ❌ 禁止 |
