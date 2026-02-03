# Collateral Manager Agent Skill

Build agents that manage collateral positions across DeFi protocols.

## Overview

Collateral Manager Agent enables automated collateral optimization, rebalancing, and protection across lending protocols. Essential for maintaining healthy positions, maximizing capital efficiency, and preventing liquidations.

## SDK Reference

```typescript
import { Demos } from "@kynesyslabs/demosdk/websdk"
import { EVM } from "@kynesyslabs/demosdk/xm-websdk"
import { DemosWork, BaseOperation } from "@kynesyslabs/demoswork"

// Cross-protocol collateral management
const evm = await EVM.create("https://rpc.ankr.com/eth")
```

## Agent Use Cases

### 1. Cross-Protocol Collateral Optimizer

Optimize collateral across multiple protocols:

```typescript
class CrossProtocolCollateralOptimizer {
  private protocols: Map<string, LendingProtocol> = new Map()
  private positions: Map<string, CollateralPosition[]> = new Map()

  async analyzeCollateralEfficiency(
    user: string
  ): Promise<CollateralAnalysis> {
    const positions: ProtocolPosition[] = []

    for (const [name, protocol] of this.protocols) {
      const pos = await protocol.getUserPosition(user)
      if (pos.collateralValue > 0n || pos.debtValue > 0n) {
        positions.push({
          protocol: name,
          ...pos,
          ltv: await protocol.getLTV(pos.collateralAsset),
          liquidationThreshold: await protocol.getLiquidationThreshold(pos.collateralAsset)
        })
      }
    }

    // Calculate efficiency metrics
    const totalCollateral = positions.reduce((sum, p) => sum + p.collateralValue, 0n)
    const totalDebt = positions.reduce((sum, p) => sum + p.debtValue, 0n)
    const avgLTV = positions.reduce((sum, p) => sum + p.ltv * Number(p.collateralValue), 0) /
      Number(totalCollateral)

    // Find optimization opportunities
    const opportunities = await this.findOptimizationOpportunities(positions)

    return {
      user,
      positions,
      totalCollateral,
      totalDebt,
      avgLTV,
      healthFactor: this.calculateAggregateHealth(positions),
      opportunities,
      potentialSavings: opportunities.reduce((sum, o) => sum + o.expectedSavings, 0n)
    }
  }

  async findOptimizationOpportunities(
    positions: ProtocolPosition[]
  ): Promise<OptimizationOpportunity[]> {
    const opportunities: OptimizationOpportunity[] = []

    // Check for better LTV opportunities
    for (const pos of positions) {
      for (const [name, protocol] of this.protocols) {
        if (name === pos.protocol) continue

        const newLTV = await protocol.getLTV(pos.collateralAsset)

        if (newLTV > pos.ltv * 1.1) { // 10% better LTV
          const additionalBorrow = (pos.collateralValue * BigInt(Math.floor((newLTV - pos.ltv) * 10000))) / 10000n

          opportunities.push({
            type: "better_ltv",
            currentProtocol: pos.protocol,
            targetProtocol: name,
            asset: pos.collateralAsset,
            currentLTV: pos.ltv,
            newLTV,
            additionalBorrowCapacity: additionalBorrow,
            expectedSavings: this.estimateMigrationSavings(pos, name)
          })
        }
      }
    }

    // Check for collateral swaps
    for (const pos of positions) {
      const betterCollaterals = await this.findBetterCollaterals(
        pos.protocol,
        pos.collateralAsset,
        pos.collateralValue
      )

      for (const better of betterCollaterals) {
        opportunities.push({
          type: "collateral_swap",
          currentProtocol: pos.protocol,
          targetProtocol: pos.protocol,
          currentAsset: pos.collateralAsset,
          newAsset: better.asset,
          ltvImprovement: better.ltvImprovement,
          expectedSavings: better.expectedSavings
        })
      }
    }

    return opportunities.sort((a, b) => Number(b.expectedSavings - a.expectedSavings))
  }

  async executeOptimization(
    opportunity: OptimizationOpportunity
  ): Promise<OptimizationResult> {
    switch (opportunity.type) {
      case "better_ltv":
        return await this.migrateToBetterLTV(opportunity)
      case "collateral_swap":
        return await this.swapCollateral(opportunity)
      default:
        throw new Error("Unknown optimization type")
    }
  }

  private async migrateToBetterLTV(
    opportunity: OptimizationOpportunity
  ): Promise<OptimizationResult> {
    const sourceProtocol = this.protocols.get(opportunity.currentProtocol)!
    const targetProtocol = this.protocols.get(opportunity.targetProtocol)!

    // Use flash loan for atomic migration
    const flashLoan = await this.getFlashLoan(
      opportunity.asset,
      opportunity.debtValue
    )

    try {
      // 1. Repay debt on source
      await sourceProtocol.repay(opportunity.asset, opportunity.debtValue)

      // 2. Withdraw collateral
      const collateral = await sourceProtocol.withdraw(opportunity.collateralAsset)

      // 3. Deposit to target
      await targetProtocol.deposit(opportunity.collateralAsset, collateral)

      // 4. Borrow on target (more than before due to better LTV)
      await targetProtocol.borrow(opportunity.asset, flashLoan.amount + flashLoan.fee)

      // 5. Repay flash loan
      await this.repayFlashLoan(flashLoan)

      return {
        success: true,
        opportunity,
        actualSavings: opportunity.expectedSavings,
        newBorrowCapacity: opportunity.additionalBorrowCapacity
      }
    } catch (error) {
      // Flash loan will revert
      throw error
    }
  }
}
```

### 2. Collateral Health Guardian

Monitor and protect collateral positions:

```typescript
class CollateralHealthGuardian {
  private positions: Map<string, MonitoredPosition> = new Map()
  private alertThresholds: AlertThresholds
  private autoProtectEnabled: boolean = true

  async monitorPosition(
    positionId: string,
    protocol: LendingProtocol,
    config: MonitorConfig
  ): Promise<void> {
    const monitor = async () => {
      const position = await protocol.getPosition(positionId)
      const healthFactor = await protocol.getHealthFactor(positionId)
      const collateralPrices = await this.getCollateralPrices(position.collaterals)

      const monitored: MonitoredPosition = {
        id: positionId,
        protocol: protocol.name,
        healthFactor,
        collaterals: position.collaterals.map((c, i) => ({
          ...c,
          currentPrice: collateralPrices[i],
          liquidationPrice: this.calculateLiquidationPrice(position, c)
        })),
        lastUpdated: Date.now()
      }

      this.positions.set(positionId, monitored)

      // Check alert thresholds
      await this.checkThresholds(monitored, config)
    }

    // Initial check
    await monitor()

    // Set up interval
    setInterval(monitor, config.checkInterval || 30000)
  }

  private async checkThresholds(
    position: MonitoredPosition,
    config: MonitorConfig
  ): Promise<void> {
    // Critical threshold - immediate action
    if (position.healthFactor < config.criticalThreshold) {
      await this.handleCritical(position)
      return
    }

    // Warning threshold - prepare for action
    if (position.healthFactor < config.warningThreshold) {
      await this.handleWarning(position)
      return
    }

    // Check individual collateral proximity to liquidation
    for (const collateral of position.collaterals) {
      const distanceToLiquidation = Math.abs(
        (collateral.currentPrice - collateral.liquidationPrice) / collateral.currentPrice
      )

      if (distanceToLiquidation < 0.05) { // Within 5%
        await this.handleCollateralRisk(position, collateral)
      }
    }
  }

  private async handleCritical(position: MonitoredPosition): Promise<void> {
    this.emitAlert("critical", position)

    if (!this.autoProtectEnabled) return

    // Determine best protection strategy
    const strategy = await this.determineProtectionStrategy(position)

    switch (strategy.action) {
      case "add_collateral":
        await this.addEmergencyCollateral(position, strategy)
        break
      case "repay_debt":
        await this.repayEmergencyDebt(position, strategy)
        break
      case "swap_collateral":
        await this.swapToSaferCollateral(position, strategy)
        break
      case "partial_close":
        await this.partialClosePosition(position, strategy)
        break
    }
  }

  private async determineProtectionStrategy(
    position: MonitoredPosition
  ): Promise<ProtectionStrategy> {
    // Check available balances
    const availableAssets = await this.getAvailableAssets()

    // Option 1: Add more collateral
    const addableCollateral = this.findAddableCollateral(position, availableAssets)
    if (addableCollateral) {
      const needed = this.calculateCollateralNeeded(position, 1.5) // Target 1.5 health
      if (availableAssets.get(addableCollateral.asset)! >= needed) {
        return {
          action: "add_collateral",
          asset: addableCollateral.asset,
          amount: needed,
          expectedHealth: 1.5
        }
      }
    }

    // Option 2: Repay debt
    const debtAsset = position.debt?.asset
    if (debtAsset && availableAssets.has(debtAsset)) {
      const repayAmount = this.calculateRepayNeeded(position, 1.5)
      if (availableAssets.get(debtAsset)! >= repayAmount) {
        return {
          action: "repay_debt",
          asset: debtAsset,
          amount: repayAmount,
          expectedHealth: 1.5
        }
      }
    }

    // Option 3: Partial close
    return {
      action: "partial_close",
      closePercent: 30,
      expectedHealth: 1.5
    }
  }

  async setAutoProtectionRules(rules: ProtectionRules): Promise<void> {
    this.alertThresholds = {
      critical: rules.criticalHealthFactor,
      warning: rules.warningHealthFactor,
      info: rules.infoHealthFactor
    }

    this.autoProtectEnabled = rules.autoProtect
  }
}
```

### 3. Multi-Collateral Position Manager

Manage positions with multiple collateral types:

```typescript
class MultiCollateralPositionManager {
  private protocol: LendingProtocol

  async optimizeCollateralMix(
    positionId: string,
    targetHealth: number = 1.5
  ): Promise<CollateralMixResult> {
    const position = await this.protocol.getPosition(positionId)
    const currentMix = position.collaterals

    // Get all available collateral types
    const availableTypes = await this.protocol.getSupportedCollaterals()

    // Calculate optimal weights based on:
    // - Correlation (lower is better for diversification)
    // - Volatility (lower is better for stability)
    // - LTV (higher is better for capital efficiency)
    const scores = await Promise.all(
      availableTypes.map(async type => {
        const [volatility, correlation, ltv] = await Promise.all([
          this.getVolatility(type),
          this.getCorrelationWithDebt(type, position.debt.asset),
          this.protocol.getLTV(type)
        ])

        return {
          asset: type,
          volatility,
          correlation,
          ltv,
          score: ltv * 0.4 - volatility * 0.3 - Math.abs(correlation) * 0.3
        }
      })
    )

    // Sort by score
    const rankedCollaterals = scores.sort((a, b) => b.score - a.score)

    // Build optimal mix
    const optimalMix: CollateralAllocation[] = []
    let remainingWeight = 100

    for (const collateral of rankedCollaterals) {
      if (remainingWeight <= 0) break

      const maxWeight = Math.min(50, remainingWeight) // Max 50% in any single asset
      const weight = this.calculateOptimalWeight(collateral, optimalMix)

      optimalMix.push({
        asset: collateral.asset,
        weight: Math.min(weight, maxWeight),
        ltv: collateral.ltv,
        volatility: collateral.volatility
      })

      remainingWeight -= optimalMix[optimalMix.length - 1].weight
    }

    // Compare with current mix
    const currentEfficiency = this.calculateMixEfficiency(currentMix)
    const optimalEfficiency = this.calculateMixEfficiency(optimalMix)

    return {
      currentMix,
      optimalMix,
      currentEfficiency,
      optimalEfficiency,
      improvement: optimalEfficiency - currentEfficiency,
      rebalanceNeeded: optimalEfficiency - currentEfficiency > 0.05
    }
  }

  async rebalanceCollateral(
    positionId: string,
    targetMix: CollateralAllocation[]
  ): Promise<RebalanceResult> {
    const position = await this.protocol.getPosition(positionId)
    const currentMix = position.collaterals

    const changes: CollateralChange[] = []

    // Calculate changes needed
    const totalValue = currentMix.reduce((sum, c) => sum + c.value, 0n)

    for (const target of targetMix) {
      const current = currentMix.find(c => c.asset === target.asset)
      const currentWeight = current
        ? Number(current.value * 100n / totalValue)
        : 0

      const weightDiff = target.weight - currentWeight

      if (Math.abs(weightDiff) > 2) { // 2% threshold
        const valueChange = (totalValue * BigInt(Math.abs(weightDiff))) / 100n

        changes.push({
          asset: target.asset,
          action: weightDiff > 0 ? "add" : "remove",
          amount: valueChange
        })
      }
    }

    // Execute rebalance atomically using flash loan
    const flashLoan = await this.getRebalanceFlashLoan(changes)

    try {
      // Remove excess collateral first
      for (const change of changes.filter(c => c.action === "remove")) {
        await this.protocol.withdrawCollateral(positionId, change.asset, change.amount)
      }

      // Swap assets
      for (const change of changes) {
        if (change.action === "add") {
          const sourceAsset = changes.find(c => c.action === "remove")?.asset
          if (sourceAsset) {
            await this.swapAssets(sourceAsset, change.asset, change.amount)
          }
        }
      }

      // Add new collateral
      for (const change of changes.filter(c => c.action === "add")) {
        await this.protocol.addCollateral(positionId, change.asset, change.amount)
      }

      // Repay flash loan
      await this.repayFlashLoan(flashLoan)

      return {
        success: true,
        changes,
        newHealth: await this.protocol.getHealthFactor(positionId)
      }
    } catch (error) {
      throw error // Flash loan reverts
    }
  }

  private calculateMixEfficiency(mix: CollateralAllocation[]): number {
    // Weighted average of LTV adjusted by volatility
    let totalWeight = 0
    let weightedLTV = 0

    for (const alloc of mix) {
      const adjustedLTV = alloc.ltv * (1 - alloc.volatility * 0.5)
      weightedLTV += adjustedLTV * alloc.weight
      totalWeight += alloc.weight
    }

    return totalWeight > 0 ? weightedLTV / totalWeight : 0
  }
}
```

## Best Practices

1. **Monitor health factors** continuously
2. **Diversify collateral** to reduce correlation risk
3. **Set conservative thresholds** for auto-protection
4. **Use flash loans** for atomic rebalancing
5. **Consider gas costs** in optimization decisions

## Related Skills

- [Lending Protocol Agent](./lending-protocol-agent.md) - Lending operations
- [Liquidation Agent](./liquidation-agent.md) - Liquidation handling
- [Risk Assessment Agent](./risk-assessment-agent.md) - Risk management
