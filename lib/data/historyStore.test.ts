import { mkdir, mkdtemp, readdir, readFile, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  queryAllFundingHistory,
  queryAllOpportunityHistory,
  queryFundingHistory,
  queryOpportunityHistory,
  saveHistorySnapshot
} from "./historyStore";
import type { FundingMarket, SpotMarket } from "../exchanges/types";

let tempDir: string;
let historyDir: string;

beforeEach(async () => {
  tempDir = await mkdtemp(join(tmpdir(), "funding-history-"));
  historyDir = join(tempDir, "history");
});

afterEach(async () => {
  await rm(tempDir, { recursive: true, force: true });
});

function fundingMarket(
  exchange: FundingMarket["exchange"],
  fundingRate: number,
  markPrice: number,
  timestampOffset = 0
): FundingMarket {
  return {
    exchange,
    rawSymbol: `${exchange}-BTCUSDT`,
    symbol: "BTC/USDT",
    base: "BTC",
    quote: "USDT",
    fundingRate,
    fundingIntervalHours: 8,
    nextFundingTime: 1_800_000_000_000 + timestampOffset,
    markPrice,
    volume24h: 10_000_000,
    openInterestUsd: 20_000_000
  };
}

function spotMarket(exchange: SpotMarket["exchange"]): SpotMarket {
  return {
    exchange,
    symbol: "BTC/USDT",
    base: "BTC",
    quote: "USDT",
    price: 100_000,
    volume24h: 8_000_000
  };
}

describe("historyStore", () => {
  it("writes and queries funding history by symbol", async () => {
    await saveHistorySnapshot({
      fundingMarkets: [
        fundingMarket("Binance", 0.0001, 100_000),
        fundingMarket("Bybit", 0.0002, 100_100)
      ],
      spotMarkets: [],
      timestamp: 1_700_000_000_000,
      historyDir
    });

    const rows = await queryFundingHistory("BTC/USDT", { historyDir });

    expect(rows).toHaveLength(2);
    expect(rows[0]).toMatchObject({
      exchange: "Binance",
      symbol: "BTC/USDT",
      fundingRate: 0.0001,
      markPrice: 100_000,
      timestamp: 1_700_000_000_000
    });
    expect(rows[0].annualizedRate).toBeCloseTo(10.95);
  });

  it("writes and queries derived opportunity history by symbol", async () => {
    await saveHistorySnapshot({
      fundingMarkets: [
        fundingMarket("Binance", 0.0002, 100_300),
        fundingMarket("Bybit", -0.0001, 100_000)
      ],
      spotMarkets: [spotMarket("Binance")],
      timestamp: 1_700_000_000_000,
      historyDir
    });

    const rows = await queryOpportunityHistory("BTC/USDT", { historyDir });

    expect(rows.map((row) => row.type).sort()).toEqual(["cross-exchange", "spot-perp"]);
    expect(rows[0]).toMatchObject({
      symbol: "BTC/USDT",
      timestamp: 1_700_000_000_000
    });
    expect(rows.some((row) => typeof row.priceSpread === "number")).toBe(true);
  });

  it("writes funding and opportunity history into date-sharded files", async () => {
    await saveHistorySnapshot({
      fundingMarkets: [
        fundingMarket("Binance", 0.0002, 100_300),
        fundingMarket("Bybit", -0.0001, 100_000)
      ],
      spotMarkets: [spotMarket("Binance")],
      timestamp: Date.UTC(2026, 5, 4, 12),
      historyDir
    });

    const files = await readdir(historyDir);
    expect(files.sort()).toEqual(["funding-2026-06-04.jsonl", "opportunities-2026-06-04.jsonl"]);

    const fundingContent = await readFile(join(historyDir, "funding-2026-06-04.jsonl"), "utf8");
    const opportunityContent = await readFile(join(historyDir, "opportunities-2026-06-04.jsonl"), "utf8");
    expect(fundingContent).toContain('"exchange":"Binance"');
    expect(opportunityContent).toContain('"type":"cross-exchange"');
    expect(opportunityContent).toContain('"annualized":');
    expect(opportunityContent).toContain('"annualizedSpread":');
    expect(opportunityContent).toContain('"score":');
  });

  it("limits funding history queries to the most recent 5000 rows by default", async () => {
    await mkdir(historyDir, { recursive: true });
    const rows = Array.from({ length: 5001 }, (_, index) =>
      JSON.stringify({
        exchange: "Binance",
        symbol: "BTC/USDT",
        fundingRate: 0.0001,
        annualizedRate: 10,
        markPrice: 100_000,
        nextFundingTime: 1_800_000_000_000,
        timestamp: index + 1
      })
    );
    await writeFile(join(historyDir, "funding-2026-06-04.jsonl"), `${rows.join("\n")}\n`, "utf8");

    const result = await queryFundingHistory("BTC/USDT", { historyDir });

    expect(result).toHaveLength(5000);
    expect(result[0].timestamp).toBe(2);
    expect(result.at(-1)?.timestamp).toBe(5001);
  });

  it("queries all funding history across symbols for heatmap analysis", async () => {
    await mkdir(historyDir, { recursive: true });
    const rows = ["BTC/USDT", "ETH/USDT"].map((symbol, index) =>
      JSON.stringify({
        exchange: "Binance",
        symbol,
        fundingRate: 0.0001,
        annualizedRate: 10 + index,
        markPrice: 100_000,
        nextFundingTime: 1_800_000_000_000,
        timestamp: 1000 + index
      })
    );
    await writeFile(join(historyDir, "funding-2026-06-04.jsonl"), `${rows.join("\n")}\n`, "utf8");

    const result = await queryAllFundingHistory({ historyDir, limit: 10 });

    expect(result.map((row) => row.symbol)).toEqual(["BTC/USDT", "ETH/USDT"]);
  });

  it("filters opportunity history by time range and explicit limit", async () => {
    await mkdir(historyDir, { recursive: true });
    const rows = [1000, 2000, 3000].map((timestamp) =>
      JSON.stringify({
        type: "cross-exchange",
        symbol: "BTC/USDT",
        timestamp,
        annualizedSpread: 20,
        priceSpread: 0.2,
        score: 70,
        exchangeCount: 2
      })
    );
    await writeFile(join(historyDir, "opportunities-2026-06-04.jsonl"), `${rows.join("\n")}\n`, "utf8");

    const result = await queryOpportunityHistory("BTC/USDT", {
      historyDir,
      from: 1500,
      to: 3500,
      limit: 1
    });

    expect(result).toHaveLength(1);
    expect(result[0].timestamp).toBe(3000);
  });

  it("queries all opportunity history across symbols for research analysis", async () => {
    await mkdir(historyDir, { recursive: true });
    const rows = ["BTC/USDT", "ETH/USDT"].map((symbol, index) =>
      JSON.stringify({
        type: "cross-exchange",
        symbol,
        timestamp: 1000 + index,
        annualized: 20 + index,
        annualizedSpread: 20 + index,
        priceSpread: 0.2,
        score: 70,
        exchangeCount: 2
      })
    );
    await writeFile(join(historyDir, "opportunities-2026-06-04.jsonl"), `${rows.join("\n")}\n`, "utf8");

    const result = await queryAllOpportunityHistory({ historyDir, limit: 10 });

    expect(result.map((row) => row.symbol)).toEqual(["BTC/USDT", "ETH/USDT"]);
  });

  it("removes history shards older than the retention window when saving", async () => {
    await mkdir(historyDir, { recursive: true });
    await writeFile(join(historyDir, "funding-2026-04-01.jsonl"), "{}\n", "utf8");
    await writeFile(join(historyDir, "opportunities-2026-04-01.jsonl"), "{}\n", "utf8");
    await writeFile(join(historyDir, "funding-2026-05-10.jsonl"), "{}\n", "utf8");

    await saveHistorySnapshot({
      fundingMarkets: [fundingMarket("Binance", 0.0001, 100_000)],
      spotMarkets: [],
      timestamp: Date.UTC(2026, 5, 4, 12),
      historyDir,
      now: Date.UTC(2026, 5, 4, 12),
      retentionDays: 30
    });

    const files = await readdir(historyDir);
    expect(files).not.toContain("funding-2026-04-01.jsonl");
    expect(files).not.toContain("opportunities-2026-04-01.jsonl");
    expect(files).toContain("funding-2026-05-10.jsonl");
    expect(files).toContain("funding-2026-06-04.jsonl");
  });
});
