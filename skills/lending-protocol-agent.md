# Lending Protocol Agent Skill

> **⚠️ Prerequisites**: Complete [SDK Setup](./00-sdk-setup.md) first to configure your environment.

Build agents that interact with DeFi lending protocols for supply, borrow, and liquidation operations.

## Overview

Lending Protocol Agent enables automated lending, borrowing, and position management across DeFi protocols. Essential for yield optimization, leverage strategies, and capital efficiency.

## SDK Reference

```typescript
import { Demos } from "@kynesyslabs/demosdk/websdk"
import { EVM } from "@kynesyslabs/demosdk/xm-websdk"
import { DemosWork, BaseOperation } from "@kynesyslabs/demoswork"

// Lending protocol interactions
const evm = await EVM.create("https://rpc.ankr.com/eth")
```

## Agent Use Cases

### 1. Multi-Protocol Lending Manager

Manage positions across lending protocols:

```typescript
class MultiProtocolLendingManager {
  private protocols: Map<string, LendingProtocol> = new Map()
  private positions: Map<string, LendingPosition[]> = new Map()

  registerProtocol(protocol: LendingProtocol): void {
    this.protocols.set(protocol.name, protocol)
  }

  async getMarketData(
    protocol: string,
    asset: string
  ): Promise<MarketData> {
    const proto = this.protocols.get(protocol)
    if (!proto) throw new Error("Protocol not found")

    const [supplyRate, borrowRate, utilization, liquidity] = await Promise.all([
      proto.getSupplyRate(asset),
      proto.getBorrowRate(asset),
      proto.getUtilization(asset),
      proto.getAvailableLiquidity(asset)
    ])

    return {
      protocol,
      asset,
      supplyAPY: supplyRate,
      borrowAPY: borrowRate,
      utilization,
      availableLiquidity: liquidity,
      timestamp: Date.now()
    }
  }

  async supply(
    protocol: string,
    asset: string,
    amount: bigint
  ): Promise<SupplyResult> {
    const proto = this.protocols.get(protocol)
    if (!proto) throw new Error("Protocol not found")

    // Check if asset needs approval
    const allowance = await proto.getAllowance(asset)
    if (allowance < amount) {
      await proto.approve(asset, amount)
    }

    // Execute supply
    const tx = await proto.supply(asset, amount)

    // Track position
    const position: LendingPosition = {
      id: this.generatePositionId(),
      protocol,
      asset,
      type: "supply",
      amount,
      entryRate: await proto.getSupplyRate(asset),
      entryTimestamp: Date.now(),
      txHash: tx.hash
    }

    this.addPosition(protocol, position)

    return {
      success: true,
      position,
      txHash: tx.hash
    }
  }

  async borrow(
    protocol: string,
    asset: string,
    amount: bigint,
    collateral?: { asset: string; amount: bigint }
  ): Promise<BorrowResult> {
    const proto = this.protocols.get(protocol)
    if (!proto) throw new Error("Protocol not found")

    // Supply collateral if provided
    if (collateral) {
      await this.supply(protocol, collateral.asset, collateral.amount)
    }

    // Check borrow capacity
    const capacity = await proto.getBorrowCapacity(asset)
    if (capacity < amount) {
      throw new Error("Insufficient borrow capacity")
    }

    // Check health factor
    const healthFactor = await proto.getHealthFactor()
    const projectedHealth = await proto.simulateHealthFactor({
      borrow: { asset, amount }
    })

    if (projectedHealth < 1.1) {
      throw new Error("Would put position at liquidation risk")
    }

    // Execute borrow
    const tx = await proto.borrow(asset, amount)

    const position: LendingPosition = {
      id: this.generatePositionId(),
      protocol,
      asset,
      type: "borrow",
      amount,
      entryRate: await proto.getBorrowRate(asset),
      entryTimestamp: Date.now(),
      txHash: tx.hash
    }

    this.addPosition(protocol, position)

    return {
      success: true,
      position,
      healthFactor: projectedHealth,
      txHash: tx.hash
    }
  }

  async repay(
    protocol: string,
    asset: string,
    amount: bigint
  ): Promise<RepayResult> {
    const proto = this.protocols.get(protocol)
    if (!proto) throw new Error("Protocol not found")

    // Approve if needed
    const allowance = await proto.getAllowance(asset)
    if (allowance < amount) {
      await proto.approve(asset, amount)
    }

    const tx = await proto.repay(asset, amount)

    // Update position
    const positions = this.getPositions(protocol, "borrow", asset)
    let remaining = amount

    for (const pos of positions) {
      if (remaining >= pos.amount) {
        remaining -= pos.amount
        pos.amount = 0n
        pos.closedAt = Date.now()
      } else {
        pos.amount -= remaining
        remaining = 0n
        break
      }
    }

    return {
      success: true,
      repaidAmount: amount - remaining,
      txHash: tx.hash,
      newHealthFactor: await proto.getHealthFactor()
    }
  }

  async findBestRate(
    asset: string,
    type: "supply" | "borrow"
  ): Promise<RateComparison[]> {
    const comparisons: RateComparison[] = []

    for (const [name, protocol] of this.protocols) {
      try {
        const rate = type === "supply"
          ? await protocol.getSupplyRate(asset)
          : await protocol.getBorrowRate(asset)

        const liquidity = await protocol.getAvailableLiquidity(asset)

        comparisons.push({
          protocol: name,
          asset,
          type,
          rate,
          liquidity,
          utilization: await protocol.getUtilization(asset)
        })
      } catch {
        // Protocol doesn't support this asset
      }
    }

    // Sort by best rate
    return comparisons.sort((a, b) =>
      type === "supply" ? b.rate - a.rate : a.rate - b.rate
    )
  }
}
```

### 2. Health Factor Monitor

Monitor and protect lending positions:

```typescript
class HealthFactorMonitor {
  private positions: Map<string, MonitoredPosition> = new Map()
  private alerts: Alert[] = []
  private autoProtectEnabled: boolean = true

  async monitorPosition(
    positionId: string,
    protocol: LendingProtocol,
    thresholds: HealthThresholds
  ): Promise<void> {
    const checkHealth = async () => {
      const healthFactor = await protocol.getHealthFactor()
      const position = this.positions.get(positionId)

      if (!position) return

      position.currentHealth = healthFactor
      position.lastChecked = Date.now()

      // Check thresholds
      if (healthFactor <= thresholds.critical) {
        await this.handleCriticalHealth(position, protocol)
      } else if (healthFactor <= thresholds.warning) {
        await this.handleWarningHealth(position, protocol)
      } else if (healthFactor <= thresholds.caution) {
        this.emitAlert(position, "caution", healthFactor)
      }
    }

    // Initial check
    await checkHealth()

    // Set up monitoring interval
    const interval = setInterval(checkHealth, 30000) // Every 30 seconds

    this.positions.set(positionId, {
      id: positionId,
      protocol: protocol.name,
      thresholds,
      monitoring: true,
      intervalId: interval,
      currentHealth: 0,
      lastChecked: Date.now()
    })
  }

  private async handleCriticalHealth(
    position: MonitoredPosition,
    protocol: LendingProtocol
  ): Promise<void> {
    this.emitAlert(position, "critical", position.currentHealth)

    if (!this.autoProtectEnabled) return

    // Auto-protect: repay debt or add collateral
    const protection = await this.determineProtection(position, protocol)

    if (protection.action === "repay") {
      await this.executeRepay(position, protocol, protection.amount)
    } else if (protection.action === "add_collateral") {
      await this.executeAddCollateral(position, protocol, protection)
    } else if (protection.action === "partial_close") {
      await this.executePartialClose(position, protocol, protection)
    }
  }

  private async determineProtection(
    position: MonitoredPosition,
    protocol: LendingProtocol
  ): Promise<ProtectionAction> {
    const [debt, collateral, prices] = await Promise.all([
      protocol.getTotalDebt(),
      protocol.getTotalCollateral(),
      protocol.getPrices()
    ])

    // Calculate how much to repay to reach safe health factor
    const targetHealth = 1.5
    const currentHealth = position.currentHealth

    // Simple calculation: repay enough to improve health
    const debtToRepay = this.calculateRepayAmount(
      debt,
      collateral,
      currentHealth,
      targetHealth
    )

    // Check available balance for repay
    const balance = await protocol.getAvailableBalance(debt.asset)

    if (balance >= debtToRepay) {
      return {
        action: "repay",
        amount: debtToRepay,
        asset: debt.asset,
        expectedHealth: targetHealth
      }
    }

    // Check if we can add collateral
    const collateralNeeded = this.calculateCollateralNeeded(
      debt,
      collateral,
      currentHealth,
      targetHealth
    )

    const collateralBalance = await protocol.getAvailableBalance(collateral.asset)

    if (collateralBalance >= collateralNeeded) {
      return {
        action: "add_collateral",
        amount: collateralNeeded,
        asset: collateral.asset,
        expectedHealth: targetHealth
      }
    }

    // Last resort: partial close
    return {
      action: "partial_close",
      closePercent: 0.3, // Close 30% of position
      expectedHealth: targetHealth
    }
  }

  async getHealthReport(): Promise<HealthReport> {
    const positionReports: PositionHealthReport[] = []

    for (const [id, position] of this.positions) {
      positionReports.push({
        positionId: id,
        protocol: position.protocol,
        currentHealth: position.currentHealth,
        thresholds: position.thresholds,
        status: this.getHealthStatus(position),
        lastChecked: position.lastChecked
      })
    }

    return {
      positions: positionReports,
      criticalCount: positionReports.filter(p => p.status === "critical").length,
      warningCount: positionReports.filter(p => p.status === "warning").length,
      healthyCount: positionReports.filter(p => p.status === "healthy").length,
      alerts: this.alerts.slice(-50) // Last 50 alerts
    }
  }
}
```

### 3. Interest Rate Optimizer

Optimize borrowing costs across protocols:

```typescript
class InterestRateOptimizer {
  private protocols: LendingProtocol[]
  private positions: Map<string, OptimizedPosition> = new Map()

  async optimizeBorrowPosition(
    asset: string,
    currentProtocol: string,
    currentAmount: bigint
  ): Promise<OptimizationResult> {
    // Get rates from all protocols
    const rates = await Promise.all(
      this.protocols.map(async protocol => ({
        protocol: protocol.name,
        borrowRate: await protocol.getBorrowRate(asset),
        liquidity: await protocol.getAvailableLiquidity(asset),
        migrationCost: await this.estimateMigrationCost(
          currentProtocol,
          protocol.name,
          asset,
          currentAmount
        )
      }))
    )

    // Find best option considering migration costs
    const currentRate = rates.find(r => r.protocol === currentProtocol)!
    let bestOption: typeof rates[0] | null = null
    let bestSavings = 0n

    for (const option of rates) {
      if (option.protocol === currentProtocol) continue
      if (option.liquidity < currentAmount) continue

      // Calculate annual savings
      const rateDiff = currentRate.borrowRate - option.borrowRate
      const annualSavings = (currentAmount * BigInt(Math.floor(rateDiff * 10000))) / 10000n

      // Subtract migration cost
      const netSavings = annualSavings - option.migrationCost

      if (netSavings > bestSavings) {
        bestSavings = netSavings
        bestOption = option
      }
    }

    if (!bestOption || bestSavings <= 0n) {
      return {
        shouldMigrate: false,
        currentProtocol,
        currentRate: currentRate.borrowRate,
        reason: "No better option available"
      }
    }

    return {
      shouldMigrate: true,
      currentProtocol,
      targetProtocol: bestOption.protocol,
      currentRate: currentRate.borrowRate,
      targetRate: bestOption.borrowRate,
      estimatedSavings: bestSavings,
      migrationCost: bestOption.migrationCost,
      breakEvenDays: this.calculateBreakEven(
        bestOption.migrationCost,
        currentRate.borrowRate - bestOption.borrowRate,
        currentAmount
      )
    }
  }

  async executeMigration(
    fromProtocol: string,
    toProtocol: string,
    asset: string,
    amount: bigint
  ): Promise<MigrationResult> {
    const from = this.protocols.find(p => p.name === fromProtocol)!
    const to = this.protocols.find(p => p.name === toProtocol)!

    // Step 1: Flash loan to repay current debt
    const flashLoan = await this.getFlashLoan(asset, amount)

    try {
      // Step 2: Repay debt on source protocol
      await from.repay(asset, amount)

      // Step 3: Withdraw collateral from source
      const collateral = await from.withdrawAll()

      // Step 4: Supply collateral to target
      for (const { asset: collateralAsset, amount: collateralAmount } of collateral) {
        await to.supply(collateralAsset, collateralAmount)
      }

      // Step 5: Borrow on target protocol
      await to.borrow(asset, amount)

      // Step 6: Repay flash loan
      await this.repayFlashLoan(flashLoan)

      return {
        success: true,
        fromProtocol,
        toProtocol,
        migratedAmount: amount,
        newRate: await to.getBorrowRate(asset)
      }
    } catch (error) {
      // Rollback: flash loan will revert if not repaid
      throw new Error(`Migration failed: ${(error as Error).message}`)
    }
  }

  async findOptimalLeverage(
    asset: string,
    collateralAmount: bigint,
    targetLeverage: number
  ): Promise<LeverageStrategy> {
    // Find protocol with best rates for recursive borrowing
    const rates = await Promise.all(
      this.protocols.map(async protocol => {
        const [supplyRate, borrowRate, ltv] = await Promise.all([
          protocol.getSupplyRate(asset),
          protocol.getBorrowRate(asset),
          protocol.getLTV(asset)
        ])

        return {
          protocol: protocol.name,
          supplyRate,
          borrowRate,
          ltv,
          netRate: supplyRate - borrowRate,
          maxLeverage: 1 / (1 - ltv)
        }
      })
    )

    // Find best protocol for leverage
    const viable = rates.filter(r =>
      r.maxLeverage >= targetLeverage && r.netRate > 0
    )

    if (viable.length === 0) {
      return {
        viable: false,
        reason: "No protocol supports requested leverage with positive carry"
      }
    }

    const best = viable.sort((a, b) => b.netRate - a.netRate)[0]

    // Calculate loop iterations needed
    const iterations = this.calculateIterations(
      collateralAmount,
      targetLeverage,
      best.ltv
    )

    return {
      viable: true,
      protocol: best.protocol,
      iterations,
      finalLeverage: targetLeverage,
      netAPY: best.netRate * targetLeverage,
      borrowCost: best.borrowRate * (targetLeverage - 1),
      supplyYield: best.supplyRate * targetLeverage
    }
  }
}
```

## Best Practices

1. **Monitor health factor** continuously
2. **Use flash loans** for capital-efficient migrations
3. **Compare rates** across multiple protocols
4. **Set conservative thresholds** for auto-protection
5. **Account for gas costs** in optimization decisions

## Related Skills

- [Collateral Manager Agent](./collateral-manager-agent.md) - Collateral management
- [Liquidation Agent](./liquidation-agent.md) - Liquidation handling
- [Flash Loan Agent](./flash-loan-agent.md) - Flash loan operations
