const cache = new Map();

export async function cachedFetch(url, ttlMs = 30_000, options = {}) {
  const cached = cache.get(url);
  const now = Date.now();
  if (cached && now - cached.timestamp < ttlMs) {
    return cached.data;
  }
  const res = await fetch(url, options);
  if (!res.ok) {
    throw new Error(`Request failed: ${res.status}`);
  }
  const data = await res.json();
  cache.set(url, { data, timestamp: now });
  return data;
}

export function invalidateCache(urlPattern) {
  for (const key of cache.keys()) {
    if (key.includes(urlPattern)) {
      cache.delete(key);
    }
  }
}
