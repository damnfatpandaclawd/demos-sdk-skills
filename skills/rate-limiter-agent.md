# Rate Limiter Agent Skill

> **⚠️ Prerequisites**: Complete [SDK Setup](./00-sdk-setup.md) first to configure your environment.

Build agents that implement rate limiting for API protection and resource management.

## Overview

Rate Limiter enables agents to control request rates, prevent abuse, and ensure fair resource usage. Essential for APIs, automated systems, and multi-user services.

## SDK Reference

```typescript
import { StorageProgram } from "@kynesyslabs/demosdk/storage"

// Rate limiting typically uses in-memory tracking
// with optional persistence to StorageProgram
```

## Agent Use Cases

### 1. Token Bucket Rate Limiter

Classic token bucket implementation:

```typescript
class TokenBucketRateLimiter {
  private buckets: Map<string, TokenBucket> = new Map()
  private maxTokens: number
  private refillRate: number // tokens per second

  constructor(maxTokens: number, refillRate: number) {
    this.maxTokens = maxTokens
    this.refillRate = refillRate
  }

  async checkLimit(identifier: string): Promise<RateLimitResult> {
    let bucket = this.buckets.get(identifier)

    if (!bucket) {
      bucket = {
        tokens: this.maxTokens,
        lastRefill: Date.now()
      }
      this.buckets.set(identifier, bucket)
    }

    // Refill tokens based on time elapsed
    const now = Date.now()
    const elapsed = (now - bucket.lastRefill) / 1000
    const newTokens = Math.min(
      this.maxTokens,
      bucket.tokens + elapsed * this.refillRate
    )
    bucket.tokens = newTokens
    bucket.lastRefill = now

    if (bucket.tokens >= 1) {
      bucket.tokens -= 1
      return {
        allowed: true,
        remaining: Math.floor(bucket.tokens),
        resetAt: this.calculateResetTime(bucket)
      }
    }

    return {
      allowed: false,
      remaining: 0,
      resetAt: this.calculateResetTime(bucket),
      retryAfter: Math.ceil((1 - bucket.tokens) / this.refillRate * 1000)
    }
  }

  private calculateResetTime(bucket: TokenBucket): number {
    const tokensNeeded = this.maxTokens - bucket.tokens
    return Date.now() + (tokensNeeded / this.refillRate * 1000)
  }
}
```

### 2. Sliding Window Rate Limiter

More accurate rate limiting:

```typescript
class SlidingWindowRateLimiter {
  private windows: Map<string, RequestWindow[]> = new Map()
  private windowSize: number // in milliseconds
  private maxRequests: number

  constructor(windowSize: number, maxRequests: number) {
    this.windowSize = windowSize
    this.maxRequests = maxRequests
  }

  async checkLimit(identifier: string): Promise<RateLimitResult> {
    const now = Date.now()
    const windowStart = now - this.windowSize

    // Get or create windows for identifier
    let windows = this.windows.get(identifier) || []

    // Remove expired windows
    windows = windows.filter(w => w.timestamp > windowStart)

    if (windows.length >= this.maxRequests) {
      const oldestWindow = windows[0]
      const retryAfter = oldestWindow.timestamp + this.windowSize - now

      return {
        allowed: false,
        remaining: 0,
        resetAt: oldestWindow.timestamp + this.windowSize,
        retryAfter
      }
    }

    // Add new request
    windows.push({ timestamp: now })
    this.windows.set(identifier, windows)

    return {
      allowed: true,
      remaining: this.maxRequests - windows.length,
      resetAt: windows[0].timestamp + this.windowSize
    }
  }
}
```

### 3. Tiered Rate Limiter

Different limits for different tiers:

```typescript
class TieredRateLimiter {
  private tiers: Map<string, TierConfig> = new Map()
  private userTiers: Map<string, string> = new Map()
  private limiters: Map<string, TokenBucketRateLimiter> = new Map()

  constructor() {
    // Default tiers
    this.tiers.set("free", { maxTokens: 10, refillRate: 0.1 })
    this.tiers.set("basic", { maxTokens: 100, refillRate: 1 })
    this.tiers.set("premium", { maxTokens: 1000, refillRate: 10 })
  }

  async setUserTier(identifier: string, tier: string): Promise<void> {
    this.userTiers.set(identifier, tier)
    // Reset limiter with new tier config
    const config = this.tiers.get(tier) || this.tiers.get("free")!
    this.limiters.set(
      identifier,
      new TokenBucketRateLimiter(config.maxTokens, config.refillRate)
    )
  }

  async checkLimit(identifier: string): Promise<RateLimitResult> {
    let limiter = this.limiters.get(identifier)

    if (!limiter) {
      const tier = this.userTiers.get(identifier) || "free"
      const config = this.tiers.get(tier)!
      limiter = new TokenBucketRateLimiter(config.maxTokens, config.refillRate)
      this.limiters.set(identifier, limiter)
    }

    return await limiter.checkLimit(identifier)
  }
}
```

## Best Practices

1. **Choose appropriate algorithm** for use case
2. **Set reasonable limits** based on resources
3. **Return retry-after headers** for clients
4. **Monitor rate limit hits** for capacity planning
5. **Allow temporary limit increases** for legitimate bursts

## Related Skills

- [API Gateway](./api-gateway-agent.md) - API management
- [Session Manager](./session-manager-agent.md) - User identification
