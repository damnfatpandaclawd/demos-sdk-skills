# TWAP Executor Agent Skill

> **⚠️ Prerequisites**: Complete [SDK Setup](./00-sdk-setup.md) first to configure your environment.

Build agents that execute time-weighted average price (TWAP) strategies.

## Overview

TWAP Executor enables large orders to be split and executed over time to minimize market impact and achieve better average prices. Essential for institutional trading and large position building.

## SDK Reference

```typescript
import { Demos } from "@kynesyslabs/demosdk/websdk"
import { DemosWork, BaseOperation } from "@kynesyslabs/demoswork"

// Scheduled execution with DemosWork
const work = new DemosWork()
```

## Agent Use Cases

### 1. Basic TWAP Executor

Execute orders over a time period:

```typescript
class TWAPExecutor {
  private demos: Demos
  private activeStrategies: Map<string, TWAPStrategy> = new Map()

  async createTWAP(params: TWAPParams): Promise<TWAPStrategy> {
    const strategy: TWAPStrategy = {
      id: this.generateId(),
      pair: params.pair,
      side: params.side,
      totalSize: params.totalSize,
      duration: params.duration,
      intervals: params.intervals || Math.ceil(params.duration / 60000), // Default: 1 per minute
      executedSize: 0n,
      executedValue: 0n,
      slices: [],
      status: "active",
      startTime: Date.now()
    }

    // Calculate slice size
    strategy.sliceSize = strategy.totalSize / BigInt(strategy.intervals)

    // Start execution
    this.activeStrategies.set(strategy.id, strategy)
    this.executeStrategy(strategy)

    return strategy
  }

  private async executeStrategy(strategy: TWAPStrategy): Promise<void> {
    const intervalMs = strategy.duration / strategy.intervals
    let sliceIndex = 0

    const executeSlice = async () => {
      if (strategy.status !== "active") return

      // Check if we should execute this slice
      const remainingSize = strategy.totalSize - strategy.executedSize
      if (remainingSize <= 0n) {
        strategy.status = "completed"
        return
      }

      // Calculate slice size (handle remainder on last slice)
      const isLastSlice = sliceIndex === strategy.intervals - 1
      const sliceSize = isLastSlice ? remainingSize : strategy.sliceSize

      try {
        // Execute slice
        const result = await this.executeSlice(strategy, sliceSize)

        // Record result
        strategy.slices.push({
          index: sliceIndex,
          size: result.executedSize,
          price: result.price,
          timestamp: Date.now(),
          txHash: result.txHash
        })

        strategy.executedSize += result.executedSize
        strategy.executedValue += result.executedSize * BigInt(Math.floor(result.price * 1e18)) / 10n ** 18n

        sliceIndex++

        // Schedule next slice
        if (sliceIndex < strategy.intervals && strategy.status === "active") {
          setTimeout(executeSlice, intervalMs)
        } else {
          strategy.status = "completed"
        }
      } catch (error) {
        strategy.slices.push({
          index: sliceIndex,
          error: error.message,
          timestamp: Date.now()
        })

        // Continue with next slice on error
        sliceIndex++
        if (sliceIndex < strategy.intervals) {
          setTimeout(executeSlice, intervalMs)
        }
      }
    }

    // Start first slice
    executeSlice()
  }

  private async executeSlice(
    strategy: TWAPStrategy,
    size: bigint
  ): Promise<SliceResult> {
    // Get current price
    const price = await this.getCurrentPrice(strategy.pair)

    // Calculate min output with slippage tolerance
    const expectedOutput = this.calculateExpectedOutput(
      strategy.side,
      size,
      price
    )
    const minOutput = expectedOutput * 995n / 1000n // 0.5% slippage

    // Execute swap
    const tx = await this.dex.swap({
      tokenIn: strategy.side === "buy" ? strategy.pair.quote : strategy.pair.base,
      tokenOut: strategy.side === "buy" ? strategy.pair.base : strategy.pair.quote,
      amountIn: size,
      minAmountOut: minOutput
    })

    const receipt = await tx.wait()

    return {
      executedSize: size,
      price,
      txHash: receipt.transactionHash
    }
  }

  getAveragePrice(strategyId: string): number | null {
    const strategy = this.activeStrategies.get(strategyId)
    if (!strategy || strategy.executedSize === 0n) return null

    return Number(strategy.executedValue) / Number(strategy.executedSize)
  }

  async pauseStrategy(strategyId: string): Promise<boolean> {
    const strategy = this.activeStrategies.get(strategyId)
    if (!strategy || strategy.status !== "active") return false

    strategy.status = "paused"
    return true
  }

  async resumeStrategy(strategyId: string): Promise<boolean> {
    const strategy = this.activeStrategies.get(strategyId)
    if (!strategy || strategy.status !== "paused") return false

    strategy.status = "active"
    this.executeStrategy(strategy)
    return true
  }
}
```

### 2. Adaptive TWAP

Adjust execution based on market conditions:

```typescript
class AdaptiveTWAPExecutor {
  private baseTWAP: TWAPExecutor
  private volumeTracker: VolumeTracker

  async createAdaptiveTWAP(params: AdaptiveTWAPParams): Promise<AdaptiveTWAPStrategy> {
    const strategy: AdaptiveTWAPStrategy = {
      ...params,
      id: this.generateId(),
      adaptiveMode: params.adaptiveMode || "volume",
      participationRate: params.participationRate || 0.1, // 10% of volume
      minSliceSize: params.minSliceSize,
      maxSliceSize: params.maxSliceSize,
      executedSize: 0n,
      status: "active"
    }

    this.executeAdaptive(strategy)

    return strategy
  }

  private async executeAdaptive(strategy: AdaptiveTWAPStrategy): Promise<void> {
    const checkInterval = strategy.duration / strategy.intervals

    const executeAdaptiveSlice = async () => {
      if (strategy.status !== "active") return

      const remainingSize = strategy.totalSize - strategy.executedSize
      if (remainingSize <= 0n) {
        strategy.status = "completed"
        return
      }

      // Calculate adaptive slice size
      const sliceSize = await this.calculateAdaptiveSliceSize(strategy)

      if (sliceSize > 0n) {
        try {
          const result = await this.executeSlice(strategy, sliceSize)
          strategy.executedSize += result.executedSize
        } catch (error) {
          // Log error but continue
        }
      }

      // Schedule next check
      if (strategy.status === "active") {
        setTimeout(executeAdaptiveSlice, checkInterval)
      }
    }

    executeAdaptiveSlice()
  }

  private async calculateAdaptiveSliceSize(
    strategy: AdaptiveTWAPStrategy
  ): Promise<bigint> {
    const remainingSize = strategy.totalSize - strategy.executedSize

    switch (strategy.adaptiveMode) {
      case "volume": {
        // Participate as percentage of recent volume
        const recentVolume = await this.volumeTracker.getRecentVolume(
          strategy.pair,
          60000 // Last minute
        )
        const targetSize = BigInt(Math.floor(
          Number(recentVolume) * strategy.participationRate
        ))

        return this.clampSliceSize(targetSize, strategy, remainingSize)
      }

      case "volatility": {
        // Reduce size during high volatility
        const volatility = await this.getVolatility(strategy.pair)
        const baseSize = strategy.totalSize / BigInt(strategy.intervals)
        const adjustedSize = BigInt(Math.floor(
          Number(baseSize) * (1 - volatility * 2)
        ))

        return this.clampSliceSize(adjustedSize, strategy, remainingSize)
      }

      case "spread": {
        // Skip execution during wide spreads
        const spread = await this.getSpread(strategy.pair)
        if (spread > strategy.maxSpread) {
          return 0n // Skip this interval
        }
        const baseSize = strategy.totalSize / BigInt(strategy.intervals)
        return this.clampSliceSize(baseSize, strategy, remainingSize)
      }

      default:
        return strategy.totalSize / BigInt(strategy.intervals)
    }
  }

  private clampSliceSize(
    size: bigint,
    strategy: AdaptiveTWAPStrategy,
    remaining: bigint
  ): bigint {
    let clamped = size

    if (strategy.minSliceSize && clamped < strategy.minSliceSize) {
      clamped = strategy.minSliceSize
    }
    if (strategy.maxSliceSize && clamped > strategy.maxSliceSize) {
      clamped = strategy.maxSliceSize
    }
    if (clamped > remaining) {
      clamped = remaining
    }

    return clamped
  }
}
```

### 3. TWAP with Price Bands

Execute only within acceptable price ranges:

```typescript
class PriceBoundedTWAP {
  async createBoundedTWAP(params: BoundedTWAPParams): Promise<BoundedTWAPStrategy> {
    const strategy: BoundedTWAPStrategy = {
      ...params,
      id: this.generateId(),
      upperBound: params.upperBound,
      lowerBound: params.lowerBound,
      boundAction: params.boundAction || "pause", // "pause" | "cancel" | "continue"
      executedSize: 0n,
      skippedSlices: 0,
      status: "active"
    }

    this.executeBounded(strategy)

    return strategy
  }

  private async executeBounded(strategy: BoundedTWAPStrategy): Promise<void> {
    const intervalMs = strategy.duration / strategy.intervals
    let sliceIndex = 0

    const executeSlice = async () => {
      if (strategy.status !== "active") return

      const remainingSize = strategy.totalSize - strategy.executedSize
      if (remainingSize <= 0n) {
        strategy.status = "completed"
        return
      }

      // Check price bounds
      const currentPrice = await this.getCurrentPrice(strategy.pair)
      const withinBounds = this.isWithinBounds(currentPrice, strategy)

      if (!withinBounds) {
        switch (strategy.boundAction) {
          case "cancel":
            strategy.status = "cancelled"
            strategy.cancelReason = `Price ${currentPrice} outside bounds [${strategy.lowerBound}, ${strategy.upperBound}]`
            return

          case "pause":
            strategy.skippedSlices++
            // Extend duration to compensate
            if (sliceIndex < strategy.intervals - 1) {
              setTimeout(executeSlice, intervalMs)
            }
            return

          case "continue":
            // Execute anyway
            break
        }
      }

      // Execute slice
      const sliceSize = remainingSize < strategy.sliceSize
        ? remainingSize
        : strategy.sliceSize

      try {
        const result = await this.executeSlice(strategy, sliceSize, currentPrice)
        strategy.executedSize += result.executedSize
        sliceIndex++
      } catch (error) {
        sliceIndex++
      }

      if (sliceIndex < strategy.intervals + strategy.skippedSlices) {
        setTimeout(executeSlice, intervalMs)
      } else {
        strategy.status = "completed"
      }
    }

    executeSlice()
  }

  private isWithinBounds(
    price: number,
    strategy: BoundedTWAPStrategy
  ): boolean {
    if (strategy.upperBound && price > strategy.upperBound) return false
    if (strategy.lowerBound && price < strategy.lowerBound) return false
    return true
  }

  async updateBounds(
    strategyId: string,
    newBounds: { upper?: number; lower?: number }
  ): Promise<boolean> {
    const strategy = this.strategies.get(strategyId)
    if (!strategy) return false

    if (newBounds.upper !== undefined) {
      strategy.upperBound = newBounds.upper
    }
    if (newBounds.lower !== undefined) {
      strategy.lowerBound = newBounds.lower
    }

    return true
  }
}
```

## Best Practices

1. **Monitor market impact** and adjust participation rate
2. **Handle failed slices** gracefully with retry logic
3. **Implement price bounds** to protect against adverse moves
4. **Track execution quality** vs benchmark TWAP
5. **Allow strategy modifications** during execution

## Related Skills

- [Limit Order Agent](./limit-order-agent.md) - Order management
- [Slippage Protection](./slippage-protection-agent.md) - Slippage control
- [Portfolio Rebalancer](./portfolio-rebalancer-agent.md) - Portfolio management
