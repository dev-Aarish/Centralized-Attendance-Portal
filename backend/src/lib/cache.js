import { LRUCache } from 'lru-cache'

// ─── Response Cache ───────────────────────────────────────────────────────────
// Caches full API responses for heavy read endpoints.
// Keyed by userId + endpoint path. 60-second TTL to keep data fresh enough.
const responseCache = new LRUCache({
  max: 1000,
  ttl: 60 * 1000,
})

export function getCachedResponse(userId, path) {
  return responseCache.get(`${userId}::${path}`) || null
}

export function setCachedResponse(userId, path, data) {
  responseCache.set(`${userId}::${path}`, data)
}

export function invalidateUserResponses(userId) {
  for (const key of responseCache.keys()) {
    if (key.startsWith(`${userId}::`)) {
      responseCache.delete(key)
    }
  }
}

// ─── Dev-only logging ─────────────────────────────────────────────────────────
export function devLog(...args) {
  if (process.env.NODE_ENV !== 'production') {
    console.log(...args)
  }
}
