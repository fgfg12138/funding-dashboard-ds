# V1 Release Checklist

## V1 Scope

V1 is a read-only market observation system for funding-rate and basis research.

- No API Key.
- No real trading.
- No real order placement.
- No simulated order placement in V1 live watch pages.
- No strategy execution.
- Only public market data, local read-only research outputs, local configuration, and local mock/config data where explicitly labeled.

## Completed Pages

- `/opportunities` - unified opportunity board for CrossExchange, SpotPerp, and Basis opportunities.
- `/dashboard` - funding-rate board with tabbed modules:
  - `/dashboard?module=spot-perp`
  - `/dashboard?module=cross`
- `/basis` - basis / short spread board with simplified estimated Carry display and risk notice.
- `/alpha` - Alpha discovery research page.
- `/factors` - factor research page.
- `/notifications` - in-app notification event page.
- `/simulation` - read-only simulation research view.
- `/strategies` - strategy configuration management.
- `/risk-rules` - risk rule configuration management.
- `/adl-monitor` - mock ADL monitoring center and settings.
- `/debug` - market normalization debug page.
- `/history/[symbol]` - local history inspection page.

## Completed APIs

- `GET /api/opportunities`
- `GET /api/summary`
- `GET /api/funding/cross-exchange`
- `GET /api/funding/spot-perp`
- `GET /api/basis/opportunities`
- `GET /api/debug/markets`
- `GET /api/history/funding`
- `GET /api/history/opportunities`
- `GET /api/research/opportunities`
- `GET /api/research/heatmap`
- `GET /api/research/factors`
- `GET /api/research/alpha`
- `GET /api/research/alpha/[id]`
- `GET /api/notifications`
- `POST /api/notifications/evaluate`
- `GET /api/simulation/account`
- `GET /api/simulation/history`
- `POST /api/simulation/run`
- `GET /api/strategies`
- `POST /api/strategies`
- `PATCH /api/strategies/[id]`
- `DELETE /api/strategies/[id]`
- `GET /api/risk-rules`
- `POST /api/risk-rules`
- `PATCH /api/risk-rules/[id]`
- `DELETE /api/risk-rules/[id]`
- `GET /api/adl-monitor`
- `POST /api/adl-monitor/mock-refresh`
- `GET /api/adl-settings`
- `PATCH /api/adl-settings`

## Acceptance Checks Completed

- Production build completes.
- Main pages return HTTP 200 in production smoke checks.
- Key APIs return a consistent envelope with `data`, `errors`, `updatedAt`, and `stale`.
- `/dashboard` defaults to `spot-perp`, supports `module=spot-perp` and `module=cross`, and no longer renders both large tables at once.
- Large tables use constrained height and horizontal overflow where needed.
- Single exchange failures degrade to partial data instead of failing the whole market snapshot.
- Page shell shows updated time and read-only / no-trading status.

## Known Issues

- Some exchange public endpoints can timeout or temporarily fail; the UI displays partial data and cache status when this happens.
- ADL monitor data is mock/local configuration data only. It does not read real account positions.
- Historical research quality depends on local JSONL history accumulation; fresh installations may show sparse Alpha/factor/history results.
- Estimated Carry is a simplified model and does not deduct fees, slippage, borrow costs, or future Funding changes.
- Notification delivery is in-app only. Telegram, email, and webhook channels are not implemented in V1.

## Unsupported In V1

- Exchange API keys.
- Real account balances.
- Real positions.
- Real order placement.
- Automated execution.
- Semi-automated execution.
- Real stop loss / take profit execution.
- Real ADL position reduction.
- Private account data ingestion.

## V2 Preparation Items

- Formal permission and safety model before any semi-automated workflow.
- Separate read-only public data adapters from any future private-account adapters.
- Explicit API-key storage design, encryption, rotation, and redaction policy if V2 ever needs private data.
- Manual approval gates before any future order-related operation.
- Exchange sandbox-only execution research before considering any production execution path.
- Audit logging for every user-triggered action.
- Risk engine integration design with clear dry-run and live boundaries.
- More robust browser-based visual regression coverage for the primary dashboard pages.
