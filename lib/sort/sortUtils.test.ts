import { describe, expect, it } from "vitest";
import { applySort, parseSortQuery, sortDate, sortNumber, sortString, toggleSortOrder } from "./sortUtils";

type SortKey = "score" | "name" | "createdAt";

describe("sortUtils", () => {
  it("falls back to default sort when query values are missing or invalid", () => {
    expect(parseSortQuery<SortKey>({
      allowedSorts: ["score", "name", "createdAt"],
      defaultOrder: "desc",
      defaultSort: "score",
      order: "sideways",
      sort: "volume"
    })).toEqual({ sort: "score", order: "desc" });
  });

  it("toggles current sort and defaults a new sort to descending", () => {
    expect(toggleSortOrder<SortKey>({ sort: "score", order: "desc" }, "score")).toEqual({ sort: "score", order: "asc" });
    expect(toggleSortOrder<SortKey>({ sort: "score", order: "asc" }, "name")).toEqual({ sort: "name", order: "desc" });
  });

  it("sorts number, string, and date columns", () => {
    const rows = [
      { score: 2, name: "OKX", createdAt: 200 },
      { score: 3, name: "Binance", createdAt: 100 },
      { score: 1, name: "Bybit", createdAt: 300 }
    ];
    const comparators = {
      createdAt: sortDate<(typeof rows)[number]>((row) => row.createdAt),
      name: sortString<(typeof rows)[number]>((row) => row.name),
      score: sortNumber<(typeof rows)[number]>((row) => row.score)
    };

    expect(applySort(rows, { sort: "score", order: "desc" }, comparators).map((row) => row.score)).toEqual([3, 2, 1]);
    expect(applySort(rows, { sort: "name", order: "asc" }, comparators).map((row) => row.name)).toEqual(["Binance", "Bybit", "OKX"]);
    expect(applySort(rows, { sort: "createdAt", order: "asc" }, comparators).map((row) => row.createdAt)).toEqual([100, 200, 300]);
  });
});
