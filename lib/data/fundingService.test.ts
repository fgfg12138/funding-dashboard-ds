import { describe, expect, it } from "vitest";
import { buildSpotPerpOpportunities, getFundingSnapshot, resetFundingSnapshotCacheForTests } from "./fundingService";
import type { FundingMarket, SpotMarket } from "../exchanges/types";

function spot(exchange: SpotMarket["exchange"], volume24h = 10_000_000): SpotMarket {
  return {
    exchange,
    symbol: "BTC/USDT",
    base: "BTC",
    quote: "USDT",
    price: 100_000,
    volume24h
  };
}

function perp(exchange: FundingMarket["exchange"], fundingRate = 0.0002): FundingMarket {
  return {
    exchange,
    rawSymbol: `${exchange}-BTCUSDT`,
    symbol: "BTC/USDT",
    base: "BTC",
    quote: "USDT",
    fundingRate,
    fundingIntervalHours: 8,
    nextFundingTime: Date.now() + 2 * 60 * 60_000,
    markPrice: 100_100,
    volume24h: 12_000_000,
    openInterestUsd: 40_000_000
  };
}

describe("buildSpotPerpOpportunities", () => {
  it("builds only same-exchange spot-perp combinations", () => {
    const opportunities = buildSpotPerpOpportunities(
      [spot("Binance"), spot("OKX", 20_000_000)],
      [perp("Binance"), perp("Bybit"), perp("OKX")]
    );

    expect(opportunities.map((item) => `${item.spotExchange}-${item.perpExchange}`).sort()).toEqual([
      "Binance-Binance",
      "OKX-OKX"
    ]);
  });

  it("excludes non-positive funding opportunities", () => {
    const opportunities = buildSpotPerpOpportunities([spot("Binance")], [perp("Binance", 0)]);

    expect(opportunities).toEqual([]);
  });

  it("includes score, risk tags, and reason on generated opportunities", () => {
    const [opportunity] = buildSpotPerpOpportunities([spot("Binance")], [perp("Binance")]);

    expect(opportunity.score).toBeGreaterThanOrEqual(0);
    expect(opportunity.score).toBeLessThanOrEqual(100);
    expect(opportunity.riskTags).toEqual(expect.any(Array));
    expect(opportunity.opportunityReason).toContain("Binance");
  });
});

describe("getFundingSnapshot cache and fallback", () => {
  it("reuses the same snapshot inside the TTL and reloads after expiry", async () => {
    resetFundingSnapshotCacheForTests();
    let fundingCalls = 0;
    let spotCalls = 0;

    const options = {
      cacheKey: "ttl-test",
      now: 1_000,
      saveHistory: false,
      fetchFundingMarkets: async () => {
        fundingCalls += 1;
        return { data: [perp("Binance")], sourceStatus: { Binance: "ok", OKX: "failed", Bybit: "failed" } as const };
      },
      fetchSpotMarkets: async () => {
        spotCalls += 1;
        return { data: [spot("Binance")], sourceStatus: { Binance: "ok", OKX: "failed", Bybit: "failed" } as const };
      }
    };

    await getFundingSnapshot(options);
    await getFundingSnapshot({ ...options, now: 20_000 });
    await getFundingSnapshot({ ...options, now: 70_000 });

    expect(fundingCalls).toBe(2);
    expect(spotCalls).toBe(2);
  });

  it("returns stale cached data when a refresh fails after TTL expiry", async () => {
    resetFundingSnapshotCacheForTests();
    let shouldFail = false;
    const baseOptions = {
      cacheKey: "stale-test",
      saveHistory: false,
      fetchFundingMarkets: async () => {
        if (shouldFail) throw new Error("funding timeout");
        return { data: [perp("Binance")], sourceStatus: { Binance: "ok", OKX: "failed", Bybit: "failed" } as const };
      },
      fetchSpotMarkets: async () => {
        if (shouldFail) throw new Error("spot timeout");
        return { data: [spot("Binance")], sourceStatus: { Binance: "ok", OKX: "failed", Bybit: "failed" } as const };
      }
    };

    const fresh = await getFundingSnapshot({ ...baseOptions, now: 1_000 });
    shouldFail = true;
    const stale = await getFundingSnapshot({ ...baseOptions, now: 70_000 });

    expect(fresh.stale).toBe(false);
    expect(stale.stale).toBe(true);
    expect(stale.fundingMarkets).toHaveLength(1);
    expect(stale.errors.join(" ")).toContain("funding timeout");
    expect(stale.sourceStatus).toEqual({ Binance: "stale", OKX: "stale", Bybit: "stale" });
  });

  it("keeps partial exchange data and source status when one source fails", async () => {
    resetFundingSnapshotCacheForTests();

    const snapshot = await getFundingSnapshot({
      cacheKey: "partial-test",
      now: 1_000,
      saveHistory: false,
      fetchFundingMarkets: async () => ({
        data: [perp("Binance")],
        error: "OKX funding timeout",
        sourceStatus: { Binance: "ok", OKX: "failed", Bybit: "ok" }
      }),
      fetchSpotMarkets: async () => ({
        data: [spot("Binance")],
        sourceStatus: { Binance: "ok", OKX: "ok", Bybit: "ok" }
      })
    });

    expect(snapshot.fundingMarkets).toHaveLength(1);
    expect(snapshot.errors).toEqual(["OKX funding timeout"]);
    expect(snapshot.sourceStatus).toEqual({ Binance: "ok", OKX: "failed", Bybit: "ok" });
    expect(snapshot.stale).toBe(false);
  });
});
