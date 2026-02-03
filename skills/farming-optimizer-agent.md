# Farming Optimizer Agent Skill

Build agents that maximize yield farming returns across DeFi protocols.

## Overview

Farming Optimizer Agent enables intelligent yield farming strategy optimization, auto-compounding, and farm rotation. Essential for maximizing APY, reducing gas costs, and managing farming positions across multiple protocols.

## SDK Reference

```typescript
import { Demos } from "@kynesyslabs/demosdk/websdk"
import { EVM } from "@kynesyslabs/demosdk/xm-websdk"
import { DemosWork, BaseOperation } from "@kynesyslabs/demoswork"

// Farming operations
const evm = await EVM.create("https://rpc.ankr.com/eth")
```

## Agent Use Cases

### 1. Multi-Farm Optimizer

Optimize allocation across multiple yield farms:

```typescript
class MultiFarmOptimizer {
  private farms: Map<string, FarmInfo> = new Map()
  private positions: Map<string, FarmPosition> = new Map()
  private rebalanceThreshold: number = 0.05 // 5% APY difference

  async discoverFarms(protocols: string[]): Promise<FarmInfo[]> {
    const allFarms: FarmInfo[] = []

    for (const protocol of protocols) {
      const farms = await this.fetchProtocolFarms(protocol)

      for (const farm of farms) {
        const farmInfo: FarmInfo = {
          id: `${protocol}:${farm.pid}`,
          protocol,
          poolId: farm.pid,
          token0: farm.token0,
          token1: farm.token1,
          lpToken: farm.lpToken,
          rewardToken: farm.rewardToken,
          tvl: farm.tvl,
          apr: farm.apr,
          dailyRewards: farm.dailyRewards,
          depositFee: farm.depositFee || 0,
          withdrawFee: farm.withdrawFee || 0,
          lockPeriod: farm.lockPeriod || 0
        }

        this.farms.set(farmInfo.id, farmInfo)
        allFarms.push(farmInfo)
      }
    }

    return allFarms.sort((a, b) => b.apr - a.apr)
  }

  async optimizeAllocation(
    totalCapital: bigint,
    constraints: AllocationConstraints
  ): Promise<AllocationPlan> {
    const farms = Array.from(this.farms.values())
      .filter(f => this.meetsConstraints(f, constraints))
      .sort((a, b) => this.calculateScore(b) - this.calculateScore(a))

    const allocations: FarmAllocation[] = []
    let remainingCapital = totalCapital

    // Diversification: max per farm
    const maxPerFarm = constraints.maxPerFarm || 0.25
    const maxAllocation = (totalCapital * BigInt(Math.floor(maxPerFarm * 10000))) / 10000n

    for (const farm of farms) {
      if (remainingCapital === 0n) break
      if (allocations.length >= (constraints.maxFarms || 10)) break

      // Calculate optimal allocation for this farm
      const optimalAllocation = this.calculateOptimalAllocation(
        farm,
        remainingCapital,
        maxAllocation
      )

      if (optimalAllocation > 0n) {
        allocations.push({
          farmId: farm.id,
          amount: optimalAllocation,
          expectedApr: farm.apr,
          expectedDailyReward: this.estimateDailyReward(farm, optimalAllocation)
        })

        remainingCapital -= optimalAllocation
      }
    }

    const totalExpectedApr = this.calculateWeightedApr(allocations, totalCapital)

    return {
      allocations,
      totalCapital,
      allocatedCapital: totalCapital - remainingCapital,
      unallocatedCapital: remainingCapital,
      expectedApr: totalExpectedApr,
      expectedDailyReward: allocations.reduce((sum, a) => sum + a.expectedDailyReward, 0),
      diversificationScore: allocations.length / farms.length
    }
  }

  private calculateScore(farm: FarmInfo): number {
    let score = farm.apr

    // Penalize for fees
    score -= farm.depositFee * 100
    score -= farm.withdrawFee * 50

    // Bonus for high TVL (safety)
    if (farm.tvl > 10000000) score += 5
    if (farm.tvl > 100000000) score += 10

    // Penalize lock periods
    if (farm.lockPeriod > 0) {
      score -= (farm.lockPeriod / 86400) * 0.5 // Per day penalty
    }

    return score
  }

  async rebalanceIfNeeded(): Promise<RebalanceResult | null> {
    const currentAllocations = await this.getCurrentAllocations()
    const optimalPlan = await this.optimizeAllocation(
      this.getTotalValue(currentAllocations),
      this.getDefaultConstraints()
    )

    // Check if rebalance is beneficial
    const currentApr = this.calculateCurrentApr(currentAllocations)
    const potentialApr = optimalPlan.expectedApr
    const improvement = (potentialApr - currentApr) / currentApr

    if (improvement < this.rebalanceThreshold) {
      return null // Not worth rebalancing
    }

    // Calculate rebalance cost
    const rebalanceCost = await this.estimateRebalanceCost(
      currentAllocations,
      optimalPlan.allocations
    )

    // Ensure improvement covers costs
    const breakEvenDays = rebalanceCost /
      (optimalPlan.expectedDailyReward - this.calculateCurrentDailyReward(currentAllocations))

    if (breakEvenDays > 7) {
      return null // Takes too long to recoup costs
    }

    return await this.executeRebalance(currentAllocations, optimalPlan)
  }

  private async executeRebalance(
    current: FarmAllocation[],
    target: AllocationPlan
  ): Promise<RebalanceResult> {
    const withdrawals: WithdrawalAction[] = []
    const deposits: DepositAction[] = []

    // Determine what to withdraw
    for (const allocation of current) {
      const targetAlloc = target.allocations.find(a => a.farmId === allocation.farmId)

      if (!targetAlloc) {
        // Full withdrawal
        withdrawals.push({
          farmId: allocation.farmId,
          amount: allocation.amount,
          type: "full"
        })
      } else if (targetAlloc.amount < allocation.amount) {
        // Partial withdrawal
        withdrawals.push({
          farmId: allocation.farmId,
          amount: allocation.amount - targetAlloc.amount,
          type: "partial"
        })
      }
    }

    // Execute withdrawals first
    for (const withdrawal of withdrawals) {
      await this.withdrawFromFarm(withdrawal.farmId, withdrawal.amount)
    }

    // Determine deposits
    for (const allocation of target.allocations) {
      const currentAlloc = current.find(a => a.farmId === allocation.farmId)
      const currentAmount = currentAlloc?.amount || 0n

      if (allocation.amount > currentAmount) {
        deposits.push({
          farmId: allocation.farmId,
          amount: allocation.amount - currentAmount
        })
      }
    }

    // Execute deposits
    for (const deposit of deposits) {
      await this.depositToFarm(deposit.farmId, deposit.amount)
    }

    return {
      success: true,
      withdrawals,
      deposits,
      newAllocations: target.allocations,
      timestamp: Date.now()
    }
  }
}
```

### 2. Auto-Compound Manager

Automatically compound farming rewards:

```typescript
class AutoCompoundManager {
  private compoundThreshold: bigint
  private positions: Map<string, CompoundPosition> = new Map()

  async setupAutoCompound(
    farmId: string,
    config: CompoundConfig
  ): Promise<CompoundPosition> {
    const farm = await this.getFarmInfo(farmId)

    const position: CompoundPosition = {
      id: `compound_${farmId}_${Date.now()}`,
      farmId,
      principalAmount: 0n,
      compoundedAmount: 0n,
      totalHarvested: 0n,
      compoundCount: 0,
      lastCompound: 0,
      config: {
        minCompoundAmount: config.minCompoundAmount || this.compoundThreshold,
        compoundInterval: config.compoundInterval || 86400000, // Daily
        sellRewards: config.sellRewards !== false,
        reinvestPath: config.reinvestPath || this.getDefaultPath(farm)
      },
      createdAt: Date.now()
    }

    this.positions.set(position.id, position)

    // Start compound monitoring
    this.startCompoundMonitor(position)

    return position
  }

  private async startCompoundMonitor(position: CompoundPosition): Promise<void> {
    const checkInterval = Math.min(
      position.config.compoundInterval / 4,
      3600000 // Max 1 hour
    )

    setInterval(async () => {
      await this.checkAndCompound(position)
    }, checkInterval)
  }

  async checkAndCompound(position: CompoundPosition): Promise<CompoundResult | null> {
    const pendingRewards = await this.getPendingRewards(position.farmId)

    // Check if rewards meet threshold
    const rewardValue = await this.getRewardValue(pendingRewards, position.farmId)

    if (rewardValue < position.config.minCompoundAmount) {
      return null
    }

    // Check time since last compound
    const timeSinceLastCompound = Date.now() - position.lastCompound
    if (timeSinceLastCompound < position.config.compoundInterval) {
      return null
    }

    // Estimate gas cost
    const gasEstimate = await this.estimateCompoundGas(position)
    const gasCost = await this.getGasCostInRewardToken(gasEstimate, position.farmId)

    // Ensure rewards cover gas with margin
    if (rewardValue < gasCost * 2n) {
      return null // Not profitable to compound yet
    }

    return await this.executeCompound(position, pendingRewards)
  }

  private async executeCompound(
    position: CompoundPosition,
    pendingRewards: bigint
  ): Promise<CompoundResult> {
    // Step 1: Harvest rewards
    const harvestTx = await this.harvestRewards(position.farmId)

    let lpTokensGained: bigint

    if (position.config.sellRewards) {
      // Step 2: Swap rewards for LP tokens
      const farm = await this.getFarmInfo(position.farmId)

      // Split rewards for both sides of LP
      const halfRewards = pendingRewards / 2n

      // Swap to token0
      const token0Amount = await this.swap(
        farm.rewardToken,
        farm.token0,
        halfRewards
      )

      // Swap to token1
      const token1Amount = await this.swap(
        farm.rewardToken,
        farm.token1,
        halfRewards
      )

      // Step 3: Add liquidity
      lpTokensGained = await this.addLiquidity(
        farm.token0,
        farm.token1,
        token0Amount,
        token1Amount
      )

      // Step 4: Deposit LP tokens
      await this.depositToFarm(position.farmId, lpTokensGained)
    } else {
      // Direct LP reward - just deposit
      lpTokensGained = pendingRewards
      await this.depositToFarm(position.farmId, lpTokensGained)
    }

    // Update position
    position.compoundedAmount += lpTokensGained
    position.totalHarvested += pendingRewards
    position.compoundCount++
    position.lastCompound = Date.now()

    return {
      success: true,
      harvestedAmount: pendingRewards,
      compoundedLpTokens: lpTokensGained,
      gasUsed: harvestTx.gasUsed,
      timestamp: Date.now(),
      apy: this.calculateEffectiveApy(position)
    }
  }

  calculateEffectiveApy(position: CompoundPosition): number {
    const duration = Date.now() - position.createdAt
    const daysElapsed = duration / 86400000

    if (daysElapsed < 1) return 0

    const principalValue = Number(position.principalAmount)
    const currentValue = principalValue + Number(position.compoundedAmount)

    const totalReturn = (currentValue - principalValue) / principalValue
    const annualizedReturn = Math.pow(1 + totalReturn, 365 / daysElapsed) - 1

    return annualizedReturn * 100
  }

  async getOptimalCompoundFrequency(
    farmApr: number,
    gasPrice: bigint,
    positionSize: bigint
  ): Promise<OptimalFrequency> {
    // Calculate optimal compound frequency using math
    // f = sqrt((APR * principal) / (2 * gasCost))

    const dailyRate = farmApr / 365 / 100
    const gasCost = Number(gasPrice) * 500000 // Estimated gas units
    const principal = Number(positionSize)

    // Find frequency that maximizes APY after gas
    const frequencies = [1, 2, 4, 7, 14, 30] // Days
    let bestFrequency = 30
    let bestNetApy = 0

    for (const freq of frequencies) {
      const compoundsPerYear = 365 / freq
      const gasPerYear = gasCost * compoundsPerYear

      // Compound interest formula
      const grossApy = Math.pow(1 + dailyRate * freq, compoundsPerYear) - 1
      const netApy = grossApy - (gasPerYear / principal)

      if (netApy > bestNetApy) {
        bestNetApy = netApy
        bestFrequency = freq
      }
    }

    return {
      optimalDays: bestFrequency,
      expectedNetApy: bestNetApy * 100,
      gasPerYear: gasCost * (365 / bestFrequency)
    }
  }
}
```

### 3. Farm Migration Manager

Manage migrations between yield farms:

```typescript
class FarmMigrationManager {
  private migrationHistory: Migration[] = []

  async analyzeMigrationOpportunity(
    currentFarmId: string,
    targetFarmId: string
  ): Promise<MigrationAnalysis> {
    const currentFarm = await this.getFarmInfo(currentFarmId)
    const targetFarm = await this.getFarmInfo(targetFarmId)
    const position = await this.getPosition(currentFarmId)

    // Calculate APR difference
    const aprDifference = targetFarm.apr - currentFarm.apr

    // Estimate migration costs
    const costs = await this.estimateMigrationCosts(
      currentFarm,
      targetFarm,
      position.amount
    )

    // Calculate break-even time
    const dailyGainDifference = (position.amount * BigInt(Math.floor(aprDifference * 100))) /
      (10000n * 365n)

    const breakEvenDays = dailyGainDifference > 0n
      ? Number(costs.totalCost) / Number(dailyGainDifference)
      : Infinity

    // Assess risks
    const risks = await this.assessMigrationRisks(currentFarm, targetFarm)

    return {
      currentFarm: {
        id: currentFarmId,
        apr: currentFarm.apr,
        tvl: currentFarm.tvl
      },
      targetFarm: {
        id: targetFarmId,
        apr: targetFarm.apr,
        tvl: targetFarm.tvl
      },
      aprImprovement: aprDifference,
      migrationCosts: costs,
      breakEvenDays,
      recommendation: this.generateRecommendation(aprDifference, breakEvenDays, risks),
      risks
    }
  }

  private async estimateMigrationCosts(
    current: FarmInfo,
    target: FarmInfo,
    amount: bigint
  ): Promise<MigrationCosts> {
    const costs: MigrationCosts = {
      withdrawFee: (amount * BigInt(Math.floor(current.withdrawFee * 10000))) / 10000n,
      depositFee: (amount * BigInt(Math.floor(target.depositFee * 10000))) / 10000n,
      slippage: 0n,
      gasCost: 0n,
      totalCost: 0n
    }

    // Estimate LP conversion costs if different pairs
    if (current.lpToken !== target.lpToken) {
      // Need to break LP, swap, create new LP
      const swapSlippage = (amount * 30n) / 10000n // 0.3% estimated
      costs.slippage = swapSlippage
    }

    // Estimate gas costs
    const gasPrice = await this.getGasPrice()
    const estimatedGasUnits = current.lpToken === target.lpToken
      ? 300000n // Simple migration
      : 800000n // Complex with swaps

    costs.gasCost = gasPrice * estimatedGasUnits
    costs.totalCost = costs.withdrawFee + costs.depositFee + costs.slippage + costs.gasCost

    return costs
  }

  async executeMigration(
    currentFarmId: string,
    targetFarmId: string,
    useFlashLoan: boolean = false
  ): Promise<MigrationResult> {
    const currentFarm = await this.getFarmInfo(currentFarmId)
    const targetFarm = await this.getFarmInfo(targetFarmId)
    const position = await this.getPosition(currentFarmId)

    let result: MigrationResult

    if (useFlashLoan && currentFarm.lpToken === targetFarm.lpToken) {
      // Use flash loan for atomic migration
      result = await this.flashLoanMigration(
        currentFarm,
        targetFarm,
        position.amount
      )
    } else {
      // Standard migration
      result = await this.standardMigration(
        currentFarm,
        targetFarm,
        position.amount
      )
    }

    // Record migration
    this.migrationHistory.push({
      id: `migration_${Date.now()}`,
      from: currentFarmId,
      to: targetFarmId,
      amount: position.amount,
      result,
      timestamp: Date.now()
    })

    return result
  }

  private async standardMigration(
    currentFarm: FarmInfo,
    targetFarm: FarmInfo,
    amount: bigint
  ): Promise<MigrationResult> {
    // Step 1: Harvest pending rewards
    await this.harvestRewards(currentFarm.id)

    // Step 2: Withdraw from current farm
    const withdrawnAmount = await this.withdrawFromFarm(
      currentFarm.id,
      amount
    )

    let depositAmount = withdrawnAmount

    // Step 3: Convert LP if needed
    if (currentFarm.lpToken !== targetFarm.lpToken) {
      // Remove liquidity
      const { token0Amount, token1Amount } = await this.removeLiquidity(
        currentFarm.lpToken,
        withdrawnAmount
      )

      // Swap to target pair tokens
      const targetToken0Amount = await this.swapToToken(
        currentFarm.token0,
        targetFarm.token0,
        token0Amount
      )

      const targetToken1Amount = await this.swapToToken(
        currentFarm.token1,
        targetFarm.token1,
        token1Amount
      )

      // Add liquidity to target pair
      depositAmount = await this.addLiquidity(
        targetFarm.token0,
        targetFarm.token1,
        targetToken0Amount,
        targetToken1Amount
      )
    }

    // Step 4: Deposit to target farm
    await this.depositToFarm(targetFarm.id, depositAmount)

    return {
      success: true,
      originalAmount: amount,
      finalAmount: depositAmount,
      slippage: amount - depositAmount,
      newFarmId: targetFarm.id,
      timestamp: Date.now()
    }
  }

  private async flashLoanMigration(
    currentFarm: FarmInfo,
    targetFarm: FarmInfo,
    amount: bigint
  ): Promise<MigrationResult> {
    // Flash loan allows atomic migration
    // 1. Borrow LP tokens
    // 2. Deposit to new farm
    // 3. Withdraw from old farm
    // 4. Repay flash loan

    const flashLoan = await this.getFlashLoan(currentFarm.lpToken, amount)

    try {
      // Deposit borrowed LP to target
      await this.depositToFarm(targetFarm.id, amount)

      // Harvest and withdraw from current
      await this.harvestRewards(currentFarm.id)
      const withdrawn = await this.withdrawFromFarm(currentFarm.id, amount)

      // Repay flash loan
      await this.repayFlashLoan(flashLoan)

      const profit = withdrawn - amount - flashLoan.fee

      return {
        success: true,
        originalAmount: amount,
        finalAmount: amount,
        slippage: 0n,
        flashLoanFee: flashLoan.fee,
        newFarmId: targetFarm.id,
        timestamp: Date.now()
      }
    } catch (error) {
      // Flash loan reverts automatically
      throw error
    }
  }

  private generateRecommendation(
    aprDiff: number,
    breakEvenDays: number,
    risks: RiskAssessment[]
  ): MigrationRecommendation {
    const highRisk = risks.some(r => r.level === "high")

    if (highRisk) {
      return {
        action: "hold",
        reason: "High risk factors identified",
        confidence: 0.9
      }
    }

    if (aprDiff < 1) {
      return {
        action: "hold",
        reason: "APR improvement too small (<1%)",
        confidence: 0.8
      }
    }

    if (breakEvenDays > 30) {
      return {
        action: "hold",
        reason: "Break-even period too long (>30 days)",
        confidence: 0.7
      }
    }

    if (breakEvenDays < 7 && aprDiff > 5) {
      return {
        action: "migrate",
        reason: `Strong opportunity: ${aprDiff.toFixed(1)}% APR improvement, ${breakEvenDays.toFixed(0)} days to break even`,
        confidence: 0.85
      }
    }

    return {
      action: "consider",
      reason: `Moderate opportunity: evaluate timing and gas costs`,
      confidence: 0.6
    }
  }
}
```

## Best Practices

1. **Diversify across farms** to reduce protocol risk
2. **Calculate optimal compound frequency** based on position size and gas
3. **Monitor TVL changes** as indicators of farm health
4. **Account for all fees** (deposit, withdraw, swap) in calculations
5. **Use flash loans** for gas-efficient atomic migrations

## Related Skills

- [Vault Manager Agent](./vault-manager-agent.md) - Vault strategies
- [Leverage Agent](./leverage-agent.md) - Leveraged farming
- [Gas Optimizer Agent](./gas-optimizer-agent.md) - Gas optimization
