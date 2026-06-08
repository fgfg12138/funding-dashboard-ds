# Data Accuracy Checklist

This project is V1 read-only market watching. It uses public endpoints only and does not connect API keys or trade.

## Annualized Funding Formula

`annualizedRate = fundingRate * (24 / fundingIntervalHours) * 365 * 100`

- `fundingRate` is a decimal. `0.0001` means `0.01%`.
- `fundingRatePercent = fundingRate * 100`.
- Do not multiply by 100 twice.
- Do not treat an 8h funding rate as a 1h funding rate.

## Binance

How to verify:

- Funding / mark / index / next funding:
  - Public endpoint: `https://fapi.binance.com/fapi/v1/premiumIndex`
  - `fundingRate` uses `lastFundingRate`.
  - This is Binance's most recently published funding rate from the premium index payload, not private account data.
  - `markPrice` uses `markPrice`.
  - `indexPrice` uses `indexPrice`.
  - `nextFundingTime` uses `nextFundingTime`.
- Perp 24h volume:
  - Public endpoint: `https://fapi.binance.com/fapi/v1/ticker/24hr`
  - `volume24h` uses `quoteVolume`, interpreted as USDT notional for USDT pairs.
- Open interest:
  - Public endpoint: `https://fapi.binance.com/fapi/v1/openInterest?symbol=BTCUSDT`
  - `openInterest` is contract/base quantity from Binance.
  - `openInterestUsd = openInterest * markPrice`.
- Spot price and volume:
  - Public endpoint: `https://api.binance.com/api/v3/ticker/24hr`
  - `price` uses spot `lastPrice`.
  - `volume24h` uses spot `quoteVolume`.

## OKX

How to verify:

- Instrument format:
  - Perp swap symbols use `BTC-USDT-SWAP`.
  - Spot symbols use `BTC-USDT`.
- Funding:
  - Public endpoint: `https://www.okx.com/api/v5/public/funding-rate?instId=BTC-USDT-SWAP`
  - `fundingRate` uses `fundingRate`.
  - `nextFundingTime` uses `nextFundingTime` when present, otherwise `fundingTime`.
  - `fundingIntervalHours` is calculated from `nextFundingTime - fundingTime` when both are present; fallback is 8h.
- Mark price:
  - Public endpoint: `https://www.okx.com/api/v5/public/mark-price?instType=SWAP`
  - `markPrice` uses `markPx`.
  - Last trade price is kept separately as `lastPrice` from ticker.
- Perp 24h volume:
  - Public endpoint: `https://www.okx.com/api/v5/market/tickers?instType=SWAP`
  - Prefer `volCcy24h` when available.
  - Fallback: `vol24h * last`.
  - The result is treated as USDT notional for USDT pairs.
- Open interest:
  - Public endpoint: `https://www.okx.com/api/v5/public/open-interest?instType=SWAP&instId=BTC-USDT-SWAP`
  - Prefer `oiCcy` when present because it is coin-denominated.
  - `openInterestUsd = oiCcy * markPrice`.
  - Fallback: `oi * markPrice` when `oiCcy` is missing.
  - If the endpoint does not return usable data, open interest is intentionally left missing.
- Spot:
  - Public endpoint: `https://www.okx.com/api/v5/market/tickers?instType=SPOT`
  - `price` uses `last`.
  - Spot `volume24h` uses `volCcy24h` or `vol24h * last`.

## Bybit

How to verify:

- Linear perpetual funding:
  - Public endpoint: `https://api.bybit.com/v5/market/tickers?category=linear`
  - `fundingRate` uses `fundingRate`.
  - `fundingIntervalHours` uses `fundingIntervalHour`.
  - `nextFundingTime` uses `nextFundingTime`.
  - `markPrice` uses `markPrice`.
  - `indexPrice` uses `indexPrice`.
  - `lastPrice` is retained separately.
- Perp 24h volume:
  - `volume24h` uses `turnover24h`, interpreted as USDT notional for USDT pairs.
- Open interest:
  - Prefer `openInterestValue` when present because it is already notional value.
  - Fallback: `openInterest * markPrice`.
- Spot:
  - Public endpoint: `https://api.bybit.com/v5/market/tickers?category=spot`
  - `price` uses `lastPrice`.
  - `volume24h` uses `turnover24h`.

## Fields That May Differ From Official Web Pages

- Official websites may show predicted next funding while public endpoints expose last/current funding.
- Website values can be rounded, delayed, or converted into a different quote currency.
- 24h volume may be shown as base-asset amount on the website, while this app normalizes to USDT notional where possible.
- Open interest can be shown as contracts, coin amount, or notional value depending on the exchange UI.
- Funding interval can vary for some products or special market conditions.
- Snapshot cache can make data briefly stale; debug pages show `stale`, `fetchedAt`, and source timestamps.
- Some low-liquidity symbols may be missing because public endpoints omit or delay them.

## Manual Calibration Flow

1. Open `/debug/exchange-compare`.
2. Enter a symbol such as `BTC/USDT`, `ETH/USDT`, or `OPN/USDT`.
3. Compare each exchange row against its public official market page.
4. Check `sourceEndpoint` to know which public API field is used.
5. Inspect `rawFields` for the exact key values used by the adapter.
6. Confirm whether the official page is showing funding as decimal, percent, current, previous, or predicted next funding.
