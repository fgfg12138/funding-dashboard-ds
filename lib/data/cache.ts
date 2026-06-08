type CacheEntry<T> = {
  expiresAt: number;
  value: Promise<T>;
};

const cache = new Map<string, CacheEntry<unknown>>();

export function getCached<T>(key: string, ttlMs: number, loader: () => Promise<T>): Promise<T> {
  const now = Date.now();
  const cached = cache.get(key) as CacheEntry<T> | undefined;

  if (cached && cached.expiresAt > now) {
    return cached.value;
  }

  const value = loader().catch((error) => {
    if (cached) {
      cache.set(key, {
        expiresAt: Date.now() + Math.min(ttlMs, 15_000),
        value: cached.value
      });
      return cached.value;
    }

    cache.delete(key);
    throw error;
  });
  cache.set(key, {
    expiresAt: now + ttlMs,
    value
  });

  return value;
}
