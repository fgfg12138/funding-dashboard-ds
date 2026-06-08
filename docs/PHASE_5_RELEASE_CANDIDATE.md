# Phase 5 Release Candidate

> **版本：0.5.0-rc.1**
> **状态：✅ RC Freeze — 可审查、可回滚、可交付**
> **下一阶段：Phase 6 — BLOCKED — 等待人工审批 + 外部安全审查**

---

## 完成范围

Phase 5.0–5.29 全部完成，共 **30 个子阶段**：

| 阶段范围 | 模块 |
|---------|------|
| 5.0–5.5 | Live Adapter Design, Mock Sandbox, Lifecycle, Safety Gate, Boundary |
| 5.6–5.8 | Real Testnet Design, Binance Skeleton, Route Design |
| 5.9–5.15 | Route Skeleton, Guard, Idempotency, Rate Limit, Audit, Closure |
| 5.16–5.21 | Env Config, Secret Policy, Permission, Validation, Preflight Closure |
| 5.22–5.24 | Code Review Fixes, Runtime Smoke, Smoke Closure |
| 5.25–5.26 | Readiness Checklist, Readiness Dashboard |
| 5.27–5.29 | Full Architecture Review, Code Review Fixes, Safety Audit |

---

## 当前不包含

| 能力 | 状态 |
|------|------|
| 真实 testnet 网络请求 | ❌ 不包含 |
| 主网交易 | ❌ 不包含 |
| Secret 解密 | ❌ 不包含 |
| API Key 签名 | ❌ 不包含 |
| 真实下单能力 | ❌ 不包含 |
| Middleware 白名单修改 | ❌ 不包含 |

---

## 安全证明

| 指标 | 值 |
|------|-----|
| 测试文件数 | **89** |
| 测试用例数 | **1,702** |
| 安全审查测试 | **674** |
| `/api/testnet/*` route 状态 | 全部返回 403 |
| Readiness | **❌ NOT READY** (11 required blockers) |
| Middleware `/api/testnet` | **不在 allowlist** |
| `success: true` 在 testnet route | **不存在** |
| `decryptSecret` 在运行代码中 | **不存在** (仅加密模块类型定义) |
| `createHmac` / `crypto.subtle.sign` | **不存在** |
| `submitLiveOrder` / `placeLiveOrder` | **不存在** |
| fetch/axios 在 liveAdapters | **不存在** |
| mainnet adapter 文件 | **不存在** |

---

## 测试验证

```bash
npx vitest run
# 89 test files, 1702 tests — ✅ all passed

npx next build
# Build — ✅ succeeded
```

---

## 回滚说明

| 操作 | 命令 |
|------|------|
| 回滚到上一版本 | `git revert HEAD --no-edit && git push` |
| 回滚到指定版本 | `git revert <commit-hash> --no-edit && git push` |
| 查看当前版本标签 | `git log --oneline -5` |
| 标记 RC 版本 | `git tag v0.5.0-rc.1 && git push --tags` |

---

## 下一阶段进入条件

> **Phase 6 仍 BLOCKED，需要满足以下全部条件方可进入：**

| # | 条件 | 状态 |
|---|------|------|
| 1 | 代码审查通过 | ⏳ 待完成 |
| 2 | 外部安全审查通过 | ⏳ 待完成 |
| 3 | 合规审查通过 | ⏳ 待完成 |
| 4 | 项目决策确认 | ⏳ 待完成 |
| 5 | Phase 6 设计文档审批 | ⏳ 待完成 |

---

## 主网警告

> **⚠ 本 RC 版本不包含任何主网交易能力。**
> **即使 Phase 6 开始真实 testnet 集成，也绝不能直接接主网。**
> **主网交易需要独立的 Phase 6 安全审查 + 合规审查 + 项目决策。**
