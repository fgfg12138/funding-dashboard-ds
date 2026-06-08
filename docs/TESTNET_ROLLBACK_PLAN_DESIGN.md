# Testnet Rollback Plan Design

> **Phase 6.5 — Design Only**
> **No real order cancellation. No exchange API calls. No signing. No secret.**

---

## 1. 为什么 Testnet 前必须有 Rollback Plan

| 风险 | 没有 rollback plan 的后果 |
|------|-------------------------|
| 订单状态未知 | 无法确定订单是否存在 |
| Partial fill | 无法处理部分成交残留 |
| 交易所超时 | 无法恢复一致性 |
| 本地队列不一致 | 数据同步错误 |
| Kill Switch 触发 | 无法快速清理 |
| 审计持久化失败 | 无法追溯 |

> **在启用真实 testnet 下单前，必须设计完整的 rollback / cancel / reconciliation 方案。**

---

## 2. Rollback 场景

| 场景 | 触发条件 | Rollback 动作 |
|------|---------|--------------|
| Order submitted but status unknown | API 返回 200 但后续查询失败 | Cancel order + audit |
| Partial fill | 订单部分成交后连接中断 | Cancel remaining + reconciliation |
| Rejected by exchange | 交易所明确拒绝 | Mark failed + notify |
| Exchange timeout | 请求超时 (5s) | Retry up to 3 times, then freeze |
| Local queue mismatch | 本地状态与交易所不一致 | Reconciliation |
| Audit persistence failed | 审计写入失败 | Freeze further submissions |
| Kill Switch triggered | 全局终止 | Cancel all pending + freeze |

---

## 3. Rollback 动作设计

| 动作 | 说明 | 可自动 |
|------|------|--------|
| Cancel order | 调用交易所撤单接口 | ✅ |
| Mark failed | 本地标记为失败 | ✅ |
| Freeze further submissions | 阻止新的下单请求 | ✅ |
| Reconciliation | 与交易所同步状态 | ⚠️ 需人工确认 |
| Notify operator | 通知操作员 | ✅ |

---

## 4. 订单状态处理矩阵

| 状态 | Cancel | Mark Failed | Reconciliation | Notify |
|------|--------|-------------|----------------|--------|
| Submitted | ✅ | ❌ | ❌ | ✅ |
| Filled | ❌ | ❌ | ✅ | ✅ |
| Partial | ✅ (剩余) | ❌ | ✅ | ✅ |
| Cancelled | ❌ | ✅ | ❌ | ✅ |
| Failed | ❌ | ✅ | ❌ | ✅ |
| Unknown | ✅ | ❌ | ✅ | ✅ |

---

## 5. Kill Switch 联动

```
Kill Switch 触发
    │
    ├── Freeze all new order submissions
    ├── Cancel all pending orders
    ├── Start reconciliation for all open orders
    ├── Record audit event
    └── Notify operator
```

---

## 6. Audit / Notification 要求

| 事件 | Audit | Notify |
|------|-------|--------|
| Rollback 启动 | ✅ | ✅ |
| Cancel 请求发送 | ✅ | ❌ |
| Cancel 成功 | ✅ | ❌ |
| Cancel 失败 | ✅ | ✅ |
| Reconciliation 启动 | ✅ | ✅ |
| Reconciliation 完成 | ✅ | ❌ |
| Freeze 激活 | ✅ | ✅ |
| Freeze 解除 | ✅ | ✅ |

---

## 7. 人工确认要求

| 操作 | 需要人工确认 |
|------|-------------|
| Cancel order (单个) | ❌ (可自动) |
| Cancel all (批量) | ✅ |
| Reconciliation 启动 | ✅ |
| Freeze 解除 | ✅ |
| Rollback 完成确认 | ✅ |

---

## 8. 当前阶段限制

| 事项 | 状态 |
|------|------|
| 真实撤单 | ❌ 禁止 |
| 真实下单 | ❌ 禁止 |
| 真实 testnet 请求 | ❌ 禁止 |
| 签名 | ❌ 禁止 |
| Secret 解密 | ❌ 禁止 |
| Middleware 修改 | ❌ 禁止 |
| Route 返回 success:true | ❌ 禁止 |
