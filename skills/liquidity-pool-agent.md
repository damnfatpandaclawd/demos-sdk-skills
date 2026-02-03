# Liquidity Pool Agent Skill

> **⚠️ Prerequisites**: Complete [SDK Setup](./00-sdk-setup.md) first to configure your environment.

Build agents that manage liquidity pools, provide liquidity, and optimize LP positions.

## Overview

Liquidity Pool operations enable agents to add/remove liquidity, calculate optimal positions, and manage LP tokens. Essential for DeFi automation, yield optimization, and market making.

## SDK Reference

```typescript
import { Demos } from "@kynesyslabs/demosdk/websdk"

// Liquidity Methods
demos.addLiquidity(poolAddress, tokenA, tokenB, amountA, amountB)
demos.removeLiquidity(poolAddress, lpAmount)
demos.getPoolInfo(poolAddress)
demos.estimateSwapOutput(poolAddress, tokenIn, amountIn)
demos.getLPTokenBalance(poolAddress, address)
demos.calculateOptimalAmounts(poolAddress, amountA)
```

## Agent Use Cases

### 1. Liquidity Provider Agent

Automated liquidity provision:

```typescript
class LiquidityProviderAgent {
  private demos: Demos

  async addLiquidityOptimal(
    poolAddress: string,
    tokenAAmount: bigint,
    slippageTolerance: number = 0.01
  ): Promise<AddLiquidityResult> {
    // Get pool info
    const pool = await this.demos.getPoolInfo(poolAddress)

    // Calculate optimal token B amount
    const optimalB = await this.demos.calculateOptimalAmounts(poolAddress, tokenAAmount)

    // Calculate minimum amounts with slippage
    const minA = tokenAAmount * BigInt(Math.floor((1 - slippageTolerance) * 10000)) / 10000n
    const minB = optimalB * BigInt(Math.floor((1 - slippageTolerance) * 10000)) / 10000n

    // Add liquidity
    const tx = await this.demos.addLiquidity(
      poolAddress,
      pool.tokenA,
      pool.tokenB,
      tokenAAmount,
      optimalB,
      minA,
      minB
    )

    const result = await this.demos.insertTransaction(tx)

    return {
      txHash: result.hash,
      lpTokensReceived: result.lpTokens,
      tokenADeposited: tokenAAmount,
      tokenBDeposited: optimalB,
      shareOfPool: await this.calculatePoolShare(poolAddress)
    }
  }

  async removeLiquidity(
    poolAddress: string,
    percentage: number = 100
  ): Promise<RemoveLiquidityResult> {
    const lpBalance = await this.demos.getLPTokenBalance(
      poolAddress,
      await this.demos.wallet.getAddress()
    )

    const amountToRemove = lpBalance * BigInt(percentage) / 100n

    const tx = await this.demos.removeLiquidity(poolAddress, amountToRemove)
    const result = await this.demos.insertTransaction(tx)

    return {
      txHash: result.hash,
      lpTokensBurned: amountToRemove,
      tokenAReceived: result.tokenAAmount,
      tokenBReceived: result.tokenBAmount
    }
  }

  private async calculatePoolShare(poolAddress: string): Promise<number> {
    const pool = await this.demos.getPoolInfo(poolAddress)
    const myLp = await this.demos.getLPTokenBalance(
      poolAddress,
      await this.demos.wallet.getAddress()
    )
    return Number(myLp * 10000n / pool.totalLpSupply) / 100
  }
}
```

### 2. Impermanent Loss Monitor Agent

Track and alert on IL:

```typescript
class ImpermanentLossMonitorAgent {
  private demos: Demos
  private positions: Map<string, LPPosition> = new Map()

  async trackPosition(
    poolAddress: string,
    entryPriceA: number,
    entryPriceB: number
  ): Promise<void> {
    const position = await this.getPositionDetails(poolAddress)

    this.positions.set(poolAddress, {
      ...position,
      entryPriceA,
      entryPriceB,
      entryTimestamp: Date.now()
    })
  }

  async calculateImpermanentLoss(
    poolAddress: string
  ): Promise<ImpermanentLossResult> {
    const position = this.positions.get(poolAddress)
    if (!position) throw new Error("Position not tracked")

    const pool = await this.demos.getPoolInfo(poolAddress)

    // Current prices
    const currentPriceA = await this.getPrice(pool.tokenA)
    const currentPriceB = await this.getPrice(pool.tokenB)

    // Price ratio change
    const entryRatio = position.entryPriceA / position.entryPriceB
    const currentRatio = currentPriceA / currentPriceB
    const priceChange = currentRatio / entryRatio

    // IL formula: IL = 2 * sqrt(priceChange) / (1 + priceChange) - 1
    const il = 2 * Math.sqrt(priceChange) / (1 + priceChange) - 1

    // Current position value
    const currentValue = await this.calculatePositionValue(poolAddress)

    // HODL value (if tokens were held instead)
    const hodlValue = position.initialTokenA * currentPriceA +
                      position.initialTokenB * currentPriceB

    return {
      impermanentLoss: il * 100, // percentage
      currentValue,
      hodlValue,
      difference: currentValue - hodlValue,
      priceChangeRatio: priceChange
    }
  }

  async setILAlert(
    poolAddress: string,
    threshold: number,
    callback: (il: number) => void
  ): Promise<void> {
    setInterval(async () => {
      const result = await this.calculateImpermanentLoss(poolAddress)
      if (Math.abs(result.impermanentLoss) >= threshold) {
        callback(result.impermanentLoss)
      }
    }, 60000) // Check every minute
  }
}
```

### 3. Pool Rebalancer Agent

Maintain target allocations:

```typescript
class PoolRebalancerAgent {
  private demos: Demos

  async rebalancePosition(
    poolAddress: string,
    targetRatio: number // e.g., 0.5 for 50/50
  ): Promise<RebalanceResult> {
    const position = await this.getPositionDetails(poolAddress)
    const pool = await this.demos.getPoolInfo(poolAddress)

    // Calculate current ratio
    const priceA = await this.getPrice(pool.tokenA)
    const priceB = await this.getPrice(pool.tokenB)

    const valueA = Number(position.tokenA) * priceA
    const valueB = Number(position.tokenB) * priceB
    const totalValue = valueA + valueB
    const currentRatio = valueA / totalValue

    // Check if rebalance needed
    if (Math.abs(currentRatio - targetRatio) < 0.02) {
      return { rebalanced: false, reason: "Within tolerance" }
    }

    // Remove all liquidity
    await this.demos.removeLiquidity(poolAddress, position.lpTokens)

    // Swap to achieve target ratio
    const targetValueA = totalValue * targetRatio
    const swapAmount = valueA - targetValueA

    if (swapAmount > 0) {
      // Swap A for B
      await this.demos.swap(pool.tokenA, pool.tokenB, BigInt(Math.abs(swapAmount / priceA)))
    } else {
      // Swap B for A
      await this.demos.swap(pool.tokenB, pool.tokenA, BigInt(Math.abs(swapAmount / priceB)))
    }

    // Re-add liquidity
    const newBalanceA = await this.demos.getTokenBalance(pool.tokenA)
    const result = await this.demos.addLiquidity(
      poolAddress,
      pool.tokenA,
      pool.tokenB,
      newBalanceA,
      0n // Will be calculated optimally
    )

    return {
      rebalanced: true,
      previousRatio: currentRatio,
      newRatio: targetRatio,
      txHash: result.hash
    }
  }
}
```

## Best Practices

1. **Monitor impermanent loss** continuously
2. **Use slippage protection** on all operations
3. **Consider gas costs** in rebalancing decisions
4. **Diversify across pools** to reduce risk
5. **Track fees earned** vs IL

## Related Skills

- [DEX Integration](./dex-integration-agent.md) - Trading operations
- [Yield Optimization](./yield-optimization-agent.md) - Maximize returns
