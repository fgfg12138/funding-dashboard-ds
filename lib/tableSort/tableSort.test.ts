import { describe, expect, it } from "vitest";
import { applySort, buildSortQuery, parseSortState, sortIndicator, toggleSortState } from "./tableSort";

type SortKey = "score" | "annualized";

describe("tableSort", () => {
  it("uses default sort and order when query params are missing or invalid", () => {
    expect(parseSortState<SortKey>({
      allowedSorts: ["score", "annualized"],
      defaultOrder: "desc",
      defaultSort: "score",
      order: null,
      sort: null
    })).toEqual({ sort: "score", order: "desc" });

    expect(parseSortState<SortKey>({
      allowedSorts: ["score", "annualized"],
      defaultOrder: "desc",
      defaultSort: "score",
      order: "sideways",
      sort: "volume"
    })).toEqual({ sort: "score", order: "desc" });
  });

  it("toggles the current column and defaults a new column to descending", () => {
    expect(toggleSortState<SortKey>({ sort: "score", order: "desc" }, "score")).toEqual({ sort: "score", order: "asc" });
    expect(toggleSortState<SortKey>({ sort: "score", order: "asc" }, "annualized")).toEqual({ sort: "annualized", order: "desc" });
  });

  it("sorts rows in asc or desc order", () => {
    const rows = [{ score: 1, annualized: 30 }, { score: 3, annualized: 10 }, { score: 2, annualized: 20 }];
    const selectors = {
      score: (row: (typeof rows)[number]) => row.score,
      annualized: (row: (typeof rows)[number]) => row.annualized
    };

    expect(applySort(rows, { sort: "score", order: "desc" }, selectors).map((row) => row.score)).toEqual([3, 2, 1]);
    expect(applySort(rows, { sort: "annualized", order: "asc" }, selectors).map((row) => row.annualized)).toEqual([10, 20, 30]);
  });

  it("keeps sort state in URL query strings and renders indicators", () => {
    const query = buildSortQuery<SortKey>({ sort: "score", order: "desc" }, "score", new URLSearchParams("module=cross"));

    expect(query).toBe("module=cross&sort=score&order=asc");
    expect(sortIndicator<SortKey>({ sort: "score", order: "asc" }, "score")).toBe(" ↑");
    expect(sortIndicator<SortKey>({ sort: "score", order: "desc" }, "score")).toBe(" ↓");
    expect(sortIndicator<SortKey>({ sort: "score", order: "desc" }, "annualized")).toBe("");
  });
});
