# Sandbox / Testnet Plan — 沙盒测试网接入计划

> **阶段：** Phase 5.0 — Design Only
> **状态：** 接入计划文档，不包含任何真实主网连接
> **当前项目：EXCHANGE_ENV=disabled, LIVE_TRADING_ENABLED=false, ALLOW_MAINNET_TRADING=false**

---

## 目录

1. [Sandbox vs Testnet vs Mainnet](#1-sandbox-vs-testnet-vs-mainnet)
2. [为什么必须先接 Sandbox](#2-为什么必须先接-sandbox)
3. [环境变量设计](#3-环境变量设计)
4. [Sandbox API Key 管理](#4-sandbox-api-key-管理)
5. [错误处理与回滚](#5-错误处理与回滚)
6. [测试用例计划](#6-测试用例计划)
7. [测试网接入步骤](#7-测试网接入步骤)
8. [上线主网前检查清单](#8-上线主网前检查清单)

---

## 1. Sandbox vs Testnet vs Mainnet

| 特性 | Sandbox | Testnet | Mainnet |
|------|---------|---------|---------|
| **资金** | 虚拟资金 | 虚拟资金 | **真实资金** |
| **撮合** | 模拟撮合 | 模拟撮合 | 真实撮合 |
| **API Key** | 独立 Key | 独立 Key | **真实 Key** |
| **风险** | 无风险 | 无风险 | **资金损失风险** |
| **速度** | 可能较慢 | 接近主网 | 实时 |
| **收费** | 免手续费 | 免手续费 | **真实手续费** |
| **用途** | 功能性验证 | 性能/兼容性验证 | 实盘交易 |

### 本项目定义

| 模式 | 含义 | 环境变量值 |
|------|------|-----------|
| **Disabled** | 禁用所有交易功能（当前默认） | `EXCHANGE_ENV=disabled` |
| **Sandbox** | 接入交易所沙盒/模拟环境 | `EXCHANGE_ENV=sandbox` |
| **Testnet** | 接入交易所测试网 | `EXCHANGE_ENV=testnet` |
| **Mainnet** | ⚠ **仅在 Phase 5.6+ 合规审查后** | `EXCHANGE_ENV=mainnet` |

---

## 2. 为什么必须先接 Sandbox

### 不能跳过沙盒直接接入主网的理由

```
跳过沙盒的风险：
  ├── API 兼容性未知 → 下单失败或数据错误
  ├── 权限配置错误 → 可能造成资金损失
  ├── 下单逻辑未验证 → 可能下错方向/数量
  ├── 错误处理不完善 → 无法正确处理 API 异常
  ├── Rate limit 未测试 → 被交易所封禁
  ├── 滑点模型不准确 → 实际成交价偏离预期
  └── 风控未实战验证 → 风控失效导致亏损
```

### 沙盒阶段目标

1. 验证 TradingAdapter 接口设计可行性
2. 验证下单/撤单/查询流程
3. 验证风控拦截的真实性
4. 验证 Kill Switch 在实盘中的行为
5. 验证审计日志覆盖所有关键操作
6. 验证错误处理和回滚机制
7. 收集 API 兼容性数据

---

## 3. 环境变量设计

### 环境变量

```bash
# ─── 交易环境 (Phase 5+) ───

# 交易所环境: disabled | sandbox | testnet | mainnet
# 默认: disabled
# 禁止默认设为 mainnet
EXCHANGE_ENV=disabled

# 是否启用实盘交易功能
# 默认: false
# 只有 ALLOW_MAINNET_TRADING=true 且 EXCHANGE_ENV=mainnet 时才允许主网交易
LIVE_TRADING_ENABLED=false

# 是否允许主网交易（合规审查后才能设为 true）
# 默认: false
# 设为 true 前必须有完整的安全审查和合规审查
ALLOW_MAINNET_TRADING=false

# ─── Sandbox Endpoints ───

# Binance Testnet
# Futures: https://testnet.binancefuture.com
# 无需设置，使用交易所默认 testnet URL

# OKX Demo Trading
# 需在 OKX 账户中启用 Demo Trading 模式

# Bybit Testnet
# https://api-testnet.bybit.com
```

### 环境变量校验

```
系统启动时验证:
  ├── EXCHANGE_ENV 必须是 disabled / sandbox / testnet / mainnet 之一
  ├── LIVE_TRADING_ENABLED 必须是 true / false
  ├── ALLOW_MAINNET_TRADING 必须是 true / false
  ├── 如果 ALLOW_MAINNET_TRADING=false，拒绝任何主网连接
  ├── 如果 EXCHANGE_ENV=disabled，拒绝任何交易功能
  └── 如果 LIVE_TRADING_ENABLED=false，拒绝任何下单
```

### 默认值安全规则

```
┌────────────────────────────────────────────────────────┐
│  禁止默认主网原则                                       │
│                                                        │
│  EXCHANGE_ENV 默认值必须为 "disabled"                   │
│  LIVE_TRADING_ENABLED 默认值必须为 "false"              │
│  ALLOW_MAINNET_TRADING 默认值必须为 "false"             │
│                                                        │
│  用户在启用主网前必须:                                   │
│  1. 通过 Sandbox 完整测试                               │
│  2. 完成安全审查                                        │
│  3. 完成合规审查                                        │
│  4. 手动修改环境变量且重新部署                           │
└────────────────────────────────────────────────────────┘
```

---

## 4. Sandbox API Key 管理

### 关键原则

- **Sandbox API Key 完全独立于主网 Key**
- Sandbox Key 在交易所测试网注册
- Sandbox Key 只有测试网虚拟资金
- Sandbox Key 泄露不影响主网资产

### 存储

```
Sandbox Key 存储方式与 Phase 3.2 加密存储一致：
- AES-256-GCM 加密
- localStorage 持久化
- 区分环境标记 (environment: "sandbox")
- 禁止将 Sandbox Key 用于主网连接
```

### 权限要求

| 权限 | Sandbox | Mainnet |
|------|---------|---------|
| Read | ✅ 必须 | ✅ 必须 |
| Trade | ✅ 允许 | 🔒 Phase 5.3+ |
| Withdraw | ❌ 禁止 | ❌ 禁止 |
| IP Whitelist | ✅ 建议 | ✅ 必须 |

---

## 5. 错误处理与回滚

### 订单失败处理

```
下单失败时的处理流程:
  ├── 1. 检查错误类型
  │     ├── 网络错误 → 重试 (最多 3 次)
  │     ├── 权限错误 → 记录审计 + 通知用户
  │     ├── 余额不足 → 记录审计 + 通知用户
  │     ├── 限频错误 → 等待后重试
  │     └── 未知错误 → 记录审计 + Kill Switch 自动触发
  │
  ├── 2. 更新本地状态
  │     ├── 失败 → 状态设为 sandbox-failed
  │     └── 部分成交 → 状态设为 sandbox-partial
  │
  ├── 3. 写入审计日志
  │
  └── 4. 创建本地通知
```

### 回滚策略

| 场景 | 回滚操作 |
|------|---------|
| 下单失败 | 标记失败，不移除队列项目，允许重试 |
| 部分成交 | 记录成交数量，队列项目状态更新 |
| 撤单失败 | 重试撤单，持续失败则标记异常 |
| 网络断开 | 保留队列项目，恢复后轮询状态 |

---

## 6. 测试用例计划

### Phase 5.1 — Mock Contract 测试 ✅ 已完成

> **⚠ Phase 5.1 为纯 Mock 沙盒，不连接任何真实交易所测试网。**
> **所有结果标记 `source: "mock-sandbox"`，不可作为真实交易依据。**

| 测试编号 | 描述 | 预期结果 | 状态 |
|---------|------|---------|------|
| SC-001 | validateEnvironment 返回 sandbox + Mock 警告 | 通过含 Mock 标记 | ✅ |
| SC-002 | submitSandboxOrder 返回 mock-sandbox 结果 | 含 orderId + source | ✅ |
| SC-003 | cancelSandboxOrder 返回 true | true | ✅ |
| SC-004 | getSandboxOrderStatus 返回 mock filled 状态 | sandbox-filled | ✅ |
| SC-005 | buildSandboxOrderRequest 生成正确请求格式 | 含所有必填字段 | ✅ |
| SC-006 | 不包含 fetch/axios/SDK 调用 | 静态分析通过 | ✅ |
| SC-007 | 不需要 API Key | 无需凭证 | ✅ |

| 测试编号 | 描述 | 预期结果 |
|---------|------|---------|
| SC-001 | validateEnvironment 在 disabled 模式下抛出错误 | 拒绝操作 |
| SC-002 | validateEnvironment 在 sandbox 模式下返回通过 | 允许操作 |
| SC-003 | submitSandboxOrder 返回正确的 TradingOrderResult | 含 orderId |
| SC-004 | cancelSandboxOrder 返回 true | 取消成功 |
| SC-005 | getSandboxOrderStatus 返回当前状态 | 状态正确 |
| SC-006 | buildSandboxOrderRequest 生成正确的请求格式 | 含所有必填字段 |

### Phase 5.2 — Sandbox Order Lifecycle Store（已完成，仍为 Mock）

> **⚠ 当前 Sandbox Lifecycle Store 仍使用 Mock Sandbox Adapter，不连接真实交易所。**
> **所有数据标记 `source: "mock-sandbox"`。**

| 测试编号 | 描述 | 预期结果 | 状态 |
|---------|------|---------|------|
| SL-001 | 创建 lifecycle record | `sandbox-ready` | ✅ |
| SL-002 | 提交 mock order | `sandbox-submitted` | ✅ |
| SL-003 | 追加 result history | 状态流转正确 | ✅ |
| SL-004 | 标记 cancelled | `sandbox-cancelled` | ✅ |
| SL-005 | 标记 failed | `sandbox-failed` | ✅ |
| SL-006 | 不修改 executionQueueTypes | 不变 | ✅ |

### Phase 5.3 — Sandbox Lifecycle 页面（已完成，仍为 Mock UI）

> **⚠ `/sandbox-lifecycle` 页面仅展示 Mock 生命周期记录，不连接真实 testnet。**

| 测试编号 | 描述 | 预期结果 | 状态 |
|---------|------|---------|------|
| SV-001 | 页面展示统计卡片 | 6 张卡片 | ✅ |
| SV-002 | 表格展示全部字段 | createdAt/status/source/时间戳 | ✅ |
| SV-003 | 标记取消 → audit + notification | 事件写入 | ✅ |
| SV-004 | 标记失败 → audit + notification | 事件写入 | ✅ |
| SV-005 | 清空记录 | 全部移除 | ✅ |

### Phase 5.4 — Sandbox Safety Gate（已完成，仍为 Mock）

> **⚠ 新增 10 项安全检查门禁，所有检查通过后才能创建 Mock Sandbox Lifecycle。**
> **仍不连接真实 testnet。**

| 测试编号 | 描述 | 预期结果 | 状态 |
|---------|------|---------|------|
| SG-001 | Kill Switch 开启 → blocked | 拦截 | ✅ |
| SG-002 | 队列已过期 → blocked | 拦截 | ✅ |
| SG-003 | 队列已取消 → blocked | 拦截 | ✅ |
| SG-004 | 缺少 confirmation → blocked | 拦截 | ✅ |
| SG-005 | Preview 不可提交 → blocked | 拦截 | ✅ |
| SG-006 | RiskGate 未通过 → blocked | 拦截 | ✅ |
| SG-007 | liveTradingEnabled=true → blocked | 拦截 | ✅ |
| SG-008 | allowMainnetTrading=true → blocked | 拦截 | ✅ |
| SG-009 | 全部通过 → allowed + MOCK_SANDBOX_ONLY | 通过 | ✅ |
| SG-010 | 集成 /execution-queue | 按钮前过门禁 | ✅ |

### Phase 5.5 — Mock Sandbox Closure（✅ 已完成）

> **⚠ 新增验收文档和 17 项边界测试。全部标记 `source: "mock-sandbox"`，仍不连接真实 testnet。**

| 测试编号 | 描述 | 预期结果 | 状态 |
|---------|------|---------|------|
| BC-001 | liveAdapters 无 fetch() | 静态分析通过 | ✅ |
| BC-002 | liveAdapters 无 axios | 静态分析通过 | ✅ |
| BC-003 | liveAdapters 无 SDK import | 静态分析通过 | ✅ |
| BC-004 | 无 mainnet 适配器文件 | 无匹配 | ✅ |
| BC-005 | mock adapter source = mock-sandbox | source 符合 | ✅ |
| BC-006 | safety gate env 默认 disabled/false | 默认值安全 | ✅ |
| BC-007 | executionQueueTypes 无 sandbox 状态 | 隔离 | ✅ |
| BC-008 | lifecycle 页面含 Mock 声明 | 文案正确 | ✅ |
| BC-009 | 文档禁止默认主网 | 已声明 | ✅ |
| BC-010 | 无 Secret 解密调用 | 无调用 | ✅ |

### Phase 5.6 — 真实 Testnet 集成测试（待完成 — 阻塞于代码审查）
...
### Phase 5.7 — Binance Testnet Adapter Skeleton（✅ 已完成，仍为 Skeleton）

> **⚠ Binance Testnet Adapter Skeleton 不连接真实 Binance Testnet。**
> **所有方法返回 disabled/blocked。**

| 测试编号 | 描述 | 预期结果 | 状态 |
|---------|------|---------|------|
| SK-001 | exchangeId = binance | 正确 | ✅ |
| SK-002 | mode = design-only | 正确 | ✅ |
| SK-003 | validateEnvironment 默认 disabled | valid=false | ✅ |
| SK-004 | validateEnvironment testnet 通过 | valid=true | ✅ |
| SK-005 | validateEnvironment 阻止 liveTradingEnabled | valid=false | ✅ |
| SK-006 | validateEnvironment 阻止 allowMainnetTrading | valid=false | ✅ |
| SK-007 | checkPermissions 返回 disabled | permission-check-disabled | ✅ |
| SK-008 | placeTestnetOrder 返回 testnet-blocked | 拦截 | ✅ |
| SK-009 | cancel 返回 false | false | ✅ |
| SK-010 | getStatus 返回 testnet-unknown | unknown | ✅ |
| SK-011 | 无 fetch/axios/HMAC/decryptSecret/SDK | 静态分析 | ✅ |

### Phase 5.8+ — Mainnet 前验证

| 测试编号 | 描述 |
|---------|------|
| MN-001 | 所有 Phase 4 流程图覆盖的路径均通过 Sandbox |
| MN-002 | Sandbox 运行满 7 天无异常 |
| MN-003 | 安全审查通过 |
| MN-004 | 合规审查通过 |
| MN-005 | 环境变量配置正确 |

---

## 7. 测试网接入步骤

### Step 1: 注册测试网账户

| 交易所 | 注册地址 | 备注 |
|--------|---------|------|
| Binance Testnet | https://testnet.binancefuture.com/ | 自动分配 100 USDT 虚拟资金 |
| OKX Demo | https://www.okx.com/account/demo | 需在主网账户启用 Demo |
| Bybit Testnet | https://testnet.bybit.com/ | 需申请 Testnet API Key |

### Step 2: 获取测试网 API Key

- 每个交易所生成独立的 Testnet API Key
- 记录 Key 的权限设置（必须开启 Trade，禁止 Withdraw）
- 保存 Key 用于后续测试

### Step 3: 配置环境变量

```bash
EXCHANGE_ENV=sandbox
LIVE_TRADING_ENABLED=true
ALLOW_MAINNET_TRADING=false
```

### Step 4: 运行 Phase 5.1 Mock Contract 测试 ✅

> 已在使用 `createMockSandboxTradingAdapter()` 验证接口兼容性。
> 所有测试通过，不连接真实测试网。

### Step 5: 运行 Phase 5.5 Sandbox 集成测试（待完成）

- 连接真实测试网
- 验证下单、撤单、查询流程
- 验证风控和 Kill Switch 集成

---

## 8. 上线主网前检查清单

### 🔒 安全检查

- [ ] EXCHANGE_ENV 已改为 mainnet（非默认，需手动）
- [ ] ALLOW_MAINNET_TRADING 改为 true
- [ ] API Key 权限已限制：no withdraw, trade only
- [ ] IP 白名单已配置
- [ ] Kill Switch 已验证可按预期工作
- [ ] 风控引擎已配置正确的生产参数
- [ ] 最大仓位限制已设置
- [ ] 日亏损限制已设置
- [ ] 熔断机制已配置

### ✅ 功能检查

- [ ] Sandbox 环境运行满 7 天无异常
- [ ] 所有订单类型已在 Sandbox 验证
- [ ] 撤单功能正常
- [ ] 错误处理和回滚正常
- [ ] 审计日志覆盖所有操作
- [ ] 本地通知正常

### 📋 合规检查

- [ ] 法律合规审查通过
- [ ] 用户协议已更新
- [ ] 风险披露文档已准备
- [ ] 隐私政策已更新

---

## 附录

### A. 默认值安全声明

```
本项目默认禁止任何形式的实盘交易：

  1. EXCHANGE_ENV 默认 = "disabled"
  2. LIVE_TRADING_ENABLED 默认 = false
  3. ALLOW_MAINNET_TRADING 默认 = false
  4. middleware.ts 拦截所有非 GET 修改请求
  5. 无限价单、市价单、撤单的实现代码

任何启用实盘交易的操作都需要：
  - 用户主动修改环境变量
  - 完整的沙盒验证周期
  - 安全审查和合规审查
```
