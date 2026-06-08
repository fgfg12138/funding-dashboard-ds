# Testnet Readiness Checklist

> **Phase 5.25 — Readiness Assessment**
> **Status: ✅ Completed — Assessment Only**
> **Current Readiness: ❌ NOT READY (ready=false)**

---

## Current Readiness Summary

| Metric | Value |
|--------|-------|
| Total Items | 28 |
| ✅ Pass | 17 |
| ❌ Failed | 0 |
| 🔴 Blocked | 7 |
| ⚪ Not Started | 4 |
| 🔴 Required Blocked | 11 |
| **Ready for Real Testnet** | **❌ NO** |

---

## ✅ Pass Items (已完成的 skeleton/设计)

| Category | Item | Evidence |
|----------|------|----------|
| env | Env config (`testnetEnvConfig.ts`) | Phase 5.16 |
| env | Env integration into route handler | Phase 5.17 |
| env | Route skeleton (4 routes, all 403) | Phase 5.9 |
| env | Idempotency store skeleton | Phase 5.12 |
| env | Rate limit store skeleton | Phase 5.13 |
| env | Request validation skeleton | Phase 5.20 |
| env | Runtime smoke tests (all 403) | Phase 5.23 |
| risk | Security guard skeleton (10 checks) | Phase 5.10 |
| risk | No-mainnet boundary tests | Phase 3/5.6 |
| secret | Secret access policy defined | Phase 5.18 |
| secret | Secret never enters client component | Phase 5.8 design |
| permission | Permission check skeleton | Phase 5.19 |
| signing | Signing policy defined | Phase 5.8 design |
| adapter | Binance testnet adapter skeleton | Phase 5.7 |
| risk | Risk gate skeleton | Phase 5.10 |
| audit | Audit event skeleton | Phase 5.14 |
| middleware | READ_ONLY_MODE guard for non-testnet | Phase 4 |

## 🔴 Blocked Items (需要完成才能进入真实 testnet)

| Category | Item | Blocking Reason |
|----------|------|-----------------|
| middleware | Middleware testnet mutation allowlist | Must allow POST testnet routes |
| secret | Server-side secret retrieval implementation | Requires server route to decrypt/use API Key |
| permission | Real permission verification against exchange | Requires real testnet adapter + server-side secret |
| signing | Signing implementation (server-side) | Requires HMAC/ed25519 |
| adapter | Real Binance testnet adapter (network calls) | Requires server-side secret + signing + middleware |
| audit | Persistent audit storage | Requires database or log file |
| rollback | Testnet rollback plan documented | Requires documented procedure |

## ⚪ Not-Started Items

| Category | Item | Notes |
|----------|------|-------|
| env | Separate staging/testnet deployment env | No staging server configured |
| risk | Real risk evaluation (balance, exposure) | No real-time evaluation against testnet account |
| risk | Kill Switch for testnet | No Kill Switch integration |
| ops | Operations approval for testnet | No ops review conducted |
| ops | Monitoring and alerting for testnet | No monitoring for route errors |
| adapter | OKX testnet adapter | Not planned for initial launch |
| adapter | Bybit testnet adapter | Not planned for initial launch |

---

## Entering Real Testnet — Minimum Conditions

> **All of the following must be ✅ pass before real testnet can be enabled.**

| # | Condition | Current Status |
|---|-----------|----------------|
| 1 | Code review of Phases 5.9–5.24 completed and approved | ⏳ Not started |
| 2 | Middleware allowlist updated for `/api/testnet` mutation routes | 🔴 Blocked |
| 3 | Server-side secret retrieval implemented (no client access) | 🔴 Blocked |
| 4 | Binance testnet adapter with real network calls implemented | 🔴 Blocked |
| 5 | Server-side request signing implemented (HMAC/ed25519) | 🔴 Blocked |
| 6 | Real permission verification against Binance testnet endpoint | 🔴 Blocked |
| 7 | Kill Switch integrated and tested for testnet routes | ⚪ Not started |
| 8 | Rollback plan documented and reviewed | 🔴 Blocked |
| 9 | Persistent audit storage (database or log file) | 🔴 Blocked |
| 10 | Operations/stakeholder approval obtained | ⚪ Not started |
| 11 | Monitoring and alerting configured for testnet errors | ⚪ Not started |
| 12 | Staging/testnet deployment environment isolated from production | ⚪ Not started |

---

## Current Phase Limitations

| Limitation | Status |
|------------|--------|
| Real testnet network requests | ❌ Disabled — all routes return 403 |
| Real order submission | ❌ Disabled — all routes return 403 |
| Secret decryption | ❌ Disabled — no decryptSecret call |
| API Key signing | ❌ Disabled — no createHmac call |
| Middleware modification | ❌ Disabled — no /api/testnet in allowlist |
| Route returning success:true | ❌ Disabled — all routes return success:false |

---

## 主网警告

> **⚠ 主网交易始终禁止。即使 Phase 5.26+ 开始真实 testnet 集成，也绝不能直接接主网。**
> **进入主网需要独立的 Phase 6 安全审查和合规审查。**
