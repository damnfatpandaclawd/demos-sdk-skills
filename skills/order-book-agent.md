# Order Book Agent Skill

> **⚠️ Prerequisites**: Complete [SDK Setup](./00-sdk-setup.md) first to configure your environment.

Build agents that manage and analyze order book data for trading decisions.

## Overview

Order Book Agent enables real-time order book management, depth analysis, and order flow tracking. Essential for market making, execution optimization, and liquidity analysis.

## SDK Reference

```typescript
import { Demos } from "@kynesyslabs/demosdk/websdk"
import { EVM } from "@kynesyslabs/demosdk/xm-websdk"

// Subscribe to order book updates
await demos.subscribeToAddress(dexAddress, callback)
```

## Agent Use Cases

### 1. Order Book Manager

Maintain and query order book state:

```typescript
class OrderBookManager {
  private bids: Map<number, OrderLevel> = new Map()
  private asks: Map<number, OrderLevel> = new Map()
  private lastUpdate: number = 0

  async processUpdate(update: OrderBookUpdate): Promise<void> {
    for (const bid of update.bids) {
      if (bid.size === 0n) {
        this.bids.delete(bid.price)
      } else {
        this.bids.set(bid.price, {
          price: bid.price,
          size: bid.size,
          orderCount: bid.orderCount
        })
      }
    }

    for (const ask of update.asks) {
      if (ask.size === 0n) {
        this.asks.delete(ask.price)
      } else {
        this.asks.set(ask.price, {
          price: ask.price,
          size: ask.size,
          orderCount: ask.orderCount
        })
      }
    }

    this.lastUpdate = Date.now()
  }

  getBestBid(): OrderLevel | null {
    const prices = Array.from(this.bids.keys()).sort((a, b) => b - a)
    return prices.length > 0 ? this.bids.get(prices[0])! : null
  }

  getBestAsk(): OrderLevel | null {
    const prices = Array.from(this.asks.keys()).sort((a, b) => a - b)
    return prices.length > 0 ? this.asks.get(prices[0])! : null
  }

  getMidPrice(): number | null {
    const bestBid = this.getBestBid()
    const bestAsk = this.getBestAsk()

    if (!bestBid || !bestAsk) return null
    return (bestBid.price + bestAsk.price) / 2
  }

  getSpread(): number | null {
    const bestBid = this.getBestBid()
    const bestAsk = this.getBestAsk()

    if (!bestBid || !bestAsk) return null
    return (bestAsk.price - bestBid.price) / bestBid.price
  }

  getDepth(side: "bid" | "ask", levels: number): OrderLevel[] {
    const book = side === "bid" ? this.bids : this.asks
    const prices = Array.from(book.keys()).sort(
      side === "bid" ? (a, b) => b - a : (a, b) => a - b
    )

    return prices.slice(0, levels).map(p => book.get(p)!)
  }
}
```

### 2. Order Book Analyzer

Analyze market depth and imbalances:

```typescript
class OrderBookAnalyzer {
  private orderBook: OrderBookManager

  calculateImbalance(levels: number = 5): number {
    const bids = this.orderBook.getDepth("bid", levels)
    const asks = this.orderBook.getDepth("ask", levels)

    const bidVolume = bids.reduce((sum, l) => sum + Number(l.size), 0)
    const askVolume = asks.reduce((sum, l) => sum + Number(l.size), 0)

    // Returns -1 to 1, positive means more buy pressure
    return (bidVolume - askVolume) / (bidVolume + askVolume)
  }

  calculateVWAP(side: "bid" | "ask", targetSize: bigint): number | null {
    const levels = this.orderBook.getDepth(side, 100)
    let remainingSize = targetSize
    let weightedSum = 0n
    let totalSize = 0n

    for (const level of levels) {
      const fillSize = remainingSize < level.size ? remainingSize : level.size
      weightedSum += BigInt(Math.floor(level.price * 1e8)) * fillSize
      totalSize += fillSize
      remainingSize -= fillSize

      if (remainingSize <= 0n) break
    }

    if (totalSize === 0n) return null
    return Number(weightedSum / totalSize) / 1e8
  }

  estimateSlippage(side: "bid" | "ask", size: bigint): number {
    const midPrice = this.orderBook.getMidPrice()
    if (!midPrice) return Infinity

    const vwap = this.calculateVWAP(side, size)
    if (!vwap) return Infinity

    return Math.abs(vwap - midPrice) / midPrice
  }

  detectLargeOrders(threshold: bigint): LargeOrder[] {
    const largeOrders: LargeOrder[] = []

    for (const level of this.orderBook.getDepth("bid", 50)) {
      if (level.size >= threshold) {
        largeOrders.push({
          side: "bid",
          price: level.price,
          size: level.size,
          type: "support"
        })
      }
    }

    for (const level of this.orderBook.getDepth("ask", 50)) {
      if (level.size >= threshold) {
        largeOrders.push({
          side: "ask",
          price: level.price,
          size: level.size,
          type: "resistance"
        })
      }
    }

    return largeOrders
  }
}
```

### 3. Order Flow Tracker

Track and analyze order flow:

```typescript
class OrderFlowTracker {
  private trades: Trade[] = []
  private maxHistory: number = 1000

  async recordTrade(trade: Trade): Promise<void> {
    this.trades.push({
      ...trade,
      timestamp: Date.now()
    })

    if (this.trades.length > this.maxHistory) {
      this.trades.shift()
    }
  }

  calculateNetFlow(windowMs: number): { buyVolume: bigint; sellVolume: bigint; net: bigint } {
    const cutoff = Date.now() - windowMs
    const recentTrades = this.trades.filter(t => t.timestamp > cutoff)

    let buyVolume = 0n
    let sellVolume = 0n

    for (const trade of recentTrades) {
      if (trade.side === "buy") {
        buyVolume += trade.size
      } else {
        sellVolume += trade.size
      }
    }

    return {
      buyVolume,
      sellVolume,
      net: buyVolume - sellVolume
    }
  }

  detectLargeTrades(threshold: bigint, windowMs: number): Trade[] {
    const cutoff = Date.now() - windowMs
    return this.trades.filter(
      t => t.timestamp > cutoff && t.size >= threshold
    )
  }

  calculateTradingIntensity(windowMs: number): number {
    const cutoff = Date.now() - windowMs
    const recentTrades = this.trades.filter(t => t.timestamp > cutoff)
    return recentTrades.length / (windowMs / 1000) // trades per second
  }

  getAggregatedFlow(
    windowMs: number,
    bucketMs: number
  ): FlowBucket[] {
    const cutoff = Date.now() - windowMs
    const buckets: Map<number, FlowBucket> = new Map()

    for (const trade of this.trades) {
      if (trade.timestamp < cutoff) continue

      const bucketKey = Math.floor(trade.timestamp / bucketMs) * bucketMs

      if (!buckets.has(bucketKey)) {
        buckets.set(bucketKey, {
          timestamp: bucketKey,
          buyVolume: 0n,
          sellVolume: 0n,
          tradeCount: 0
        })
      }

      const bucket = buckets.get(bucketKey)!
      if (trade.side === "buy") {
        bucket.buyVolume += trade.size
      } else {
        bucket.sellVolume += trade.size
      }
      bucket.tradeCount++
    }

    return Array.from(buckets.values()).sort((a, b) => a.timestamp - b.timestamp)
  }
}
```

## Best Practices

1. **Handle updates efficiently** with incremental processing
2. **Maintain multiple depth levels** for accurate analysis
3. **Track historical patterns** for predictive signals
4. **Normalize across venues** for cross-DEX analysis
5. **Implement staleness detection** for stale data

## Related Skills

- [Market Maker Agent](./market-maker-agent.md) - Market making
- [TWAP Executor](./twap-executor-agent.md) - Execution algorithms
- [Slippage Protection](./slippage-protection-agent.md) - Slippage management
