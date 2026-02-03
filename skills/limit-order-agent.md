# Limit Order Agent Skill

Build agents that manage and execute limit orders across DEXs.

## Overview

Limit Order Agent enables off-chain limit order management with on-chain execution, supporting advanced order types like stop-loss, take-profit, and trailing stops. Essential for automated trading.

## SDK Reference

```typescript
import { Demos } from "@kynesyslabs/demosdk/websdk"
import { EVM } from "@kynesyslabs/demosdk/xm-websdk"

// Price monitoring for order triggers
await demos.subscribeToAddress(priceOracle, callback)
```

## Agent Use Cases

### 1. Limit Order Manager

Manage and execute limit orders:

```typescript
class LimitOrderManager {
  private orders: Map<string, LimitOrder> = new Map()
  private priceFeeds: Map<string, PriceFeed> = new Map()

  async createOrder(params: CreateOrderParams): Promise<LimitOrder> {
    const order: LimitOrder = {
      id: this.generateOrderId(),
      pair: params.pair,
      side: params.side,
      price: params.price,
      size: params.size,
      type: params.type || "limit",
      status: "pending",
      createdAt: Date.now(),
      expiry: params.expiry,
      owner: params.owner
    }

    // Validate order
    await this.validateOrder(order)

    // Store order
    this.orders.set(order.id, order)

    // Start monitoring price
    await this.startPriceMonitoring(order)

    return order
  }

  async cancelOrder(orderId: string, owner: string): Promise<boolean> {
    const order = this.orders.get(orderId)

    if (!order) {
      throw new Error("Order not found")
    }

    if (order.owner !== owner) {
      throw new Error("Not order owner")
    }

    if (order.status !== "pending") {
      throw new Error("Order cannot be cancelled")
    }

    order.status = "cancelled"
    return true
  }

  async checkAndExecute(orderId: string): Promise<ExecutionResult | null> {
    const order = this.orders.get(orderId)
    if (!order || order.status !== "pending") return null

    // Check expiry
    if (order.expiry && Date.now() > order.expiry) {
      order.status = "expired"
      return null
    }

    // Get current price
    const currentPrice = await this.getCurrentPrice(order.pair)

    // Check if order should trigger
    const shouldTrigger = this.shouldTrigger(order, currentPrice)

    if (!shouldTrigger) return null

    // Execute order
    order.status = "executing"

    try {
      const result = await this.executeOrder(order, currentPrice)
      order.status = "filled"
      order.executedAt = Date.now()
      order.executedPrice = result.price
      order.executedSize = result.size

      return result
    } catch (error) {
      order.status = "failed"
      order.error = error.message
      return null
    }
  }

  private shouldTrigger(order: LimitOrder, currentPrice: number): boolean {
    switch (order.type) {
      case "limit":
        if (order.side === "buy") {
          return currentPrice <= order.price
        }
        return currentPrice >= order.price

      case "stop-loss":
        if (order.side === "sell") {
          return currentPrice <= order.price
        }
        return currentPrice >= order.price

      case "take-profit":
        if (order.side === "sell") {
          return currentPrice >= order.price
        }
        return currentPrice <= order.price

      default:
        return false
    }
  }

  private async executeOrder(
    order: LimitOrder,
    currentPrice: number
  ): Promise<ExecutionResult> {
    // Build swap transaction
    const swapParams = {
      tokenIn: order.side === "buy" ? order.pair.quote : order.pair.base,
      tokenOut: order.side === "buy" ? order.pair.base : order.pair.quote,
      amountIn: order.size,
      minAmountOut: this.calculateMinOutput(order, currentPrice)
    }

    const tx = await this.dex.swap(swapParams)
    const receipt = await tx.wait()

    return {
      orderId: order.id,
      txHash: receipt.transactionHash,
      price: currentPrice,
      size: order.size,
      fee: receipt.gasUsed
    }
  }
}
```

### 2. Advanced Order Types

Support complex order types:

```typescript
class AdvancedOrderManager {
  private baseManager: LimitOrderManager

  async createTrailingStop(
    params: TrailingStopParams
  ): Promise<TrailingStopOrder> {
    const order: TrailingStopOrder = {
      ...params,
      id: this.generateOrderId(),
      type: "trailing-stop",
      status: "tracking",
      trailPercent: params.trailPercent,
      highestPrice: await this.getCurrentPrice(params.pair),
      triggerPrice: 0
    }

    // Calculate initial trigger price
    order.triggerPrice = order.highestPrice * (1 - order.trailPercent)

    // Start tracking
    await this.startTrailingTracking(order)

    return order
  }

  private async trackTrailingStop(order: TrailingStopOrder): Promise<void> {
    const interval = setInterval(async () => {
      if (order.status !== "tracking") {
        clearInterval(interval)
        return
      }

      const currentPrice = await this.getCurrentPrice(order.pair)

      // Update highest price and trigger
      if (currentPrice > order.highestPrice) {
        order.highestPrice = currentPrice
        order.triggerPrice = currentPrice * (1 - order.trailPercent)
      }

      // Check if triggered
      if (currentPrice <= order.triggerPrice) {
        order.status = "triggered"
        clearInterval(interval)
        await this.executeTrailingStop(order)
      }
    }, 1000) // Check every second
  }

  async createOCO(params: OCOParams): Promise<OCOOrder> {
    // One-Cancels-Other order
    const order: OCOOrder = {
      id: this.generateOrderId(),
      type: "oco",
      pair: params.pair,
      size: params.size,
      takeProfit: {
        price: params.takeProfitPrice,
        status: "pending"
      },
      stopLoss: {
        price: params.stopLossPrice,
        status: "pending"
      },
      status: "active"
    }

    // Monitor both prices
    await this.startOCOMonitoring(order)

    return order
  }

  private async monitorOCO(order: OCOOrder): Promise<void> {
    const checkInterval = setInterval(async () => {
      if (order.status !== "active") {
        clearInterval(checkInterval)
        return
      }

      const currentPrice = await this.getCurrentPrice(order.pair)

      // Check take-profit
      if (currentPrice >= order.takeProfit.price) {
        order.takeProfit.status = "triggered"
        order.stopLoss.status = "cancelled"
        order.status = "completed"
        clearInterval(checkInterval)
        await this.executeSell(order, currentPrice, "take-profit")
        return
      }

      // Check stop-loss
      if (currentPrice <= order.stopLoss.price) {
        order.stopLoss.status = "triggered"
        order.takeProfit.status = "cancelled"
        order.status = "completed"
        clearInterval(checkInterval)
        await this.executeSell(order, currentPrice, "stop-loss")
      }
    }, 1000)
  }

  async createIceberg(params: IcebergParams): Promise<IcebergOrder> {
    // Large order split into smaller visible chunks
    const order: IcebergOrder = {
      id: this.generateOrderId(),
      type: "iceberg",
      pair: params.pair,
      side: params.side,
      totalSize: params.totalSize,
      visibleSize: params.visibleSize,
      price: params.price,
      filledSize: 0n,
      status: "active"
    }

    // Create first visible order
    await this.createVisibleChunk(order)

    return order
  }

  private async createVisibleChunk(order: IcebergOrder): Promise<void> {
    const remainingSize = order.totalSize - order.filledSize

    if (remainingSize <= 0n) {
      order.status = "filled"
      return
    }

    const chunkSize = remainingSize < order.visibleSize
      ? remainingSize
      : order.visibleSize

    const chunkOrder = await this.baseManager.createOrder({
      pair: order.pair,
      side: order.side,
      price: order.price,
      size: chunkSize,
      type: "limit",
      owner: order.owner
    })

    // Monitor chunk and create next when filled
    await this.monitorChunk(order, chunkOrder)
  }
}
```

### 3. Order Book Integration

Integrate with on-chain order books:

```typescript
class OnChainOrderManager {
  private orderBookContract: ethers.Contract

  async placeLimitOrder(
    order: LimitOrder
  ): Promise<OnChainOrderResult> {
    // Approve tokens if selling
    if (order.side === "sell") {
      await this.approveToken(order.pair.base, order.size)
    } else {
      const quoteAmount = order.size * BigInt(Math.floor(order.price * 1e18)) / 10n ** 18n
      await this.approveToken(order.pair.quote, quoteAmount)
    }

    // Place order on-chain
    const tx = await this.orderBookContract.placeOrder(
      order.side === "buy",
      ethers.parseUnits(order.price.toString(), 18),
      order.size
    )

    const receipt = await tx.wait()

    // Extract order ID from events
    const orderPlacedEvent = receipt.logs.find(
      log => log.topics[0] === this.orderBookContract.interface.getEvent("OrderPlaced").topicHash
    )

    return {
      txHash: receipt.transactionHash,
      onChainOrderId: orderPlacedEvent?.args?.orderId,
      status: "placed"
    }
  }

  async cancelOnChainOrder(orderId: bigint): Promise<boolean> {
    const tx = await this.orderBookContract.cancelOrder(orderId)
    await tx.wait()
    return true
  }

  async getOpenOrders(owner: string): Promise<OnChainOrder[]> {
    const orderCount = await this.orderBookContract.getUserOrderCount(owner)
    const orders: OnChainOrder[] = []

    for (let i = 0; i < orderCount; i++) {
      const orderId = await this.orderBookContract.getUserOrderId(owner, i)
      const order = await this.orderBookContract.getOrder(orderId)

      if (order.status === 0) { // Open
        orders.push({
          id: orderId,
          side: order.isBuy ? "buy" : "sell",
          price: Number(ethers.formatUnits(order.price, 18)),
          size: order.size,
          filled: order.filled,
          timestamp: Number(order.timestamp)
        })
      }
    }

    return orders
  }
}
```

## Best Practices

1. **Validate order parameters** before submission
2. **Monitor prices efficiently** with batched queries
3. **Handle partial fills** gracefully
4. **Implement order expiry** to prevent stale orders
5. **Log all order actions** for auditing

## Related Skills

- [Order Book Agent](./order-book-agent.md) - Order book data
- [Price Oracle Agent](./price-oracle-agent.md) - Price feeds
- [TWAP Executor](./twap-executor-agent.md) - Time-weighted execution
