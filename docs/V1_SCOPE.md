# V1 Scope — 只读行情与套利机会看板

This project version is a **read-only** funding and basis opportunity dashboard.
**Phase 1** in the project roadmap — see [ROADMAP.md](./ROADMAP.md) for the full 5-phase plan.

---

## Read-Only Mode Boundaries

The following guards are active at the infrastructure level to enforce read-only behavior:

- **Middleware Layer** (`middleware.ts`): A Next.js middleware intercepts all HTTP requests at the routing boundary.
  - GET / HEAD requests are allowed everywhere.
  - POST / PUT / PATCH / DELETE are **blocked with HTTP 405** unless the path is in a hard-coded allowlist.
  - Allowlisted paths are local-only endpoints that do NOT interact with any exchange or account:
    - `/api/adl-monitor` — mock ADL position management
    - `/api/adl-settings` — ADL configuration
    - `/api/notifications/evaluate` — in-app notification evaluation
    - `/api/risk-rules` — local risk rule CRUD
    - `/api/simulation` — local simulation engine
    - `/api/strategies` — local strategy config CRUD
  - All responses include `X-Read-Only: true` header.

- **No API Key Storage**: The application does **not** store, read, or transmit any exchange API keys. All data is fetched from public REST endpoints (no authentication required).

- **No Real Orders**: The application does **not** place, cancel, or modify any real orders on any exchange. There is no order placement code path in the codebase.

- **No Strategy Execution**: Strategy configuration is persisted locally as JSON for reference only. The application does not execute any strategy logic against live markets.

- **No Private Account Data**: The application only reads public market data (funding rates, prices, volumes, open interest). No account balances, positions, or private data are accessed.

---

## In Scope

- Read-only market watching and research.
- Public market data fetching only (Binance, OKX, Bybit public REST APIs).
- Funding rate display and calculations.
- Cross-exchange perpetual funding spread opportunities.
- Same-exchange spot + perpetual funding opportunities.
- Basis / spot-short-spread opportunities.
- Unified opportunity comparison across cross-exchange, spot-perp, and basis rows.
- Local-only snapshots, history, configuration, research views, notifications, and simulation analytics for observation.
- Mock ADL monitoring (local mock data, no real account positions).
- In-app notification logging only (no Telegram, email, or webhook delivery).

---

## Out Of Scope

- ✗ Exchange API keys — not stored, not connected
- ✗ Private account access — no balances, positions, or history
- ✗ Real orders — no place, cancel, or modify
- ✗ Real trading — no buy / sell execution
- ✗ Automatic execution — no strategy auto-run
- ✗ Semi-automatic execution — no user-confirmed execution
- ✗ Strategy execution — configs are for reference only
- ✗ Real position management — no position tracking against exchange
- ✗ Real deleveraging, liquidation, or ADL actions
- ✗ Paper trading / simulated execution — this is the **next phase** (Phase 2)
- ✗ API Key management UI — this is Phase 3

---

## Next Phase Goal: Paper Trading (Phase 2)

The immediate next milestone is **Paper Trading (模拟执行 / 纸上交易)**:

- Expand the existing simulation engine into a paper trading mode accessible from the main UI.
- Users can open and close virtual positions based on opportunity signals.
- Paper trading P&L is tracked separately from the read-only dashboard.
- No real exchange API interaction at this phase.
- See [ROADMAP.md](./ROADMAP.md#phase-2--纸上交易--模拟执行) for full details.

---

## V1 Closure Notes

V1 can proceed to a UI-wide redesign after the data structure is stable enough for:

- Consistent funding and spot snapshots.
- Unified opportunity metadata.
- Clear opportunity type boundaries.
- Explicit read-only product scope (this document).
- Infrastructure read-only guard in production (middleware).
