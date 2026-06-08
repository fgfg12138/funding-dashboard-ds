export type LocalNotificationType = "risk" | "confirmation" | "queue" | "safety" | "system";
export type LocalNotificationSeverity = "info" | "warning" | "blocked" | "error";

export type LocalNotification = {
  id: string;
  type: LocalNotificationType;
  severity: LocalNotificationSeverity;
  title: string;
  message: string;
  entityType: string;
  entityId: string;
  symbol?: string;
  createdAt: number;
  readAt: number | null;
  source: "local";
};

export type CreateLocalNotificationInput = {
  type: LocalNotificationType;
  severity: LocalNotificationSeverity;
  title: string;
  message: string;
  entityType: string;
  entityId: string;
  symbol?: string;
};
