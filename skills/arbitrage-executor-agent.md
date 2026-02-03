# Arbitrage Executor Agent Skill

> **⚠️ Prerequisites**: Complete [SDK Setup](./00-sdk-setup.md) first to configure your environment.

Build agents that identify and execute cross-chain and cross-DEX arbitrage opportunities.

## Overview

Arbitrage Executor enables automated detection and execution of price discrepancies across chains, DEXs, and trading pairs. Essential for market efficiency, MEV capture, and profit generation.

## SDK Reference

```typescript
import { Demos } from "@kynesyslabs/demosdk/websdk"
import { EVM } from "@kynesyslabs/demosdk/xm-websdk"
import { DemosWork, BaseOperation } from "@kynesyslabs/demoswork"

// Multi-chain arbitrage with DemosWork
const work = new DemosWork()
work.push(buyOperation)
work.push(sellOperation)
```

## Agent Use Cases

### 1. Cross-DEX Arbitrage Scanner

Find price differences across DEXs on same chain:

```typescript
class CrossDexArbitrageScanner {
  private demos: Demos
  private dexes: DEXConfig[] = []
  private minProfitBps: number = 30 // 0.3% minimum profit

  async scanOpportunities(
    tokenPair: TokenPair
  ): Promise<ArbitrageOpportunity[]> {
    const opportunities: ArbitrageOpportunity[] = []

    // Get prices from all DEXs
    const prices = await Promise.all(
      this.dexes.map(dex => this.getPrice(dex, tokenPair))
    )

    // Find arbitrage opportunities
    for (let i = 0; i < prices.length; i++) {
      for (let j = 0; j < prices.length; j++) {
        if (i === j) continue

        const buyPrice = prices[i].price
        const sellPrice = prices[j].price
        const profitBps = ((sellPrice - buyPrice) / buyPrice) * 10000

        if (profitBps > this.minProfitBps) {
          const gasEstimate = await this.estimateGas(
            this.dexes[i],
            this.dexes[j],
            tokenPair
          )

          const netProfit = this.calculateNetProfit(
            profitBps,
            gasEstimate,
            tokenPair.amount
          )

          if (netProfit > 0) {
            opportunities.push({
              buyDex: this.dexes[i],
              sellDex: this.dexes[j],
              tokenPair,
              buyPrice,
              sellPrice,
              profitBps,
              gasEstimate,
              netProfit
            })
          }
        }
      }
    }

    return opportunities.sort((a, b) => b.netProfit - a.netProfit)
  }

  async executeArbitrage(opp: ArbitrageOpportunity): Promise<TxResult> {
    // Atomic execution using flash loan or own capital
    const work = new DemosWork()

    // Step 1: Buy on cheaper DEX
    work.push(new BaseOperation({
      context: "xm",
      content: await this.prepareBuyTx(opp.buyDex, opp.tokenPair),
      critical: true
    }))

    // Step 2: Sell on expensive DEX
    work.push(new BaseOperation({
      context: "xm",
      content: await this.prepareSellTx(opp.sellDex, opp.tokenPair),
      critical: true
    }))

    return await this.demos.executeWork(work)
  }
}
```

### 2. Cross-Chain Arbitrage

Exploit price differences across chains:

```typescript
class CrossChainArbitrageAgent {
  private chains: ChainConfig[] = []
  private bridgeService: BridgeService

  async findCrossChainOpportunity(
    token: string
  ): Promise<CrossChainArbitrage | null> {
    // Get token prices on all chains
    const chainPrices = await Promise.all(
      this.chains.map(async chain => ({
        chain,
        price: await this.getTokenPrice(chain, token),
        liquidity: await this.getLiquidity(chain, token)
      }))
    )

    // Find best buy and sell chains
    const sorted = chainPrices.sort((a, b) => a.price - b.price)
    const buyChain = sorted[0]
    const sellChain = sorted[sorted.length - 1]

    const priceDiff = (sellChain.price - buyChain.price) / buyChain.price

    // Calculate bridge costs
    const bridgeCost = await this.bridgeService.estimateCost(
      buyChain.chain,
      sellChain.chain,
      token
    )

    const netProfit = priceDiff - bridgeCost.percentage

    if (netProfit > 0.005) { // 0.5% minimum
      return {
        buyChain: buyChain.chain,
        sellChain: sellChain.chain,
        token,
        buyPrice: buyChain.price,
        sellPrice: sellChain.price,
        bridgeCost,
        netProfit,
        maxSize: Math.min(buyChain.liquidity, sellChain.liquidity)
      }
    }

    return null
  }

  async executeCrossChainArbitrage(
    opp: CrossChainArbitrage
  ): Promise<ExecutionResult> {
    const work = new DemosWork()

    // Buy on source chain
    const buyTx = await this.prepareBuy(opp.buyChain, opp.token, opp.maxSize)
    work.push(new BaseOperation({
      context: "xm",
      content: buyTx,
      critical: true
    }))

    // Bridge to destination
    const bridgeTx = await this.bridgeService.prepareBridge(
      opp.buyChain,
      opp.sellChain,
      opp.token,
      opp.maxSize
    )
    work.push(new BaseOperation({
      context: "xm",
      content: bridgeTx,
      critical: true
    }))

    // Sell on destination chain
    const sellTx = await this.prepareSell(opp.sellChain, opp.token, opp.maxSize)
    work.push(new BaseOperation({
      context: "xm",
      content: sellTx,
      critical: true
    }))

    return await this.demos.executeWork(work)
  }
}
```

### 3. Triangular Arbitrage

Exploit inefficiencies in trading pairs:

```typescript
class TriangularArbitrageAgent {
  async findTriangularOpportunity(
    baseToken: string,
    dex: DEXConfig
  ): Promise<TriangularArbitrage | null> {
    // Get all trading pairs involving base token
    const pairs = await this.getTradingPairs(dex, baseToken)

    // Find triangular paths: A -> B -> C -> A
    for (const pairAB of pairs) {
      for (const pairBC of pairs) {
        if (pairAB.quote !== pairBC.base) continue

        const pairCA = pairs.find(
          p => p.base === pairBC.quote && p.quote === baseToken
        )
        if (!pairCA) continue

        // Calculate profit
        const startAmount = 1
        const afterAB = startAmount * pairAB.price
        const afterBC = afterAB * pairBC.price
        const afterCA = afterBC * pairCA.price

        const profit = (afterCA - startAmount) / startAmount

        if (profit > 0.003) { // 0.3% profit threshold
          return {
            path: [pairAB, pairBC, pairCA],
            profit,
            optimalSize: await this.calculateOptimalSize(
              [pairAB, pairBC, pairCA],
              profit
            )
          }
        }
      }
    }

    return null
  }

  async executeTriangular(opp: TriangularArbitrage): Promise<TxResult> {
    // Execute all three swaps atomically
    const swapData = await this.encodeMultiSwap(opp.path, opp.optimalSize)

    return await this.evm.executeMulticall(swapData)
  }
}
```

## Best Practices

1. **Account for all costs** including gas, slippage, and bridge fees
2. **Use flash loans** for capital-efficient execution
3. **Monitor mempool** to avoid front-running
4. **Implement rate limiting** to avoid detection
5. **Diversify across opportunities** to reduce risk

## Related Skills

- [Flash Loan Agent](./flash-loan-agent.md) - Capital efficiency
- [MEV Protection](./mev-protection-agent.md) - Front-running protection
- [Cross-Chain Bridge](./crosschain-bridge-agent.md) - Bridging
