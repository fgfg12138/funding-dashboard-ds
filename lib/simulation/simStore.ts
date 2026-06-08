import { appendFile, mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import type { SimAccountSnapshot, SimAccountState } from "./simAccount";

const DEFAULT_SIM_DIR = join(process.cwd(), ".data");
const ACCOUNT_STATE_FILE = "simulation-account.json";
const DEFAULT_LIMIT = 500;

export type SimStoreOptions = {
  simulationDir?: string;
  limit?: number;
};

export async function readSimAccountState(options: SimStoreOptions = {}): Promise<SimAccountState | undefined> {
  const path = getAccountStatePath(options.simulationDir);
  try {
    return JSON.parse(await readFile(path, "utf8")) as SimAccountState;
  } catch (error) {
    if (error instanceof Error && "code" in error && error.code === "ENOENT") {
      return undefined;
    }
    throw error;
  }
}

export async function writeSimAccountState(state: SimAccountState, options: SimStoreOptions = {}): Promise<void> {
  const path = getAccountStatePath(options.simulationDir);
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, `${JSON.stringify(state, null, 2)}\n`, "utf8");
}

export async function appendSimSnapshot(snapshot: SimAccountSnapshot, options: SimStoreOptions = {}): Promise<void> {
  const path = getSnapshotShardPath(options.simulationDir, formatShardDate(snapshot.timestamp));
  await mkdir(dirname(path), { recursive: true });
  await appendFile(path, `${JSON.stringify(snapshot)}\n`, "utf8");
}

export async function querySimSnapshots(options: SimStoreOptions = {}): Promise<SimAccountSnapshot[]> {
  const simulationDir = options.simulationDir ?? DEFAULT_SIM_DIR;
  const files = await listSnapshotFiles(simulationDir);
  const rows = (await Promise.all(files.map((file) => readJsonLines<SimAccountSnapshot>(join(simulationDir, file))))).flat();
  const limit = normalizeLimit(options.limit);

  return rows.sort((a, b) => b.timestamp - a.timestamp).slice(0, limit);
}

function getAccountStatePath(simulationDir = DEFAULT_SIM_DIR): string {
  return join(simulationDir, ACCOUNT_STATE_FILE);
}

function getSnapshotShardPath(simulationDir = DEFAULT_SIM_DIR, date: string): string {
  return join(simulationDir, `simulation-snapshots-${date}.jsonl`);
}

async function listSnapshotFiles(simulationDir: string): Promise<string[]> {
  let files: string[] = [];
  try {
    files = await readdir(simulationDir);
  } catch (error) {
    if (error instanceof Error && "code" in error && error.code === "ENOENT") {
      return [];
    }
    throw error;
  }

  return files.filter((file) => /^simulation-snapshots-\d{4}-\d{2}-\d{2}\.jsonl$/.test(file)).sort((a, b) => b.localeCompare(a));
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

function formatShardDate(timestamp: number): string {
  return new Date(timestamp).toISOString().slice(0, 10);
}

function normalizeLimit(limit: number | undefined): number {
  if (!Number.isFinite(limit) || limit === undefined || limit <= 0) {
    return DEFAULT_LIMIT;
  }

  return Math.floor(limit);
}
