import { appendFile, mkdir, readFile, readdir } from "node:fs/promises";
import { dirname, join } from "node:path";
import type { NotificationEvent } from "./notificationRules";

const DEFAULT_NOTIFICATION_DIR = join(process.cwd(), ".data");
const DEFAULT_LIMIT = 200;

export type NotificationStoreOptions = {
  notificationDir?: string;
  limit?: number;
};

export async function appendNotificationEvents(
  events: NotificationEvent[],
  options: NotificationStoreOptions = {}
): Promise<void> {
  if (events.length === 0) {
    return;
  }

  const grouped = groupBy(events, (event) => formatShardDate(event.createdAt));
  await Promise.all(
    Array.from(grouped.entries()).map(([date, rows]) => {
      const path = getNotificationShardPath(options.notificationDir, date);
      return appendJsonLines(path, rows);
    })
  );
}

export async function queryNotificationEvents(options: NotificationStoreOptions = {}): Promise<NotificationEvent[]> {
  const files = await listNotificationFiles(options.notificationDir);
  const rows = (await Promise.all(files.map((file) => readJsonLines<NotificationEvent>(join(options.notificationDir ?? DEFAULT_NOTIFICATION_DIR, file))))).flat();
  const limit = normalizeLimit(options.limit);

  return rows.sort((a, b) => b.createdAt - a.createdAt).slice(0, limit);
}

async function appendJsonLines<T>(path: string, rows: T[]): Promise<void> {
  await mkdir(dirname(path), { recursive: true });
  await appendFile(path, `${rows.map((row) => JSON.stringify(row)).join("\n")}\n`, "utf8");
}

async function listNotificationFiles(notificationDir = DEFAULT_NOTIFICATION_DIR): Promise<string[]> {
  let files: string[] = [];
  try {
    files = await readdir(notificationDir);
  } catch (error) {
    if (error instanceof Error && "code" in error && error.code === "ENOENT") {
      return [];
    }
    throw error;
  }

  return files.filter((file) => /^notifications-\d{4}-\d{2}-\d{2}\.jsonl$/.test(file)).sort((a, b) => b.localeCompare(a));
}

async function readJsonLines<T>(path: string): Promise<T[]> {
  let content = "";
  try {
    content = await readFile(path, "utf8");
  } catch (error) {
    if (error instanceof Error && "code" in error && error.code === "ENOENT") {
      return [];
    }
    throw error;
  }

  return content
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      try {
        return JSON.parse(line) as T;
      } catch {
        return undefined;
      }
    })
    .filter((row): row is T => Boolean(row));
}

function getNotificationShardPath(notificationDir = DEFAULT_NOTIFICATION_DIR, date: string): string {
  return join(notificationDir, `notifications-${date}.jsonl`);
}

function formatShardDate(timestamp: number): string {
  return new Date(timestamp).toISOString().slice(0, 10);
}

function normalizeLimit(limit: number | undefined): number {
  if (!Number.isFinite(limit) || limit === undefined || limit <= 0) {
    return DEFAULT_LIMIT;
  }

  return Math.floor(limit);
}

function groupBy<T>(items: T[], keyFn: (item: T) => string): Map<string, T[]> {
  const grouped = new Map<string, T[]>();
  for (const item of items) {
    const key = keyFn(item);
    const bucket = grouped.get(key) ?? [];
    bucket.push(item);
    grouped.set(key, bucket);
  }
  return grouped;
}
