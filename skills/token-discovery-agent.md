# Multi-Chain Token Discovery Agent Skill

> **⚠️ Prerequisites**: Complete [SDK Setup](./00-sdk-setup.md) first to configure your environment.

Build agents that discover and track tokens across multiple EVM chains using Demos Network's abstraction layer.

## Overview

Token Discovery enables agents to find wrapped token equivalents, track token pairs across chains, and manage multi-chain portfolios - essential for arbitrage, portfolio management, and cross-chain operations.

## SDK Reference

```typescript
import { EvmCoinFinder } from "@kynesyslabs/demosdk/abstraction"

const finder = new EvmCoinFinder()

// Token Discovery Methods
EvmCoinFinder.findNativeEth(targetChainIds)     // Find ETH/WETH on chains
EvmCoinFinder.findWrappedAssets(targetChainIds) // Find wrapped versions
EvmCoinFinder.findTokenPairs(tokenAddress, sourceChainId, targetChainIds)
EvmCoinFinder.getNativeForSupportedChain(chain, targetChainId)
EvmCoinFinder.validateChainId(chainId)

// Returns EvmTokenPair: { native: string, wrapped: string }
```

## Supported Chains

| Chain | Chain ID | Native |
|-------|----------|--------|
| Ethereum | 1 | ETH |
| Polygon | 137 | MATIC |
| Arbitrum | 42161 | ETH |
| Optimism | 10 | ETH |
| Base | 8453 | ETH |
| BSC | 56 | BNB |
| Avalanche | 43114 | AVAX |

## Agent Use Cases

### 1. Cross-Chain Arbitrage Scanner

Detect price discrepancies across chains:

```typescript
class ArbitrageScannerAgent {
  private finder: EvmCoinFinder
  private priceFeeds: Map<number, PriceFeed>

  async scanArbitrageOpportunities(
    tokenAddress: string,
    sourceChainId: number
  ): Promise<ArbitrageOpportunity[]> {
    // Find token on all supported chains
    const targetChains = [1, 137, 42161, 10, 8453, 56, 43114]
    const tokenPairs = await EvmCoinFinder.findTokenPairs(
      tokenAddress,
      sourceChainId,
      targetChains
    )

    // Get prices from each chain
    const prices = await Promise.all(
      Object.entries(tokenPairs).map(async ([chainId, pair]) => {
        const price = await this.getPrice(parseInt(chainId), pair.wrapped)
        return {
          chainId: parseInt(chainId),
          address: pair.wrapped,
          price
        }
      })
    )

    // Find arbitrage opportunities
    const opportunities: ArbitrageOpportunity[] = []

    for (let i = 0; i < prices.length; i++) {
      for (let j = i + 1; j < prices.length; j++) {
        const spread = Math.abs(prices[i].price - prices[j].price) / prices[i].price

        if (spread > 0.005) { // 0.5% minimum spread
          opportunities.push({
            buyChain: prices[i].price < prices[j].price ? prices[i].chainId : prices[j].chainId,
            sellChain: prices[i].price < prices[j].price ? prices[j].chainId : prices[i].chainId,
            spread: spread * 100,
            estimatedProfit: this.calculateProfit(spread, prices[i], prices[j]),
            tokenPairs: {
              buy: tokenPairs[prices[i].chainId < prices[j].price ? i : j],
              sell: tokenPairs[prices[i].chainId < prices[j].price ? j : i]
            }
          })
        }
      }
    }

    return opportunities.sort((a, b) => b.estimatedProfit - a.estimatedProfit)
  }

  async executeArbitrage(opportunity: ArbitrageOpportunity, amount: bigint) {
    // Buy on cheaper chain
    const buyTx = await this.executeBuy(
      opportunity.buyChain,
      opportunity.tokenPairs.buy.wrapped,
      amount
    )

    // Bridge to sell chain (via Demos Native Bridge)
    const bridgeTx = await this.bridgeTokens(
      opportunity.buyChain,
      opportunity.sellChain,
      amount
    )

    // Sell on more expensive chain
    const sellTx = await this.executeSell(
      opportunity.sellChain,
      opportunity.tokenPairs.sell.wrapped,
      amount
    )

    return {
      buyTx,
      bridgeTx,
      sellTx,
      actualProfit: this.calculateActualProfit(buyTx, bridgeTx, sellTx)
    }
  }
}
```

### 2. Portfolio Tracker Agent

Track portfolio value across all chains:

```typescript
class PortfolioTrackerAgent {
  private demos: Demos

  async trackPortfolio(
    addresses: { chain: string; address: string }[]
  ): Promise<Portfolio> {
    // Discover all tokens on all chains
    const holdings: Holding[] = []

    for (const { chain, address } of addresses) {
      const chainHoldings = await this.discoverHoldings(chain, address)
      holdings.push(...chainHoldings)
    }

    // Find wrapped equivalents to consolidate
    const consolidated = await this.consolidateHoldings(holdings)

    // Calculate total value
    const totalValue = await this.calculateTotalValue(consolidated)

    return {
      holdings: consolidated,
      totalValue,
      byChain: this.groupByChain(consolidated),
      byAsset: this.groupByAsset(consolidated)
    }
  }

  private async discoverHoldings(
    chain: string,
    address: string
  ): Promise<Holding[]> {
    const chainId = this.getChainId(chain)

    // Get native balance
    const nativeBalance = await this.getNativeBalance(chainId, address)
    const nativePairs = await EvmCoinFinder.findNativeEth([chainId])

    const holdings: Holding[] = [{
      chain,
      chainId,
      token: "native",
      address: nativePairs[chainId].native,
      balance: nativeBalance,
      isNative: true
    }]

    // Get ERC20 balances
    const erc20Tokens = await this.getERC20Tokens(chainId, address)

    for (const token of erc20Tokens) {
      holdings.push({
        chain,
        chainId,
        token: token.symbol,
        address: token.address,
        balance: token.balance,
        decimals: token.decimals,
        isNative: false
      })
    }

    return holdings
  }

  private async consolidateHoldings(holdings: Holding[]): Promise<ConsolidatedHolding[]> {
    const consolidated: Map<string, ConsolidatedHolding> = new Map()

    for (const holding of holdings) {
      // Find if this token exists on other chains
      const chainIds = [1, 137, 42161, 10, 8453, 56, 43114]
      const tokenPairs = await EvmCoinFinder.findTokenPairs(
        holding.address,
        holding.chainId,
        chainIds.filter(id => id !== holding.chainId)
      )

      // Create canonical identifier
      const canonicalId = await this.getCanonicalId(holding, tokenPairs)

      if (consolidated.has(canonicalId)) {
        // Add to existing
        const existing = consolidated.get(canonicalId)!
        existing.holdings.push(holding)
        existing.totalBalance += this.normalizeBalance(holding)
      } else {
        // Create new entry
        consolidated.set(canonicalId, {
          canonicalId,
          symbol: holding.token,
          holdings: [holding],
          totalBalance: this.normalizeBalance(holding),
          chainDistribution: {}
        })
      }
    }

    return Array.from(consolidated.values())
  }
}
```

### 3. Token Bridge Route Finder

Find optimal bridging routes:

```typescript
class BridgeRouteAgent {
  async findBestRoute(
    tokenAddress: string,
    sourceChainId: number,
    targetChainId: number,
    amount: bigint
  ): Promise<BridgeRoute[]> {
    // Find token on target chain
    const tokenPairs = await EvmCoinFinder.findTokenPairs(
      tokenAddress,
      sourceChainId,
      [targetChainId]
    )

    if (!tokenPairs[targetChainId]) {
      // Token doesn't exist on target - find alternative routes
      return await this.findAlternativeRoutes(
        tokenAddress,
        sourceChainId,
        targetChainId,
        amount
      )
    }

    // Direct route available
    const directRoute = await this.evaluateDirectRoute(
      tokenAddress,
      tokenPairs[targetChainId].wrapped,
      sourceChainId,
      targetChainId,
      amount
    )

    // Find alternative routes via intermediate chains
    const alternativeRoutes = await this.findIntermediateRoutes(
      tokenAddress,
      sourceChainId,
      targetChainId,
      amount
    )

    // Rank all routes
    const allRoutes = [directRoute, ...alternativeRoutes]
      .filter(r => r !== null)
      .sort((a, b) => a.totalCost - b.totalCost)

    return allRoutes
  }

  private async findIntermediateRoutes(
    tokenAddress: string,
    sourceChainId: number,
    targetChainId: number,
    amount: bigint
  ): Promise<BridgeRoute[]> {
    const intermediateChains = [1, 137, 42161] // Ethereum, Polygon, Arbitrum as hubs
      .filter(id => id !== sourceChainId && id !== targetChainId)

    const routes: BridgeRoute[] = []

    for (const intermediateChainId of intermediateChains) {
      // Check if token exists on intermediate chain
      const toIntermediate = await EvmCoinFinder.findTokenPairs(
        tokenAddress,
        sourceChainId,
        [intermediateChainId]
      )

      if (!toIntermediate[intermediateChainId]) continue

      const toTarget = await EvmCoinFinder.findTokenPairs(
        toIntermediate[intermediateChainId].wrapped,
        intermediateChainId,
        [targetChainId]
      )

      if (!toTarget[targetChainId]) continue

      // Calculate costs
      const hop1Cost = await this.estimateBridgeCost(sourceChainId, intermediateChainId, amount)
      const hop2Cost = await this.estimateBridgeCost(intermediateChainId, targetChainId, amount)

      routes.push({
        type: "multi-hop",
        hops: [
          { from: sourceChainId, to: intermediateChainId, token: toIntermediate[intermediateChainId].wrapped },
          { from: intermediateChainId, to: targetChainId, token: toTarget[targetChainId].wrapped }
        ],
        totalCost: hop1Cost + hop2Cost,
        estimatedTime: this.estimateTime(2),
        risk: "medium"
      })
    }

    return routes
  }
}
```

### 4. Liquidity Aggregator Agent

Find best liquidity across chains:

```typescript
class LiquidityAggregatorAgent {
  async findLiquidity(
    tokenAddress: string,
    sourceChainId: number,
    amount: bigint
  ): Promise<LiquiditySource[]> {
    // Find token on all chains
    const allChains = [1, 137, 42161, 10, 8453, 56, 43114]
    const tokenPairs = await EvmCoinFinder.findTokenPairs(
      tokenAddress,
      sourceChainId,
      allChains
    )

    // Check liquidity on each chain
    const liquiditySources = await Promise.all(
      Object.entries(tokenPairs).map(async ([chainId, pair]) => {
        const liquidity = await this.checkLiquidity(parseInt(chainId), pair.wrapped)
        const slippage = await this.estimateSlippage(parseInt(chainId), pair.wrapped, amount)

        return {
          chainId: parseInt(chainId),
          tokenAddress: pair.wrapped,
          availableLiquidity: liquidity,
          estimatedSlippage: slippage,
          dexes: await this.findDexes(parseInt(chainId), pair.wrapped)
        }
      })
    )

    // Rank by best execution
    return liquiditySources
      .filter(s => s.availableLiquidity >= amount)
      .sort((a, b) => a.estimatedSlippage - b.estimatedSlippage)
  }

  async splitOrder(
    tokenAddress: string,
    sourceChainId: number,
    totalAmount: bigint
  ): Promise<SplitOrder> {
    const sources = await this.findLiquidity(tokenAddress, sourceChainId, totalAmount)

    // Optimal split algorithm
    const splits: OrderSplit[] = []
    let remaining = totalAmount

    for (const source of sources) {
      if (remaining <= 0n) break

      const optimalAmount = this.calculateOptimalSplit(
        source,
        remaining,
        totalAmount
      )

      if (optimalAmount > 0n) {
        splits.push({
          chainId: source.chainId,
          tokenAddress: source.tokenAddress,
          amount: optimalAmount,
          estimatedSlippage: source.estimatedSlippage,
          dex: source.dexes[0]
        })
        remaining -= optimalAmount
      }
    }

    return {
      totalAmount,
      splits,
      averageSlippage: this.calculateAverageSlippage(splits),
      totalGasCost: await this.estimateTotalGas(splits)
    }
  }
}
```

### 5. Token Launch Monitor Agent

Monitor new token launches across chains:

```typescript
class TokenLaunchMonitorAgent {
  private knownTokens: Map<string, TokenInfo>

  async monitorNewTokens(
    chainIds: number[] = [1, 137, 42161, 8453]
  ): Promise<void> {
    for (const chainId of chainIds) {
      // Subscribe to new token events
      await this.subscribeToTokenCreations(chainId, async (newToken) => {
        // Check if this token has wrapped versions
        const wrappedVersions = await this.findWrappedVersions(newToken, chainId)

        // Analyze token
        const analysis = await this.analyzeToken(newToken, chainId)

        // Emit alert
        this.emit("newToken", {
          token: newToken,
          chainId,
          wrappedVersions,
          analysis,
          timestamp: Date.now()
        })
      })
    }
  }

  private async findWrappedVersions(
    tokenAddress: string,
    chainId: number
  ): Promise<Record<number, string>> {
    const allChains = [1, 137, 42161, 10, 8453, 56, 43114]
      .filter(id => id !== chainId)

    try {
      const pairs = await EvmCoinFinder.findTokenPairs(
        tokenAddress,
        chainId,
        allChains
      )

      const wrapped: Record<number, string> = {}
      for (const [cId, pair] of Object.entries(pairs)) {
        if (pair.wrapped) {
          wrapped[parseInt(cId)] = pair.wrapped
        }
      }

      return wrapped
    } catch {
      // New token, likely no wrapped versions yet
      return {}
    }
  }

  private async analyzeToken(
    tokenAddress: string,
    chainId: number
  ): Promise<TokenAnalysis> {
    return {
      hasLiquidity: await this.checkHasLiquidity(chainId, tokenAddress),
      isVerified: await this.checkIsVerified(chainId, tokenAddress),
      holderCount: await this.getHolderCount(chainId, tokenAddress),
      totalSupply: await this.getTotalSupply(chainId, tokenAddress),
      riskScore: await this.calculateRiskScore(chainId, tokenAddress)
    }
  }
}
```

### 6. Native Token Optimizer Agent

Optimize native token holdings across chains:

```typescript
class NativeTokenOptimizer {
  async optimizeNativeBalances(
    addresses: { chain: string; address: string }[]
  ): Promise<OptimizationPlan> {
    // Get native balances on all chains
    const chainIds = [1, 137, 42161, 10, 8453, 56, 43114]
    const nativePairs = await EvmCoinFinder.findNativeEth(chainIds)

    const balances: ChainBalance[] = []
    for (const { chain, address } of addresses) {
      const chainId = this.getChainId(chain)
      const balance = await this.getNativeBalance(chainId, address)
      const gasCost = await this.estimateAverageGasCost(chainId)

      balances.push({
        chain,
        chainId,
        balance,
        nativeAddress: nativePairs[chainId]?.native,
        wrappedAddress: nativePairs[chainId]?.wrapped,
        estimatedGasNeeds: gasCost * 10n, // 10 txs worth
        surplus: balance - gasCost * 10n
      })
    }

    // Find optimization opportunities
    const optimizations: Optimization[] = []

    // Move surplus from low-activity chains to high-activity chains
    const surplusChains = balances.filter(b => b.surplus > 0n)
    const deficitChains = balances.filter(b => b.surplus < 0n)

    for (const surplus of surplusChains) {
      for (const deficit of deficitChains) {
        const amount = this.calculateOptimalTransfer(surplus, deficit)
        if (amount > 0n) {
          optimizations.push({
            from: surplus.chainId,
            to: deficit.chainId,
            amount,
            savings: await this.estimateSavings(surplus.chainId, deficit.chainId, amount)
          })
        }
      }
    }

    return {
      currentBalances: balances,
      optimizations,
      totalSavings: optimizations.reduce((acc, o) => acc + o.savings, 0n),
      executionPlan: this.buildExecutionPlan(optimizations)
    }
  }
}
```

## Error Handling

```typescript
try {
  const pairs = await EvmCoinFinder.findTokenPairs(tokenAddress, sourceChainId, targetChainIds)
} catch (error) {
  switch (error.code) {
    case 'UNSUPPORTED_CHAIN_ID':
      // Chain not supported
      break
    case 'INVALID_ADDRESS':
      // Token address invalid
      break
    case 'CONTRACT_NOT_FOUND':
      // Token doesn't exist on chain
      break
  }
}
```

## Best Practices

1. **Validate chain IDs** before making calls
2. **Cache token pairs** to reduce API calls
3. **Handle missing pairs** gracefully - not all tokens exist on all chains
4. **Monitor gas costs** when bridging between chains
5. **Consider liquidity** before attempting cross-chain swaps

## Integration with DemosWork

```typescript
const discoveryWorkflow = new DemosWork()

// Step 1: Find token on all chains
discoveryWorkflow.push(new BaseOperation(
  new NativeWorkStep({
    method: "abstraction.findTokenPairs",
    params: {
      tokenAddress,
      sourceChainId: 1,
      targetChainIds: [137, 42161, 8453]
    }
  })
))

// Step 2: Get prices from each chain
discoveryWorkflow.push(new BaseOperation(
  new NativeWorkStep({
    method: "price.getMultiChain",
    params: { pairs: "{{step1.result}}" }
  })
))

// Step 3: Conditional arbitrage execution
const conditional = new ConditionalOperation()
conditional.if("{{step2.result.maxSpread}}", ">", 0.5)
  .then(new BaseOperation(executeArbitrageStep))

discoveryWorkflow.push(conditional)
```

## Related Skills

- [Cross-Chain Treasury](./crosschain-treasury-agent.md) - Manage assets across chains
- [DemosWork Pipelines](./demoswork-agent-pipelines.md) - Automate cross-chain workflows
- [DEX Integration](./dex-integration-agent.md) - Execute swaps on discovered tokens
