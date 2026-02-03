# Vault Manager Agent Skill

> **⚠️ Prerequisites**: Complete [SDK Setup](./00-sdk-setup.md) first to configure your environment.

Build agents that manage DeFi vaults for automated yield strategies.

## Overview

Vault Manager Agent enables automated vault management, strategy execution, and yield optimization. Essential for yield aggregators, auto-compounding, and managed portfolio strategies.

## SDK Reference

```typescript
import { Demos } from "@kynesyslabs/demosdk/websdk"
import { EVM } from "@kynesyslabs/demosdk/xm-websdk"
import { DemosWork, BaseOperation } from "@kynesyslabs/demoswork"

// Vault management
const evm = await EVM.create("https://rpc.ankr.com/eth")
```

## Agent Use Cases

### 1. Yield Vault Manager

Manage yield-generating vaults:

```typescript
class YieldVaultManager {
  private vaults: Map<string, VaultConfig> = new Map()
  private strategies: Map<string, YieldStrategy> = new Map()

  async createVault(config: VaultCreationConfig): Promise<Vault> {
    const vaultId = this.generateVaultId()

    // Deploy vault contract
    const deployTx = await this.deployVaultContract({
      asset: config.asset,
      name: config.name,
      symbol: config.symbol,
      depositCap: config.depositCap,
      performanceFee: config.performanceFee,
      managementFee: config.managementFee,
      withdrawalFee: config.withdrawalFee
    })

    const vault: Vault = {
      id: vaultId,
      address: deployTx.contractAddress,
      asset: config.asset,
      totalAssets: 0n,
      totalShares: 0n,
      sharePrice: BigInt(1e18),
      strategies: [],
      performanceFee: config.performanceFee,
      managementFee: config.managementFee,
      highWaterMark: BigInt(1e18),
      createdAt: Date.now()
    }

    this.vaults.set(vaultId, vault)

    return vault
  }

  async deposit(
    vaultId: string,
    amount: bigint,
    depositor: string
  ): Promise<DepositResult> {
    const vault = this.vaults.get(vaultId)
    if (!vault) throw new Error("Vault not found")

    // Calculate shares to mint
    const sharesToMint = vault.totalAssets === 0n
      ? amount
      : (amount * vault.totalShares) / vault.totalAssets

    // Transfer assets to vault
    const tx = await this.vaultContract(vaultId).deposit(amount, depositor)

    vault.totalAssets += amount
    vault.totalShares += sharesToMint

    // Allocate to strategies
    await this.rebalanceStrategies(vaultId)

    return {
      depositor,
      assets: amount,
      shares: sharesToMint,
      sharePrice: vault.sharePrice,
      txHash: tx.hash
    }
  }

  async withdraw(
    vaultId: string,
    shares: bigint,
    receiver: string
  ): Promise<WithdrawResult> {
    const vault = this.vaults.get(vaultId)
    if (!vault) throw new Error("Vault not found")

    // Calculate assets to return
    const assetsToReturn = (shares * vault.totalAssets) / vault.totalShares

    // Apply withdrawal fee
    const fee = (assetsToReturn * vault.withdrawalFee) / 10000n
    const netAssets = assetsToReturn - fee

    // Check if we need to withdraw from strategies
    const idleAssets = await this.getIdleAssets(vaultId)

    if (idleAssets < netAssets) {
      await this.withdrawFromStrategies(vaultId, netAssets - idleAssets)
    }

    // Execute withdrawal
    const tx = await this.vaultContract(vaultId).withdraw(shares, receiver)

    vault.totalAssets -= assetsToReturn
    vault.totalShares -= shares

    return {
      receiver,
      shares,
      assets: netAssets,
      fee,
      txHash: tx.hash
    }
  }

  async addStrategy(
    vaultId: string,
    strategy: YieldStrategy,
    allocation: number
  ): Promise<void> {
    const vault = this.vaults.get(vaultId)
    if (!vault) throw new Error("Vault not found")

    // Validate total allocation doesn't exceed 100%
    const currentAllocation = vault.strategies.reduce(
      (sum, s) => sum + s.allocation, 0
    )

    if (currentAllocation + allocation > 100) {
      throw new Error("Total allocation exceeds 100%")
    }

    vault.strategies.push({
      id: strategy.id,
      name: strategy.name,
      allocation,
      deposited: 0n,
      earned: 0n
    })

    this.strategies.set(strategy.id, strategy)

    // Rebalance to new allocation
    await this.rebalanceStrategies(vaultId)
  }

  async harvest(vaultId: string): Promise<HarvestResult> {
    const vault = this.vaults.get(vaultId)
    if (!vault) throw new Error("Vault not found")

    let totalHarvested = 0n
    const harvestResults: StrategyHarvest[] = []

    for (const strategyAlloc of vault.strategies) {
      const strategy = this.strategies.get(strategyAlloc.id)!

      const harvested = await strategy.harvest()
      totalHarvested += harvested

      harvestResults.push({
        strategyId: strategyAlloc.id,
        harvested,
        newDeposited: strategyAlloc.deposited + harvested
      })

      strategyAlloc.earned += harvested
    }

    // Calculate and collect fees
    const performanceFee = this.calculatePerformanceFee(vault, totalHarvested)
    const managementFee = this.calculateManagementFee(vault)

    const totalFees = performanceFee + managementFee
    const netHarvested = totalHarvested - totalFees

    vault.totalAssets += netHarvested
    vault.sharePrice = (vault.totalAssets * BigInt(1e18)) / vault.totalShares

    // Update high water mark
    if (vault.sharePrice > vault.highWaterMark) {
      vault.highWaterMark = vault.sharePrice
    }

    return {
      totalHarvested,
      performanceFee,
      managementFee,
      netHarvested,
      newSharePrice: vault.sharePrice,
      strategies: harvestResults
    }
  }

  private async rebalanceStrategies(vaultId: string): Promise<void> {
    const vault = this.vaults.get(vaultId)
    if (!vault) return

    const totalAssets = vault.totalAssets

    for (const strategyAlloc of vault.strategies) {
      const targetAmount = (totalAssets * BigInt(strategyAlloc.allocation)) / 100n
      const currentAmount = strategyAlloc.deposited
      const strategy = this.strategies.get(strategyAlloc.id)!

      if (targetAmount > currentAmount) {
        // Need to deposit more
        const depositAmount = targetAmount - currentAmount
        await strategy.deposit(depositAmount)
        strategyAlloc.deposited = targetAmount
      } else if (targetAmount < currentAmount) {
        // Need to withdraw
        const withdrawAmount = currentAmount - targetAmount
        await strategy.withdraw(withdrawAmount)
        strategyAlloc.deposited = targetAmount
      }
    }
  }
}
```

### 2. Auto-Compounding Vault

Automatically compound yields:

```typescript
class AutoCompoundingVault {
  private vault: YieldVaultManager
  private compoundThreshold: bigint
  private lastCompound: number = 0

  async startAutoCompounding(
    vaultId: string,
    config: CompoundConfig
  ): Promise<void> {
    this.compoundThreshold = config.threshold

    const checkAndCompound = async () => {
      const pendingRewards = await this.getPendingRewards(vaultId)

      if (pendingRewards >= this.compoundThreshold) {
        await this.compound(vaultId)
      }

      // Check gas efficiency
      const gasPrice = await this.getGasPrice()
      const compoundGas = await this.estimateCompoundGas(vaultId)
      const gasCost = gasPrice * compoundGas

      // Only compound if rewards > 2x gas cost
      if (pendingRewards > gasCost * 2n) {
        await this.compound(vaultId)
      }
    }

    // Run on interval
    setInterval(checkAndCompound, config.interval || 3600000) // Default 1 hour
  }

  async compound(vaultId: string): Promise<CompoundResult> {
    // Harvest rewards
    const harvestResult = await this.vault.harvest(vaultId)

    // Reinvest into strategies
    await this.vault.rebalanceStrategies(vaultId)

    this.lastCompound = Date.now()

    return {
      harvested: harvestResult.totalHarvested,
      reinvested: harvestResult.netHarvested,
      fees: harvestResult.performanceFee + harvestResult.managementFee,
      timestamp: this.lastCompound
    }
  }

  async calculateAPY(vaultId: string): Promise<APYMetrics> {
    const vault = this.vault.getVault(vaultId)

    // Get historical data
    const history = await this.getSharePriceHistory(vaultId, 30) // 30 days

    // Calculate daily returns
    const dailyReturns: number[] = []
    for (let i = 1; i < history.length; i++) {
      const dailyReturn = Number(history[i].price - history[i - 1].price) /
        Number(history[i - 1].price)
      dailyReturns.push(dailyReturn)
    }

    const avgDailyReturn = dailyReturns.reduce((a, b) => a + b, 0) / dailyReturns.length

    // Calculate APYs
    const simpleAPY = avgDailyReturn * 365
    const compoundAPY = Math.pow(1 + avgDailyReturn, 365) - 1

    // Calculate fees impact
    const grossAPY = compoundAPY / (1 - vault.performanceFee / 10000)

    return {
      simpleAPY: simpleAPY * 100,
      compoundAPY: compoundAPY * 100,
      grossAPY: grossAPY * 100,
      netAPY: compoundAPY * 100,
      avgDailyReturn: avgDailyReturn * 100,
      volatility: this.calculateVolatility(dailyReturns) * 100
    }
  }

  private calculateVolatility(returns: number[]): number {
    const mean = returns.reduce((a, b) => a + b, 0) / returns.length
    const squaredDiffs = returns.map(r => Math.pow(r - mean, 2))
    const variance = squaredDiffs.reduce((a, b) => a + b, 0) / returns.length
    return Math.sqrt(variance * 365) // Annualized
  }
}
```

### 3. Multi-Strategy Vault Allocator

Dynamically allocate between strategies:

```typescript
class MultiStrategyAllocator {
  private strategies: Map<string, StrategyPerformance> = new Map()
  private riskParams: RiskParameters

  async optimizeAllocation(
    vaultId: string,
    constraints: AllocationConstraints
  ): Promise<OptimizedAllocation> {
    const strategies = await this.getStrategiesWithMetrics()

    // Calculate expected returns and risks
    const metrics = strategies.map(s => ({
      strategy: s,
      expectedReturn: this.calculateExpectedReturn(s),
      risk: this.calculateRisk(s),
      sharpeRatio: this.calculateSharpeRatio(s)
    }))

    // Mean-variance optimization
    const allocation = this.meanVarianceOptimize(
      metrics,
      constraints
    )

    return {
      allocation,
      expectedReturn: this.portfolioExpectedReturn(allocation, metrics),
      expectedRisk: this.portfolioRisk(allocation, metrics),
      sharpeRatio: this.portfolioSharpeRatio(allocation, metrics)
    }
  }

  private meanVarianceOptimize(
    strategies: StrategyMetrics[],
    constraints: AllocationConstraints
  ): StrategyAllocation[] {
    // Simplified mean-variance optimization
    const n = strategies.length
    const allocations: StrategyAllocation[] = []

    // Start with equal weights
    let weights = strategies.map(() => 1 / n)

    // Iterative optimization
    for (let iter = 0; iter < 100; iter++) {
      for (let i = 0; i < n; i++) {
        const s = strategies[i]

        // Gradient of utility function
        const marginalReturn = s.expectedReturn
        const marginalRisk = this.marginalRisk(weights, strategies, i)
        const gradient = marginalReturn - this.riskParams.riskAversion * marginalRisk

        // Update weight
        weights[i] += 0.01 * gradient

        // Apply constraints
        weights[i] = Math.max(constraints.minAllocation || 0, weights[i])
        weights[i] = Math.min(constraints.maxAllocation || 1, weights[i])
      }

      // Normalize
      const sum = weights.reduce((a, b) => a + b, 0)
      weights = weights.map(w => w / sum)
    }

    return strategies.map((s, i) => ({
      strategyId: s.strategy.id,
      allocation: Math.round(weights[i] * 100),
      expectedContribution: weights[i] * s.expectedReturn
    }))
  }

  async rebalanceToOptimal(vaultId: string): Promise<RebalanceResult> {
    const currentAllocation = await this.getCurrentAllocation(vaultId)
    const optimalAllocation = await this.optimizeAllocation(vaultId, {
      minAllocation: 5,
      maxAllocation: 40
    })

    const changes: AllocationChange[] = []

    for (const optimal of optimalAllocation.allocation) {
      const current = currentAllocation.find(c => c.strategyId === optimal.strategyId)
      const currentAlloc = current?.allocation || 0

      if (Math.abs(currentAlloc - optimal.allocation) >= 2) { // 2% threshold
        changes.push({
          strategyId: optimal.strategyId,
          from: currentAlloc,
          to: optimal.allocation,
          action: optimal.allocation > currentAlloc ? "increase" : "decrease"
        })
      }
    }

    // Execute rebalance
    for (const change of changes) {
      if (change.action === "decrease") {
        await this.vault.withdrawFromStrategy(vaultId, change.strategyId, change.from - change.to)
      }
    }

    for (const change of changes) {
      if (change.action === "increase") {
        await this.vault.depositToStrategy(vaultId, change.strategyId, change.to - change.from)
      }
    }

    return {
      changes,
      newAllocation: optimalAllocation,
      timestamp: Date.now()
    }
  }

  async monitorAndRebalance(vaultId: string, config: MonitorConfig): Promise<void> {
    setInterval(async () => {
      const drift = await this.calculateAllocationDrift(vaultId)

      if (drift > config.maxDrift) {
        await this.rebalanceToOptimal(vaultId)
      }

      // Check for underperforming strategies
      const performances = await this.getRecentPerformances(vaultId)
      for (const perf of performances) {
        if (perf.return < config.minReturn) {
          // Consider removing or reducing allocation
          await this.reduceUnderperformer(vaultId, perf.strategyId)
        }
      }
    }, config.checkInterval || 3600000)
  }
}
```

## Best Practices

1. **Implement share-based accounting** for fair deposits/withdrawals
2. **Use high water marks** for performance fees
3. **Monitor strategy health** continuously
4. **Optimize gas** for compounding operations
5. **Diversify** across multiple strategies

## Related Skills

- [Farming Optimizer Agent](./farming-optimizer-agent.md) - Yield farming
- [Lending Protocol Agent](./lending-protocol-agent.md) - Lending strategies
- [Risk Assessment Agent](./risk-assessment-agent.md) - Risk management
