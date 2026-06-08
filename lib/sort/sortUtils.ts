export type SortOrder = "asc" | "desc";

export type SortState<TSort extends string> = {
  order: SortOrder;
  sort: TSort;
};

export type SortComparator<T> = (left: T, right: T) => number;

export function parseSortQuery<TSort extends string>({
  allowedSorts,
  defaultOrder,
  defaultSort,
  order,
  sort
}: {
  allowedSorts: readonly TSort[];
  defaultOrder: SortOrder;
  defaultSort: TSort;
  order?: string | null;
  sort?: string | null;
}): SortState<TSort> {
  return {
    order: order === "asc" || order === "desc" ? order : defaultOrder,
    sort: allowedSorts.includes(sort as TSort) ? sort as TSort : defaultSort
  };
}

export function toggleSortOrder<TSort extends string>(
  current: SortState<TSort>,
  nextSort: TSort
): SortState<TSort> {
  if (current.sort !== nextSort) {
    return { sort: nextSort, order: "desc" };
  }

  return {
    sort: nextSort,
    order: current.order === "desc" ? "asc" : "desc"
  };
}

export function sortNumber<T>(selector: (row: T) => number | undefined | null): SortComparator<T> {
  return (left, right) => compareNullableNumber(selector(left), selector(right));
}

export function sortString<T>(selector: (row: T) => string | undefined | null): SortComparator<T> {
  return (left, right) => (selector(left) ?? "").localeCompare(selector(right) ?? "");
}

export function sortDate<T>(selector: (row: T) => number | Date | string | undefined | null): SortComparator<T> {
  return (left, right) => compareNullableNumber(toTimestamp(selector(left)), toTimestamp(selector(right)));
}

export function applySort<T, TSort extends string>(
  rows: T[],
  sortState: SortState<TSort>,
  comparators: Record<TSort, SortComparator<T>>
): T[] {
  const direction = sortState.order === "asc" ? 1 : -1;

  return rows.slice().sort((left, right) => {
    const compared = comparators[sortState.sort](left, right);
    return compared === 0 ? 0 : compared * direction;
  });
}

export function compareNullableNumber(left: number | undefined | null, right: number | undefined | null): number {
  const normalizedLeft = Number.isFinite(left) ? Number(left) : Number.NEGATIVE_INFINITY;
  const normalizedRight = Number.isFinite(right) ? Number(right) : Number.NEGATIVE_INFINITY;

  return normalizedLeft - normalizedRight;
}

function toTimestamp(value: number | Date | string | undefined | null): number | undefined {
  if (value instanceof Date) {
    return value.getTime();
  }
  if (typeof value === "number") {
    return value;
  }
  if (typeof value === "string") {
    const parsed = Date.parse(value);
    return Number.isFinite(parsed) ? parsed : undefined;
  }

  return undefined;
}
