# Persistent Audit Storage Design

> **Phase 6.1 — Design Only**
> **No database connection. No real requests. No secret decryption. No signing.**

---

## 1. 为什么真实 Testnet 前必须持久化 Audit

| 风险 | In-Memory 的问题 | 持久化的必要性 |
|------|-----------------|---------------|
| 进程重启丢失 | 所有审计记录丢失 | 可追溯全部历史事件 |
| 无法审计 replay | 没有持久 hash chain | 可检测数据篡改 |
| 合规要求 | 不能导出审计日志 | 支持 export/backup |
| 故障排查 | 重启后无法查看历史 | 可回溯事故现场 |
| 安全审查 | 没有 audit trail | 提供不可否认性证明 |

> **在启用真实 testnet 下单前，审计日志必须从 in-memory 迁移到持久化存储。**

---

## 2. 推荐存储方案

| 环境 | 推荐存储 | 理由 |
|------|---------|------|
| 本地开发 / Staging | **SQLite** | 零配置，文件级，适合单机部署 |
| 生产 / 正式 Testnet | **Postgres** | 并发、权限、备份、高可用 |

---

## 3. 审计事件分类

| 分类 | 说明 | 写入时机 |
|------|------|---------|
| **local audit** | 本地用户操作、UI 触发的审计 | Phase 4（已有 `auditStore.ts`） |
| **testnet route audit** | `/api/testnet/*` route 的请求和拦截 | Phase 5.14（已有 `testnetAuditStore.ts`） |
| **risk gate audit** | 风控拦截事件 | Phase 5.10 guard skeleton |
| **permission audit** | API Key 权限检查事件 | Phase 5.19 permission skeleton |
| **secret access audit** | Secret 解密和使用的审计 | Phase 6+ 实现 |
| **order lifecycle audit** | 订单生命周期（提交/部分成交/成交/取消/失败） | Phase 6+ 实现 |

---

## 4. 表结构设计

### 4.1 `audit_events`

| 字段 | 类型 | 说明 |
|------|------|------|
| `id` | TEXT (UUID) | 主键 |
| `event_type` | TEXT | 事件类型标识 |
| `actor` | TEXT | 操作主体 (user id / system) |
| `route_name` | TEXT | 触发 route (nullable) |
| `exchange_id` | TEXT | 交易所标识 |
| `entity_type` | TEXT | 关联实体类型 |
| `entity_id` | TEXT | 关联实体 ID |
| `severity` | TEXT | 严重级别 (info/warning/blocked/error) |
| `message` | TEXT | 事件描述 |
| `metadata_hash` | TEXT | 元数据 hash（完整性校验） |
| `source` | TEXT | 来源标识 |
| `created_at` | INTEGER (unix ms) | 创建时间 |

### 4.2 `audit_event_metadata`

| 字段 | 类型 | 说明 |
|------|------|------|
| `id` | TEXT (UUID) | 主键 |
| `event_id` | TEXT (FK → audit_events.id) | 关联事件 ID |
| `key` | TEXT | Metadata key |
| `value` | TEXT | Metadata value (JSON 序列化) |

### 4.3 `audit_integrity_checks`

| 字段 | 类型 | 说明 |
|------|------|------|
| `id` | TEXT (UUID) | 主键 |
| `last_event_id` | TEXT (FK → audit_events.id) | 最后一个事件的 ID |
| `last_metadata_hash` | TEXT | 最后一个事件的 metadata_hash |
| `event_count` | INTEGER | 总事件数 |
| `cumulative_hash` | TEXT | 累积 hash（hash chain 锚点） |
| `checked_at` | INTEGER (unix ms) | 校验时间 |

---

## 5. 禁止存储字段

| 字段 | 原因 |
|------|------|
| API Secret (明文) | 安全 |
| Raw request body | 可能包含 Secret |
| Private key | 安全 |
| Full API Key | 安全 |
| Signed payload | 可能被 replay |
| JWT token | 会话劫持风险 |

---

## 6. Retention 策略

| 环境 | 保留期限 | 处理方式 |
|------|---------|---------|
| 本地开发 | 7 天 | 自动删除过期记录 |
| Staging | 30 天 | 自动归档后删除 |
| 生产 | 90 天 | 归档到冷存储，必要时可扩展 |

---

## 7. Integrity / Hash Chain 设计

```
audit_events (ordered by created_at ASC):
  event_1: metadata_hash = H(metadata_json)
  event_2: metadata_hash = H(metadata_json + event_1.metadata_hash)
  event_3: metadata_hash = H(metadata_json + event_2.metadata_hash)
  ...

audit_integrity_checks:
  cumulative_hash = H(event_N.metadata_hash + event_count)
```

- 当前阶段使用 deterministic string hash skeleton（非 crypto）
- 未来可升级为 SHA-256 等真加密 hash

---

## 8. Export / Backup / Restore

| 操作 | 说明 |
|------|------|
| Export (JSON) | 导出所有事件为 JSON 行格式 |
| Export (CSV) | 导出摘要为 CSV 格式 |
| Backup | 完整数据库备份（SQLite file copy / Postgres pg_dump） |
| Restore | 导入备份文件还原审计数据库 |

---

## 9. 当前阶段限制

| 事项 | 状态 |
|------|------|
| 数据库连接 | ❌ 不实现 |
| SQLite import | ❌ 不引入 |
| Postgres import | ❌ 不引入 |
| Prisma ORM | ❌ 不引入 |
| 真实请求 | ❌ 禁止 |
| Secret 解密 | ❌ 禁止 |
| 签名 | ❌ 禁止 |
| Middleware 修改 | ❌ 禁止 |
| Route 返回 success:true | ❌ 禁止 |
