# Whale Tracker Agent Skill

Build agents that monitor and analyze large wallet activities and whale movements.

## Overview

Whale Tracker Agent enables real-time monitoring of large holders, tracking significant transfers, and analyzing accumulation/distribution patterns. Essential for market intelligence and alpha generation.

## SDK Reference

```typescript
import { Demos } from "@kynesyslabs/demosdk/websdk"
import { EVM } from "@kynesyslabs/demosdk/xm-websdk"

// Subscribe to whale addresses
await demos.subscribeToAddress(whaleAddress, callback)
```

## Agent Use Cases

### 1. Whale Activity Monitor

Track whale wallet activities:

```typescript
class WhaleActivityMonitor {
  private demos: Demos
  private trackedWhales: Map<string, WhaleProfile> = new Map()
  private activityLog: WhaleActivity[] = []
  private minWhaleThreshold: bigint = BigInt(1e6) * BigInt(1e18) // $1M

  async addWhale(address: string, label?: string): Promise<void> {
    const balance = await this.getTotalValue(address)

    if (balance < this.minWhaleThreshold) {
      throw new Error("Address does not meet whale threshold")
    }

    const profile: WhaleProfile = {
      address,
      label: label || `Whale-${address.slice(0, 8)}`,
      firstSeen: Date.now(),
      totalValue: balance,
      holdings: await this.getHoldings(address),
      activityScore: 0
    }

    this.trackedWhales.set(address, profile)

    // Subscribe to activity
    await this.demos.subscribeToAddress(address, event => {
      this.handleWhaleActivity(address, event)
    })
  }

  private async handleWhaleActivity(
    address: string,
    event: AddressEvent
  ): Promise<void> {
    const profile = this.trackedWhales.get(address)
    if (!profile) return

    const activity: WhaleActivity = {
      whale: address,
      type: this.classifyActivity(event),
      token: event.token,
      amount: event.amount,
      value: await this.getTokenValue(event.token, event.amount),
      timestamp: Date.now(),
      txHash: event.txHash
    }

    this.activityLog.push(activity)

    // Update profile
    profile.holdings = await this.getHoldings(address)
    profile.totalValue = await this.getTotalValue(address)
    profile.activityScore++

    // Emit alert if significant
    if (activity.value > this.minWhaleThreshold / 10n) {
      await this.emitAlert(activity)
    }
  }

  private classifyActivity(event: AddressEvent): ActivityType {
    if (event.type === "transfer") {
      if (event.direction === "in") return "accumulation"
      return "distribution"
    }
    if (event.type === "swap") return "swap"
    if (event.type === "stake") return "staking"
    if (event.type === "unstake") return "unstaking"
    return "other"
  }

  async getWhaleStats(address: string): Promise<WhaleStats> {
    const profile = this.trackedWhales.get(address)
    if (!profile) throw new Error("Whale not tracked")

    const recentActivity = this.activityLog.filter(
      a => a.whale === address && a.timestamp > Date.now() - 7 * 24 * 60 * 60 * 1000
    )

    const accumulation = recentActivity
      .filter(a => a.type === "accumulation")
      .reduce((sum, a) => sum + a.value, 0n)

    const distribution = recentActivity
      .filter(a => a.type === "distribution")
      .reduce((sum, a) => sum + a.value, 0n)

    return {
      address,
      label: profile.label,
      totalValue: profile.totalValue,
      holdings: profile.holdings,
      weeklyAccumulation: accumulation,
      weeklyDistribution: distribution,
      netFlow: accumulation - distribution,
      activityCount: recentActivity.length,
      trend: accumulation > distribution ? "accumulating" : "distributing"
    }
  }

  async getTopWhalesByToken(token: string, limit: number = 10): Promise<WhaleHolding[]> {
    const holdings: WhaleHolding[] = []

    for (const [address, profile] of this.trackedWhales) {
      const tokenHolding = profile.holdings.find(h => h.token === token)
      if (tokenHolding) {
        holdings.push({
          address,
          label: profile.label,
          amount: tokenHolding.amount,
          value: tokenHolding.value,
          percentage: 0 // Calculate later
        })
      }
    }

    return holdings
      .sort((a, b) => Number(b.value - a.value))
      .slice(0, limit)
  }
}
```

### 2. Accumulation Pattern Detector

Detect whale accumulation patterns:

```typescript
class AccumulationDetector {
  private whaleMonitor: WhaleActivityMonitor
  private patterns: AccumulationPattern[] = []

  async detectAccumulation(
    token: string,
    timeWindow: number = 7 * 24 * 60 * 60 * 1000
  ): Promise<AccumulationAnalysis> {
    const cutoff = Date.now() - timeWindow
    const activities = this.whaleMonitor.getActivitiesForToken(token, cutoff)

    // Group by whale
    const whaleActivities = new Map<string, WhaleActivity[]>()
    for (const activity of activities) {
      if (!whaleActivities.has(activity.whale)) {
        whaleActivities.set(activity.whale, [])
      }
      whaleActivities.get(activity.whale)!.push(activity)
    }

    // Analyze each whale's pattern
    const patterns: WhaleAccumulationPattern[] = []

    for (const [whale, acts] of whaleActivities) {
      const pattern = this.analyzeWhalePattern(whale, acts)
      if (pattern.confidence > 0.7) {
        patterns.push(pattern)
      }
    }

    // Calculate aggregate metrics
    const totalAccumulation = patterns
      .filter(p => p.type === "accumulation")
      .reduce((sum, p) => sum + p.netChange, 0n)

    const totalDistribution = patterns
      .filter(p => p.type === "distribution")
      .reduce((sum, p) => sum + Math.abs(Number(p.netChange)), 0)

    return {
      token,
      timeWindow,
      whaleCount: patterns.length,
      accumulatingWhales: patterns.filter(p => p.type === "accumulation").length,
      distributingWhales: patterns.filter(p => p.type === "distribution").length,
      totalAccumulation,
      totalDistribution: BigInt(totalDistribution),
      netFlow: totalAccumulation - BigInt(totalDistribution),
      patterns,
      signal: this.generateSignal(patterns)
    }
  }

  private analyzeWhalePattern(
    whale: string,
    activities: WhaleActivity[]
  ): WhaleAccumulationPattern {
    const sorted = activities.sort((a, b) => a.timestamp - b.timestamp)

    let netChange = 0n
    const buyAmounts: bigint[] = []
    const sellAmounts: bigint[] = []

    for (const act of sorted) {
      if (act.type === "accumulation") {
        netChange += act.value
        buyAmounts.push(act.value)
      } else if (act.type === "distribution") {
        netChange -= act.value
        sellAmounts.push(act.value)
      }
    }

    // Detect DCA pattern (regular buys of similar size)
    const isDCA = this.detectDCAPattern(buyAmounts)

    // Detect dump pattern (large single sells)
    const isDump = sellAmounts.some(
      s => s > buyAmounts.reduce((a, b) => a + b, 0n) * 2n / 3n
    )

    return {
      whale,
      type: netChange > 0n ? "accumulation" : "distribution",
      netChange,
      transactionCount: sorted.length,
      avgTransactionSize: netChange / BigInt(sorted.length || 1),
      isDCA,
      isDump,
      confidence: this.calculateConfidence(sorted)
    }
  }

  private detectDCAPattern(amounts: bigint[]): boolean {
    if (amounts.length < 3) return false

    const avg = amounts.reduce((a, b) => a + b, 0n) / BigInt(amounts.length)
    const variance = amounts.reduce(
      (sum, a) => sum + Math.abs(Number(a - avg)), 0
    ) / amounts.length

    // Low variance indicates DCA
    return variance < Number(avg) * 0.3
  }

  private generateSignal(patterns: WhaleAccumulationPattern[]): Signal {
    const accumulators = patterns.filter(p => p.type === "accumulation")
    const distributors = patterns.filter(p => p.type === "distribution")

    if (accumulators.length > distributors.length * 2) {
      return { type: "bullish", strength: "strong", reason: "Heavy whale accumulation" }
    }
    if (accumulators.length > distributors.length) {
      return { type: "bullish", strength: "moderate", reason: "Net whale accumulation" }
    }
    if (distributors.length > accumulators.length * 2) {
      return { type: "bearish", strength: "strong", reason: "Heavy whale distribution" }
    }
    if (distributors.length > accumulators.length) {
      return { type: "bearish", strength: "moderate", reason: "Net whale distribution" }
    }

    return { type: "neutral", strength: "weak", reason: "Mixed whale activity" }
  }
}
```

### 3. Copy Trading Agent

Copy whale trades:

```typescript
class CopyTradingAgent {
  private whaleMonitor: WhaleActivityMonitor
  private followList: Map<string, FollowConfig> = new Map()
  private executedCopies: CopyTrade[] = []

  async followWhale(
    whaleAddress: string,
    config: FollowConfig
  ): Promise<void> {
    // Validate whale exists
    const stats = await this.whaleMonitor.getWhaleStats(whaleAddress)

    this.followList.set(whaleAddress, {
      ...config,
      maxPositionSize: config.maxPositionSize || BigInt(1e4) * BigInt(1e18),
      minTradeSize: config.minTradeSize || BigInt(1e3) * BigInt(1e18),
      copyRatio: config.copyRatio || 0.01, // 1% of whale's trade
      delay: config.delay || 5000, // 5 second delay
      tokens: config.tokens || [] // Empty = all tokens
    })

    // Listen for whale activity
    await this.demos.subscribeToAddress(whaleAddress, async event => {
      await this.handleWhaleActivity(whaleAddress, event)
    })
  }

  private async handleWhaleActivity(
    whale: string,
    event: AddressEvent
  ): Promise<void> {
    const config = this.followList.get(whale)
    if (!config) return

    // Filter by token if specified
    if (config.tokens.length > 0 && !config.tokens.includes(event.token)) {
      return
    }

    // Filter by trade size
    const value = await this.getTokenValue(event.token, event.amount)
    if (value < config.minTradeSize) return

    // Calculate copy amount
    const copyAmount = BigInt(Math.floor(Number(event.amount) * config.copyRatio))

    // Ensure within position limits
    const currentPosition = await this.getPosition(event.token)
    if (currentPosition + copyAmount > config.maxPositionSize) {
      return
    }

    // Delay to avoid front-running detection
    await new Promise(r => setTimeout(r, config.delay))

    // Execute copy trade
    try {
      const result = await this.executeCopyTrade({
        whale,
        originalTx: event.txHash,
        token: event.token,
        action: event.direction === "in" ? "buy" : "sell",
        amount: copyAmount
      })

      this.executedCopies.push(result)
    } catch (error) {
      console.error("Copy trade failed:", error)
    }
  }

  async getCopyPerformance(whale: string): Promise<CopyPerformance> {
    const copies = this.executedCopies.filter(c => c.whale === whale)

    let totalInvested = 0n
    let currentValue = 0n
    let realizedPnL = 0n

    for (const copy of copies) {
      if (copy.action === "buy") {
        totalInvested += copy.value
      } else {
        realizedPnL += copy.value - copy.costBasis
      }
    }

    // Calculate unrealized PnL from open positions
    const openPositions = await this.getOpenPositions(whale)
    for (const pos of openPositions) {
      currentValue += await this.getTokenValue(pos.token, pos.amount)
    }

    return {
      whale,
      totalTrades: copies.length,
      totalInvested,
      currentValue,
      realizedPnL,
      unrealizedPnL: currentValue - (totalInvested - realizedPnL),
      roi: Number(currentValue + realizedPnL - totalInvested) / Number(totalInvested)
    }
  }
}
```

## Best Practices

1. **Verify whale status** before tracking
2. **Set appropriate thresholds** to filter noise
3. **Implement delays** in copy trading to avoid detection
4. **Monitor multiple whales** for consensus signals
5. **Track performance** of copy trading strategies

## Related Skills

- [Address Monitoring](./address-monitoring-agent.md) - Balance tracking
- [On-Chain Analytics](./on-chain-analytics-agent.md) - Data analysis
- [Sentiment Analysis](./sentiment-analysis-agent.md) - Market sentiment
