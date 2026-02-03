# Sentiment Analysis Agent Skill

> **⚠️ Prerequisites**: Complete [SDK Setup](./00-sdk-setup.md) first to configure your environment.

Build agents that analyze market sentiment from social and on-chain data.

## Overview

Sentiment Analysis Agent enables multi-source sentiment aggregation from social media, on-chain metrics, and trading data. Essential for market timing, trend prediction, and risk management.

## SDK Reference

```typescript
import { Demos } from "@kynesyslabs/demosdk/websdk"

// DAHR for social API access
const dahr = await demos.web2.createDahr()
const response = await dahr.startProxy({ url, method: "GET" })
```

## Agent Use Cases

### 1. Social Sentiment Analyzer

Analyze sentiment from social media:

```typescript
class SocialSentimentAnalyzer {
  private demos: Demos
  private sentimentCache: Map<string, SentimentScore[]> = new Map()

  async analyzeSocialSentiment(
    token: string,
    sources: SocialSource[] = ["twitter", "reddit", "telegram"]
  ): Promise<SocialSentimentResult> {
    const results = await Promise.all(
      sources.map(source => this.fetchAndAnalyze(token, source))
    )

    // Aggregate sentiment
    const aggregated = this.aggregateSentiment(results)

    // Cache result
    if (!this.sentimentCache.has(token)) {
      this.sentimentCache.set(token, [])
    }
    this.sentimentCache.get(token)!.push({
      score: aggregated.score,
      timestamp: Date.now()
    })

    return aggregated
  }

  private async fetchAndAnalyze(
    token: string,
    source: SocialSource
  ): Promise<SourceSentiment> {
    const dahr = await this.demos.web2.createDahr()

    let posts: SocialPost[] = []

    switch (source) {
      case "twitter":
        posts = await this.fetchTwitterPosts(dahr, token)
        break
      case "reddit":
        posts = await this.fetchRedditPosts(dahr, token)
        break
      case "telegram":
        posts = await this.fetchTelegramMessages(dahr, token)
        break
    }

    // Analyze sentiment of each post
    const analyzed = posts.map(post => ({
      ...post,
      sentiment: this.analyzeSentimentText(post.content),
      influence: this.calculateInfluence(post)
    }))

    // Calculate weighted sentiment
    const totalInfluence = analyzed.reduce((sum, p) => sum + p.influence, 0)
    const weightedScore = analyzed.reduce(
      (sum, p) => sum + p.sentiment.score * p.influence, 0
    ) / totalInfluence

    return {
      source,
      postCount: posts.length,
      score: weightedScore,
      volume: totalInfluence,
      topPosts: analyzed
        .sort((a, b) => b.influence - a.influence)
        .slice(0, 5)
    }
  }

  private analyzeSentimentText(text: string): TextSentiment {
    // Simple keyword-based sentiment (in production, use ML model)
    const bullishKeywords = [
      "bullish", "moon", "buy", "accumulate", "breakout", "pump",
      "undervalued", "gem", "holding", "hodl", "long"
    ]
    const bearishKeywords = [
      "bearish", "sell", "dump", "crash", "overvalued", "short",
      "scam", "rug", "avoid", "dead", "drop"
    ]

    const words = text.toLowerCase().split(/\s+/)

    let bullishCount = 0
    let bearishCount = 0

    for (const word of words) {
      if (bullishKeywords.some(k => word.includes(k))) bullishCount++
      if (bearishKeywords.some(k => word.includes(k))) bearishCount++
    }

    const total = bullishCount + bearishCount
    if (total === 0) {
      return { score: 0, confidence: 0.3, label: "neutral" }
    }

    const score = (bullishCount - bearishCount) / total

    return {
      score, // -1 to 1
      confidence: Math.min(total / 10, 1),
      label: score > 0.3 ? "bullish" : score < -0.3 ? "bearish" : "neutral"
    }
  }

  private calculateInfluence(post: SocialPost): number {
    // Weight by engagement and account metrics
    return (
      post.likes * 1 +
      post.retweets * 3 +
      post.replies * 2 +
      Math.sqrt(post.authorFollowers) * 0.1
    )
  }

  private aggregateSentiment(results: SourceSentiment[]): SocialSentimentResult {
    const totalVolume = results.reduce((sum, r) => sum + r.volume, 0)
    const weightedScore = results.reduce(
      (sum, r) => sum + r.score * r.volume, 0
    ) / totalVolume

    return {
      score: weightedScore,
      label: weightedScore > 0.3 ? "bullish" : weightedScore < -0.3 ? "bearish" : "neutral",
      sources: results,
      totalMentions: results.reduce((sum, r) => sum + r.postCount, 0),
      dominantSource: results.sort((a, b) => b.volume - a.volume)[0].source,
      timestamp: Date.now()
    }
  }
}
```

### 2. On-Chain Sentiment Analyzer

Derive sentiment from on-chain metrics:

```typescript
class OnChainSentimentAnalyzer {
  async analyzeOnChainSentiment(token: string): Promise<OnChainSentiment> {
    const [
      transferMetrics,
      holderMetrics,
      tradingMetrics,
      whaleMetrics
    ] = await Promise.all([
      this.analyzeTransferActivity(token),
      this.analyzeHolderDistribution(token),
      this.analyzeTradingPatterns(token),
      this.analyzeWhaleActivity(token)
    ])

    // Weight each component
    const weights = {
      transfers: 0.2,
      holders: 0.3,
      trading: 0.3,
      whales: 0.2
    }

    const compositeScore =
      transferMetrics.score * weights.transfers +
      holderMetrics.score * weights.holders +
      tradingMetrics.score * weights.trading +
      whaleMetrics.score * weights.whales

    return {
      score: compositeScore,
      components: {
        transfers: transferMetrics,
        holders: holderMetrics,
        trading: tradingMetrics,
        whales: whaleMetrics
      },
      signals: this.generateSignals({
        transferMetrics,
        holderMetrics,
        tradingMetrics,
        whaleMetrics
      })
    }
  }

  private async analyzeTransferActivity(token: string): Promise<MetricScore> {
    // Get transfer velocity
    const recent = await this.getRecentTransfers(token, 24 * 60 * 60 * 1000)
    const historical = await this.getAverageTransfers(token, 30)

    const velocityChange = recent.count / historical.avgCount

    // More activity = more interest
    const score = Math.min(1, Math.max(-1, (velocityChange - 1) * 2))

    return {
      score,
      metric: "transfer_velocity",
      value: velocityChange,
      interpretation: velocityChange > 1.5
        ? "High activity - increased interest"
        : velocityChange < 0.5
        ? "Low activity - declining interest"
        : "Normal activity"
    }
  }

  private async analyzeHolderDistribution(token: string): Promise<MetricScore> {
    const current = await this.getHolderCount(token)
    const previous = await this.getHolderCount(token, 7 * 24 * 60 * 60 * 1000)

    const change = (current - previous) / previous

    // Growing holder base = bullish
    const score = Math.min(1, Math.max(-1, change * 10))

    return {
      score,
      metric: "holder_growth",
      value: change,
      interpretation: change > 0.05
        ? "Strong holder growth - accumulation phase"
        : change < -0.05
        ? "Holder decline - distribution phase"
        : "Stable holder base"
    }
  }

  private async analyzeTradingPatterns(token: string): Promise<MetricScore> {
    const trades = await this.getRecentTrades(token, 24 * 60 * 60 * 1000)

    const buyVolume = trades
      .filter(t => t.side === "buy")
      .reduce((sum, t) => sum + t.value, 0n)

    const sellVolume = trades
      .filter(t => t.side === "sell")
      .reduce((sum, t) => sum + t.value, 0n)

    const total = buyVolume + sellVolume
    if (total === 0n) {
      return { score: 0, metric: "buy_sell_ratio", value: 0, interpretation: "No activity" }
    }

    const buyRatio = Number(buyVolume) / Number(total)
    const score = (buyRatio - 0.5) * 2 // Convert 0-1 to -1 to 1

    return {
      score,
      metric: "buy_sell_ratio",
      value: buyRatio,
      interpretation: buyRatio > 0.6
        ? "Strong buying pressure"
        : buyRatio < 0.4
        ? "Strong selling pressure"
        : "Balanced market"
    }
  }

  private generateSignals(metrics: AllMetrics): Signal[] {
    const signals: Signal[] = []

    // Strong accumulation signal
    if (
      metrics.holderMetrics.score > 0.5 &&
      metrics.tradingMetrics.score > 0.3 &&
      metrics.whaleMetrics.score > 0.3
    ) {
      signals.push({
        type: "accumulation",
        strength: "strong",
        description: "Multiple bullish on-chain signals"
      })
    }

    // Strong distribution signal
    if (
      metrics.holderMetrics.score < -0.3 &&
      metrics.whaleMetrics.score < -0.3
    ) {
      signals.push({
        type: "distribution",
        strength: "strong",
        description: "Whale distribution with declining holders"
      })
    }

    return signals
  }
}
```

### 3. Composite Sentiment Engine

Combine all sentiment sources:

```typescript
class CompositeSentimentEngine {
  private socialAnalyzer: SocialSentimentAnalyzer
  private onChainAnalyzer: OnChainSentimentAnalyzer
  private historicalSentiment: Map<string, SentimentHistory[]> = new Map()

  async getCompositeSentiment(token: string): Promise<CompositeSentiment> {
    const [social, onChain, market] = await Promise.all([
      this.socialAnalyzer.analyzeSocialSentiment(token),
      this.onChainAnalyzer.analyzeOnChainSentiment(token),
      this.analyzeMarketSentiment(token)
    ])

    // Weight sources based on reliability
    const weights = {
      social: 0.25,
      onChain: 0.45,
      market: 0.30
    }

    const compositeScore =
      social.score * weights.social +
      onChain.score * weights.onChain +
      market.score * weights.market

    // Calculate trend
    const trend = this.calculateTrend(token, compositeScore)

    // Store historical
    if (!this.historicalSentiment.has(token)) {
      this.historicalSentiment.set(token, [])
    }
    this.historicalSentiment.get(token)!.push({
      score: compositeScore,
      timestamp: Date.now()
    })

    return {
      token,
      score: compositeScore,
      label: this.getLabel(compositeScore),
      trend,
      components: { social, onChain, market },
      confidence: this.calculateConfidence(social, onChain, market),
      recommendation: this.generateRecommendation(compositeScore, trend),
      timestamp: Date.now()
    }
  }

  private calculateTrend(token: string, currentScore: number): Trend {
    const history = this.historicalSentiment.get(token) || []

    if (history.length < 2) {
      return { direction: "stable", strength: 0 }
    }

    const recent = history.slice(-10)
    const avgRecent = recent.reduce((sum, h) => sum + h.score, 0) / recent.length
    const change = currentScore - avgRecent

    return {
      direction: change > 0.1 ? "improving" : change < -0.1 ? "declining" : "stable",
      strength: Math.abs(change),
      momentum: this.calculateMomentum(recent)
    }
  }

  private generateRecommendation(
    score: number,
    trend: Trend
  ): Recommendation {
    if (score > 0.5 && trend.direction === "improving") {
      return {
        action: "strong_buy",
        confidence: 0.8,
        reason: "Strong bullish sentiment with positive momentum"
      }
    }

    if (score > 0.3 && trend.direction !== "declining") {
      return {
        action: "buy",
        confidence: 0.6,
        reason: "Positive sentiment"
      }
    }

    if (score < -0.5 && trend.direction === "declining") {
      return {
        action: "strong_sell",
        confidence: 0.8,
        reason: "Strong bearish sentiment with negative momentum"
      }
    }

    if (score < -0.3) {
      return {
        action: "sell",
        confidence: 0.6,
        reason: "Negative sentiment"
      }
    }

    return {
      action: "hold",
      confidence: 0.5,
      reason: "Neutral sentiment"
    }
  }
}
```

## Best Practices

1. **Use multiple sources** for robust sentiment
2. **Weight by reliability** and historical accuracy
3. **Track sentiment changes** not just levels
4. **Consider time lags** between sentiment and price
5. **Validate with backtesting** before trading

## Related Skills

- [Whale Tracker](./whale-tracker-agent.md) - Whale activity
- [On-Chain Analytics](./on-chain-analytics-agent.md) - Chain data
- [DAHR Web2 Proxy](./dahr-web2-proxy-agent.md) - API access
