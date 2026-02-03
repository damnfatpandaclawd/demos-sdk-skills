# Flash Loan Agent Skill

> **⚠️ Prerequisites**: Complete [SDK Setup](./00-sdk-setup.md) first to configure your environment.

Build agents that execute flash loan strategies for capital-efficient operations.

## Overview

Flash Loan Agent enables uncollateralized borrowing within single transactions for arbitrage, liquidations, and collateral swaps. Essential for capital-efficient DeFi operations.

## SDK Reference

```typescript
import { DemosWork, BaseOperation, WorkStep } from "@kynesyslabs/demoswork"
import { EVM } from "@kynesyslabs/demosdk/xm-websdk"

// Flash loans require atomic execution
const work = new DemosWork()
work.push(borrowOperation)
work.push(useOperation)
work.push(repayOperation)
```

## Agent Use Cases

### 1. Flash Loan Executor

Execute flash loan strategies:

```typescript
class FlashLoanExecutor {
  private demos: Demos
  private supportedProtocols: FlashLoanProtocol[] = [
    { name: "aave", fee: 0.0009 },  // 0.09%
    { name: "dydx", fee: 0 },       // Free
    { name: "uniswap", fee: 0.0005 } // 0.05%
  ]

  async executeFlashLoan(
    strategy: FlashLoanStrategy
  ): Promise<FlashLoanResult> {
    // Select best protocol based on fees and liquidity
    const protocol = await this.selectProtocol(
      strategy.token,
      strategy.amount
    )

    if (!protocol) {
      throw new Error("No protocol has sufficient liquidity")
    }

    // Build flash loan transaction
    const calldata = await this.buildFlashLoanCalldata(
      protocol,
      strategy
    )

    // Simulate to verify profitability
    const simulation = await this.simulate(calldata)

    if (!simulation.profitable) {
      return {
        success: false,
        reason: "Strategy not profitable after fees",
        expectedProfit: simulation.profit
      }
    }

    // Execute
    const tx = await this.evm.sendTransaction(calldata)
    const receipt = await tx.wait()

    return {
      success: true,
      txHash: receipt.transactionHash,
      profit: this.extractProfit(receipt),
      gasUsed: receipt.gasUsed,
      protocol: protocol.name
    }
  }

  private async selectProtocol(
    token: string,
    amount: bigint
  ): Promise<FlashLoanProtocol | null> {
    const available = await Promise.all(
      this.supportedProtocols.map(async p => ({
        protocol: p,
        liquidity: await this.getProtocolLiquidity(p, token)
      }))
    )

    // Sort by fee (ascending), then liquidity (descending)
    const suitable = available
      .filter(p => p.liquidity >= amount)
      .sort((a, b) => {
        if (a.protocol.fee !== b.protocol.fee) {
          return a.protocol.fee - b.protocol.fee
        }
        return Number(b.liquidity - a.liquidity)
      })

    return suitable[0]?.protocol || null
  }

  private async buildFlashLoanCalldata(
    protocol: FlashLoanProtocol,
    strategy: FlashLoanStrategy
  ): Promise<TransactionData> {
    const encoder = new ethers.AbiCoder()

    // Encode the callback data for the strategy
    const callbackData = encoder.encode(
      ["address[]", "bytes[]"],
      [strategy.targets, strategy.calldatas]
    )

    switch (protocol.name) {
      case "aave":
        return this.buildAaveFlashLoan(strategy, callbackData)
      case "uniswap":
        return this.buildUniswapFlashSwap(strategy, callbackData)
      default:
        throw new Error(`Unsupported protocol: ${protocol.name}`)
    }
  }
}
```

### 2. Arbitrage Flash Loan Agent

Use flash loans for arbitrage:

```typescript
class ArbitrageFlashLoanAgent {
  private flashLoan: FlashLoanExecutor
  private arbitrageScanner: ArbitrageScanner

  async findAndExecuteArbitrage(): Promise<ArbitrageResult | null> {
    // Scan for opportunities
    const opportunities = await this.arbitrageScanner.scan()

    for (const opp of opportunities) {
      // Calculate required capital
      const requiredCapital = this.calculateCapital(opp)

      // Build arbitrage strategy
      const strategy: FlashLoanStrategy = {
        token: opp.baseToken,
        amount: requiredCapital,
        targets: [],
        calldatas: []
      }

      // Step 1: Buy on cheaper DEX
      const buyCalldata = await this.buildSwapCalldata(
        opp.buyDex,
        opp.baseToken,
        opp.quoteToken,
        requiredCapital
      )
      strategy.targets.push(opp.buyDex.router)
      strategy.calldatas.push(buyCalldata)

      // Step 2: Sell on expensive DEX
      const sellCalldata = await this.buildSwapCalldata(
        opp.sellDex,
        opp.quoteToken,
        opp.baseToken,
        opp.expectedOutput
      )
      strategy.targets.push(opp.sellDex.router)
      strategy.calldatas.push(sellCalldata)

      // Execute flash loan arbitrage
      const result = await this.flashLoan.executeFlashLoan(strategy)

      if (result.success) {
        return {
          ...result,
          opportunity: opp
        }
      }
    }

    return null
  }

  private calculateCapital(opp: ArbitrageOpportunity): bigint {
    // Calculate optimal trade size based on liquidity
    const buyLiquidity = opp.buyDex.liquidity
    const sellLiquidity = opp.sellDex.liquidity

    // Use 10% of smaller liquidity pool
    return (buyLiquidity < sellLiquidity ? buyLiquidity : sellLiquidity) / 10n
  }
}
```

### 3. Liquidation Flash Loan Agent

Use flash loans for liquidations:

```typescript
class LiquidationFlashLoanAgent {
  private flashLoan: FlashLoanExecutor
  private lendingProtocol: LendingProtocol

  async monitorAndLiquidate(): Promise<void> {
    // Subscribe to unhealthy positions
    await this.lendingProtocol.subscribeToUnhealthy(async position => {
      const profit = await this.calculateLiquidationProfit(position)

      if (profit > 0n) {
        await this.executeLiquidation(position)
      }
    })
  }

  async executeLiquidation(
    position: UnhealthyPosition
  ): Promise<LiquidationResult> {
    // Calculate debt to repay
    const debtToRepay = position.debt * position.closeFactor / 10000n

    // Build liquidation strategy
    const strategy: FlashLoanStrategy = {
      token: position.debtToken,
      amount: debtToRepay,
      targets: [],
      calldatas: []
    }

    // Step 1: Approve debt token to lending protocol
    const approveCalldata = this.encodeApprove(
      position.debtToken,
      this.lendingProtocol.address,
      debtToRepay
    )
    strategy.targets.push(position.debtToken)
    strategy.calldatas.push(approveCalldata)

    // Step 2: Liquidate position
    const liquidateCalldata = this.encodeLiquidate(
      position.borrower,
      position.debtToken,
      position.collateralToken,
      debtToRepay
    )
    strategy.targets.push(this.lendingProtocol.address)
    strategy.calldatas.push(liquidateCalldata)

    // Step 3: Swap collateral to debt token to repay flash loan
    const swapCalldata = await this.encodeSwap(
      position.collateralToken,
      position.debtToken,
      position.collateralReceived
    )
    strategy.targets.push(this.dex.router)
    strategy.calldatas.push(swapCalldata)

    // Execute
    return await this.flashLoan.executeFlashLoan(strategy)
  }

  private async calculateLiquidationProfit(
    position: UnhealthyPosition
  ): Promise<bigint> {
    const debtToRepay = position.debt * position.closeFactor / 10000n
    const collateralReceived = debtToRepay * position.liquidationBonus / 10000n

    // Convert collateral value to debt token
    const collateralValue = await this.getTokenValue(
      position.collateralToken,
      collateralReceived,
      position.debtToken
    )

    // Subtract flash loan fee and gas
    const flashFee = debtToRepay * 9n / 10000n // 0.09% Aave fee
    const gasEstimate = await this.estimateGas()

    return collateralValue - debtToRepay - flashFee - gasEstimate
  }
}
```

## Best Practices

1. **Simulate transactions** before execution to verify profitability
2. **Account for all fees** including flash loan, gas, and DEX fees
3. **Use lowest fee protocol** with sufficient liquidity
4. **Implement proper error handling** for reverts
5. **Monitor gas prices** to ensure profitability

## Related Skills

- [Arbitrage Executor](./arbitrage-executor-agent.md) - Arbitrage strategies
- [Liquidation Agent](./liquidation-agent.md) - Liquidation monitoring
- [DEX Integration](./dex-integration-agent.md) - DEX swaps
