type CacheEntry = { expiresAt: number; value: Promise<unknown> };

const entries = new Map<string, CacheEntry>();

/** Small process-local cache for repeat public reads; failed loads are never cached. */
export function cacheServerRead<T>(key: string, ttlMs: number, load: () => Promise<T>): Promise<T> {
  const now = Date.now();
  const cached = entries.get(key);
  if (cached && cached.expiresAt > now) return cached.value as Promise<T>;
  if (cached) entries.delete(key);

  const value = load().catch((error) => {
    entries.delete(key);
    throw error;
  });
  entries.set(key, { expiresAt: now + ttlMs, value });
  if (entries.size > 500) {
    for (const [entryKey, entry] of entries) {
      if (entry.expiresAt <= now) entries.delete(entryKey);
      if (entries.size <= 400) break;
    }
  }
  return value;
}
