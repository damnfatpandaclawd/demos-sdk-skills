# Token Metrics Agent Skill

Build agents that track and analyze comprehensive token metrics.

## Overview

Token Metrics Agent enables deep analysis of token fundamentals, technicals, and on-chain metrics. Essential for investment research, portfolio management, and market intelligence.

## SDK Reference

```typescript
import { Demos } from "@kynesyslabs/demosdk/websdk"
import { EVM } from "@kynesyslabs/demosdk/xm-websdk"

// Token data queries
const tokenInfo = await evm.getTokenInfo(tokenAddress)
```

## Agent Use Cases

### 1. Comprehensive Token Analyzer

Analyze all aspects of a token:

```typescript
class ComprehensiveTokenAnalyzer {
  async analyzeToken(tokenAddress: string): Promise<TokenAnalysis> {
    const [
      fundamentals,
      technicals,
      onChain,
      social
    ] = await Promise.all([
      this.analyzeFundamentals(tokenAddress),
      this.analyzeTechnicals(tokenAddress),
      this.analyzeOnChain(tokenAddress),
      this.analyzeSocial(tokenAddress)
    ])

    const score = this.calculateCompositeScore({
      fundamentals,
      technicals,
      onChain,
      social
    })

    return {
      tokenAddress,
      fundamentals,
      technicals,
      onChain,
      social,
      compositeScore: score,
      recommendation: this.generateRecommendation(score),
      risks: this.identifyRisks({ fundamentals, technicals, onChain }),
      timestamp: Date.now()
    }
  }

  private async analyzeFundamentals(address: string): Promise<Fundamentals> {
    const tokenInfo = await this.getTokenInfo(address)
    const supply = await this.getSupplyMetrics(address)

    return {
      name: tokenInfo.name,
      symbol: tokenInfo.symbol,
      decimals: tokenInfo.decimals,
      totalSupply: supply.total,
      circulatingSupply: supply.circulating,
      maxSupply: supply.max,
      marketCap: supply.circulating * await this.getPrice(address),
      fullyDilutedValuation: supply.max * await this.getPrice(address),
      supplyInflation: this.calculateInflation(supply),
      tokenomics: await this.analyzeTokenomics(address)
    }
  }

  private async analyzeTokenomics(address: string): Promise<Tokenomics> {
    const holders = await this.getTopHolders(address, 100)
    const vestingSchedules = await this.getVestingSchedules(address)

    // Calculate concentration metrics
    const top10Holdings = holders.slice(0, 10)
      .reduce((sum, h) => sum + h.percentage, 0)
    const top50Holdings = holders.slice(0, 50)
      .reduce((sum, h) => sum + h.percentage, 0)

    return {
      holderCount: await this.getHolderCount(address),
      top10Concentration: top10Holdings,
      top50Concentration: top50Holdings,
      giniCoefficient: this.calculateGini(holders),
      vestingSchedules,
      upcomingUnlocks: this.getUpcomingUnlocks(vestingSchedules),
      teamAllocation: this.identifyTeamHoldings(holders),
      contractBalance: await this.getContractBalance(address)
    }
  }

  private async analyzeTechnicals(address: string): Promise<Technicals> {
    const priceHistory = await this.getPriceHistory(address, 90)
    const volumeHistory = await this.getVolumeHistory(address, 90)

    return {
      price: {
        current: priceHistory[priceHistory.length - 1].price,
        change24h: this.calculatePriceChange(priceHistory, 1),
        change7d: this.calculatePriceChange(priceHistory, 7),
        change30d: this.calculatePriceChange(priceHistory, 30),
        ath: Math.max(...priceHistory.map(p => p.price)),
        atl: Math.min(...priceHistory.map(p => p.price)),
        fromATH: this.calculateFromATH(priceHistory)
      },
      volume: {
        current24h: volumeHistory[volumeHistory.length - 1].volume,
        avg7d: this.calculateAvgVolume(volumeHistory, 7),
        avg30d: this.calculateAvgVolume(volumeHistory, 30),
        volumeMarketCapRatio: this.calculateVolumeRatio(priceHistory, volumeHistory)
      },
      indicators: {
        rsi: this.calculateRSI(priceHistory, 14),
        macd: this.calculateMACD(priceHistory),
        movingAverages: {
          ma7: this.calculateMA(priceHistory, 7),
          ma25: this.calculateMA(priceHistory, 25),
          ma99: this.calculateMA(priceHistory, 99)
        },
        volatility: this.calculateVolatility(priceHistory)
      }
    }
  }

  private calculateRSI(prices: PricePoint[], period: number): number {
    if (prices.length < period + 1) return 50

    const changes = prices.slice(-period - 1).map((p, i, arr) =>
      i === 0 ? 0 : p.price - arr[i - 1].price
    ).slice(1)

    const gains = changes.filter(c => c > 0)
    const losses = changes.filter(c => c < 0).map(Math.abs)

    const avgGain = gains.reduce((a, b) => a + b, 0) / period
    const avgLoss = losses.reduce((a, b) => a + b, 0) / period

    if (avgLoss === 0) return 100

    const rs = avgGain / avgLoss
    return 100 - (100 / (1 + rs))
  }
}
```

### 2. Token Comparison Agent

Compare multiple tokens:

```typescript
class TokenComparisonAgent {
  async compareTokens(
    tokenAddresses: string[]
  ): Promise<TokenComparison> {
    const analyses = await Promise.all(
      tokenAddresses.map(addr => this.analyzeToken(addr))
    )

    const comparison: TokenComparison = {
      tokens: analyses,
      rankings: this.generateRankings(analyses),
      correlations: await this.calculateCorrelations(tokenAddresses),
      recommendations: this.generateComparisonRecommendations(analyses)
    }

    return comparison
  }

  private generateRankings(analyses: TokenAnalysis[]): Rankings {
    return {
      byMarketCap: [...analyses]
        .sort((a, b) => Number(b.fundamentals.marketCap - a.fundamentals.marketCap))
        .map((a, i) => ({ token: a.tokenAddress, rank: i + 1 })),

      byVolume: [...analyses]
        .sort((a, b) => Number(b.technicals.volume.current24h - a.technicals.volume.current24h))
        .map((a, i) => ({ token: a.tokenAddress, rank: i + 1 })),

      byHolders: [...analyses]
        .sort((a, b) => b.fundamentals.tokenomics.holderCount - a.fundamentals.tokenomics.holderCount)
        .map((a, i) => ({ token: a.tokenAddress, rank: i + 1 })),

      byScore: [...analyses]
        .sort((a, b) => b.compositeScore - a.compositeScore)
        .map((a, i) => ({ token: a.tokenAddress, rank: i + 1 })),

      byGrowth: [...analyses]
        .sort((a, b) => b.technicals.price.change30d - a.technicals.price.change30d)
        .map((a, i) => ({ token: a.tokenAddress, rank: i + 1 }))
    }
  }

  private async calculateCorrelations(
    addresses: string[]
  ): Promise<CorrelationMatrix> {
    const priceHistories = await Promise.all(
      addresses.map(addr => this.getPriceHistory(addr, 30))
    )

    const matrix: number[][] = []

    for (let i = 0; i < addresses.length; i++) {
      matrix[i] = []
      for (let j = 0; j < addresses.length; j++) {
        if (i === j) {
          matrix[i][j] = 1
        } else if (j < i) {
          matrix[i][j] = matrix[j][i]
        } else {
          matrix[i][j] = this.calculatePearsonCorrelation(
            priceHistories[i].map(p => p.price),
            priceHistories[j].map(p => p.price)
          )
        }
      }
    }

    return {
      tokens: addresses,
      correlations: matrix,
      highlyCorrelated: this.findHighCorrelations(addresses, matrix),
      diversificationScore: this.calculateDiversificationScore(matrix)
    }
  }

  private calculatePearsonCorrelation(x: number[], y: number[]): number {
    const n = Math.min(x.length, y.length)
    if (n < 2) return 0

    const xSlice = x.slice(-n)
    const ySlice = y.slice(-n)

    const xMean = xSlice.reduce((a, b) => a + b) / n
    const yMean = ySlice.reduce((a, b) => a + b) / n

    let numerator = 0
    let xVar = 0
    let yVar = 0

    for (let i = 0; i < n; i++) {
      const xDiff = xSlice[i] - xMean
      const yDiff = ySlice[i] - yMean
      numerator += xDiff * yDiff
      xVar += xDiff * xDiff
      yVar += yDiff * yDiff
    }

    const denominator = Math.sqrt(xVar * yVar)
    return denominator === 0 ? 0 : numerator / denominator
  }
}
```

### 3. Token Alert Agent

Monitor token metrics and generate alerts:

```typescript
class TokenAlertAgent {
  private alerts: Map<string, AlertConfig[]> = new Map()
  private triggered: TriggeredAlert[] = []

  async setAlert(config: AlertConfig): Promise<string> {
    const alertId = this.generateAlertId()

    if (!this.alerts.has(config.tokenAddress)) {
      this.alerts.set(config.tokenAddress, [])
    }

    this.alerts.get(config.tokenAddress)!.push({
      ...config,
      id: alertId,
      createdAt: Date.now()
    })

    return alertId
  }

  async checkAlerts(): Promise<TriggeredAlert[]> {
    const newlyTriggered: TriggeredAlert[] = []

    for (const [tokenAddress, configs] of this.alerts) {
      const metrics = await this.getTokenMetrics(tokenAddress)

      for (const config of configs) {
        const triggered = this.evaluateCondition(config, metrics)

        if (triggered) {
          const alert: TriggeredAlert = {
            alertId: config.id,
            tokenAddress,
            condition: config.condition,
            threshold: config.threshold,
            actualValue: this.getMetricValue(config.metric, metrics),
            triggeredAt: Date.now()
          }

          newlyTriggered.push(alert)
          this.triggered.push(alert)

          // Remove one-time alerts
          if (!config.recurring) {
            const index = configs.indexOf(config)
            configs.splice(index, 1)
          }
        }
      }
    }

    return newlyTriggered
  }

  private evaluateCondition(
    config: AlertConfig,
    metrics: TokenMetrics
  ): boolean {
    const value = this.getMetricValue(config.metric, metrics)

    switch (config.condition) {
      case "above":
        return value > config.threshold
      case "below":
        return value < config.threshold
      case "change_above":
        return Math.abs(value) > config.threshold
      case "crosses_above":
        return value > config.threshold && config.previousValue <= config.threshold
      case "crosses_below":
        return value < config.threshold && config.previousValue >= config.threshold
      default:
        return false
    }
  }

  private getMetricValue(metric: string, metrics: TokenMetrics): number {
    switch (metric) {
      case "price":
        return metrics.price
      case "price_change_24h":
        return metrics.priceChange24h
      case "volume":
        return Number(metrics.volume24h)
      case "market_cap":
        return Number(metrics.marketCap)
      case "holder_count":
        return metrics.holderCount
      case "rsi":
        return metrics.rsi
      case "volatility":
        return metrics.volatility
      default:
        return 0
    }
  }

  // Preset alert templates
  static presets = {
    priceAlert: (token: string, price: number, above: boolean): AlertConfig => ({
      tokenAddress: token,
      metric: "price",
      condition: above ? "above" : "below",
      threshold: price,
      recurring: false
    }),

    volatilityAlert: (token: string, threshold: number): AlertConfig => ({
      tokenAddress: token,
      metric: "volatility",
      condition: "above",
      threshold,
      recurring: true
    }),

    whaleAlert: (token: string, minHolding: number): AlertConfig => ({
      tokenAddress: token,
      metric: "top_holder_change",
      condition: "change_above",
      threshold: minHolding,
      recurring: true
    })
  }
}
```

## Best Practices

1. **Cache frequently accessed metrics** to reduce API calls
2. **Normalize metrics** for cross-token comparison
3. **Track metrics over time** to identify trends
4. **Combine multiple indicators** for robust signals
5. **Set appropriate alert thresholds** to avoid noise

## Related Skills

- [Price Oracle Agent](./price-oracle-agent.md) - Price data
- [On-Chain Analytics](./on-chain-analytics-agent.md) - Chain data
- [Sentiment Analysis](./sentiment-analysis-agent.md) - Market sentiment
