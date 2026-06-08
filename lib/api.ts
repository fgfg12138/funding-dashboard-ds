/**
 * Shared API response envelope used by all read-only pages.
 *
 * Every server endpoint returns this shape so client components
 * can rely on a consistent contract.
 */
export type ApiResponse<T> = {
  data: T;
  errors?: string[];
  stale?: boolean;
  updatedAt: number;
};
