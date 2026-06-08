export type NotificationEventType =
  | "Alpha Signal"
  | "Stable Alpha Signal"
  | "Risky Alpha Warning"
  | "Funding Heat Warning";

export type NotificationSeverity = "info" | "success" | "warning";
/** Channels supported in V1 (in-app) and planned for future (telegram, email). */
export type NotificationChannel = "in-app" | "telegram" | "email";
export type NotificationSource = "alpha" | "heatmap";

export type NotificationRule = {
  id: string;
  name: string;
  enabled: boolean;
  eventType: NotificationEventType;
  threshold: number;
  cooldownMinutes: number;
  channel: NotificationChannel;
};

export type NotificationEvent = {
  id: string;
  eventType: NotificationEventType;
  severity: NotificationSeverity;
  title: string;
  message: string;
  symbol: string;
  exchange?: string;
  createdAt: number;
  source: NotificationSource;
  dedupeKey: string;
};

/* ── Channel Configuration (extension points for future phases) ── */

/** Per-channel settings for notification delivery. */
export type TelegramChannelConfig = {
  botToken: string;
  chatId: string;
  parseMode?: "HTML" | "Markdown";
};

export type EmailChannelConfig = {
  smtpHost: string;
  smtpPort: number;
  username: string;
  /** App password or SMTP token. */
  password: string;
  fromAddress: string;
  toAddresses: string[];
  useTls?: boolean;
};

export type NotificationChannelConfig = {
  telegram?: TelegramChannelConfig;
  email?: EmailChannelConfig;
};

/**
 * Interface for a notification channel dispatcher.
 * Implementations handle delivery for a specific channel type.
 */
export interface NotificationDispatcher {
  readonly channel: NotificationChannel;
  /** Send a single notification event. Returns true on success. */
  send(event: NotificationEvent, config: NotificationChannelConfig): Promise<boolean>;
}

/** Registry of available dispatchers, keyed by channel name. */
export const NOTIFICATION_DISPATCHERS = new Map<NotificationChannel, NotificationDispatcher>();

/* ── Default Rules ─────────────────────────────────────── */

export const DEFAULT_NOTIFICATION_RULES: NotificationRule[] = [
  {
    id: "alpha-score-80",
    name: "Alpha Score >= 80",
    enabled: true,
    eventType: "Alpha Signal",
    threshold: 80,
    cooldownMinutes: 60,
    channel: "in-app"
  },
  {
    id: "stable-alpha-score-80",
    name: "Stable Alpha Score >= 80",
    enabled: true,
    eventType: "Stable Alpha Signal",
    threshold: 80,
    cooldownMinutes: 60,
    channel: "in-app"
  },
  {
    id: "risky-alpha-50",
    name: "Risky Alpha Warning",
    enabled: true,
    eventType: "Risky Alpha Warning",
    threshold: 50,
    cooldownMinutes: 30,
    channel: "in-app"
  },
  {
    id: "funding-heat-80",
    name: "Funding Heat Warning",
    enabled: true,
    eventType: "Funding Heat Warning",
    threshold: 80,
    cooldownMinutes: 30,
    channel: "in-app"
  }
];
