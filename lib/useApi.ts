"use client";

import { useCallback, useEffect, useRef, useState } from "react";

type UseApiOptions<T> = {
  /** Fetch URL */
  url: string;
  /** Timeout in ms (default 30s) */
  timeout?: number;
  /** Number of retries on failure (default 0) */
  retries?: number;
  /** Auto-fetch on mount (default true) */
  immediate?: boolean;
  /** Called with parsed data on each successful fetch */
  onSuccess?: (data: T) => void;
  /** Called with error message on failure */
  onError?: (error: string) => void;
};

type UseApiResult<T> = {
  /** Parsed response data */
  data: T | null;
  /** Array of error messages */
  errors: string[];
  /** True while loading */
  loading: boolean;
  /** True if the response is stale/cached */
  stale: boolean;
  /** Last updated timestamp */
  updatedAt: number | null;
  /** Re-fetch the data */
  refetch: () => void;
};

type ApiEnvelope<T> = {
  data: T;
  errors?: string[];
  stale?: boolean;
  updatedAt: number;
};

/**
 * A shared data-fetching hook with timeout, retry, and stale detection.
 *
 * Usage:
 *   const { data, loading, errors, refetch } = useApi<MyType>({ url: "/api/foo" });
 */
export function useApi<T>({
  url,
  timeout = 30_000,
  retries = 0,
  immediate = true,
  onSuccess,
  onError,
}: UseApiOptions<T>): UseApiResult<T> {
  const [data, setData] = useState<T | null>(null);
  const [errors, setErrors] = useState<string[]>([]);
  const [loading, setLoading] = useState(immediate);
  const [stale, setStale] = useState(false);
  const [updatedAt, setUpdatedAt] = useState<number | null>(null);
  const requestInFlight = useRef(false);
  const abortControllerRef = useRef<AbortController | null>(null);

  const fetchData = useCallback(async () => {
    if (requestInFlight.current) return;
    requestInFlight.current = true;
    setLoading(true);
    setErrors([]);

    let lastError: string | null = null;
    let attempts = 0;
    const maxAttempts = retries + 1;

    while (attempts < maxAttempts) {
      attempts++;
      abortControllerRef.current?.abort();
      const controller = new AbortController();
      abortControllerRef.current = controller;

      const timer = setTimeout(() => controller.abort(), timeout);

      try {
        const response = await fetch(url, { cache: "no-store", signal: controller.signal });
        clearTimeout(timer);

        if (!response.ok) {
          throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }

        const payload = (await response.json()) as ApiEnvelope<T>;
        setData(payload.data);
        setStale(Boolean(payload.stale));
        setUpdatedAt(payload.updatedAt ?? Date.now());
        if (payload.errors?.length) {
          setErrors(payload.errors);
        }
        onSuccess?.(payload.data);
        requestInFlight.current = false;
        setLoading(false);
        return;
      } catch (error) {
        clearTimeout(timer);
        if (error instanceof Error && error.name === "AbortError") {
          lastError = attempts < maxAttempts ? "请求超时，正在重试..." : "请求超时，请稍后重试。";
        } else {
          lastError = error instanceof Error ? error.message : "数据加载失败，请稍后重试。";
        }
      }
    }

    setErrors([lastError ?? "数据加载失败"]);
    onError?.(lastError ?? "数据加载失败");
    requestInFlight.current = false;
    setLoading(false);
  }, [url, timeout, retries, onSuccess, onError]);

  useEffect(() => {
    if (immediate) {
      fetchData();
    }
    return () => {
      abortControllerRef.current?.abort();
    };
  }, [fetchData, immediate]);

  return { data, errors, loading, stale, updatedAt, refetch: fetchData };
}
