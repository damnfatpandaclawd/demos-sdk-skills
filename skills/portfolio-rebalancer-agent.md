# Portfolio Rebalancer Agent Skill

> **⚠️ Prerequisites**: Complete [SDK Setup](./00-sdk-setup.md) first to configure your environment.

Build agents that automatically rebalance portfolios to target allocations.

## Overview

Portfolio Rebalancer enables automated portfolio management with threshold-based rebalancing, tax-aware strategies, and multi-chain support. Essential for asset managers and DeFi users.

## SDK Reference

```typescript
import { Demos } from "@kynesyslabs/demosdk/websdk"
import { EVM } from "@kynesyslabs/demosdk/xm-websdk"
import { DemosWork, BaseOperation } from "@kynesyslabs/demoswork"

// Multi-chain portfolio with XM SDK
```

## Agent Use Cases

### 1. Threshold-Based Rebalancer

Rebalance when allocations drift beyond thresholds:

```typescript
class ThresholdRebalancer {
  private demos: Demos
  private targetAllocations: Map<string, number> = new Map()
  private rebalanceThreshold: number = 0.05 // 5% drift

  async setTargetAllocation(allocations: TokenAllocation[]): Promise<void> {
    // Validate allocations sum to 1
    const total = allocations.reduce((sum, a) => sum + a.percentage, 0)
    if (Math.abs(total - 1) > 0.001) {
      throw new Error("Allocations must sum to 100%")
    }

    for (const allocation of allocations) {
      this.targetAllocations.set(allocation.token, allocation.percentage)
    }
  }

  async getCurrentAllocations(): Promise<Map<string, CurrentAllocation>> {
    const allocations = new Map<string, CurrentAllocation>()
    let totalValue = 0n

    // Get balances and values for all tokens
    for (const [token] of this.targetAllocations) {
      const balance = await this.getBalance(token)
      const price = await this.getPrice(token)
      const value = balance * price / 10n ** 18n

      allocations.set(token, { balance, price, value })
      totalValue += value
    }

    // Calculate percentages
    for (const [token, allocation] of allocations) {
      allocation.percentage = Number(allocation.value) / Number(totalValue)
    }

    return allocations
  }

  async checkRebalanceNeeded(): Promise<RebalanceAnalysis> {
    const current = await this.getCurrentAllocations()
    const trades: RebalanceTrade[] = []
    let maxDrift = 0

    for (const [token, target] of this.targetAllocations) {
      const currentAlloc = current.get(token)
      if (!currentAlloc) continue

      const drift = currentAlloc.percentage - target
      maxDrift = Math.max(maxDrift, Math.abs(drift))

      if (Math.abs(drift) > this.rebalanceThreshold) {
        trades.push({
          token,
          currentPercentage: currentAlloc.percentage,
          targetPercentage: target,
          drift,
          action: drift > 0 ? "sell" : "buy"
        })
      }
    }

    return {
      needsRebalance: maxDrift > this.rebalanceThreshold,
      maxDrift,
      trades
    }
  }

  async executeRebalance(): Promise<RebalanceResult> {
    const analysis = await this.checkRebalanceNeeded()

    if (!analysis.needsRebalance) {
      return { executed: false, reason: "Within threshold" }
    }

    const current = await this.getCurrentAllocations()
    const totalValue = Array.from(current.values())
      .reduce((sum, a) => sum + a.value, 0n)

    // Calculate trade amounts
    const trades: ExecutableTrade[] = []

    for (const trade of analysis.trades) {
      const currentAlloc = current.get(trade.token)!
      const targetValue = totalValue * BigInt(Math.floor(trade.targetPercentage * 10000)) / 10000n
      const currentValue = currentAlloc.value

      if (trade.action === "sell") {
        const sellValue = currentValue - targetValue
        const sellAmount = sellValue * 10n ** 18n / currentAlloc.price

        trades.push({
          action: "sell",
          token: trade.token,
          amount: sellAmount,
          value: sellValue
        })
      } else {
        const buyValue = targetValue - currentValue
        trades.push({
          action: "buy",
          token: trade.token,
          amount: buyValue * 10n ** 18n / currentAlloc.price,
          value: buyValue
        })
      }
    }

    // Execute trades: sell first, then buy
    const sellTrades = trades.filter(t => t.action === "sell")
    const buyTrades = trades.filter(t => t.action === "buy")

    const results: TradeResult[] = []

    for (const trade of [...sellTrades, ...buyTrades]) {
      const result = await this.executeTrade(trade)
      results.push(result)
    }

    return {
      executed: true,
      trades: results,
      newAllocations: await this.getCurrentAllocations()
    }
  }
}
```

### 2. Multi-Chain Rebalancer

Rebalance across multiple chains:

```typescript
class MultiChainRebalancer {
  private chains: Map<string, ChainConnection> = new Map()
  private targetAllocations: CrossChainAllocation[] = []

  async addChain(chainId: string, config: ChainConfig): Promise<void> {
    const evm = await EVM.create(config.rpcUrl)
    await evm.connectWallet(config.privateKey)

    this.chains.set(chainId, {
      evm,
      config,
      tokens: config.tokens
    })
  }

  async getCrossChainPortfolio(): Promise<CrossChainPortfolio> {
    const portfolio: CrossChainPortfolio = {
      chains: new Map(),
      totalValue: 0n
    }

    for (const [chainId, chain] of this.chains) {
      const chainPortfolio: ChainPortfolio = {
        tokens: new Map(),
        totalValue: 0n
      }

      for (const token of chain.tokens) {
        const balance = await this.getBalance(chain.evm, token)
        const price = await this.getPrice(chainId, token)
        const value = balance * price / 10n ** 18n

        chainPortfolio.tokens.set(token, { balance, price, value })
        chainPortfolio.totalValue += value
      }

      portfolio.chains.set(chainId, chainPortfolio)
      portfolio.totalValue += chainPortfolio.totalValue
    }

    return portfolio
  }

  async rebalanceCrossChain(): Promise<CrossChainRebalanceResult> {
    const portfolio = await this.getCrossChainPortfolio()
    const work = new DemosWork()

    // Calculate required moves
    const moves = this.calculateCrossChainMoves(portfolio)

    // Add bridge operations for cross-chain moves
    for (const move of moves.bridges) {
      const bridgeTx = await this.prepareBridge(
        move.fromChain,
        move.toChain,
        move.token,
        move.amount
      )

      work.push(new BaseOperation({
        context: "xm",
        content: bridgeTx,
        critical: true
      }))
    }

    // Add swap operations
    for (const swap of moves.swaps) {
      const swapTx = await this.prepareSwap(
        swap.chain,
        swap.tokenIn,
        swap.tokenOut,
        swap.amountIn
      )

      work.push(new BaseOperation({
        context: "xm",
        content: swapTx,
        critical: false
      }))
    }

    // Execute all operations
    const result = await this.demos.executeWork(work)

    return {
      success: result.success,
      bridges: moves.bridges.length,
      swaps: moves.swaps.length,
      newPortfolio: await this.getCrossChainPortfolio()
    }
  }

  private calculateCrossChainMoves(
    portfolio: CrossChainPortfolio
  ): CrossChainMoves {
    const moves: CrossChainMoves = {
      bridges: [],
      swaps: []
    }

    // Calculate current vs target for each chain/token
    for (const target of this.targetAllocations) {
      const chainPortfolio = portfolio.chains.get(target.chain)
      const currentValue = chainPortfolio?.tokens.get(target.token)?.value || 0n
      const targetValue = portfolio.totalValue *
        BigInt(Math.floor(target.percentage * 10000)) / 10000n

      const diff = targetValue - currentValue

      if (diff > 0n) {
        // Need more of this token on this chain
        // Find source (same token on different chain or different token to swap)
        const source = this.findSource(portfolio, target.token, diff)

        if (source.chain !== target.chain) {
          moves.bridges.push({
            fromChain: source.chain,
            toChain: target.chain,
            token: target.token,
            amount: diff
          })
        }

        if (source.token !== target.token) {
          moves.swaps.push({
            chain: target.chain,
            tokenIn: source.token,
            tokenOut: target.token,
            amountIn: diff
          })
        }
      }
    }

    return moves
  }
}
```

### 3. Tax-Aware Rebalancer

Minimize tax implications:

```typescript
class TaxAwareRebalancer {
  private costBasis: Map<string, CostBasisEntry[]> = new Map()
  private taxRates: TaxRates

  async rebalanceWithTaxOptimization(
    targetAllocations: TokenAllocation[]
  ): Promise<TaxAwareRebalanceResult> {
    const analysis = await this.analyzeRebalance(targetAllocations)

    // Calculate tax implications for each potential trade
    const tradesWithTax = await Promise.all(
      analysis.trades.map(async trade => ({
        ...trade,
        taxImplication: await this.calculateTaxImplication(trade)
      }))
    )

    // Prioritize trades with losses (tax loss harvesting)
    const sortedTrades = tradesWithTax.sort((a, b) => {
      // Losses first (negative tax impact is good)
      return a.taxImplication.netTax - b.taxImplication.netTax
    })

    // Filter out trades where tax cost exceeds benefit
    const optimalTrades = sortedTrades.filter(trade => {
      const rebalanceBenefit = this.estimateRebalanceBenefit(trade)
      return trade.taxImplication.netTax < rebalanceBenefit
    })

    // Execute optimal trades
    const results: TradeResult[] = []
    for (const trade of optimalTrades) {
      const result = await this.executeTrade(trade)
      results.push(result)

      // Update cost basis
      this.updateCostBasis(trade, result)
    }

    return {
      executed: optimalTrades.length,
      skippedForTax: sortedTrades.length - optimalTrades.length,
      totalTaxImpact: optimalTrades.reduce(
        (sum, t) => sum + t.taxImplication.netTax, 0
      ),
      trades: results
    }
  }

  private async calculateTaxImplication(trade: RebalanceTrade): Promise<TaxImplication> {
    if (trade.action === "buy") {
      return { gains: 0, losses: 0, netTax: 0 }
    }

    // Get cost basis for selling
    const entries = this.costBasis.get(trade.token) || []
    const currentPrice = await this.getPrice(trade.token)

    let totalGains = 0
    let totalLosses = 0
    let remainingToSell = trade.amount

    // FIFO cost basis calculation
    for (const entry of entries) {
      if (remainingToSell <= 0n) break

      const sellAmount = remainingToSell < entry.amount
        ? remainingToSell
        : entry.amount

      const costBasis = Number(sellAmount) * entry.price
      const proceeds = Number(sellAmount) * currentPrice

      const gainLoss = proceeds - costBasis

      if (gainLoss > 0) {
        // Determine short vs long term
        const holdingPeriod = Date.now() - entry.timestamp
        const isLongTerm = holdingPeriod > 365 * 24 * 60 * 60 * 1000

        totalGains += gainLoss * (isLongTerm
          ? this.taxRates.longTermCapitalGains
          : this.taxRates.shortTermCapitalGains
        )
      } else {
        totalLosses += Math.abs(gainLoss) * this.taxRates.capitalLossDeduction
      }

      remainingToSell -= sellAmount
    }

    return {
      gains: totalGains,
      losses: totalLosses,
      netTax: totalGains - totalLosses
    }
  }
}
```

## Best Practices

1. **Set appropriate thresholds** to avoid excessive trading
2. **Consider gas costs** when rebalancing small amounts
3. **Use TWAP** for large rebalance trades
4. **Track cost basis** for tax reporting
5. **Monitor slippage** during execution

## Related Skills

- [TWAP Executor](./twap-executor-agent.md) - Large order execution
- [Yield Optimization](./yield-optimization-agent.md) - Yield strategies
- [Tax-Loss Harvesting](./compliance-monitoring-agent.md) - Tax optimization
