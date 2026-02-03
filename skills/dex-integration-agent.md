# DEX Integration Agent Skill

Build decentralized exchange agents for swapping, liquidity provision, and trading automation across multiple chains using Demos Network.

## Overview

DEX Integration enables agents to execute swaps, provide liquidity, and automate trading strategies across Uniswap, SushiSwap, and other DEXes - essential for trading bots, arbitrage, and DeFi automation.

## SDK Reference

```typescript
import { EVM } from "@kynesyslabs/demosdk/xm-websdk"
import { RubicService, RubicBridge } from "@kynesyslabs/demosdk/bridge"

// DEX Swap Preparation
const evm = await EVM.create(rpcUrl)
await evm.prepareSwap(tokenIn, tokenOut, amountIn, slippage)
await evm.prepareAddLiquidity(tokenA, tokenB, amountA, amountB)
await evm.prepareRemoveLiquidity(lpToken, amount)

// Cross-Chain DEX via Rubic
const rubic = new RubicService()
await rubic.getCrossChainQuote(fromChain, toChain, tokenIn, tokenOut, amount)
await rubic.executeCrossChainSwap(quote)
```

## Supported DEXes

| DEX | Chains | Features |
|-----|--------|----------|
| Uniswap V3 | Ethereum, Polygon, Arbitrum, Base | Concentrated liquidity |
| SushiSwap | Multi-chain | Classic AMM + BentoBox |
| PancakeSwap | BSC, Ethereum | Classic AMM |
| Raydium | Solana | Order book + AMM |
| Orca | Solana | Whirlpool concentrated |

## Agent Use Cases

### 1. Smart Swap Router Agent

Find and execute best swap routes:

```typescript
class SmartSwapAgent {
  private demos: Demos
  private dexes: Map<string, DEXAdapter>

  async findBestSwap(
    tokenIn: string,
    tokenOut: string,
    amountIn: bigint,
    chainId: number,
    options: SwapOptions = {}
  ): Promise<SwapQuote[]> {
    const quotes: SwapQuote[] = []

    // Query all DEXes on this chain
    const chainDexes = this.getDexesForChain(chainId)

    for (const dex of chainDexes) {
      try {
        const quote = await this.getQuote(dex, tokenIn, tokenOut, amountIn)
        quotes.push({
          dex: dex.name,
          amountOut: quote.amountOut,
          priceImpact: quote.priceImpact,
          route: quote.route,
          gasEstimate: quote.gasEstimate,
          effectivePrice: amountIn / quote.amountOut
        })
      } catch (error) {
        // DEX doesn't support this pair
      }
    }

    // Sort by best output
    quotes.sort((a, b) => Number(b.amountOut - a.amountOut))

    // Check for split routes
    if (options.allowSplitRoutes && amountIn > options.splitThreshold) {
      const splitQuote = await this.findSplitRoute(tokenIn, tokenOut, amountIn, quotes)
      if (splitQuote && splitQuote.totalAmountOut > quotes[0]?.amountOut) {
        quotes.unshift(splitQuote)
      }
    }

    return quotes
  }

  async executeSwap(
    quote: SwapQuote,
    slippageBps: number = 50
  ): Promise<SwapResult> {
    const minAmountOut = quote.amountOut * (10000n - BigInt(slippageBps)) / 10000n

    const dex = this.dexes.get(quote.dex)
    const evm = await EVM.create(dex.rpcUrl)

    // Prepare swap transaction
    const swapPayload = await evm.prepareSwap(
      quote.route[0],
      quote.route[quote.route.length - 1],
      quote.amountIn,
      minAmountOut
    )

    await evm.disconnect()

    // Execute through Demos
    const result = await this.executeTx(swapPayload)

    return {
      success: true,
      txHash: result.hash,
      amountIn: quote.amountIn,
      amountOut: await this.parseSwapOutput(result),
      route: quote.route,
      dex: quote.dex
    }
  }

  private async findSplitRoute(
    tokenIn: string,
    tokenOut: string,
    amountIn: bigint,
    singleQuotes: SwapQuote[]
  ): Promise<SplitSwapQuote | null> {
    // Try different split ratios
    const splits = [
      [50, 50],
      [60, 40],
      [70, 30],
      [80, 20]
    ]

    let bestSplit: SplitSwapQuote | null = null

    for (const [ratio1, ratio2] of splits) {
      const amount1 = amountIn * BigInt(ratio1) / 100n
      const amount2 = amountIn - amount1

      // Route through top 2 DEXes
      if (singleQuotes.length < 2) continue

      const dex1Quote = await this.getQuote(
        this.dexes.get(singleQuotes[0].dex)!,
        tokenIn, tokenOut, amount1
      )
      const dex2Quote = await this.getQuote(
        this.dexes.get(singleQuotes[1].dex)!,
        tokenIn, tokenOut, amount2
      )

      const totalOut = dex1Quote.amountOut + dex2Quote.amountOut

      if (!bestSplit || totalOut > bestSplit.totalAmountOut) {
        bestSplit = {
          type: "split",
          splits: [
            { dex: singleQuotes[0].dex, amount: amount1, output: dex1Quote.amountOut },
            { dex: singleQuotes[1].dex, amount: amount2, output: dex2Quote.amountOut }
          ],
          totalAmountOut: totalOut
        }
      }
    }

    return bestSplit
  }
}
```

### 2. Liquidity Provider Agent

Manage LP positions:

```typescript
class LiquidityProviderAgent {
  private demos: Demos

  async addLiquidity(
    pool: PoolConfig,
    amountA: bigint,
    amountB: bigint,
    options: LPOptions = {}
  ): Promise<AddLiquidityResult> {
    const evm = await EVM.create(pool.rpcUrl)

    // Check current pool ratio
    const reserves = await this.getPoolReserves(pool)
    const optimalRatio = reserves.reserveA / reserves.reserveB

    // Adjust amounts if needed
    const adjusted = this.adjustAmountsToRatio(amountA, amountB, optimalRatio)

    // Prepare LP transaction
    const lpPayload = await evm.prepareAddLiquidity(
      pool.tokenA,
      pool.tokenB,
      adjusted.amountA,
      adjusted.amountB,
      options.slippageBps || 50
    )

    await evm.disconnect()

    // Execute
    const result = await this.executeTx(lpPayload)

    return {
      success: true,
      txHash: result.hash,
      lpTokensReceived: await this.parseLPTokens(result),
      tokenADeposited: adjusted.amountA,
      tokenBDeposited: adjusted.amountB,
      poolShare: await this.calculatePoolShare(pool, adjusted)
    }
  }

  async removeLiquidity(
    pool: PoolConfig,
    lpAmount: bigint,
    options: RemoveLPOptions = {}
  ): Promise<RemoveLiquidityResult> {
    const evm = await EVM.create(pool.rpcUrl)

    // Get expected output
    const expectedOutput = await this.calculateRemoveOutput(pool, lpAmount)

    // Prepare removal
    const removePayload = await evm.prepareRemoveLiquidity(
      pool.lpToken,
      lpAmount,
      expectedOutput.minA,
      expectedOutput.minB
    )

    await evm.disconnect()

    const result = await this.executeTx(removePayload)

    return {
      success: true,
      txHash: result.hash,
      lpTokensBurned: lpAmount,
      tokenAReceived: await this.parseTokenOutput(result, pool.tokenA),
      tokenBReceived: await this.parseTokenOutput(result, pool.tokenB)
    }
  }

  async manageLPPositions(
    positions: LPPosition[]
  ): Promise<PositionManagementResult> {
    const recommendations: PositionAction[] = []

    for (const position of positions) {
      // Calculate current metrics
      const metrics = await this.calculatePositionMetrics(position)

      // Check impermanent loss
      if (metrics.impermanentLoss > position.maxIL) {
        recommendations.push({
          position,
          action: "remove",
          reason: `IL exceeded threshold (${metrics.impermanentLoss}% > ${position.maxIL}%)`,
          urgency: "high"
        })
      }

      // Check if position is out of range (concentrated liquidity)
      if (position.type === "concentrated" && !metrics.inRange) {
        recommendations.push({
          position,
          action: "rebalance",
          reason: "Position out of range",
          suggestedRange: this.calculateOptimalRange(position)
        })
      }

      // Check reward accumulation
      if (metrics.pendingRewards > position.harvestThreshold) {
        recommendations.push({
          position,
          action: "harvest",
          reason: `Pending rewards: ${metrics.pendingRewards}`
        })
      }
    }

    return {
      positions,
      recommendations,
      totalValue: positions.reduce((acc, p) => acc + p.value, 0n),
      totalPendingRewards: positions.reduce((acc, p) => acc + p.pendingRewards, 0n)
    }
  }
}
```

### 3. Arbitrage Agent

Detect and execute arbitrage:

```typescript
class ArbitrageAgent {
  private demos: Demos
  private dexes: Map<string, DEXAdapter>

  async scanArbitrageOpportunities(
    pairs: TradingPair[],
    minProfitBps: number = 30
  ): Promise<ArbitrageOpportunity[]> {
    const opportunities: ArbitrageOpportunity[] = []

    for (const pair of pairs) {
      // Get prices from all DEXes
      const prices = await this.getPricesFromAllDexes(pair)

      // Find price discrepancies
      for (let i = 0; i < prices.length; i++) {
        for (let j = i + 1; j < prices.length; j++) {
          const spread = Math.abs(prices[i].price - prices[j].price) / prices[i].price * 10000

          if (spread >= minProfitBps) {
            const buyDex = prices[i].price < prices[j].price ? prices[i] : prices[j]
            const sellDex = prices[i].price < prices[j].price ? prices[j] : prices[i]

            // Calculate optimal trade size
            const optimalSize = await this.calculateOptimalSize(buyDex, sellDex)

            // Estimate profit after gas
            const profit = await this.estimateNetProfit(buyDex, sellDex, optimalSize)

            if (profit > 0n) {
              opportunities.push({
                pair,
                buyDex: buyDex.dex,
                sellDex: sellDex.dex,
                spread,
                optimalSize,
                estimatedProfit: profit,
                timestamp: Date.now()
              })
            }
          }
        }
      }
    }

    return opportunities.sort((a, b) => Number(b.estimatedProfit - a.estimatedProfit))
  }

  async executeArbitrage(
    opportunity: ArbitrageOpportunity
  ): Promise<ArbitrageResult> {
    // Execute atomically if possible (flashloan) or sequentially
    if (await this.canUseFlashloan(opportunity)) {
      return await this.executeFlashloanArbitrage(opportunity)
    }

    // Sequential execution
    const buyResult = await this.executeBuy(
      opportunity.buyDex,
      opportunity.pair.tokenA,
      opportunity.pair.tokenB,
      opportunity.optimalSize
    )

    if (!buyResult.success) {
      return { success: false, error: "Buy failed" }
    }

    const sellResult = await this.executeSell(
      opportunity.sellDex,
      opportunity.pair.tokenB,
      opportunity.pair.tokenA,
      buyResult.amountReceived
    )

    if (!sellResult.success) {
      // Try to recover by selling back on original DEX
      await this.attemptRecovery(opportunity, buyResult)
      return { success: false, error: "Sell failed" }
    }

    return {
      success: true,
      profit: sellResult.amountReceived - opportunity.optimalSize,
      buyTx: buyResult.txHash,
      sellTx: sellResult.txHash,
      gasUsed: buyResult.gasUsed + sellResult.gasUsed
    }
  }

  async executeTriangularArbitrage(
    path: [string, string, string],
    chainId: number
  ): Promise<TriangularResult> {
    // Path: A -> B -> C -> A
    const [tokenA, tokenB, tokenC] = path

    // Find optimal amount
    const quotes = await Promise.all([
      this.getQuote(tokenA, tokenB),
      this.getQuote(tokenB, tokenC),
      this.getQuote(tokenC, tokenA)
    ])

    // Calculate profit
    const startAmount = 1000000000000000000n // 1 token
    let amount = startAmount

    for (const quote of quotes) {
      amount = amount * quote.amountOut / quote.amountIn
    }

    const profit = amount - startAmount

    if (profit <= 0n) {
      return { profitable: false, estimatedProfit: profit }
    }

    // Execute all three swaps
    const results = []
    for (let i = 0; i < path.length; i++) {
      const fromToken = path[i]
      const toToken = path[(i + 1) % path.length]

      const result = await this.executeSwap(fromToken, toToken, amount)
      if (!result.success) {
        return { success: false, error: `Swap ${i + 1} failed`, partialResults: results }
      }

      results.push(result)
      amount = result.amountOut
    }

    return {
      success: true,
      actualProfit: amount - startAmount,
      transactions: results.map(r => r.txHash)
    }
  }
}
```

### 4. DCA (Dollar Cost Average) Agent

Automated periodic purchases:

```typescript
class DCAAgent {
  private demos: Demos
  private schedules: Map<string, DCASchedule>

  async createDCASchedule(
    config: DCAConfig
  ): Promise<string> {
    const scheduleId = crypto.randomUUID()

    const schedule: DCASchedule = {
      id: scheduleId,
      tokenIn: config.tokenIn,
      tokenOut: config.tokenOut,
      amountPerPurchase: config.amountPerPurchase,
      frequency: config.frequency, // "hourly" | "daily" | "weekly"
      startTime: config.startTime || Date.now(),
      endTime: config.endTime,
      totalBudget: config.totalBudget,
      spent: 0n,
      purchases: [],
      status: "active"
    }

    this.schedules.set(scheduleId, schedule)

    // Start scheduler
    await this.startScheduler(schedule)

    return scheduleId
  }

  private async executeDCAPurchase(schedule: DCASchedule) {
    // Check budget
    if (schedule.totalBudget && schedule.spent >= schedule.totalBudget) {
      schedule.status = "completed"
      return
    }

    // Check end time
    if (schedule.endTime && Date.now() > schedule.endTime) {
      schedule.status = "completed"
      return
    }

    // Find best swap route
    const swapAgent = new SmartSwapAgent()
    const quotes = await swapAgent.findBestSwap(
      schedule.tokenIn,
      schedule.tokenOut,
      schedule.amountPerPurchase,
      schedule.chainId
    )

    if (quotes.length === 0) {
      schedule.purchases.push({
        timestamp: Date.now(),
        success: false,
        error: "No swap routes available"
      })
      return
    }

    // Execute best quote
    const result = await swapAgent.executeSwap(quotes[0])

    // Record purchase
    schedule.purchases.push({
      timestamp: Date.now(),
      success: result.success,
      amountIn: schedule.amountPerPurchase,
      amountOut: result.amountOut,
      price: schedule.amountPerPurchase / result.amountOut,
      txHash: result.txHash
    })

    schedule.spent += schedule.amountPerPurchase
  }

  async getDCAStats(scheduleId: string): Promise<DCAStats> {
    const schedule = this.schedules.get(scheduleId)
    if (!schedule) throw new Error("Schedule not found")

    const successfulPurchases = schedule.purchases.filter(p => p.success)

    const totalTokensAcquired = successfulPurchases.reduce((acc, p) => acc + p.amountOut, 0n)
    const totalSpent = successfulPurchases.reduce((acc, p) => acc + p.amountIn, 0n)
    const averagePrice = totalSpent / totalTokensAcquired

    // Get current price for comparison
    const currentPrice = await this.getCurrentPrice(schedule.tokenIn, schedule.tokenOut)

    return {
      scheduleId,
      totalPurchases: schedule.purchases.length,
      successfulPurchases: successfulPurchases.length,
      totalSpent,
      totalTokensAcquired,
      averagePrice,
      currentPrice,
      performanceVsSpot: (currentPrice - averagePrice) / averagePrice * 100,
      remainingBudget: schedule.totalBudget ? schedule.totalBudget - schedule.spent : undefined,
      status: schedule.status
    }
  }
}
```

### 5. Limit Order Agent

Create and manage limit orders:

```typescript
class LimitOrderAgent {
  private demos: Demos
  private orders: Map<string, LimitOrder>

  async createLimitOrder(
    config: LimitOrderConfig
  ): Promise<string> {
    const orderId = crypto.randomUUID()

    const order: LimitOrder = {
      id: orderId,
      tokenIn: config.tokenIn,
      tokenOut: config.tokenOut,
      amountIn: config.amountIn,
      targetPrice: config.targetPrice,
      type: config.type, // "buy" | "sell"
      expiry: config.expiry,
      status: "pending",
      createdAt: Date.now()
    }

    this.orders.set(orderId, order)

    // Start monitoring price
    await this.monitorPrice(order)

    return orderId
  }

  private async monitorPrice(order: LimitOrder) {
    const checkPrice = async () => {
      if (order.status !== "pending") return

      // Check expiry
      if (order.expiry && Date.now() > order.expiry) {
        order.status = "expired"
        return
      }

      // Get current price
      const currentPrice = await this.getCurrentPrice(order.tokenIn, order.tokenOut)

      // Check if target hit
      const targetHit = order.type === "buy"
        ? currentPrice <= order.targetPrice
        : currentPrice >= order.targetPrice

      if (targetHit) {
        await this.executeOrder(order)
      } else {
        // Check again after delay
        setTimeout(checkPrice, 10000) // 10 seconds
      }
    }

    await checkPrice()
  }

  private async executeOrder(order: LimitOrder): Promise<void> {
    order.status = "executing"

    try {
      const swapAgent = new SmartSwapAgent()
      const result = await swapAgent.executeSwap({
        dex: "auto",
        amountIn: order.amountIn,
        route: [order.tokenIn, order.tokenOut],
        minAmountOut: this.calculateMinOutput(order)
      })

      if (result.success) {
        order.status = "filled"
        order.fillTx = result.txHash
        order.filledAt = Date.now()
        order.fillPrice = order.amountIn / result.amountOut
      } else {
        order.status = "failed"
        order.error = result.error
      }
    } catch (error) {
      order.status = "failed"
      order.error = error.message
    }
  }

  async cancelOrder(orderId: string): Promise<boolean> {
    const order = this.orders.get(orderId)
    if (!order || order.status !== "pending") return false

    order.status = "cancelled"
    return true
  }
}
```

### 6. TWAP (Time-Weighted Average Price) Agent

Execute large orders over time:

```typescript
class TWAPAgent {
  private demos: Demos

  async executeTWAP(
    config: TWAPConfig
  ): Promise<TWAPExecution> {
    const {
      tokenIn,
      tokenOut,
      totalAmount,
      duration, // milliseconds
      intervals // number of trades
    } = config

    const amountPerInterval = totalAmount / BigInt(intervals)
    const intervalDuration = duration / intervals

    const execution: TWAPExecution = {
      id: crypto.randomUUID(),
      config,
      trades: [],
      startTime: Date.now(),
      status: "running"
    }

    for (let i = 0; i < intervals; i++) {
      // Wait for interval (except first)
      if (i > 0) {
        await this.sleep(intervalDuration)
      }

      // Execute trade
      const trade = await this.executeTrade(tokenIn, tokenOut, amountPerInterval)
      execution.trades.push(trade)

      // Update metrics
      execution.totalAmountIn = execution.trades.reduce((acc, t) => acc + t.amountIn, 0n)
      execution.totalAmountOut = execution.trades.reduce((acc, t) => acc + (t.amountOut || 0n), 0n)

      // Emit progress
      this.emit("twap_progress", {
        executionId: execution.id,
        progress: (i + 1) / intervals * 100,
        trade
      })
    }

    execution.status = "completed"
    execution.endTime = Date.now()
    execution.averagePrice = execution.totalAmountIn / execution.totalAmountOut

    return execution
  }

  private async executeTrade(
    tokenIn: string,
    tokenOut: string,
    amount: bigint
  ): Promise<TWAPTrade> {
    const swapAgent = new SmartSwapAgent()

    try {
      const quotes = await swapAgent.findBestSwap(tokenIn, tokenOut, amount)
      const result = await swapAgent.executeSwap(quotes[0])

      return {
        timestamp: Date.now(),
        success: result.success,
        amountIn: amount,
        amountOut: result.amountOut,
        txHash: result.txHash
      }
    } catch (error) {
      return {
        timestamp: Date.now(),
        success: false,
        amountIn: amount,
        error: error.message
      }
    }
  }
}
```

## Price Impact Calculation

```typescript
// Calculate expected price impact
function calculatePriceImpact(
  amountIn: bigint,
  reserveIn: bigint,
  reserveOut: bigint
): number {
  const amountOut = (amountIn * reserveOut) / (reserveIn + amountIn)
  const spotPrice = reserveOut / reserveIn
  const executionPrice = amountOut / amountIn
  return (spotPrice - executionPrice) / spotPrice * 100
}
```

## Best Practices

1. **Always check slippage** before executing swaps
2. **Monitor gas prices** to optimize execution timing
3. **Use price oracles** for accurate pricing
4. **Implement MEV protection** for large trades
5. **Split large orders** to reduce price impact

## Integration with DemosWork

```typescript
const dexWorkflow = new DemosWork()

// Step 1: Get best quote
dexWorkflow.push(new BaseOperation(
  new NativeWorkStep({
    method: "dex.getQuote",
    params: { tokenIn, tokenOut, amount }
  })
))

// Step 2: Execute swap
dexWorkflow.push(new BaseOperation(
  new XmWorkStep({
    chain: "ethereum",
    method: "dex.swap",
    params: { quote: "{{step1.result}}" }
  })
))
```

## Related Skills

- [Token Discovery](./token-discovery-agent.md) - Find tokens for trading
- [Event Monitoring](./event-monitoring-agent.md) - Monitor DEX events
- [Transaction Builder](./transaction-builder-agent.md) - Build complex DEX transactions
