# Slippage Protection Agent Skill

> **⚠️ Prerequisites**: Complete [SDK Setup](./00-sdk-setup.md) first to configure your environment.

Build agents that monitor and protect against excessive slippage in trades.

## Overview

Slippage Protection Agent enables real-time slippage estimation, dynamic tolerance adjustment, and trade protection mechanisms. Essential for large trades, DEX operations, and automated trading systems.

## SDK Reference

```typescript
import { Demos } from "@kynesyslabs/demosdk/websdk"
import { EVM } from "@kynesyslabs/demosdk/xm-websdk"

// Simulate transactions before execution
const simulation = await evm.simulateTransaction(tx)
```

## Agent Use Cases

### 1. Slippage Estimator

Estimate slippage before trade execution:

```typescript
class SlippageEstimator {
  private orderBook: OrderBookManager
  private historicalSlippage: Map<string, number[]> = new Map()

  async estimateSlippage(
    pair: string,
    side: "buy" | "sell",
    size: bigint
  ): Promise<SlippageEstimate> {
    // Get current order book
    const midPrice = this.orderBook.getMidPrice()
    if (!midPrice) throw new Error("No market data")

    // Calculate expected execution price from order book
    const expectedPrice = this.calculateVWAP(side, size)
    const bookSlippage = Math.abs(expectedPrice - midPrice) / midPrice

    // Get historical slippage for similar trades
    const historicalAvg = this.getHistoricalAverage(pair, size)

    // Add buffer for market impact
    const impactMultiplier = this.estimateMarketImpact(size)

    const estimatedSlippage = Math.max(
      bookSlippage,
      historicalAvg
    ) * impactMultiplier

    return {
      estimated: estimatedSlippage,
      bookBased: bookSlippage,
      historical: historicalAvg,
      impactMultiplier,
      confidence: this.calculateConfidence(pair, size),
      recommendedTolerance: estimatedSlippage * 1.5 + 0.001 // Add 0.1% buffer
    }
  }

  private calculateVWAP(side: "buy" | "sell", size: bigint): number {
    const levels = this.orderBook.getDepth(side === "buy" ? "ask" : "bid", 100)
    let remaining = size
    let weightedSum = 0n
    let totalFilled = 0n

    for (const level of levels) {
      const fillAmount = remaining < level.size ? remaining : level.size
      weightedSum += BigInt(Math.floor(level.price * 1e18)) * fillAmount
      totalFilled += fillAmount
      remaining -= fillAmount

      if (remaining <= 0n) break
    }

    return Number(weightedSum / totalFilled) / 1e18
  }

  private estimateMarketImpact(size: bigint): number {
    // Larger trades have more impact
    const sizeInUSD = Number(size) / 1e6

    if (sizeInUSD < 1000) return 1.0
    if (sizeInUSD < 10000) return 1.1
    if (sizeInUSD < 100000) return 1.25
    if (sizeInUSD < 1000000) return 1.5
    return 2.0
  }

  recordActualSlippage(
    pair: string,
    size: bigint,
    slippage: number
  ): void {
    const key = `${pair}:${this.getSizeBucket(size)}`

    if (!this.historicalSlippage.has(key)) {
      this.historicalSlippage.set(key, [])
    }

    const history = this.historicalSlippage.get(key)!
    history.push(slippage)

    // Keep last 100 data points
    if (history.length > 100) history.shift()
  }
}
```

### 2. Dynamic Slippage Controller

Automatically adjust slippage tolerance:

```typescript
class DynamicSlippageController {
  private baseSlippage: number = 0.005 // 0.5%
  private maxSlippage: number = 0.05 // 5%
  private volatilityMultiplier: number = 2

  async calculateDynamicTolerance(
    pair: string,
    side: "buy" | "sell",
    size: bigint,
    urgency: "low" | "medium" | "high"
  ): Promise<number> {
    // Get current market conditions
    const volatility = await this.getVolatility(pair)
    const spread = await this.getSpread(pair)
    const liquidity = await this.getLiquidity(pair, side)

    // Base calculation
    let tolerance = this.baseSlippage

    // Adjust for volatility
    tolerance *= (1 + volatility * this.volatilityMultiplier)

    // Adjust for spread
    tolerance = Math.max(tolerance, spread * 1.5)

    // Adjust for trade size vs liquidity
    const sizeRatio = Number(size) / liquidity
    if (sizeRatio > 0.1) {
      tolerance *= (1 + sizeRatio)
    }

    // Adjust for urgency
    switch (urgency) {
      case "high":
        tolerance *= 1.5
        break
      case "low":
        tolerance *= 0.7
        break
    }

    return Math.min(tolerance, this.maxSlippage)
  }

  async shouldExecute(
    expectedSlippage: number,
    tolerance: number,
    urgency: "low" | "medium" | "high"
  ): Promise<{ execute: boolean; reason: string }> {
    if (expectedSlippage <= tolerance) {
      return { execute: true, reason: "Within tolerance" }
    }

    if (urgency === "high" && expectedSlippage <= this.maxSlippage) {
      return {
        execute: true,
        reason: "Exceeds tolerance but urgent, within max"
      }
    }

    return {
      execute: false,
      reason: `Slippage ${(expectedSlippage * 100).toFixed(2)}% exceeds tolerance ${(tolerance * 100).toFixed(2)}%`
    }
  }
}
```

### 3. Trade Protection Agent

Protect trades from excessive slippage:

```typescript
class TradeProtectionAgent {
  private slippageController: DynamicSlippageController
  private maxRetries: number = 3

  async executeProtectedTrade(
    trade: TradeParams
  ): Promise<TradeResult> {
    let attempts = 0
    let lastError: Error | null = null

    while (attempts < this.maxRetries) {
      attempts++

      // Calculate current tolerance
      const tolerance = await this.slippageController.calculateDynamicTolerance(
        trade.pair,
        trade.side,
        trade.size,
        trade.urgency
      )

      // Simulate trade
      const simulation = await this.simulateTrade(trade, tolerance)

      if (!simulation.success) {
        lastError = new Error(simulation.error)

        // If slippage too high, try smaller size
        if (simulation.error?.includes("slippage")) {
          trade.size = trade.size * 80n / 100n // Reduce by 20%
          continue
        }

        throw lastError
      }

      // Execute trade with minimum output guarantee
      const minOutput = this.calculateMinOutput(
        simulation.expectedOutput,
        tolerance
      )

      try {
        const result = await this.executeTrade(trade, minOutput)

        // Record actual slippage for future estimates
        const actualSlippage = this.calculateActualSlippage(
          simulation.expectedOutput,
          result.actualOutput
        )

        this.recordSlippage(trade.pair, trade.size, actualSlippage)

        return {
          success: true,
          ...result,
          attempts,
          tolerance,
          actualSlippage
        }
      } catch (error) {
        if (error.message.includes("INSUFFICIENT_OUTPUT_AMOUNT")) {
          lastError = error
          continue
        }
        throw error
      }
    }

    return {
      success: false,
      error: lastError?.message || "Max retries exceeded",
      attempts
    }
  }

  async splitAndExecute(
    trade: TradeParams,
    chunks: number = 5
  ): Promise<TradeResult[]> {
    const chunkSize = trade.size / BigInt(chunks)
    const results: TradeResult[] = []
    const delay = 15000 // 15 seconds between chunks

    for (let i = 0; i < chunks; i++) {
      const chunkTrade = {
        ...trade,
        size: i === chunks - 1
          ? trade.size - chunkSize * BigInt(chunks - 1)
          : chunkSize
      }

      const result = await this.executeProtectedTrade(chunkTrade)
      results.push(result)

      if (!result.success) {
        // Stop if a chunk fails
        break
      }

      if (i < chunks - 1) {
        await new Promise(r => setTimeout(r, delay))
      }
    }

    return results
  }

  private calculateMinOutput(
    expected: bigint,
    tolerance: number
  ): bigint {
    const factor = BigInt(Math.floor((1 - tolerance) * 10000))
    return expected * factor / 10000n
  }
}
```

## Best Practices

1. **Always simulate** before executing large trades
2. **Adapt tolerance** to market conditions
3. **Split large orders** to reduce market impact
4. **Record actual slippage** to improve estimates
5. **Implement circuit breakers** for extreme conditions

## Related Skills

- [Order Book Agent](./order-book-agent.md) - Market depth
- [TWAP Executor](./twap-executor-agent.md) - Time-weighted execution
- [Market Maker Agent](./market-maker-agent.md) - Liquidity provision
