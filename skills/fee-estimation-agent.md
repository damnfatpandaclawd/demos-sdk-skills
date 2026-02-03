# Fee Estimation Agent Skill

Build agents that accurately estimate transaction fees and optimize gas usage on Demos Network.

## Overview

Fee Estimation enables agents to predict transaction costs, optimize fee strategies, and ensure transactions confirm reliably. Essential for cost-sensitive operations, automated trading, and user-facing applications.

## SDK Reference

```typescript
import { Demos } from "@kynesyslabs/demosdk/websdk"

// Fee Methods
demos.estimateFee(transaction)               // Estimate single tx fee
demos.estimateBatchFee(transactions)         // Estimate batch fee
demos.getNetworkFees()                       // Get current fee rates
demos.getFeeHistory(blocks)                  // Historical fee data
demos.suggestFee(priority)                   // Get suggested fee
```

## Agent Use Cases

### 1. Fee Optimizer Agent

Optimize fees for cost-effective transactions:

```typescript
class FeeOptimizerAgent {
  private demos: Demos
  private feeHistory: FeeData[] = []

  async optimizeFee(
    transaction: Transaction,
    urgency: "low" | "medium" | "high"
  ): Promise<OptimizedFee> {
    // Get current network conditions
    const networkFees = await this.demos.getNetworkFees()
    const history = await this.demos.getFeeHistory(100)

    // Calculate optimal fee based on urgency
    let multiplier: number
    switch (urgency) {
      case "low":
        multiplier = 0.8
        break
      case "medium":
        multiplier = 1.0
        break
      case "high":
        multiplier = 1.5
        break
    }

    const baseFee = await this.demos.estimateFee(transaction)
    const optimizedFee = BigInt(Math.floor(Number(baseFee) * multiplier))

    // Check against historical success rates
    const successRate = this.calculateSuccessRate(optimizedFee, history)

    return {
      baseFee,
      optimizedFee,
      urgency,
      estimatedConfirmTime: this.estimateConfirmTime(optimizedFee, networkFees),
      successProbability: successRate
    }
  }

  async findOptimalTiming(
    transaction: Transaction,
    maxWaitHours: number = 24
  ): Promise<TimingRecommendation> {
    const history = await this.demos.getFeeHistory(1000)

    // Analyze fee patterns by hour
    const hourlyAverages = this.analyzeHourlyFees(history)

    // Find cheapest hours
    const sortedHours = Object.entries(hourlyAverages)
      .sort((a, b) => a[1] - b[1])

    const cheapestHour = parseInt(sortedHours[0][0])
    const currentHour = new Date().getHours()
    const hoursUntilCheapest = (cheapestHour - currentHour + 24) % 24

    if (hoursUntilCheapest <= maxWaitHours) {
      return {
        recommendWait: true,
        optimalHour: cheapestHour,
        hoursToWait: hoursUntilCheapest,
        estimatedSavings: hourlyAverages[currentHour] - hourlyAverages[cheapestHour]
      }
    }

    return {
      recommendWait: false,
      reason: "Wait time exceeds maximum"
    }
  }

  private calculateSuccessRate(fee: bigint, history: FeeData[]): number {
    const confirmed = history.filter(h => h.fee <= fee && h.confirmed).length
    return confirmed / history.length
  }
}
```

### 2. Fee Alert Agent

Monitor and alert on fee conditions:

```typescript
class FeeAlertAgent {
  private demos: Demos
  private alerts: FeeAlert[] = []

  async setFeeAlert(
    threshold: bigint,
    direction: "above" | "below",
    callback: (fee: bigint) => void
  ): Promise<string> {
    const alertId = this.generateAlertId()

    this.alerts.push({
      id: alertId,
      threshold,
      direction,
      callback,
      triggered: false
    })

    return alertId
  }

  async startMonitoring(intervalMs: number = 60000): Promise<void> {
    setInterval(async () => {
      const fees = await this.demos.getNetworkFees()

      for (const alert of this.alerts) {
        if (alert.triggered) continue

        const shouldTrigger = alert.direction === "above"
          ? fees.baseFee > alert.threshold
          : fees.baseFee < alert.threshold

        if (shouldTrigger) {
          alert.triggered = true
          alert.callback(fees.baseFee)
        }
      }
    }, intervalMs)
  }

  async waitForLowFees(
    maxFee: bigint,
    timeoutMs: number = 3600000
  ): Promise<boolean> {
    const startTime = Date.now()

    while (Date.now() - startTime < timeoutMs) {
      const fees = await this.demos.getNetworkFees()

      if (fees.baseFee <= maxFee) {
        return true
      }

      await new Promise(r => setTimeout(r, 30000))
    }

    return false
  }
}
```

### 3. Cost Analysis Agent

Analyze transaction costs over time:

```typescript
class CostAnalysisAgent {
  private demos: Demos

  async analyzeAddressCosts(
    address: string,
    startDate: Date,
    endDate: Date
  ): Promise<CostAnalysis> {
    const transactions = await this.demos.getTransactionHistory(address, {
      from: startDate.getTime(),
      to: endDate.getTime()
    })

    const analysis: CostAnalysis = {
      totalFeesPaid: 0n,
      transactionCount: transactions.length,
      averageFee: 0n,
      highestFee: 0n,
      lowestFee: BigInt(Number.MAX_SAFE_INTEGER),
      feesByType: {},
      feesByDay: {}
    }

    for (const tx of transactions) {
      const fee = BigInt(tx.fee)
      analysis.totalFeesPaid += fee

      if (fee > analysis.highestFee) analysis.highestFee = fee
      if (fee < analysis.lowestFee) analysis.lowestFee = fee

      // By type
      analysis.feesByType[tx.type] = (analysis.feesByType[tx.type] || 0n) + fee

      // By day
      const day = new Date(tx.timestamp).toISOString().split('T')[0]
      analysis.feesByDay[day] = (analysis.feesByDay[day] || 0n) + fee
    }

    analysis.averageFee = analysis.transactionCount > 0
      ? analysis.totalFeesPaid / BigInt(analysis.transactionCount)
      : 0n

    return analysis
  }

  async suggestOptimizations(
    analysis: CostAnalysis
  ): Promise<Optimization[]> {
    const optimizations: Optimization[] = []

    // Check for high-fee transactions
    if (analysis.highestFee > analysis.averageFee * 3n) {
      optimizations.push({
        type: "timing",
        description: "Some transactions paid 3x average fee - consider timing",
        potentialSavings: analysis.highestFee - analysis.averageFee
      })
    }

    // Check for batch opportunities
    const smallTxCount = Object.values(analysis.feesByType)
      .filter(f => f < analysis.averageFee).length

    if (smallTxCount > 10) {
      optimizations.push({
        type: "batching",
        description: `${smallTxCount} small transactions could be batched`,
        potentialSavings: analysis.averageFee * BigInt(smallTxCount) * 2n / 10n
      })
    }

    return optimizations
  }
}
```

## Best Practices

1. **Use dynamic fee estimation** for time-sensitive transactions
2. **Batch transactions** when possible for 20% savings
3. **Monitor fee trends** to find optimal timing
4. **Set fee alerts** for low-fee opportunities
5. **Cache fee estimates** to reduce API calls

## Related Skills

- [Batch Transaction Agent](./batch-transaction-agent.md) - Fee-efficient batching
- [Transaction Builder](./transaction-builder-agent.md) - Transaction construction
