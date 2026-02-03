# Gas Tracker Agent Skill

> **⚠️ Prerequisites**: Complete [SDK Setup](./00-sdk-setup.md) first to configure your environment.

Build agents that track and optimize gas prices across chains.

## Overview

Gas Tracker Agent enables real-time gas price monitoring, prediction, and optimization strategies. Essential for cost-effective transaction execution and automated trading systems.

## SDK Reference

```typescript
import { Demos } from "@kynesyslabs/demosdk/websdk"
import { EVM } from "@kynesyslabs/demosdk/xm-websdk"

// Gas estimation
const gasPrice = await evm.provider.getGasPrice()
const feeData = await evm.provider.getFeeData()
```

## Agent Use Cases

### 1. Multi-Chain Gas Monitor

Monitor gas prices across chains:

```typescript
class MultiChainGasMonitor {
  private chains: Map<string, ChainGasConfig> = new Map()
  private gasHistory: Map<string, GasPrice[]> = new Map()
  private alerts: GasAlert[] = []

  async addChain(chainId: string, config: ChainGasConfig): Promise<void> {
    const evm = await EVM.create(config.rpcUrl)
    this.chains.set(chainId, { ...config, provider: evm.provider })
    this.gasHistory.set(chainId, [])
  }

  async getCurrentGas(chainId: string): Promise<GasData> {
    const config = this.chains.get(chainId)
    if (!config) throw new Error("Chain not configured")

    const feeData = await config.provider.getFeeData()
    const block = await config.provider.getBlock("latest")

    const gasData: GasData = {
      chainId,
      timestamp: Date.now(),
      baseFee: feeData.gasPrice || 0n,
      maxPriorityFee: feeData.maxPriorityFeePerGas || 0n,
      maxFee: feeData.maxFeePerGas || 0n,
      blockNumber: block?.number || 0,
      blockUtilization: block ? this.calculateUtilization(block) : 0,
      recommendations: this.generateRecommendations(feeData)
    }

    // Store history
    this.gasHistory.get(chainId)!.push({
      timestamp: gasData.timestamp,
      baseFee: gasData.baseFee,
      priorityFee: gasData.maxPriorityFee
    })

    // Prune old history
    const history = this.gasHistory.get(chainId)!
    const cutoff = Date.now() - 24 * 60 * 60 * 1000
    while (history.length > 0 && history[0].timestamp < cutoff) {
      history.shift()
    }

    return gasData
  }

  private generateRecommendations(feeData: FeeData): GasRecommendations {
    const baseFee = feeData.gasPrice || 0n
    const priorityFee = feeData.maxPriorityFeePerGas || 0n

    return {
      slow: {
        maxFee: baseFee + priorityFee / 2n,
        priorityFee: priorityFee / 2n,
        estimatedTime: "5-10 minutes"
      },
      standard: {
        maxFee: baseFee + priorityFee,
        priorityFee: priorityFee,
        estimatedTime: "1-3 minutes"
      },
      fast: {
        maxFee: baseFee * 2n + priorityFee * 2n,
        priorityFee: priorityFee * 2n,
        estimatedTime: "< 30 seconds"
      }
    }
  }

  async getAllChainsGas(): Promise<Map<string, GasData>> {
    const results = new Map<string, GasData>()

    await Promise.all(
      Array.from(this.chains.keys()).map(async chainId => {
        try {
          const gasData = await this.getCurrentGas(chainId)
          results.set(chainId, gasData)
        } catch (error) {
          // Skip failed chains
        }
      })
    )

    return results
  }

  getCheapestChain(): { chainId: string; gasPrice: bigint } | null {
    let cheapest: { chainId: string; gasPrice: bigint } | null = null

    for (const [chainId, history] of this.gasHistory) {
      if (history.length === 0) continue

      const latest = history[history.length - 1]
      if (!cheapest || latest.baseFee < cheapest.gasPrice) {
        cheapest = { chainId, gasPrice: latest.baseFee }
      }
    }

    return cheapest
  }
}
```

### 2. Gas Price Predictor

Predict future gas prices:

```typescript
class GasPricePredictor {
  private gasMonitor: MultiChainGasMonitor

  async predictGas(
    chainId: string,
    horizonMinutes: number = 60
  ): Promise<GasPrediction> {
    const history = await this.gasMonitor.getHistory(chainId, 24 * 60) // 24 hours

    if (history.length < 100) {
      throw new Error("Insufficient history for prediction")
    }

    // Calculate patterns
    const hourlyPattern = this.calculateHourlyPattern(history)
    const trend = this.calculateTrend(history)
    const volatility = this.calculateVolatility(history)

    // Current hour's expected adjustment
    const currentHour = new Date().getUTCHours()
    const hourlyAdjustment = hourlyPattern[currentHour]

    // Calculate prediction
    const currentGas = history[history.length - 1].baseFee
    const trendAdjustment = trend * BigInt(horizonMinutes)

    const predictedGas = currentGas + trendAdjustment +
      BigInt(Math.floor(Number(currentGas) * hourlyAdjustment))

    // Calculate confidence based on volatility
    const confidence = Math.max(0.3, 1 - volatility)

    return {
      chainId,
      currentGas,
      predictedGas,
      horizon: horizonMinutes,
      confidence,
      trend: trend > 0n ? "increasing" : trend < 0n ? "decreasing" : "stable",
      optimalWindow: this.findOptimalWindow(hourlyPattern, currentHour),
      factors: {
        hourlyPattern: hourlyAdjustment,
        trend: Number(trend),
        volatility
      }
    }
  }

  private calculateHourlyPattern(history: GasPrice[]): number[] {
    const hourlyBuckets: bigint[][] = Array(24).fill(null).map(() => [])

    for (const point of history) {
      const hour = new Date(point.timestamp).getUTCHours()
      hourlyBuckets[hour].push(point.baseFee)
    }

    const overallAvg = history.reduce((sum, p) => sum + p.baseFee, 0n) /
      BigInt(history.length)

    return hourlyBuckets.map(bucket => {
      if (bucket.length === 0) return 0
      const avg = bucket.reduce((a, b) => a + b, 0n) / BigInt(bucket.length)
      return Number(avg - overallAvg) / Number(overallAvg)
    })
  }

  private calculateTrend(history: GasPrice[]): bigint {
    // Simple linear regression
    const n = history.length
    const recent = history.slice(-60) // Last hour

    if (recent.length < 10) return 0n

    let sumX = 0n
    let sumY = 0n
    let sumXY = 0n
    let sumXX = 0n

    for (let i = 0; i < recent.length; i++) {
      const x = BigInt(i)
      const y = recent[i].baseFee

      sumX += x
      sumY += y
      sumXY += x * y
      sumXX += x * x
    }

    const nBig = BigInt(recent.length)
    const slope = (nBig * sumXY - sumX * sumY) / (nBig * sumXX - sumX * sumX)

    return slope
  }

  private findOptimalWindow(
    pattern: number[],
    currentHour: number
  ): OptimalWindow {
    // Find the lowest gas period in next 24 hours
    let minIndex = currentHour
    let minValue = pattern[currentHour]

    for (let i = 0; i < 24; i++) {
      const hour = (currentHour + i) % 24
      if (pattern[hour] < minValue) {
        minValue = pattern[hour]
        minIndex = hour
      }
    }

    const hoursUntil = (minIndex - currentHour + 24) % 24

    return {
      optimalHour: minIndex,
      hoursUntil,
      expectedSavings: -minValue, // Negative pattern value = savings
      recommendation: hoursUntil < 2
        ? "Execute soon"
        : hoursUntil < 6
        ? "Wait for better rates"
        : "Consider scheduling"
    }
  }
}
```

### 3. Gas Optimization Agent

Optimize transaction gas usage:

```typescript
class GasOptimizationAgent {
  private predictor: GasPricePredictor
  private pendingTxs: PendingTransaction[] = []

  async optimizeTransaction(
    tx: TransactionRequest,
    options: OptimizationOptions = {}
  ): Promise<OptimizedTransaction> {
    const chainId = tx.chainId || "1"

    // Get current and predicted gas
    const currentGas = await this.getCurrentGas(chainId)
    const prediction = await this.predictor.predictGas(chainId, 60)

    // Determine optimal strategy
    const strategy = this.determineStrategy(
      currentGas,
      prediction,
      options
    )

    let optimizedTx: TransactionRequest = { ...tx }

    switch (strategy.action) {
      case "execute_now":
        optimizedTx = this.setGasParams(tx, currentGas, "standard")
        break

      case "execute_fast":
        optimizedTx = this.setGasParams(tx, currentGas, "fast")
        break

      case "wait":
        // Queue for later execution
        this.pendingTxs.push({
          tx,
          queuedAt: Date.now(),
          targetGas: strategy.targetGas,
          deadline: options.deadline || Date.now() + 24 * 60 * 60 * 1000
        })
        return {
          tx: optimizedTx,
          strategy,
          status: "queued",
          estimatedExecution: prediction.optimalWindow.hoursUntil * 60 * 60 * 1000
        }

      case "batch":
        // Add to batch for combined execution
        return this.addToBatch(tx, options)
    }

    return {
      tx: optimizedTx,
      strategy,
      status: "ready",
      estimatedCost: await this.estimateCost(optimizedTx)
    }
  }

  private determineStrategy(
    currentGas: GasData,
    prediction: GasPrediction,
    options: OptimizationOptions
  ): OptimizationStrategy {
    const urgency = options.urgency || "normal"
    const maxGas = options.maxGasPrice

    // If urgent, execute now regardless
    if (urgency === "urgent") {
      return { action: "execute_fast", reason: "Urgent transaction" }
    }

    // If current gas is above max, must wait
    if (maxGas && currentGas.baseFee > maxGas) {
      return {
        action: "wait",
        reason: "Gas above maximum threshold",
        targetGas: maxGas
      }
    }

    // If prediction shows lower gas soon, wait
    if (
      prediction.predictedGas < currentGas.baseFee * 80n / 100n &&
      prediction.confidence > 0.6
    ) {
      return {
        action: "wait",
        reason: "Predicted lower gas",
        targetGas: prediction.predictedGas
      }
    }

    // If optimal window is soon, wait
    if (prediction.optimalWindow.hoursUntil <= 1) {
      return {
        action: "wait",
        reason: "Optimal window approaching",
        targetGas: currentGas.baseFee * 80n / 100n
      }
    }

    // Default: execute at standard rate
    return { action: "execute_now", reason: "No optimization opportunity" }
  }

  async processPendingQueue(): Promise<ProcessResult[]> {
    const results: ProcessResult[] = []
    const now = Date.now()

    for (const pending of this.pendingTxs) {
      // Check deadline
      if (now > pending.deadline) {
        // Execute regardless of gas
        const result = await this.executeTransaction(pending.tx, "standard")
        results.push({ ...result, reason: "deadline_reached" })
        continue
      }

      // Check if gas target met
      const currentGas = await this.getCurrentGas(pending.tx.chainId || "1")
      if (currentGas.baseFee <= pending.targetGas) {
        const result = await this.executeTransaction(pending.tx, "standard")
        results.push({ ...result, reason: "target_gas_reached" })
      }
    }

    // Remove processed transactions
    this.pendingTxs = this.pendingTxs.filter(p =>
      !results.some(r => r.txHash && r.originalTx === p.tx)
    )

    return results
  }
}
```

## Best Practices

1. **Monitor multiple chains** for arbitrage opportunities
2. **Track historical patterns** for prediction
3. **Set appropriate thresholds** for alerts
4. **Batch transactions** when possible
5. **Consider time-of-day patterns** for optimal execution

## Related Skills

- [Fee Estimation](./fee-estimation-agent.md) - Fee optimization
- [Transaction Builder](./transaction-builder-agent.md) - TX construction
- [Batch Transaction](./batch-transaction-agent.md) - TX batching
