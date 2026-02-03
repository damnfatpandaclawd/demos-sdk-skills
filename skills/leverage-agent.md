# Leverage Agent Skill

Build agents that manage leveraged positions across DeFi protocols.

## Overview

Leverage Agent enables automated leverage trading, recursive borrowing strategies, and risk-managed leveraged positions. Essential for capital-efficient trading, yield amplification, and delta exposure management.

## SDK Reference

```typescript
import { Demos } from "@kynesyslabs/demosdk/websdk"
import { EVM } from "@kynesyslabs/demosdk/xm-websdk"
import { DemosWork, BaseOperation } from "@kynesyslabs/demoswork"

// Leverage operations
const evm = await EVM.create("https://rpc.ankr.com/eth")
```

## Agent Use Cases

### 1. Recursive Leverage Manager

Build leveraged positions through recursive borrowing:

```typescript
class RecursiveLeverageManager {
  private protocol: LendingProtocol
  private maxIterations: number = 10
  private minHealthFactor: number = 1.25

  async buildLeveragedPosition(
    asset: string,
    initialAmount: bigint,
    targetLeverage: number
  ): Promise<LeveragedPosition> {
    // Validate leverage is achievable
    const ltv = await this.protocol.getLTV(asset)
    const maxLeverage = 1 / (1 - ltv)

    if (targetLeverage > maxLeverage) {
      throw new Error(`Max leverage for ${asset} is ${maxLeverage.toFixed(2)}x`)
    }

    // Calculate iterations needed
    const iterations = this.calculateIterations(targetLeverage, ltv)

    let totalDeposited = initialAmount
    let totalBorrowed = 0n
    let currentDeposit = initialAmount

    // Initial deposit
    await this.protocol.deposit(asset, initialAmount)

    // Recursive loop
    for (let i = 0; i < iterations && i < this.maxIterations; i++) {
      // Calculate borrow amount (LTV of current deposit)
      const borrowAmount = (currentDeposit * BigInt(Math.floor(ltv * 10000))) / 10000n

      // Check health factor
      const projectedHealth = await this.protocol.simulateHealthFactor({
        additionalBorrow: borrowAmount
      })

      if (projectedHealth < this.minHealthFactor) {
        break // Stop to maintain safety
      }

      // Borrow
      await this.protocol.borrow(asset, borrowAmount)
      totalBorrowed += borrowAmount

      // Re-deposit borrowed amount
      await this.protocol.deposit(asset, borrowAmount)
      totalDeposited += borrowAmount
      currentDeposit = borrowAmount
    }

    const actualLeverage = Number(totalDeposited) / Number(initialAmount)

    return {
      id: this.generatePositionId(),
      asset,
      initialAmount,
      totalDeposited,
      totalBorrowed,
      netExposure: totalDeposited - totalBorrowed,
      leverage: actualLeverage,
      healthFactor: await this.protocol.getHealthFactor(),
      liquidationPrice: await this.calculateLiquidationPrice(asset, totalDeposited, totalBorrowed),
      createdAt: Date.now()
    }
  }

  async unwindPosition(positionId: string): Promise<UnwindResult> {
    const position = await this.getPosition(positionId)

    let totalRepaid = 0n
    let totalWithdrawn = 0n

    // Unwind in reverse order
    while (position.totalBorrowed > 0n) {
      // Withdraw max possible
      const withdrawable = await this.protocol.getWithdrawable(position.asset)

      if (withdrawable === 0n) {
        // Need to repay some debt first
        const repayAmount = await this.calculateMinRepayForWithdraw(position)
        await this.protocol.repay(position.asset, repayAmount)
        totalRepaid += repayAmount
        position.totalBorrowed -= repayAmount
        continue
      }

      // Withdraw
      await this.protocol.withdraw(position.asset, withdrawable)
      totalWithdrawn += withdrawable
      position.totalDeposited -= withdrawable

      // Repay with withdrawn amount
      const repayAmount = withdrawable > position.totalBorrowed
        ? position.totalBorrowed
        : withdrawable

      if (repayAmount > 0n) {
        await this.protocol.repay(position.asset, repayAmount)
        totalRepaid += repayAmount
        position.totalBorrowed -= repayAmount
      }
    }

    // Final withdrawal
    const finalWithdrawable = await this.protocol.getWithdrawable(position.asset)
    await this.protocol.withdraw(position.asset, finalWithdrawable)
    totalWithdrawn += finalWithdrawable

    return {
      success: true,
      totalWithdrawn,
      totalRepaid,
      finalAmount: totalWithdrawn - totalRepaid,
      profitLoss: (totalWithdrawn - totalRepaid) - position.initialAmount
    }
  }

  async adjustLeverage(
    positionId: string,
    newLeverage: number
  ): Promise<AdjustResult> {
    const position = await this.getPosition(positionId)
    const currentLeverage = position.leverage

    if (newLeverage > currentLeverage) {
      return await this.increaseLeverage(position, newLeverage)
    } else {
      return await this.decreaseLeverage(position, newLeverage)
    }
  }

  private async increaseLeverage(
    position: LeveragedPosition,
    targetLeverage: number
  ): Promise<AdjustResult> {
    const currentValue = position.totalDeposited
    const targetValue = position.initialAmount * BigInt(Math.floor(targetLeverage * 1000)) / 1000n
    const additionalNeeded = targetValue - currentValue

    let deposited = 0n
    let borrowed = 0n

    while (deposited < additionalNeeded) {
      const ltv = await this.protocol.getLTV(position.asset)
      const borrowCapacity = await this.protocol.getBorrowCapacity(position.asset)

      const borrowAmount = borrowCapacity > (additionalNeeded - deposited)
        ? additionalNeeded - deposited
        : borrowCapacity

      // Check health
      const projectedHealth = await this.protocol.simulateHealthFactor({
        additionalBorrow: borrowAmount
      })

      if (projectedHealth < this.minHealthFactor) {
        break
      }

      await this.protocol.borrow(position.asset, borrowAmount)
      borrowed += borrowAmount

      await this.protocol.deposit(position.asset, borrowAmount)
      deposited += borrowAmount
    }

    position.totalDeposited += deposited
    position.totalBorrowed += borrowed
    position.leverage = Number(position.totalDeposited) / Number(position.initialAmount)

    return {
      success: true,
      newLeverage: position.leverage,
      additionalBorrowed: borrowed,
      newHealthFactor: await this.protocol.getHealthFactor()
    }
  }

  private calculateIterations(targetLeverage: number, ltv: number): number {
    // Geometric series: 1 + ltv + ltv^2 + ... = target leverage
    // Sum = 1 / (1 - ltv) at infinity
    // For n iterations: Sum = (1 - ltv^n) / (1 - ltv)
    // Solve for n: n = log(1 - targetLeverage * (1 - ltv)) / log(ltv)

    const denominator = 1 - ltv
    const numerator = 1 - targetLeverage * denominator
    const iterations = Math.log(numerator) / Math.log(ltv)

    return Math.ceil(iterations)
  }
}
```

### 2. Flash Loan Leverage

Create instant leverage with flash loans:

```typescript
class FlashLoanLeverage {
  async createInstantLeverage(
    asset: string,
    initialAmount: bigint,
    leverage: number
  ): Promise<LeveragedPosition> {
    const targetDeposit = initialAmount * BigInt(Math.floor(leverage * 1000)) / 1000n
    const borrowNeeded = targetDeposit - initialAmount

    // Get flash loan for the difference
    const flashLoan = await this.getFlashLoan(asset, borrowNeeded)

    try {
      // Deposit initial + flash loan amount
      await this.protocol.deposit(asset, targetDeposit)

      // Borrow to repay flash loan
      await this.protocol.borrow(asset, flashLoan.amount + flashLoan.fee)

      // Repay flash loan
      await this.repayFlashLoan(flashLoan)

      return {
        id: this.generatePositionId(),
        asset,
        initialAmount,
        totalDeposited: targetDeposit,
        totalBorrowed: flashLoan.amount + flashLoan.fee,
        leverage,
        healthFactor: await this.protocol.getHealthFactor(),
        createdAt: Date.now()
      }
    } catch (error) {
      // Flash loan reverts automatically
      throw error
    }
  }

  async instantDeleverage(positionId: string): Promise<DeleverageResult> {
    const position = await this.getPosition(positionId)

    // Flash loan to repay all debt
    const flashLoan = await this.getFlashLoan(
      position.asset,
      position.totalBorrowed
    )

    try {
      // Repay all debt
      await this.protocol.repay(position.asset, position.totalBorrowed)

      // Withdraw all collateral
      await this.protocol.withdrawAll(position.asset)

      // Repay flash loan (keep the profit)
      await this.repayFlashLoan(flashLoan)

      const finalAmount = position.totalDeposited - position.totalBorrowed - flashLoan.fee

      return {
        success: true,
        finalAmount,
        profitLoss: finalAmount - position.initialAmount
      }
    } catch (error) {
      throw error
    }
  }
}
```

### 3. Delta Neutral Leverage

Create leveraged positions with hedged exposure:

```typescript
class DeltaNeutralLeverage {
  private perpExchange: PerpetualExchange
  private lendingProtocol: LendingProtocol

  async createDeltaNeutralPosition(
    asset: string,
    amount: bigint,
    leverage: number
  ): Promise<DeltaNeutralPosition> {
    // Step 1: Create leveraged long position in lending
    const longPosition = await this.createLeveragedLong(asset, amount, leverage)

    // Step 2: Open short perp to hedge delta
    const shortSize = longPosition.totalDeposited
    const perpPosition = await this.perpExchange.openPosition({
      market: `${asset}-USD`,
      side: "short",
      size: shortSize,
      leverage: 1 // 1x short to match long exposure
    })

    // Calculate net exposure (should be ~0)
    const netDelta = Number(longPosition.totalDeposited) - Number(shortSize)

    return {
      id: this.generatePositionId(),
      longPosition,
      shortPosition: perpPosition,
      netDelta,
      fundingRate: await this.perpExchange.getFundingRate(`${asset}-USD`),
      supplyAPY: await this.lendingProtocol.getSupplyRate(asset),
      borrowAPY: await this.lendingProtocol.getBorrowRate(asset),
      netAPY: this.calculateNetAPY(longPosition, perpPosition),
      createdAt: Date.now()
    }
  }

  private calculateNetAPY(
    longPosition: LeveragedPosition,
    shortPosition: PerpPosition
  ): number {
    const supplyAPY = 0.03 // Example 3%
    const borrowAPY = 0.05 // Example 5%
    const fundingRate = 0.0001 // Example 0.01% per 8h

    // Supply yield on leveraged amount
    const leveragedSupplyYield = supplyAPY * longPosition.leverage

    // Borrow cost on debt
    const borrowCost = borrowAPY * (longPosition.leverage - 1)

    // Funding income (short receives when positive)
    const annualizedFunding = fundingRate * 3 * 365 // 3 times per day

    return leveragedSupplyYield - borrowCost + annualizedFunding
  }

  async rebalancePosition(positionId: string): Promise<RebalanceResult> {
    const position = await this.getPosition(positionId)

    // Check if delta drifted
    const currentLongValue = await this.getLongValue(position.longPosition)
    const currentShortValue = await this.getShortValue(position.shortPosition)

    const delta = currentLongValue - currentShortValue
    const deltaPercent = Number(delta) / Number(currentLongValue)

    if (Math.abs(deltaPercent) < 0.02) { // Within 2%
      return { rebalanced: false, reason: "Delta within bounds" }
    }

    // Rebalance short position
    if (delta > 0n) {
      // Need more short
      await this.perpExchange.increasePosition(position.shortPosition.id, delta)
    } else {
      // Need less short
      await this.perpExchange.decreasePosition(position.shortPosition.id, -delta)
    }

    return {
      rebalanced: true,
      previousDelta: deltaPercent,
      newDelta: 0,
      adjustment: delta
    }
  }

  async monitorAndRebalance(
    positionId: string,
    config: MonitorConfig
  ): Promise<void> {
    setInterval(async () => {
      const position = await this.getPosition(positionId)

      // Check delta
      const delta = await this.calculateDelta(position)
      if (Math.abs(delta) > config.maxDeltaDrift) {
        await this.rebalancePosition(positionId)
      }

      // Check funding rate changes
      const currentFunding = await this.perpExchange.getFundingRate(
        position.shortPosition.market
      )

      if (currentFunding < -config.minFundingRate) {
        // Funding flipped, consider closing
        await this.notifyFundingChange(position, currentFunding)
      }

      // Check liquidation risk
      const longHealth = position.longPosition.healthFactor
      if (longHealth < config.minHealthFactor) {
        await this.handleLowHealth(position)
      }
    }, config.checkInterval || 60000)
  }
}
```

## Best Practices

1. **Use flash loans** for gas-efficient leverage building
2. **Monitor health factor** continuously
3. **Calculate max leverage** based on LTV before attempting
4. **Implement delta hedging** for market-neutral strategies
5. **Set automatic deleveraging** triggers

## Related Skills

- [Lending Protocol Agent](./lending-protocol-agent.md) - Lending operations
- [Perpetuals Agent](./perpetuals-agent.md) - Perpetual trading
- [Flash Loan Agent](./flash-loan-agent.md) - Flash loan operations
