# Yield Optimization Agent Skill

> **⚠️ Prerequisites**: Complete [SDK Setup](./00-sdk-setup.md) first to configure your environment.

Build agents that automatically find and optimize yield across DeFi protocols on Demos Network.

## Overview

Yield Optimization enables agents to discover yield opportunities, auto-compound rewards, and rebalance positions for maximum returns. Essential for automated DeFi strategies and portfolio management.

## SDK Reference

```typescript
import { Demos } from "@kynesyslabs/demosdk/websdk"

// Yield Methods
demos.getYieldOpportunities()              // List all yield sources
demos.getPoolAPY(poolAddress)              // Get pool APY
demos.getStakingAPY(validatorAddress)      // Get staking APY
demos.getFarmingRewards(farmAddress)       // Get farming rewards
demos.harvestRewards(farmAddress)          // Claim farming rewards
```

## Agent Use Cases

### 1. Yield Aggregator Agent

Find and compare yield opportunities:

```typescript
class YieldAggregatorAgent {
  private demos: Demos

  async findBestYield(
    amount: bigint,
    riskTolerance: "low" | "medium" | "high"
  ): Promise<YieldOpportunity[]> {
    const opportunities = await this.demos.getYieldOpportunities()

    // Filter by risk
    const filtered = opportunities.filter(o => {
      switch (riskTolerance) {
        case "low":
          return o.riskScore <= 3 && o.protocol !== "new"
        case "medium":
          return o.riskScore <= 6
        case "high":
          return true
      }
    })

    // Calculate effective APY (accounting for gas costs)
    const withEffectiveAPY = await Promise.all(
      filtered.map(async (o) => {
        const gasCost = await this.estimateGasCost(o, amount)
        const annualGasCost = gasCost * 365n / BigInt(o.compoundFrequencyDays)
        const effectiveAPY = o.apy - Number(annualGasCost * 10000n / amount) / 100

        return { ...o, effectiveAPY }
      })
    )

    return withEffectiveAPY.sort((a, b) => b.effectiveAPY - a.effectiveAPY)
  }

  async deployCapital(
    opportunities: YieldOpportunity[],
    totalAmount: bigint,
    maxPositions: number = 5
  ): Promise<DeploymentResult[]> {
    const results: DeploymentResult[] = []
    const topOpportunities = opportunities.slice(0, maxPositions)
    const amountPerPosition = totalAmount / BigInt(topOpportunities.length)

    for (const opp of topOpportunities) {
      try {
        const result = await this.enterPosition(opp, amountPerPosition)
        results.push(result)
      } catch (error) {
        results.push({
          opportunity: opp,
          success: false,
          error: error.message
        })
      }
    }

    return results
  }

  private async enterPosition(
    opportunity: YieldOpportunity,
    amount: bigint
  ): Promise<DeploymentResult> {
    switch (opportunity.type) {
      case "staking":
        return await this.stake(opportunity.address, amount)
      case "liquidity":
        return await this.addLiquidity(opportunity.address, amount)
      case "farming":
        return await this.enterFarm(opportunity.address, amount)
      default:
        throw new Error(`Unknown opportunity type: ${opportunity.type}`)
    }
  }
}
```

### 2. Auto-Compounder Agent

Automatically compound rewards:

```typescript
class AutoCompounderAgent {
  private demos: Demos
  private positions: Map<string, CompoundPosition> = new Map()

  async registerPosition(
    address: string,
    type: PositionType,
    compoundThreshold: bigint
  ): Promise<void> {
    this.positions.set(address, {
      address,
      type,
      compoundThreshold,
      lastCompound: Date.now(),
      totalCompounded: 0n
    })
  }

  async runCompoundingCycle(): Promise<CompoundResult[]> {
    const results: CompoundResult[] = []

    for (const [address, position] of this.positions) {
      const pendingRewards = await this.getPendingRewards(address, position.type)

      if (pendingRewards >= position.compoundThreshold) {
        try {
          const result = await this.compound(address, position.type)
          position.lastCompound = Date.now()
          position.totalCompounded += pendingRewards

          results.push({
            address,
            compounded: pendingRewards,
            success: true,
            txHash: result.hash
          })
        } catch (error) {
          results.push({
            address,
            success: false,
            error: error.message
          })
        }
      }
    }

    return results
  }

  private async compound(
    address: string,
    type: PositionType
  ): Promise<TransactionResult> {
    switch (type) {
      case "staking":
        const rewards = await this.demos.claimRewards(address)
        return await this.demos.stake(rewards.amount, address)

      case "farming":
        const farmRewards = await this.demos.harvestRewards(address)
        // Swap rewards to LP tokens and restake
        return await this.reinvestFarmRewards(address, farmRewards)

      case "liquidity":
        const fees = await this.demos.claimLPFees(address)
        return await this.addLiquidityWithFees(address, fees)

      default:
        throw new Error(`Unknown position type: ${type}`)
    }
  }

  async startAutoCompounding(intervalMs: number = 86400000): Promise<void> {
    setInterval(async () => {
      const results = await this.runCompoundingCycle()
      console.log(`Compounded ${results.filter(r => r.success).length} positions`)
    }, intervalMs)
  }
}
```

### 3. Strategy Rebalancer Agent

Rebalance between yield sources:

```typescript
class StrategyRebalancerAgent {
  private demos: Demos
  private strategy: YieldStrategy

  async setStrategy(strategy: YieldStrategy): Promise<void> {
    this.strategy = strategy
  }

  async rebalancePortfolio(): Promise<RebalanceResult> {
    // Get current allocations
    const currentPositions = await this.getCurrentPositions()
    const totalValue = await this.calculateTotalValue(currentPositions)

    // Get latest yield data
    const opportunities = await this.demos.getYieldOpportunities()

    // Calculate optimal allocation based on strategy
    const targetAllocation = this.calculateTargetAllocation(
      opportunities,
      this.strategy
    )

    // Determine rebalancing actions
    const actions: RebalanceAction[] = []

    for (const [address, targetPct] of Object.entries(targetAllocation)) {
      const currentPct = currentPositions[address]?.percentage || 0
      const difference = targetPct - currentPct

      if (Math.abs(difference) > this.strategy.rebalanceThreshold) {
        if (difference > 0) {
          // Need to add to this position
          actions.push({
            type: "increase",
            address,
            amount: totalValue * BigInt(Math.floor(difference * 100)) / 10000n
          })
        } else {
          // Need to reduce this position
          actions.push({
            type: "decrease",
            address,
            amount: totalValue * BigInt(Math.floor(-difference * 100)) / 10000n
          })
        }
      }
    }

    // Execute rebalancing
    const results = await this.executeRebalance(actions)

    return {
      previousAllocation: currentPositions,
      newAllocation: await this.getCurrentPositions(),
      actionsExecuted: results
    }
  }

  private calculateTargetAllocation(
    opportunities: YieldOpportunity[],
    strategy: YieldStrategy
  ): Record<string, number> {
    const allocation: Record<string, number> = {}

    // Sort by risk-adjusted return
    const ranked = opportunities
      .filter(o => o.riskScore <= strategy.maxRisk)
      .map(o => ({
        ...o,
        sharpeRatio: (o.apy - strategy.riskFreeRate) / o.volatility
      }))
      .sort((a, b) => b.sharpeRatio - a.sharpeRatio)

    // Allocate based on strategy
    const topN = ranked.slice(0, strategy.maxPositions)
    const totalSharpe = topN.reduce((sum, o) => sum + o.sharpeRatio, 0)

    for (const opp of topN) {
      allocation[opp.address] = opp.sharpeRatio / totalSharpe
    }

    return allocation
  }
}
```

## Best Practices

1. **Account for gas costs** in yield calculations
2. **Diversify across protocols** to reduce risk
3. **Monitor for rug pulls** and exploits
4. **Set compound thresholds** wisely
5. **Consider impermanent loss** for LP positions

## Related Skills

- [Liquidity Pool Agent](./liquidity-pool-agent.md) - LP management
- [Staking Operations](./staking-operations-agent.md) - Staking strategies
