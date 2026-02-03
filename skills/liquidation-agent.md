# Liquidation Agent Skill

> **⚠️ Prerequisites**: Complete [SDK Setup](./00-sdk-setup.md) first to configure your environment.

Build agents that execute liquidations on DeFi lending protocols.

## Overview

Liquidation Agent enables profitable liquidation execution, position monitoring, and MEV-aware liquidation strategies. Essential for protocol health, arbitrage opportunities, and capital efficiency in lending markets.

## SDK Reference

```typescript
import { Demos } from "@kynesyslabs/demosdk/websdk"
import { EVM } from "@kynesyslabs/demosdk/xm-websdk"
import { DemosWork, BaseOperation } from "@kynesyslabs/demoswork"

// Liquidation operations
const evm = await EVM.create("https://rpc.ankr.com/eth")
```

## Agent Use Cases

### 1. Liquidation Opportunity Scanner

Scan for profitable liquidation opportunities:

```typescript
class LiquidationScanner {
  private protocols: Map<string, LendingProtocol> = new Map()
  private opportunities: Map<string, LiquidationOpportunity> = new Map()

  async scanForLiquidations(): Promise<LiquidationOpportunity[]> {
    const allOpportunities: LiquidationOpportunity[] = []

    for (const [protocolName, protocol] of this.protocols) {
      const atRisk = await protocol.getAtRiskPositions()

      for (const position of atRisk) {
        const opportunity = await this.analyzeOpportunity(
          protocolName,
          protocol,
          position
        )

        if (opportunity.profitable) {
          allOpportunities.push(opportunity)
          this.opportunities.set(opportunity.id, opportunity)
        }
      }
    }

    return allOpportunities.sort((a, b) =>
      Number(b.expectedProfit - a.expectedProfit)
    )
  }

  private async analyzeOpportunity(
    protocolName: string,
    protocol: LendingProtocol,
    position: AtRiskPosition
  ): Promise<LiquidationOpportunity> {
    const healthFactor = position.healthFactor
    const liquidatable = healthFactor < 1.0

    if (!liquidatable) {
      return { id: position.id, profitable: false, reason: "Not liquidatable yet" }
    }

    // Get liquidation params
    const [
      liquidationBonus,
      closeFactor,
      debtPrice,
      collateralPrice,
      gasPrice
    ] = await Promise.all([
      protocol.getLiquidationBonus(position.collateralAsset),
      protocol.getCloseFactor(),
      this.getPrice(position.debtAsset),
      this.getPrice(position.collateralAsset),
      this.getGasPrice()
    ])

    // Calculate max liquidatable amount
    const maxRepay = (position.debtAmount * BigInt(Math.floor(closeFactor * 10000))) / 10000n

    // Calculate collateral received
    const collateralValue = (maxRepay * debtPrice) / collateralPrice
    const bonusCollateral = (collateralValue * BigInt(Math.floor(liquidationBonus * 10000))) / 10000n
    const totalCollateral = collateralValue + bonusCollateral

    // Estimate gas cost
    const estimatedGas = await this.estimateLiquidationGas(protocol, position)
    const gasCost = estimatedGas * gasPrice

    // Calculate profit
    const grossProfit = bonusCollateral * collateralPrice / BigInt(1e18)
    const netProfit = grossProfit - gasCost

    // Check DEX liquidity for selling collateral
    const dexLiquidity = await this.checkDEXLiquidity(
      position.collateralAsset,
      totalCollateral
    )

    // Estimate slippage
    const expectedSlippage = this.estimateSlippage(totalCollateral, dexLiquidity)
    const slippageCost = (grossProfit * BigInt(Math.floor(expectedSlippage * 10000))) / 10000n

    const finalProfit = netProfit - slippageCost

    return {
      id: this.generateOpportunityId(protocolName, position.id),
      protocol: protocolName,
      position,
      debtAsset: position.debtAsset,
      collateralAsset: position.collateralAsset,
      debtToRepay: maxRepay,
      collateralToReceive: totalCollateral,
      liquidationBonus,
      grossProfit,
      gasCost,
      slippageCost,
      netProfit: finalProfit,
      profitable: finalProfit > 0n,
      healthFactor,
      timestamp: Date.now()
    }
  }

  async monitorNewOpportunities(callback: (opp: LiquidationOpportunity) => void): Promise<void> {
    // Subscribe to price oracle updates
    this.subscribeToOracleUpdates(async (priceUpdate) => {
      // Check if any positions became liquidatable
      const affected = await this.getPositionsAffectedByPrice(priceUpdate)

      for (const position of affected) {
        const protocol = this.protocols.get(position.protocol)!
        const opportunity = await this.analyzeOpportunity(
          position.protocol,
          protocol,
          position
        )

        if (opportunity.profitable && !this.opportunities.has(opportunity.id)) {
          this.opportunities.set(opportunity.id, opportunity)
          callback(opportunity)
        }
      }
    })
  }
}
```

### 2. Flash Liquidation Executor

Execute liquidations using flash loans:

```typescript
class FlashLiquidationExecutor {
  private scanner: LiquidationScanner
  private flashLoanProviders: FlashLoanProvider[]

  async executeLiquidation(
    opportunity: LiquidationOpportunity
  ): Promise<LiquidationResult> {
    // Find best flash loan source
    const flashLoan = await this.findBestFlashLoan(
      opportunity.debtAsset,
      opportunity.debtToRepay
    )

    if (!flashLoan) {
      throw new Error("No flash loan available")
    }

    // Build liquidation transaction
    const liquidationTx = await this.buildLiquidationTx(opportunity, flashLoan)

    // Simulate first
    const simulation = await this.simulate(liquidationTx)

    if (!simulation.success) {
      throw new Error(`Simulation failed: ${simulation.error}`)
    }

    // Execute with MEV protection
    const result = await this.executeWithMEVProtection(liquidationTx)

    return {
      success: true,
      opportunity,
      txHash: result.hash,
      actualProfit: result.profit,
      gasUsed: result.gasUsed
    }
  }

  private async buildLiquidationTx(
    opportunity: LiquidationOpportunity,
    flashLoan: FlashLoanQuote
  ): Promise<LiquidationTransaction> {
    const steps: TransactionStep[] = []

    // Step 1: Take flash loan
    steps.push({
      protocol: flashLoan.provider,
      action: "flashLoan",
      params: {
        asset: opportunity.debtAsset,
        amount: opportunity.debtToRepay
      }
    })

    // Step 2: Approve spending
    steps.push({
      protocol: opportunity.protocol,
      action: "approve",
      params: {
        asset: opportunity.debtAsset,
        spender: opportunity.protocol,
        amount: opportunity.debtToRepay
      }
    })

    // Step 3: Execute liquidation
    steps.push({
      protocol: opportunity.protocol,
      action: "liquidate",
      params: {
        borrower: opportunity.position.owner,
        debtAsset: opportunity.debtAsset,
        collateralAsset: opportunity.collateralAsset,
        debtAmount: opportunity.debtToRepay
      }
    })

    // Step 4: Swap collateral for debt asset
    steps.push({
      protocol: "dex",
      action: "swap",
      params: {
        tokenIn: opportunity.collateralAsset,
        tokenOut: opportunity.debtAsset,
        amountIn: opportunity.collateralToReceive,
        minAmountOut: flashLoan.amount + flashLoan.fee
      }
    })

    // Step 5: Repay flash loan
    steps.push({
      protocol: flashLoan.provider,
      action: "repayFlashLoan",
      params: {
        asset: opportunity.debtAsset,
        amount: flashLoan.amount + flashLoan.fee
      }
    })

    // Step 6: Collect profit (remaining tokens after repay)
    steps.push({
      protocol: "self",
      action: "collectProfit",
      params: {
        asset: opportunity.debtAsset
      }
    })

    return {
      steps,
      expectedProfit: opportunity.netProfit,
      deadline: Date.now() + 60000 // 1 minute
    }
  }

  private async executeWithMEVProtection(
    tx: LiquidationTransaction
  ): Promise<ExecutionResult> {
    // Try Flashbots first
    try {
      const bundle = await this.buildFlashbotsBundle(tx)
      const result = await this.submitToFlashbots(bundle)

      if (result.success) {
        return result
      }
    } catch {
      // Fallback to regular execution
    }

    // Try private mempool
    try {
      const result = await this.submitToPrivateMempool(tx)
      if (result.success) {
        return result
      }
    } catch {
      // Fallback to public
    }

    // Last resort: public mempool with high gas
    return await this.submitPublic(tx, { gasMultiplier: 1.5 })
  }

  async batchLiquidations(
    opportunities: LiquidationOpportunity[]
  ): Promise<BatchResult> {
    // Group by debt asset
    const grouped = this.groupByDebtAsset(opportunities)
    const results: LiquidationResult[] = []

    for (const [debtAsset, opps] of grouped) {
      // Get single flash loan for all
      const totalDebt = opps.reduce((sum, o) => sum + o.debtToRepay, 0n)
      const flashLoan = await this.findBestFlashLoan(debtAsset, totalDebt)

      if (!flashLoan) continue

      // Execute batch
      const batchTx = await this.buildBatchLiquidationTx(opps, flashLoan)
      const result = await this.executeWithMEVProtection(batchTx)

      for (const opp of opps) {
        results.push({
          success: true,
          opportunity: opp,
          txHash: result.hash,
          actualProfit: result.profit / BigInt(opps.length), // Approximate split
          gasUsed: result.gasUsed / BigInt(opps.length)
        })
      }
    }

    return {
      total: opportunities.length,
      successful: results.filter(r => r.success).length,
      totalProfit: results.reduce((sum, r) => sum + (r.actualProfit || 0n), 0n),
      results
    }
  }
}
```

### 3. Self-Liquidation Protector

Help users self-liquidate to minimize losses:

```typescript
class SelfLiquidationProtector {
  async analyzeSelfLiquidation(
    position: UserPosition
  ): Promise<SelfLiquidationAnalysis> {
    if (position.healthFactor >= 1.0) {
      return {
        recommended: false,
        reason: "Position is healthy"
      }
    }

    // Calculate external liquidation cost
    const externalCost = await this.calculateExternalLiquidationCost(position)

    // Calculate self-liquidation cost
    const selfCost = await this.calculateSelfLiquidationCost(position)

    // Calculate partial repay option
    const partialRepay = await this.calculatePartialRepayOption(position)

    // Calculate collateral swap option
    const collateralSwap = await this.calculateCollateralSwapOption(position)

    const options: ProtectionOption[] = [
      {
        type: "self_liquidation",
        cost: selfCost,
        resultingHealth: 0, // Position closed
        description: "Close position yourself"
      },
      {
        type: "partial_repay",
        cost: partialRepay.cost,
        resultingHealth: partialRepay.newHealth,
        description: "Repay enough to become healthy"
      },
      {
        type: "collateral_swap",
        cost: collateralSwap.cost,
        resultingHealth: collateralSwap.newHealth,
        description: "Swap to less volatile collateral"
      },
      {
        type: "wait_liquidation",
        cost: externalCost,
        resultingHealth: 0,
        description: "Let external liquidator handle"
      }
    ]

    const best = options.sort((a, b) => Number(a.cost - b.cost))[0]

    return {
      recommended: true,
      currentHealth: position.healthFactor,
      options,
      bestOption: best,
      savings: externalCost - best.cost
    }
  }

  async executeSelfLiquidation(
    position: UserPosition,
    option: ProtectionOption
  ): Promise<SelfLiquidationResult> {
    switch (option.type) {
      case "self_liquidation":
        return await this.closePosition(position)

      case "partial_repay":
        return await this.executePartialRepay(position)

      case "collateral_swap":
        return await this.executeCollateralSwap(position)

      default:
        throw new Error("Invalid option")
    }
  }

  private async closePosition(position: UserPosition): Promise<SelfLiquidationResult> {
    // Flash loan to repay all debt
    const flashLoan = await this.getFlashLoan(position.debtAsset, position.debtAmount)

    try {
      // Repay debt
      await this.protocol.repay(position.debtAsset, position.debtAmount)

      // Withdraw all collateral
      const collateral = await this.protocol.withdrawAll()

      // Swap collateral to repay flash loan
      const swapResult = await this.swap(
        position.collateralAsset,
        position.debtAsset,
        collateral
      )

      // Repay flash loan
      await this.repayFlashLoan(flashLoan)

      // Calculate remaining
      const remaining = swapResult.amountOut - flashLoan.amount - flashLoan.fee

      return {
        success: true,
        positionClosed: true,
        recovered: remaining,
        cost: position.collateralValue - remaining
      }
    } catch (error) {
      throw error
    }
  }

  private async calculateExternalLiquidationCost(
    position: UserPosition
  ): Promise<bigint> {
    const liquidationBonus = await this.protocol.getLiquidationBonus(
      position.collateralAsset
    )
    const closeFactor = await this.protocol.getCloseFactor()

    // External liquidator takes bonus
    const maxLiquidatable = (position.debtAmount * BigInt(Math.floor(closeFactor * 10000))) / 10000n
    const collateralLost = (maxLiquidatable * BigInt(Math.floor((1 + liquidationBonus) * 10000))) / 10000n

    return collateralLost - maxLiquidatable
  }
}
```

## Best Practices

1. **Use flash loans** for capital-efficient liquidations
2. **Simulate transactions** before execution
3. **Implement MEV protection** (Flashbots, private mempools)
4. **Batch liquidations** when possible
5. **Monitor gas prices** for profitability calculations

## Related Skills

- [Lending Protocol Agent](./lending-protocol-agent.md) - Lending operations
- [Flash Loan Agent](./flash-loan-agent.md) - Flash loan execution
- [MEV Protection Agent](./mev-protection-agent.md) - MEV strategies
