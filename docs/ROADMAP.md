# Roadmap — 资金费率套利平台长期路线图

本路线图定义了项目从只读看板逐步演进为全功能套利平台的阶段性计划。
**当前项目处于 Phase 3（API Key 管理与 Mock 账户基础设施）已完成 — 下一阶段 Phase 4 半自动交易。** 每个阶段都设置了明确的边界和前置条件，
不能跳过中间阶段直接进入自动交易。

---

## Phase 1 — 只读行情与套利机会发现（✅ Current）

> **状态：✅ 已发布 (V1)**
> **阶段命名：Read-Only Dashboard**

### 包含
- 读取 Binance / OKX / Bybit 公开行情（funding rate、mark price、index price、24h volume、open interest）
- 计算三类套利机会：跨交易所费率差、现货+永续、Basis
- 统一机会看板，支持筛选、排序、评分
- 历史快照本地 JSONL 存储
- Alpha 发现引擎、因子研究、热力图、机会验证等只读研究模块
- 通知引擎（仅 in-app 日志）
- 模拟回测引擎（虚拟账户，纯本地模拟）
- 策略配置 CRUD（仅配置，不执行）
- 风险规则配置 CRUD
- Mock ADL 监控
- **只读 Middleware 守卫**：拦截所有非 GET 请求，仅白名单内的本地配置端点例外

### 不包含
- ✗ 交易所 API Key 存储或连接
- ✗ 任何形式的实盘下单
- ✗ 自动或半自动执行
- ✗ 纸上交易 / 模拟执行（下一阶段）
- ✗ 真实账户数据读取

### 风险边界
- 所有数据来自公开 REST API，无认证、无私密信息
- 本地数据仅有历史快照和用户配置，无敏感金融信息
- Middleware 层在路由入口拦截修改请求，API 层不需要额外防护

---

## Phase 2 — 纸上交易 / 模拟执行（✅ Current）

> **状态：✅ 已发布**
> **阶段命名：Paper Trading**

### 包含
- 基于当前模拟回测引擎扩展为「纸上交易」模式
- 用户在 UI 上点击「开仓」/「平仓」后，系统记录虚拟委托但不发往交易所
- 纸上交易持仓与只读看板分离显示
- 纸上交易盈亏汇总（基于历史 snapshot 数据回溯计算）
- 纸上交易日志：开仓、平仓、滑点模拟、手续费模拟
- 执行中心 (/execution)
- PaperExecution 模型层 (lib/execution/)
- 净收益估算 (executionEngine.ts)
- Paper Portfolio 模拟资产统计 (/paper-portfolio)
- Opportunity Scoring Engine (lib/opportunity/scoring.ts)
- Risk Gate 风控门禁 (lib/risk/riskGate.ts)
- Strategy Template 接入 Paper Trading (paperStrategyTypes.ts)

### 不包含
- ✗ 真实交易所 API 交互
- ✗ API Key 存储
- ✗ 自动执行（仍需用户手动操作）
- ✗ 任何形式的实盘资金流动

### 为什么不能省略
纸上交易是连接「看数据」和「做交易」之间的关键验证环节：
1. 验证套利信号的实操可行性（流动性、滑点、执行延迟）
2. 验证 UI 操作流程和仓位管理
3. 让用户在零风险环境中熟悉系统
4. 不依赖任何交易所私有接口

---

## Phase 3 — 用户 API Key 管理（默认只读）

> **状态：✅ 全部完成（Phase 3.1 – 3.7），下一阶段 Phase 4**
> **阶段命名：API Key Management & Mock Account Infrastructure**

### Phase 3.1 — API Key UI 占位（✅ 已完成）

> 新增 API Key 管理页面 `/api-keys`，展示未来交易所连接入口、安全边界和权限要求。

#### 包含
- API Key 管理占位页面 (`/api-keys`)
- 导航栏「API管理」入口
- 三个交易所卡片（Binance / OKX / Bybit），每张显示：连接状态、Key 状态、权限要求
- 所有提交按钮标记为 disabled，明文标注「占位页面」
- 安全要求列表：禁止提币权限、子账户建议、IP 白名单、不保存 Secret

#### 不包含
- ✗ 真实的 API Key 表单提交
- ✗ Secret 保存、加密或传输
- ✗ 交易所私有接口连接
- ✗ 任何下单功能
- ✗ 权限检测逻辑

### Phase 3.2 — API Key 加密存储基础层（✅ 已完成）

> 新增 AES-256-GCM 加密模块和 localStorage 加密存储。

#### 包含
- `lib/apiKeys/types.ts` — ApiKeyRecord / ExchangeId / ApiKeyStatus / EncryptedSecretPayload 类型
- `lib/apiKeys/crypto.ts` — AES-256-GCM 加密/解密、密钥导入、PBKDF2 派生、API Key 掩码
- `lib/apiKeys/apiKeyStore.ts` — localStorage 加密存储，保存 masked key + 加密密文，不保存明文 Secret
- SSR-safe（try/catch 模式）
- 18 个单元测试全部通过

#### 不包含
- ✗ 实际的 API Key 输入表单（仍在占位 UI 中 disabled）
- ✗ 交易所权限检测网络请求
- ✗ 任何下单功能

### Phase 3.3 — Mock 权限检测验证器（✅ 已完成）

> 新增离线 Mock 权限检测模块，用于模拟交易所 API Key 权限检查流程。

#### 包含
- `lib/apiKeys/permissionVerifier.ts` — `verifyApiKeyPermissions()` 纯函数 + 4 个辅助导出
- 12 个单元测试全部通过
- Api-keys 页面新增 Mock 检测器状态展示
- 三条 Mock 示例覆盖：只读通过、交易权限警告、提币权限拒绝
- 所有结果包含 `mock-verification-only` 标记

#### 不包含
- ✗ 真实的交易所网络请求
- ✗ 实际的 API Key 输入表单（仍在占位 UI 中 disabled）
- ✗ 任何下单功能

### Phase 3.4 — Mock 只读账户适配器接口（✅ 已完成）

> 新增 PrivateAccountAdapter 接口和 Mock 实现，为未来账户同步做准备。

#### 包含
- `lib/exchangeAdapters/privateAccountTypes.ts` — AccountAsset / AccountPosition / AccountOpenOrder / AccountFundingPayment / PrivateAccountSnapshot 类型
- `lib/exchangeAdapters/privateAccountAdapter.ts` — `createPrivateAccountAdapter()` 工厂函数
- `lib/exchangeAdapters/mockPrivateAccountAdapter.ts` — Mock 实现，返回固定数据
- 所有数据标记 `source: "mock"`，不连接交易所
- 10 个单元测试全部通过

#### 不包含
- ✗ 真实交易所私有接口连接
- ✗ API Secret 解密
- ✗ 任何下单功能
- ✗ UI 展示真实资产（仍在占位状态）

### Phase 3.5 — 账户同步中心 Mock 页面（✅ 已完成）

> 新增账户同步中心页面 `/account-sync`，展示 Mock 账户资产、持仓、挂单、Funding 收益。

#### 包含
- 账户同步中心页面 (`/account-sync`)
- 导航栏「账户同步」入口
- `lib/exchangeAdapters/accountSnapshotSummary.ts` — 多交易所聚合汇总纯函数
- 使用 Mock PrivateAccountAdapter 展示 Binance / OKX / Bybit 模拟数据
- 所有数据标记 `source: "mock"`，页面明确标注不连接交易所

#### 不包含
- ✗ 真实交易所私有接口连接
- ✗ API Secret 解密
- ✗ 任何下单功能
- ✗ 真实账户资产展示

### Phase 3.6 — Mock 账户数据接入 Paper 风控（✅ 已完成）

> 扩展 Risk Gate，接入 Mock 账户快照数据用于账户级风控检查。

#### 包含
- `lib/risk/accountRiskContext.ts` — buildAccountRiskContext + 6 个计算函数
- RiskGateConfig 新增 4 个字段：maxAccountExposurePercent / maxSymbolAccountExposurePercent / minAvailableUsdBalance / includeAccountSnapshotRisk
- RiskGate 新增 3 个账户风控检查（总敞口比、单币敞口比、可用余额）
- /execution 页面加载 Mock 账户快照并传入 Risk Gate
- 页面顶部显示 Mock 账户总资产、可用 USDT、持仓敞口
- 19 个新增单元测试全部通过

#### 不包含
- ✗ 真实账户数据接入
- ✗ API Secret 解密
- ✗ 任何下单功能

### Phase 3.7 — Phase 3 收口验收与边界测试（✅ 已完成）

> 新增验收文档和边界测试，确保项目保持 read-only / mock-only / no-secret / no-live-trading 边界。

#### 包含
- `docs/PHASE_3_CLOSURE_CHECKLIST.md` — 完整验收文档
- `tests/phase3Boundary.test.ts` — 13 项边界测试（无下单/无交易/无 withdraw/middleware 安全/Mock 标注）
- 边界测试覆盖：placeOrder / createOrder / marketOrder / TradingAdapter / withdraw / middleware 白名单 / API Key 页面 disabled / Mock source / permissionVerifier mock 标记

### Phase 4 — 半自动交易（用户逐笔确认）（⬆ Next 下一阶段）

> **状态：规划中**
> **阶段命名：Semi-Automated Trading**

### 包含
- 系统根据信号生成交易建议
- 用户必须在 UI 上手动确认后，系统才向交易所发送订单
- 订单执行状态实时反馈
- 风控规则自动拦截超阈值订单
- 所有交易前需通过风险规则校验

### 不包含
- ✗ 自动执行（无用户确认不下单）
- ✗ 策略自动开平仓
- ✗ 批量/高频交易
- ✗ 无风控门槛的订单

### 风险边界
- 每笔订单必须用户手动确认
- 风控规则必须通过才能提交订单
- 每笔订单有金额/数量上限
- 日交易量有硬上限
- 用户可随时一键暂停所有交易

### 前置条件
- ✅ Phase 3 API Key 管理稳定运行
- ✅ 风控引擎集成测试通过
- ✅ 有监控告警和人工干预通道

---

## Phase 5 — 实盘自动交易（完整风控）

> **状态：远期规划**
> **阶段命名：Fully Automated Trading**

### 包含
- 策略可设置为自动执行模式
- 系统自动监控信号、自动开平仓
- 完整风控引擎实时运行（止损、仓位限制、日亏限制、最大回撤）
- 审计日志记录每笔系统自动操作
- 紧急停止开关
- 定期压力测试

### 不包含
- ✗ 不经过风控的自动执行
- ✗ 无日志的交易
- ✗ 手动干预渠道缺失

### 风险边界
- 自动交易前必须有完整的沙盒测试周期
- 交易参数有硬编码的全局安全限制
- 所有操作用审计日志记录
- 必须通过交易所沙盒环境验证
- 用户可随时接管为手动模式

### 前置条件
- ✅ Phase 4 半自动交易稳定运行 3 个月以上
- ✅ 风控引擎实战验证
- ✅ 完整审计系统和告警系统
- ✅ 法律合规审查

---

## 为什么不能直接从只读跳到自动交易

```
只读看板 ──────────────────────────────┐
        │                                │
        ▼                                │
  纸上交易（验证信号 + 熟悉操作）        │
        │                                │
        ▼                                │
  API Key 管理（私有数据只读接入）       │
        │                                │
        ▼                                │
  半自动交易（人工确认 + 风控初验）      │
        │                                │
        ▼                                │
  ╔══════════════════════════════════╗   │
  ║     实盘自动交易（完整风控）     ║   │
  ╚══════════════════════════════════╝   │
                                          │
  跳过中间任一阶段的风险：                 │
  - 信号未经验证 → 策略亏损               │
  - 操作流程未经测试 → 误操作             │
  - API Key 权限管理不当 → 资金风险       │
  - 风控未经实战 → 放大亏损               │
  - 用户未经培训 → 恐慌性决策             │
  ────────────────────────────────────────┘
```

每个阶段解决一个特定的风险维度：
| Phase | 解决的风险 | 需要的技能 |
|-------|-----------|-----------|
| 1 只读看板 | 数据不可见、无研究工具 | 市场理解 |
| 2 纸上交易 | 信号可行性未知 | UI 操作 |
| 3 API Key 管理 | 私有数据不接入 | 安全管理 |
| 4 半自动 | 未经确认的执行 | 风控意识 |
| 5 全自动 | 高频执行风险 | 系统信任 |

---

## 阶段时间线（预估）

| Phase | 名称 | 前置条件 | 预估周期 |
|-------|------|---------|---------|
| 1 | 只读看板 | — | ✅ 已完成 |
| 2 | 纸上交易 | Phase 1 稳定 | ✅ 已完成 |
| 3 | API Key 管理 | Phase 2 + LIVE_TRADING_ARCHITECTURE.md | ✅ 已完成 |
| 4 | 半自动交易 | Phase 3 验收完成 | 下一阶段 |
| 5 | 全自动交易 | Phase 4 + 合规审查 | TBD |

> **注意**：以上时间线为初步预估，每个阶段的推进需要前一个阶段验证通过和安全审查通过后，经项目决策确认方可进入下一阶段。
