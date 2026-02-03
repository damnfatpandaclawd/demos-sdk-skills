# Volatility Tracker Agent Skill

> **⚠️ Prerequisites**: Complete [SDK Setup](./00-sdk-setup.md) first to configure your environment.

Build agents that monitor and analyze market volatility across assets.

## Overview

Volatility Tracker Agent enables real-time volatility monitoring, regime detection, and volatility-based trading signals. Essential for risk management, options pricing, and position sizing.

## SDK Reference

```typescript
import { Demos } from "@kynesyslabs/demosdk/websdk"
import { EVM } from "@kynesyslabs/demosdk/xm-websdk"

// Price history for volatility calculation
const priceHistory = await this.getPriceHistory(token, days)
```

## Agent Use Cases

### 1. Multi-Asset Volatility Monitor

Monitor volatility across multiple assets:

```typescript
class MultiAssetVolatilityMonitor {
  private assets: Map<string, AssetVolatility> = new Map()
  private priceHistory: Map<string, PricePoint[]> = new Map()

  async addAsset(address: string, symbol: string): Promise<void> {
    // Load historical prices
    const history = await this.fetchPriceHistory(address, 365)
    this.priceHistory.set(address, history)

    // Calculate initial volatility metrics
    const volatility = this.calculateVolatilityMetrics(history)

    this.assets.set(address, {
      address,
      symbol,
      ...volatility
    })

    // Start real-time monitoring
    this.startPriceMonitoring(address)
  }

  private calculateVolatilityMetrics(history: PricePoint[]): VolatilityMetrics {
    // Calculate returns
    const returns = this.calculateReturns(history)

    return {
      // Historical volatility
      daily: this.calculateStdDev(returns.slice(-30)) * Math.sqrt(365),
      weekly: this.calculateStdDev(returns.slice(-90)) * Math.sqrt(52),
      monthly: this.calculateStdDev(returns.slice(-365)) * Math.sqrt(12),

      // Realized volatility windows
      realized7d: this.calculateRealizedVolatility(returns, 7),
      realized30d: this.calculateRealizedVolatility(returns, 30),
      realized90d: this.calculateRealizedVolatility(returns, 90),

      // Additional metrics
      parkinsonVolatility: this.calculateParkinsonVolatility(history.slice(-30)),
      garmanKlass: this.calculateGarmanKlassVolatility(history.slice(-30)),

      // Volatility of volatility
      volOfVol: this.calculateVolOfVol(returns),

      timestamp: Date.now()
    }
  }

  private calculateReturns(history: PricePoint[]): number[] {
    const returns: number[] = []
    for (let i = 1; i < history.length; i++) {
      returns.push(Math.log(history[i].price / history[i - 1].price))
    }
    return returns
  }

  private calculateStdDev(values: number[]): number {
    if (values.length < 2) return 0

    const mean = values.reduce((a, b) => a + b) / values.length
    const variance = values.reduce(
      (sum, v) => sum + Math.pow(v - mean, 2), 0
    ) / (values.length - 1)

    return Math.sqrt(variance)
  }

  private calculateRealizedVolatility(
    returns: number[],
    window: number
  ): number {
    const windowReturns = returns.slice(-window)
    return this.calculateStdDev(windowReturns) * Math.sqrt(365)
  }

  private calculateParkinsonVolatility(history: PricePoint[]): number {
    // Parkinson volatility using high/low prices
    if (!history[0].high || !history[0].low) {
      return this.calculateRealizedVolatility(
        this.calculateReturns(history), history.length
      )
    }

    const n = history.length
    let sum = 0

    for (const point of history) {
      const logHL = Math.log(point.high / point.low)
      sum += logHL * logHL
    }

    return Math.sqrt(sum / (4 * n * Math.log(2))) * Math.sqrt(365)
  }

  async getVolatilityComparison(): Promise<VolatilityComparison[]> {
    const comparisons: VolatilityComparison[] = []

    for (const [address, asset] of this.assets) {
      comparisons.push({
        address,
        symbol: asset.symbol,
        currentVolatility: asset.realized30d,
        percentile: await this.calculateVolatilityPercentile(address),
        trend: this.calculateVolatilityTrend(address),
        regime: this.classifyVolatilityRegime(asset)
      })
    }

    return comparisons.sort((a, b) => b.currentVolatility - a.currentVolatility)
  }

  private classifyVolatilityRegime(asset: AssetVolatility): VolatilityRegime {
    const current = asset.realized30d
    const historical = asset.realized90d

    if (current > historical * 1.5) {
      return { regime: "high", label: "Elevated volatility" }
    }
    if (current < historical * 0.5) {
      return { regime: "low", label: "Compressed volatility" }
    }
    return { regime: "normal", label: "Normal volatility" }
  }
}
```

### 2. Volatility Regime Detector

Detect volatility regime changes:

```typescript
class VolatilityRegimeDetector {
  private regimeHistory: RegimeChange[] = []

  async detectRegimeChange(
    address: string,
    lookbackDays: number = 90
  ): Promise<RegimeAnalysis> {
    const history = await this.getPriceHistory(address, lookbackDays)
    const returns = this.calculateReturns(history)

    // Calculate rolling volatility
    const rollingVol = this.calculateRollingVolatility(returns, 20)

    // Detect regime using Markov switching model (simplified)
    const regimes = this.classifyRegimes(rollingVol)

    // Find regime transitions
    const transitions = this.findTransitions(regimes)

    // Current regime
    const currentRegime = regimes[regimes.length - 1]

    // Predict next regime
    const prediction = this.predictNextRegime(regimes)

    return {
      currentRegime,
      regimeHistory: regimes,
      transitions,
      prediction,
      metrics: {
        avgHighVolDuration: this.calculateAvgRegimeDuration(transitions, "high"),
        avgLowVolDuration: this.calculateAvgRegimeDuration(transitions, "low"),
        currentRegimeDuration: this.getCurrentRegimeDuration(regimes)
      }
    }
  }

  private calculateRollingVolatility(
    returns: number[],
    window: number
  ): number[] {
    const rolling: number[] = []

    for (let i = window; i < returns.length; i++) {
      const windowReturns = returns.slice(i - window, i)
      const vol = this.calculateStdDev(windowReturns) * Math.sqrt(365)
      rolling.push(vol)
    }

    return rolling
  }

  private classifyRegimes(volatilities: number[]): RegimeState[] {
    // Calculate thresholds based on distribution
    const sorted = [...volatilities].sort((a, b) => a - b)
    const lowThreshold = sorted[Math.floor(sorted.length * 0.33)]
    const highThreshold = sorted[Math.floor(sorted.length * 0.67)]

    return volatilities.map(vol => {
      if (vol < lowThreshold) return "low"
      if (vol > highThreshold) return "high"
      return "normal"
    })
  }

  private findTransitions(regimes: RegimeState[]): RegimeTransition[] {
    const transitions: RegimeTransition[] = []

    for (let i = 1; i < regimes.length; i++) {
      if (regimes[i] !== regimes[i - 1]) {
        transitions.push({
          from: regimes[i - 1],
          to: regimes[i],
          index: i,
          timestamp: Date.now() - (regimes.length - i) * 24 * 60 * 60 * 1000
        })
      }
    }

    return transitions
  }

  private predictNextRegime(regimes: RegimeState[]): RegimePrediction {
    // Calculate transition probabilities
    const transitions = { low: { low: 0, normal: 0, high: 0 },
                          normal: { low: 0, normal: 0, high: 0 },
                          high: { low: 0, normal: 0, high: 0 } }
    const counts = { low: 0, normal: 0, high: 0 }

    for (let i = 0; i < regimes.length - 1; i++) {
      transitions[regimes[i]][regimes[i + 1]]++
      counts[regimes[i]]++
    }

    // Calculate probabilities
    const currentRegime = regimes[regimes.length - 1]
    const probs: Record<string, number> = {}

    for (const nextRegime of ["low", "normal", "high"]) {
      probs[nextRegime] = counts[currentRegime] > 0
        ? transitions[currentRegime][nextRegime] / counts[currentRegime]
        : 0.33
    }

    // Find most likely
    const mostLikely = Object.entries(probs)
      .sort((a, b) => b[1] - a[1])[0]

    return {
      nextRegime: mostLikely[0] as RegimeState,
      probability: mostLikely[1],
      allProbabilities: probs
    }
  }
}
```

### 3. Volatility Trading Signals

Generate trading signals from volatility:

```typescript
class VolatilityTradingSignals {
  private volatilityMonitor: MultiAssetVolatilityMonitor
  private regimeDetector: VolatilityRegimeDetector

  async generateSignals(address: string): Promise<VolatilitySignal[]> {
    const signals: VolatilitySignal[] = []

    const metrics = await this.volatilityMonitor.getMetrics(address)
    const regime = await this.regimeDetector.detectRegimeChange(address)

    // Mean reversion signal
    const meanReversionSignal = this.checkMeanReversion(metrics)
    if (meanReversionSignal) signals.push(meanReversionSignal)

    // Volatility breakout signal
    const breakoutSignal = this.checkVolatilityBreakout(metrics)
    if (breakoutSignal) signals.push(breakoutSignal)

    // Regime change signal
    const regimeSignal = this.checkRegimeChange(regime)
    if (regimeSignal) signals.push(regimeSignal)

    // Volatility compression signal
    const compressionSignal = this.checkVolatilityCompression(metrics)
    if (compressionSignal) signals.push(compressionSignal)

    return signals
  }

  private checkMeanReversion(metrics: VolatilityMetrics): VolatilitySignal | null {
    const shortTermVol = metrics.realized7d
    const longTermVol = metrics.realized90d
    const zScore = (shortTermVol - longTermVol) / metrics.volOfVol

    if (zScore > 2) {
      return {
        type: "mean_reversion",
        direction: "short_vol",
        strength: Math.min(1, zScore / 3),
        message: "Volatility elevated, expect mean reversion",
        metrics: { zScore, shortTermVol, longTermVol }
      }
    }

    if (zScore < -2) {
      return {
        type: "mean_reversion",
        direction: "long_vol",
        strength: Math.min(1, Math.abs(zScore) / 3),
        message: "Volatility compressed, expect expansion",
        metrics: { zScore, shortTermVol, longTermVol }
      }
    }

    return null
  }

  private checkVolatilityBreakout(
    metrics: VolatilityMetrics
  ): VolatilitySignal | null {
    const current = metrics.realized7d
    const ma30 = metrics.realized30d
    const ma90 = metrics.realized90d

    // Breakout: short-term vol crossing above long-term
    if (current > ma30 * 1.3 && ma30 > ma90) {
      return {
        type: "breakout",
        direction: "expansion",
        strength: (current / ma30 - 1) / 0.5,
        message: "Volatility breakout detected",
        metrics: { current, ma30, ma90 }
      }
    }

    return null
  }

  private checkVolatilityCompression(
    metrics: VolatilityMetrics
  ): VolatilitySignal | null {
    const volRatio = metrics.realized7d / metrics.realized90d

    if (volRatio < 0.5) {
      return {
        type: "compression",
        direction: "expect_expansion",
        strength: 1 - volRatio,
        message: "Volatility highly compressed, breakout likely",
        metrics: { volRatio }
      }
    }

    return null
  }

  async calculatePositionSize(
    address: string,
    riskBudget: number, // Max loss in base currency
    entryPrice: number
  ): Promise<PositionSizing> {
    const metrics = await this.volatilityMonitor.getMetrics(address)

    // Use ATR-based position sizing
    const dailyVol = metrics.realized30d / Math.sqrt(365)
    const expectedDailyMove = entryPrice * dailyVol

    // Position size based on 2 standard deviation move
    const maxPosition = riskBudget / (expectedDailyMove * 2)

    return {
      suggestedSize: maxPosition,
      dailyVolatility: dailyVol,
      expectedDailyMove,
      riskPerUnit: expectedDailyMove * 2,
      stopDistance: expectedDailyMove * 2
    }
  }
}
```

## Best Practices

1. **Use multiple volatility measures** for robust analysis
2. **Track volatility regimes** for strategy adaptation
3. **Consider volatility clustering** in models
4. **Account for volatility smile** in options pricing
5. **Update calculations frequently** during high-vol periods

## Related Skills

- [Risk Assessment Agent](./risk-assessment-agent.md) - Risk analysis
- [Token Metrics Agent](./token-metrics-agent.md) - Price analysis
- [Price Oracle Agent](./price-oracle-agent.md) - Price data
