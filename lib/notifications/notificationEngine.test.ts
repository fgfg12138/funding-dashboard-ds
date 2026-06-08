import { describe, expect, it } from "vitest";
import { evaluateNotifications } from "./notificationEngine";
import type { NotificationEvent, NotificationRule } from "./notificationRules";
import type { AlphaOpportunity } from "../research/alphaScore";
import type { FundingHeatmapRow } from "../research/fundingHeatmap";

const NOW = Date.UTC(2026, 5, 4, 12);

function alpha(overrides: Partial<AlphaOpportunity> = {}): AlphaOpportunity {
  return {
    id: "cross-exchange:BTC/USDT:Bybit:Binance",
    symbol: "BTC/USDT",
    type: "cross-exchange",
    latestAnnualized: 90,
    avgAnnualized: 70,
    fundingVolatility: 20,
    positiveFundingRatio: 0.95,
    volume24h: 10_000_000,
    openInterestUsd: 20_000_000,
    priceSpread: 0.3,
    score: 80,
    survivalHours: 12,
    annualizedDecay: 8,
    qualityScore: 82,
    alphaScore: 84,
    alphaGrade: "A",
    alphaType: "Stable Alpha",
    alphaReason: "Stable funding signal.",
    exchangePair: "Bybit / Binance",
    ...overrides
  };
}

function heatmap(overrides: Partial<FundingHeatmapRow> = {}): FundingHeatmapRow {
  return {
    exchange: "Binance",
    symbol: "BTC/USDT",
    latestAnnualized: 95,
    avgAnnualized: 70,
    maxAnnualized: 100,
    minAnnualized: 20,
    snapshotCount: 5,
    positiveFundingRatio: 1,
    negativeFundingRatio: 0,
    volatility: 18,
    latestTimestamp: NOW,
    ...overrides
  };
}

function rule(overrides: Partial<NotificationRule>): NotificationRule {
  return {
    id: "rule",
    name: "Rule",
    enabled: true,
    eventType: "Alpha Signal",
    threshold: 80,
    cooldownMinutes: 60,
    channel: "in-app",
    ...overrides
  };
}

describe("notification engine", () => {
  it("emits alpha signal events when alpha score crosses the threshold", () => {
    const events = evaluateNotifications({
      alphaRows: [alpha({ alphaScore: 85 })],
      heatmapRows: [],
      rules: [rule({ eventType: "Alpha Signal", threshold: 80 })],
      now: NOW
    });

    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({
      eventType: "Alpha Signal",
      severity: "info",
      symbol: "BTC/USDT",
      source: "alpha"
    });
  });

  it("emits stable alpha signal only for stable alpha rows above threshold", () => {
    const events = evaluateNotifications({
      alphaRows: [
        alpha({ symbol: "BTC/USDT", alphaScore: 86, alphaType: "Stable Alpha" }),
        alpha({ id: "cross-exchange:ETH/USDT:Bybit:Binance", symbol: "ETH/USDT", alphaScore: 90, alphaType: "Momentum Alpha" })
      ],
      heatmapRows: [],
      rules: [rule({ eventType: "Stable Alpha Signal", threshold: 80 })],
      now: NOW
    });

    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({
      eventType: "Stable Alpha Signal",
      symbol: "BTC/USDT",
      severity: "success"
    });
  });

  it("emits risky alpha warnings from type, volatility, or decay", () => {
    const events = evaluateNotifications({
      alphaRows: [
        alpha({ symbol: "TYPE/USDT", alphaType: "Risky Alpha", fundingVolatility: 10, annualizedDecay: 5 }),
        alpha({ id: "cross-exchange:VOL/USDT:Bybit:Binance", symbol: "VOL/USDT", alphaType: "Stable Alpha", fundingVolatility: 90, annualizedDecay: 5 }),
        alpha({ id: "cross-exchange:DECAY/USDT:Bybit:Binance", symbol: "DECAY/USDT", alphaType: "Stable Alpha", fundingVolatility: 10, annualizedDecay: 55 })
      ],
      heatmapRows: [],
      rules: [rule({ eventType: "Risky Alpha Warning", threshold: 50 })],
      now: NOW
    });

    expect(events.map((event) => event.symbol)).toEqual(["TYPE/USDT", "VOL/USDT", "DECAY/USDT"]);
    expect(events.every((event) => event.severity === "warning")).toBe(true);
  });

  it("emits funding heat warnings from high latest annualized or volatility", () => {
    const events = evaluateNotifications({
      alphaRows: [],
      heatmapRows: [
        heatmap({ symbol: "HOT/USDT", latestAnnualized: 120, volatility: 10 }),
        heatmap({ symbol: "VOL/USDT", latestAnnualized: 20, volatility: 95 }),
        heatmap({ symbol: "CALM/USDT", latestAnnualized: 20, volatility: 10 })
      ],
      rules: [rule({ eventType: "Funding Heat Warning", threshold: 80 })],
      now: NOW
    });

    expect(events.map((event) => event.symbol)).toEqual(["HOT/USDT", "VOL/USDT"]);
    expect(events[0]).toMatchObject({
      eventType: "Funding Heat Warning",
      exchange: "Binance",
      source: "heatmap"
    });
  });

  it("uses dedupe keys and cooldown to suppress repeated signals", () => {
    const previousEvent: NotificationEvent = {
      id: "previous",
      eventType: "Alpha Signal",
      severity: "info",
      title: "Previous",
      message: "Previous message",
      symbol: "BTC/USDT",
      createdAt: NOW - 10 * 60_000,
      source: "alpha",
      dedupeKey: "Alpha Signal:alpha:BTC/USDT:Bybit / Binance"
    };

    const events = evaluateNotifications({
      alphaRows: [alpha({ alphaScore: 90 })],
      heatmapRows: [],
      previousEvents: [previousEvent],
      rules: [rule({ eventType: "Alpha Signal", threshold: 80, cooldownMinutes: 60 })],
      now: NOW
    });

    expect(events).toEqual([]);

    const afterCooldown = evaluateNotifications({
      alphaRows: [alpha({ alphaScore: 90 })],
      heatmapRows: [],
      previousEvents: [{ ...previousEvent, createdAt: NOW - 61 * 60_000 }],
      rules: [rule({ eventType: "Alpha Signal", threshold: 80, cooldownMinutes: 60 })],
      now: NOW
    });

    expect(afterCooldown).toHaveLength(1);
    expect(afterCooldown[0].dedupeKey).toBe("Alpha Signal:alpha:BTC/USDT:Bybit / Binance");
  });
});
