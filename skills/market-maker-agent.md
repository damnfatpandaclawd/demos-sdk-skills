# Market Maker Agent Skill

Build agents that provide liquidity and execute automated market making strategies.

## Overview

Market Maker Agent enables automated liquidity provision with spread management, inventory control, and risk-adjusted pricing. Essential for DEX liquidity, OTC trading, and token launches.

## SDK Reference

```typescript
import { Demos } from "@kynesyslabs/demosdk/websdk"
import { EVM } from "@kynesyslabs/demosdk/xm-websdk"

// DEX interactions for market making
const tx = await evm.preparePay(poolAddress, amount)
```

## Agent Use Cases

### 1. Spread-Based Market Maker

Maintain bid-ask spreads around mid-price:

```typescript
class SpreadMarketMaker {
  private demos: Demos
  private inventory: Map<string, bigint> = new Map()
  private targetSpread: number = 0.002 // 0.2%
  private maxInventory: bigint

  constructor(demos: Demos, maxInventory: bigint) {
    this.demos = demos
    this.maxInventory = maxInventory
  }

  async calculateQuotes(
    pair: TradingPair,
    midPrice: number
  ): Promise<{ bid: Quote; ask: Quote }> {
    const inventory = this.inventory.get(pair.base) || 0n
    const inventorySkew = this.calculateInventorySkew(inventory)

    // Adjust spread based on inventory
    const adjustedSpread = this.targetSpread * (1 + Math.abs(inventorySkew))

    const bidPrice = midPrice * (1 - adjustedSpread / 2 - inventorySkew * 0.001)
    const askPrice = midPrice * (1 + adjustedSpread / 2 - inventorySkew * 0.001)

    const baseSize = this.calculateOrderSize(inventory)

    return {
      bid: { price: bidPrice, size: baseSize, side: "buy" },
      ask: { price: askPrice, size: baseSize, side: "sell" }
    }
  }

  private calculateInventorySkew(inventory: bigint): number {
    // -1 to 1, negative means we want to buy, positive means sell
    return Number(inventory) / Number(this.maxInventory)
  }

  private calculateOrderSize(inventory: bigint): bigint {
    const availableCapacity = this.maxInventory - inventory
    return availableCapacity / 10n // 10% of available capacity per order
  }

  async executeQuotes(quotes: { bid: Quote; ask: Quote }): Promise<void> {
    // Place limit orders on DEX
    await Promise.all([
      this.placeLimitOrder(quotes.bid),
      this.placeLimitOrder(quotes.ask)
    ])
  }

  async updateInventory(fill: Fill): Promise<void> {
    const current = this.inventory.get(fill.asset) || 0n

    if (fill.side === "buy") {
      this.inventory.set(fill.asset, current + fill.amount)
    } else {
      this.inventory.set(fill.asset, current - fill.amount)
    }
  }
}
```

### 2. Grid Market Maker

Place orders at multiple price levels:

```typescript
class GridMarketMaker {
  private gridLevels: number = 10
  private gridSpacing: number = 0.005 // 0.5% between levels
  private orders: Map<string, Order> = new Map()

  async createGrid(
    pair: TradingPair,
    midPrice: number,
    totalCapital: bigint
  ): Promise<Order[]> {
    const orders: Order[] = []
    const capitalPerLevel = totalCapital / BigInt(this.gridLevels * 2)

    for (let i = 1; i <= this.gridLevels; i++) {
      // Buy orders below mid price
      const buyPrice = midPrice * (1 - this.gridSpacing * i)
      orders.push({
        id: `buy-${i}`,
        side: "buy",
        price: buyPrice,
        size: capitalPerLevel,
        pair
      })

      // Sell orders above mid price
      const sellPrice = midPrice * (1 + this.gridSpacing * i)
      orders.push({
        id: `sell-${i}`,
        side: "sell",
        price: sellPrice,
        size: capitalPerLevel,
        pair
      })
    }

    return orders
  }

  async rebalanceGrid(
    currentPrice: number,
    originalMid: number
  ): Promise<void> {
    const drift = (currentPrice - originalMid) / originalMid

    if (Math.abs(drift) > this.gridSpacing * 2) {
      // Price moved significantly, recreate grid
      await this.cancelAllOrders()
      await this.createGrid(this.pair, currentPrice, this.totalCapital)
    }
  }

  async handleFill(fill: Fill): Promise<void> {
    // When an order fills, place opposite order at next level
    const oppositePrice = fill.side === "buy"
      ? fill.price * (1 + this.gridSpacing)
      : fill.price * (1 - this.gridSpacing)

    await this.placeOrder({
      side: fill.side === "buy" ? "sell" : "buy",
      price: oppositePrice,
      size: fill.size
    })
  }
}
```

### 3. Inventory-Aware Market Maker

Dynamic pricing based on inventory risk:

```typescript
class InventoryAwareMarketMaker {
  private riskAversion: number = 0.1
  private volatility: number = 0.02

  calculateOptimalSpread(
    inventory: number,
    volatility: number,
    timeHorizon: number
  ): { bidOffset: number; askOffset: number } {
    // Avellaneda-Stoikov model simplified
    const gamma = this.riskAversion
    const sigma = volatility
    const T = timeHorizon

    // Reservation price adjustment
    const reservationOffset = gamma * sigma * sigma * T * inventory

    // Optimal spread
    const optimalSpread = gamma * sigma * sigma * T +
      (2 / gamma) * Math.log(1 + gamma / 0.5)

    return {
      bidOffset: -optimalSpread / 2 + reservationOffset,
      askOffset: optimalSpread / 2 + reservationOffset
    }
  }

  async adjustPricing(
    midPrice: number,
    inventory: number
  ): Promise<{ bid: number; ask: number }> {
    const offsets = this.calculateOptimalSpread(
      inventory,
      this.volatility,
      1 // 1 hour horizon
    )

    return {
      bid: midPrice * (1 + offsets.bidOffset),
      ask: midPrice * (1 + offsets.askOffset)
    }
  }
}
```

## Best Practices

1. **Monitor inventory** continuously to avoid directional exposure
2. **Adjust spreads** based on volatility and market conditions
3. **Implement circuit breakers** for extreme market moves
4. **Track P&L** separately from inventory changes
5. **Use multiple price sources** for accurate mid-price

## Related Skills

- [DEX Integration](./dex-integration-agent.md) - DEX connectivity
- [Price Oracle](./price-oracle-agent.md) - Price feeds
- [Risk Assessment](./risk-assessment-agent.md) - Risk management
