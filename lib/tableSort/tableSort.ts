import {
  applySort as applyComparatorSort,
  compareNullableNumber,
  parseSortQuery,
  toggleSortOrder,
  type SortOrder,
  type SortState
} from "../sort/sortUtils";

export type { SortOrder, SortState };

export function parseSortState<TSort extends string>(options: {
  allowedSorts: readonly TSort[];
  defaultOrder: SortOrder;
  defaultSort: TSort;
  order?: string | null;
  sort?: string | null;
}): SortState<TSort> {
  return parseSortQuery(options);
}

export function toggleSortState<TSort extends string>(
  current: SortState<TSort>,
  nextSort: TSort
): SortState<TSort> {
  return toggleSortOrder(current, nextSort);
}

export { compareNullableNumber };

export function applySort<T, TSort extends string>(
  rows: T[],
  sortState: SortState<TSort>,
  selectors: Record<TSort, (row: T) => number | undefined | null>
): T[] {
  const comparators = Object.fromEntries(
    Object.entries(selectors).map(([key, selector]) => [
      key,
      (left: T, right: T) => compareNullableNumber((selector as (row: T) => number | undefined | null)(left), (selector as (row: T) => number | undefined | null)(right))
    ])
  ) as Record<TSort, (left: T, right: T) => number>;

  return applyComparatorSort(rows, sortState, comparators);
}

export function buildSortQuery<TSort extends string>(
  current: SortState<TSort>,
  nextSort: TSort,
  existing?: URLSearchParams
): string {
  const next = toggleSortState(current, nextSort);
  const params = new URLSearchParams(existing);
  params.set("sort", next.sort);
  params.set("order", next.order);
  return params.toString();
}

export function sortIndicator<TSort extends string>(current: SortState<TSort>, sort: TSort): string {
  if (current.sort !== sort) return "";
  return current.order === "asc" ? " ↑" : " ↓";
}
