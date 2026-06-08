export type SafetyState = {
  killSwitchEnabled: boolean;
  reason: string | null;
  enabledBy: "local-user" | "system";
  enabledAt: number | null;
  disabledAt: number | null;
  updatedAt: number;
  source: "local";
};
