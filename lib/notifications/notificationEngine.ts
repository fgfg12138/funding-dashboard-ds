import type { AlphaOpportunity } from "../research/alphaScore";
import type { FundingHeatmapRow } from "../research/fundingHeatmap";
import type { NotificationEvent, NotificationRule } from "./notificationRules";

const MINUTE_MS = 60_000;

export type EvaluateNotificationsInput = {
  alphaRows: AlphaOpportunity[];
  heatmapRows: FundingHeatmapRow[];
  rules: NotificationRule[];
  previousEvents?: NotificationEvent[];
  now?: number;
};

export function evaluateNotifications(input: EvaluateNotificationsInput): NotificationEvent[] {
  const now = input.now ?? Date.now();
  const previousEvents = input.previousEvents ?? [];
  const emittedKeys = new Set<string>();
  const events: NotificationEvent[] = [];

  for (const rule of input.rules.filter((item) => item.enabled && item.channel === "in-app")) {
    const candidates = buildEventsForRule(rule, input.alphaRows, input.heatmapRows, now);
    for (const event of candidates) {
      if (emittedKeys.has(event.dedupeKey)) {
        continue;
      }
      if (isCoolingDown(event, rule, previousEvents, now)) {
        continue;
      }

      emittedKeys.add(event.dedupeKey);
      events.push(event);
    }
  }

  return events;
}

function buildEventsForRule(
  rule: NotificationRule,
  alphaRows: AlphaOpportunity[],
  heatmapRows: FundingHeatmapRow[],
  now: number
): NotificationEvent[] {
  if (rule.eventType === "Alpha Signal") {
    return alphaRows
      .filter((row) => row.alphaScore >= rule.threshold)
      .map((row) => buildAlphaEvent(row, rule, now, "info"));
  }

  if (rule.eventType === "Stable Alpha Signal") {
    return alphaRows
      .filter((row) => row.alphaType === "Stable Alpha" && row.alphaScore >= rule.threshold)
      .map((row) => buildAlphaEvent(row, rule, now, "success"));
  }

  if (rule.eventType === "Risky Alpha Warning") {
    return alphaRows
      .filter(
        (row) =>
          row.alphaType === "Risky Alpha" ||
          row.fundingVolatility >= rule.threshold ||
          row.annualizedDecay >= rule.threshold
      )
      .map((row) => buildAlphaEvent(row, rule, now, "warning"));
  }

  return heatmapRows
    .filter((row) => row.latestAnnualized >= rule.threshold || row.volatility >= rule.threshold)
    .map((row) => buildHeatmapEvent(row, rule, now));
}

function buildAlphaEvent(
  row: AlphaOpportunity,
  rule: NotificationRule,
  now: number,
  severity: NotificationEvent["severity"]
): NotificationEvent {
  const dedupeKey = buildDedupeKey(rule.eventType, "alpha", row.symbol, row.exchangePair);

  return {
    id: buildEventId(now, dedupeKey),
    eventType: rule.eventType,
    severity,
    title: `${rule.eventType}: ${row.symbol}`,
    message: `${row.symbol} alphaScore ${row.alphaScore}, type ${row.alphaType}, grade ${row.alphaGrade}.`,
    symbol: row.symbol,
    exchange: row.exchangePair,
    createdAt: now,
    source: "alpha",
    dedupeKey
  };
}

function buildHeatmapEvent(row: FundingHeatmapRow, rule: NotificationRule, now: number): NotificationEvent {
  const dedupeKey = buildDedupeKey(rule.eventType, "heatmap", row.symbol, row.exchange);

  return {
    id: buildEventId(now, dedupeKey),
    eventType: rule.eventType,
    severity: "warning",
    title: `${rule.eventType}: ${row.symbol}`,
    message: `${row.exchange} ${row.symbol} latest annualized ${row.latestAnnualized.toFixed(2)}%, volatility ${row.volatility.toFixed(2)}%.`,
    symbol: row.symbol,
    exchange: row.exchange,
    createdAt: now,
    source: "heatmap",
    dedupeKey
  };
}

function isCoolingDown(
  event: NotificationEvent,
  rule: NotificationRule,
  previousEvents: NotificationEvent[],
  now: number
): boolean {
  const cooldownMs = Math.max(rule.cooldownMinutes, 0) * MINUTE_MS;
  if (cooldownMs === 0) {
    return false;
  }

  return previousEvents.some((previous) => previous.dedupeKey === event.dedupeKey && now - previous.createdAt < cooldownMs);
}

function buildDedupeKey(
  eventType: NotificationEvent["eventType"],
  source: NotificationEvent["source"],
  symbol: string,
  exchange: string | undefined
): string {
  return [eventType, source, symbol, exchange ?? "-"].join(":");
}

function buildEventId(now: number, dedupeKey: string): string {
  return `${now}:${dedupeKey.replace(/[^a-z0-9]+/gi, "-").replace(/^-|-$/g, "")}`;
}
