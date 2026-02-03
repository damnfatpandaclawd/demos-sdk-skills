# Cache Manager Agent Skill

Build agents that efficiently cache data for improved performance.

## Overview

Cache Manager enables agents to store and retrieve frequently accessed data with TTL support and cache invalidation. Essential for reducing API calls and improving response times.

## SDK Reference

```typescript
// Cache typically uses in-memory storage
// with optional persistence to StorageProgram

import { StorageProgram } from "@kynesyslabs/demosdk/storage"
```

## Agent Use Cases

### 1. LRU Cache Agent

Least Recently Used cache implementation:

```typescript
class LRUCacheAgent<T> {
  private cache: Map<string, CacheEntry<T>> = new Map()
  private maxSize: number
  private defaultTTL: number

  constructor(maxSize: number = 1000, defaultTTL: number = 300000) {
    this.maxSize = maxSize
    this.defaultTTL = defaultTTL
  }

  async get(key: string): Promise<T | null> {
    const entry = this.cache.get(key)

    if (!entry) return null

    // Check expiration
    if (entry.expiresAt && Date.now() > entry.expiresAt) {
      this.cache.delete(key)
      return null
    }

    // Move to end (most recently used)
    this.cache.delete(key)
    this.cache.set(key, entry)

    return entry.value
  }

  async set(key: string, value: T, ttl?: number): Promise<void> {
    // Evict if at capacity
    if (this.cache.size >= this.maxSize) {
      const firstKey = this.cache.keys().next().value
      this.cache.delete(firstKey)
    }

    this.cache.set(key, {
      value,
      createdAt: Date.now(),
      expiresAt: Date.now() + (ttl || this.defaultTTL)
    })
  }

  async getOrSet(
    key: string,
    fetcher: () => Promise<T>,
    ttl?: number
  ): Promise<T> {
    const cached = await this.get(key)
    if (cached !== null) return cached

    const value = await fetcher()
    await this.set(key, value, ttl)
    return value
  }

  async invalidate(key: string): Promise<void> {
    this.cache.delete(key)
  }

  async invalidatePattern(pattern: RegExp): Promise<number> {
    let count = 0
    for (const key of this.cache.keys()) {
      if (pattern.test(key)) {
        this.cache.delete(key)
        count++
      }
    }
    return count
  }

  async clear(): Promise<void> {
    this.cache.clear()
  }

  getStats(): CacheStats {
    let expired = 0
    const now = Date.now()

    for (const entry of this.cache.values()) {
      if (entry.expiresAt && now > entry.expiresAt) expired++
    }

    return {
      size: this.cache.size,
      maxSize: this.maxSize,
      expired
    }
  }
}
```

### 2. Multi-Level Cache Agent

Cache with multiple tiers:

```typescript
class MultiLevelCacheAgent<T> {
  private l1: LRUCacheAgent<T> // Memory (fast, small)
  private l2: Map<string, CacheEntry<T>> // Disk/persistent (slower, larger)

  constructor() {
    this.l1 = new LRUCacheAgent<T>(100, 60000) // 100 items, 1 min TTL
    this.l2 = new Map()
  }

  async get(key: string): Promise<T | null> {
    // Check L1 first
    const l1Result = await this.l1.get(key)
    if (l1Result !== null) return l1Result

    // Check L2
    const l2Entry = this.l2.get(key)
    if (l2Entry && (!l2Entry.expiresAt || Date.now() < l2Entry.expiresAt)) {
      // Promote to L1
      await this.l1.set(key, l2Entry.value)
      return l2Entry.value
    }

    return null
  }

  async set(key: string, value: T, ttl?: number): Promise<void> {
    // Set in both levels
    await this.l1.set(key, value, Math.min(ttl || 60000, 60000))
    this.l2.set(key, {
      value,
      createdAt: Date.now(),
      expiresAt: ttl ? Date.now() + ttl : undefined
    })
  }
}
```

## Best Practices

1. **Set appropriate TTLs** for different data types
2. **Implement cache warming** for predictable access patterns
3. **Monitor hit rates** to optimize cache size
4. **Use consistent keys** across the application
5. **Handle cache stampedes** with locks

## Related Skills

- [Storage Program](./storage-program-agent.md) - Persistent storage
- [Fee Estimation](./fee-estimation-agent.md) - Cache fee data
