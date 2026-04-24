import { supabase } from './supabase'

const API_BASE = import.meta.env.VITE_API_URL;
const DEFAULT_CACHE_TTL_MS = 60 * 1000
const DEFAULT_STALE_WINDOW_MS = 5 * 60 * 1000
const MAX_CACHE_ENTRIES = 200
const responseCache = new Map()
const inFlightRequests = new Map()

function buildCacheKey(userId, method, url) {
  return `${userId || 'anonymous'}::${method}::${url}`
}

function clearUserCache(userId) {
  const prefix = `${userId || 'anonymous'}::`
  for (const key of responseCache.keys()) {
    if (key.startsWith(prefix)) {
      responseCache.delete(key)
    }
  }
}

function pruneCacheIfNeeded() {
  if (responseCache.size <= MAX_CACHE_ENTRIES) return

  // Prefer removing already-expired entries first.
  const now = Date.now()
  for (const [key, entry] of responseCache.entries()) {
    if (entry.staleUntil <= now) {
      responseCache.delete(key)
      if (responseCache.size <= MAX_CACHE_ENTRIES) return
    }
  }

  // If still too large, evict least-recently-used entries.
  const sortedByAccess = Array.from(responseCache.entries())
    .sort((a, b) => (a[1].lastAccessed || 0) - (b[1].lastAccessed || 0))

  while (responseCache.size > MAX_CACHE_ENTRIES && sortedByAccess.length > 0) {
    const [oldestKey] = sortedByAccess.shift()
    responseCache.delete(oldestKey)
  }
}

function setCacheEntry(cacheKey, data, cacheTtlMs, staleWindowMs) {
  const now = Date.now()
  responseCache.set(cacheKey, {
    data,
    expiresAt: now + Math.max(1000, cacheTtlMs),
    staleUntil: now + Math.max(1000, cacheTtlMs) + Math.max(1000, staleWindowMs),
    lastAccessed: now,
  })
  pruneCacheIfNeeded()
}

async function parseResponseBody(response) {
  if (response.status === 204) return {}

  const contentType = response.headers.get('content-type') || ''
  if (contentType.includes('application/json')) {
    return response.json()
  }

  const text = await response.text()
  if (!text) return {}
  try {
    return JSON.parse(text)
  } catch {
    return { data: text }
  }
}

/**
 * Central fetch wrapper that attaches the Supabase auth token.
 * All API calls to the Express backend go through this.
 */
export async function apiFetch(path, options = {}) {
  const { data: { session } } = await supabase.auth.getSession()
  const token = session?.access_token
  const userId = session?.user?.id

  if (!token) {
    throw new Error('Not authenticated')
  }

  const {
    cache = true,
    cacheTtlMs = DEFAULT_CACHE_TTL_MS,
    staleWhileRevalidate = true,
    staleWindowMs = DEFAULT_STALE_WINDOW_MS,
    forceRefresh = false,
    ...fetchOptions
  } = options

  const url = `${API_BASE}${path}`
  const method = (fetchOptions.method || 'GET').toUpperCase()
  const isGetRequest = method === 'GET'
  const canUseCache = isGetRequest && cache
  const cacheKey = buildCacheKey(userId, method, url)

  const headers = {
    'Authorization': `Bearer ${token}`,
    ...fetchOptions.headers,
  }

  // Don't set Content-Type for FormData (browser sets it with boundary)
  if (!(fetchOptions.body instanceof FormData)) {
    headers['Content-Type'] = 'application/json'
  }

  const executeNetworkRequest = async () => {
    const response = await fetch(url, {
      ...fetchOptions,
      headers,
    })

    const data = await parseResponseBody(response)

    if (!response.ok) {
      throw new Error(data.error || `API error: ${response.status}`)
    }

    if (canUseCache) {
      setCacheEntry(cacheKey, data, cacheTtlMs, staleWindowMs)
    } else if (!isGetRequest) {
      // Successful mutations invalidate this user's cached GET responses.
      clearUserCache(userId)
    }

    return data
  }

  if (canUseCache && !forceRefresh) {
    const cached = responseCache.get(cacheKey)
    if (cached) {
      cached.lastAccessed = Date.now()

      // Fresh cache hit.
      if (cached.expiresAt > Date.now()) {
        return cached.data
      }

      // Stale-while-revalidate: return stale fast and refresh in background.
      if (staleWhileRevalidate && cached.staleUntil > Date.now()) {
        if (!inFlightRequests.has(cacheKey)) {
          const refreshPromise = executeNetworkRequest()
            .catch(() => null)
            .finally(() => {
              inFlightRequests.delete(cacheKey)
            })
          inFlightRequests.set(cacheKey, refreshPromise)
        }
        return cached.data
      }
    }

    if (inFlightRequests.has(cacheKey)) {
      return inFlightRequests.get(cacheKey)
    }
  }

  const requestPromise = executeNetworkRequest()

  if (canUseCache) {
    inFlightRequests.set(cacheKey, requestPromise)
  }

  try {
    return await requestPromise
  } finally {
    if (canUseCache) {
      inFlightRequests.delete(cacheKey)
    }
  }
}
