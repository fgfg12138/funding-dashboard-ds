import { queryAllFundingHistory, queryAllOpportunityHistory } from "../data/historyStore";
import { buildAlphaDiscovery, parseAlphaWindowHours } from "../research/alphaScore";
import { buildFundingFactorResearch } from "../research/fundingFactors";
import { buildFundingHeatmap } from "../research/fundingHeatmap";
import { evaluateNotifications } from "./notificationEngine";
import { DEFAULT_NOTIFICATION_RULES, type NotificationEvent } from "./notificationRules";
import { appendNotificationEvents, queryNotificationEvents } from "./notificationStore";

export type EvaluateNotificationSignalsOptions = {
  window?: string | null;
  now?: number;
};

export async function evaluateNotificationSignals(
  options: EvaluateNotificationSignalsOptions = {}
): Promise<{ events: NotificationEvent[]; evaluatedAt: number }> {
  const now = options.now ?? Date.now();
  const windowHours = parseAlphaWindowHours(options.window);
  const from = now - windowHours * 60 * 60_000;
  const [opportunityRows, fundingRows, previousEvents] = await Promise.all([
    queryAllOpportunityHistory({ from, to: now, limit: 5000 }),
    queryAllFundingHistory({ from, to: now, limit: 5000 }),
    queryNotificationEvents({ limit: 1000 })
  ]);
  const factorResearch = buildFundingFactorResearch({ opportunityRows, fundingRows, now, windowHours });
  const alphaRows = buildAlphaDiscovery({ samples: factorResearch.samples, limit: factorResearch.samples.length }).topAlpha;
  const heatmapRows = buildFundingHeatmap(fundingRows, { now, windowHours, limit: 5000 }).rows;
  const events = evaluateNotifications({
    alphaRows,
    heatmapRows,
    previousEvents,
    rules: DEFAULT_NOTIFICATION_RULES,
    now
  });

  await appendNotificationEvents(events);

  return {
    events,
    evaluatedAt: now
  };
}
