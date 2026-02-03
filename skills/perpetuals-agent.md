# Perpetuals Agent Skill

> **⚠️ Prerequisites**: Complete [SDK Setup](./00-sdk-setup.md) first to configure your environment.

Build agents that trade perpetual futures contracts on decentralized exchanges.

## Overview

Perpetuals Agent enables automated trading of perpetual futures, funding rate arbitrage, and position management. Essential for leverage trading, hedging, and delta-neutral strategies.

## SDK Reference

```typescript
import { Demos } from "@kynesyslabs/demosdk/websdk"
import { EVM } from "@kynesyslabs/demosdk/xm-websdk"
import { DemosWork, BaseOperation } from "@kynesyslabs/demoswork"

// Perpetual DEX interactions
const evm = await EVM.create("https://rpc.ankr.com/arbitrum")
```

## Agent Use Cases

### 1. Perpetual Position Manager

Manage leveraged perpetual positions:

```typescript
class PerpetualPositionManager {
  private exchanges: Map<string, PerpetualExchange> = new Map()
  private positions: Map<string, PerpPosition> = new Map()
  private riskLimits: RiskLimits

  async openPosition(params: OpenPositionParams): Promise<PositionResult> {
    const exchange = this.exchanges.get(params.exchange)
    if (!exchange) throw new Error("Exchange not found")

    // Validate against risk limits
    const validation = await this.validateRisk(params)
    if (!validation.valid) {
      throw new Error(`Risk limit exceeded: ${validation.reason}`)
    }

    // Get current price and calculate entry
    const markPrice = await exchange.getMarkPrice(params.market)
    const indexPrice = await exchange.getIndexPrice(params.market)

    // Check spread
    const spread = Math.abs(markPrice - indexPrice) / indexPrice
    if (spread > 0.005) { // 0.5% max spread
      throw new Error("Spread too wide")
    }

    // Calculate position size and margin
    const positionSize = params.collateral * BigInt(params.leverage)
    const liquidationPrice = this.calculateLiquidationPrice(
      markPrice,
      params.side,
      params.leverage,
      exchange.maintenanceMargin
    )

    // Execute order
    const order = await exchange.createOrder({
      market: params.market,
      side: params.side,
      size: positionSize,
      collateral: params.collateral,
      leverage: params.leverage,
      orderType: params.orderType || "market",
      reduceOnly: false,
      stopLoss: params.stopLoss,
      takeProfit: params.takeProfit
    })

    const position: PerpPosition = {
      id: order.positionId,
      exchange: params.exchange,
      market: params.market,
      side: params.side,
      size: positionSize,
      collateral: params.collateral,
      leverage: params.leverage,
      entryPrice: order.avgFillPrice,
      liquidationPrice,
      unrealizedPnl: 0n,
      realizedPnl: 0n,
      fundingPayments: 0n,
      openedAt: Date.now(),
      status: "open"
    }

    this.positions.set(position.id, position)

    return {
      success: true,
      position,
      order
    }
  }

  async closePosition(
    positionId: string,
    params?: CloseParams
  ): Promise<CloseResult> {
    const position = this.positions.get(positionId)
    if (!position) throw new Error("Position not found")

    const exchange = this.exchanges.get(position.exchange)!

    // Calculate close size
    const closeSize = params?.size || position.size

    // Execute close order
    const order = await exchange.createOrder({
      market: position.market,
      side: position.side === "long" ? "short" : "long",
      size: closeSize,
      reduceOnly: true,
      orderType: params?.orderType || "market"
    })

    // Calculate PnL
    const priceDiff = order.avgFillPrice - position.entryPrice
    const pnl = position.side === "long"
      ? (closeSize * BigInt(Math.floor(priceDiff * 1e8))) / BigInt(1e8)
      : (closeSize * BigInt(Math.floor(-priceDiff * 1e8))) / BigInt(1e8)

    position.realizedPnl += pnl
    position.size -= closeSize

    if (position.size === 0n) {
      position.status = "closed"
      position.closedAt = Date.now()
    }

    return {
      success: true,
      closedSize: closeSize,
      avgClosePrice: order.avgFillPrice,
      realizedPnl: pnl,
      remainingSize: position.size
    }
  }

  async adjustLeverage(
    positionId: string,
    newLeverage: number
  ): Promise<AdjustResult> {
    const position = this.positions.get(positionId)
    if (!position) throw new Error("Position not found")

    const exchange = this.exchanges.get(position.exchange)!

    if (newLeverage > position.leverage) {
      // Increasing leverage - need to check margin
      const newMargin = position.size / BigInt(newLeverage)
      const excessMargin = position.collateral - newMargin

      // Withdraw excess
      await exchange.withdrawMargin(positionId, excessMargin)
      position.collateral = newMargin
    } else {
      // Decreasing leverage - need to add margin
      const newMargin = position.size / BigInt(newLeverage)
      const additionalMargin = newMargin - position.collateral

      await exchange.depositMargin(positionId, additionalMargin)
      position.collateral = newMargin
    }

    position.leverage = newLeverage
    position.liquidationPrice = this.calculateLiquidationPrice(
      position.entryPrice,
      position.side,
      newLeverage,
      exchange.maintenanceMargin
    )

    return {
      success: true,
      newLeverage,
      newLiquidationPrice: position.liquidationPrice
    }
  }

  async updatePositionPnL(): Promise<void> {
    for (const [id, position] of this.positions) {
      if (position.status !== "open") continue

      const exchange = this.exchanges.get(position.exchange)!
      const currentPrice = await exchange.getMarkPrice(position.market)

      const priceDiff = currentPrice - position.entryPrice
      position.unrealizedPnl = position.side === "long"
        ? (position.size * BigInt(Math.floor(priceDiff * 1e8))) / BigInt(1e8)
        : (position.size * BigInt(Math.floor(-priceDiff * 1e8))) / BigInt(1e8)
    }
  }
}
```

### 2. Funding Rate Arbitrageur

Capture funding rate through delta-neutral positions:

```typescript
class FundingRateArbitrageur {
  private perpExchange: PerpetualExchange
  private spotExchange: SpotExchange
  private positions: Map<string, ArbitragePosition> = new Map()

  async analyzeFundingOpportunity(
    market: string
  ): Promise<FundingOpportunity> {
    const [fundingRate, fundingInterval, spotPrice, perpPrice] = await Promise.all([
      this.perpExchange.getFundingRate(market),
      this.perpExchange.getFundingInterval(market),
      this.spotExchange.getPrice(market),
      this.perpExchange.getMarkPrice(market)
    ])

    // Annualize funding rate
    const periodsPerYear = (365 * 24 * 60 * 60 * 1000) / fundingInterval
    const annualizedRate = fundingRate * periodsPerYear

    // Calculate basis (perp premium/discount)
    const basis = (perpPrice - spotPrice) / spotPrice

    // Determine direction
    const direction = fundingRate > 0 ? "short_perp_long_spot" : "long_perp_short_spot"

    // Estimate costs
    const tradingFees = 0.001 // 0.1% round trip
    const borrowCost = fundingRate > 0 ? 0 : await this.getSpotBorrowRate(market)

    const netAPY = Math.abs(annualizedRate) - tradingFees - borrowCost

    return {
      market,
      fundingRate,
      annualizedRate,
      basis,
      direction,
      netAPY,
      profitable: netAPY > 0.05, // 5% minimum
      nextFunding: await this.perpExchange.getNextFundingTime(market)
    }
  }

  async openArbitragePosition(
    market: string,
    size: bigint,
    leverage: number = 1
  ): Promise<ArbitragePosition> {
    const opportunity = await this.analyzeFundingOpportunity(market)

    if (!opportunity.profitable) {
      throw new Error("Opportunity not profitable")
    }

    const positionId = this.generatePositionId()
    let perpOrder, spotOrder

    if (opportunity.direction === "short_perp_long_spot") {
      // Short perp, buy spot
      [perpOrder, spotOrder] = await Promise.all([
        this.perpExchange.createOrder({
          market,
          side: "short",
          size: size * BigInt(leverage),
          leverage
        }),
        this.spotExchange.buy(market, size)
      ])
    } else {
      // Long perp, short spot (requires borrowing)
      [perpOrder, spotOrder] = await Promise.all([
        this.perpExchange.createOrder({
          market,
          side: "long",
          size: size * BigInt(leverage),
          leverage
        }),
        this.spotExchange.shortSell(market, size)
      ])
    }

    const position: ArbitragePosition = {
      id: positionId,
      market,
      direction: opportunity.direction,
      perpPosition: perpOrder.positionId,
      spotPosition: spotOrder.orderId,
      size,
      leverage,
      entryFundingRate: opportunity.fundingRate,
      cumulativeFunding: 0n,
      openedAt: Date.now(),
      status: "active"
    }

    this.positions.set(positionId, position)

    // Start monitoring
    this.monitorPosition(positionId)

    return position
  }

  private monitorPosition(positionId: string): void {
    const interval = setInterval(async () => {
      const position = this.positions.get(positionId)
      if (!position || position.status !== "active") {
        clearInterval(interval)
        return
      }

      // Check funding rate changes
      const currentRate = await this.perpExchange.getFundingRate(position.market)

      // Close if funding flips
      if (
        (position.direction === "short_perp_long_spot" && currentRate < -0.0001) ||
        (position.direction === "long_perp_short_spot" && currentRate > 0.0001)
      ) {
        await this.closeArbitragePosition(positionId)
      }

      // Update cumulative funding
      const funding = await this.perpExchange.getAccruedFunding(position.perpPosition)
      position.cumulativeFunding = funding
    }, 60000) // Check every minute
  }

  async closeArbitragePosition(positionId: string): Promise<CloseResult> {
    const position = this.positions.get(positionId)
    if (!position) throw new Error("Position not found")

    // Close both legs
    const [perpResult, spotResult] = await Promise.all([
      this.perpExchange.closePosition(position.perpPosition),
      position.direction === "short_perp_long_spot"
        ? this.spotExchange.sell(position.market, position.size)
        : this.spotExchange.coverShort(position.market, position.size)
    ])

    position.status = "closed"
    position.closedAt = Date.now()

    const totalPnL = perpResult.realizedPnl + spotResult.pnl + position.cumulativeFunding

    return {
      positionId,
      perpPnL: perpResult.realizedPnl,
      spotPnL: spotResult.pnl,
      fundingReceived: position.cumulativeFunding,
      totalPnL,
      duration: position.closedAt - position.openedAt
    }
  }
}
```

### 3. Liquidation Risk Manager

Monitor and prevent liquidations:

```typescript
class LiquidationRiskManager {
  private positions: Map<string, MonitoredPosition> = new Map()
  private alerts: LiquidationAlert[] = []

  async monitorPosition(
    positionId: string,
    exchange: PerpetualExchange,
    config: MonitorConfig
  ): Promise<void> {
    const checkRisk = async () => {
      const position = await exchange.getPosition(positionId)

      if (!position || position.status !== "open") {
        this.positions.delete(positionId)
        return
      }

      const markPrice = await exchange.getMarkPrice(position.market)
      const distanceToLiquidation = this.calculateLiquidationDistance(
        position,
        markPrice
      )

      const riskLevel = this.assessRiskLevel(distanceToLiquidation)

      const monitored: MonitoredPosition = {
        ...position,
        markPrice,
        distanceToLiquidation,
        riskLevel,
        lastChecked: Date.now()
      }

      this.positions.set(positionId, monitored)

      // Take action based on risk level
      if (riskLevel === "critical") {
        await this.handleCriticalRisk(monitored, exchange, config)
      } else if (riskLevel === "high") {
        await this.handleHighRisk(monitored, exchange, config)
      } else if (riskLevel === "elevated") {
        this.emitAlert(monitored, "elevated")
      }
    }

    // Initial check
    await checkRisk()

    // Set up monitoring
    setInterval(checkRisk, config.checkInterval || 10000)
  }

  private calculateLiquidationDistance(
    position: PerpPosition,
    markPrice: number
  ): number {
    if (position.side === "long") {
      return (markPrice - position.liquidationPrice) / markPrice
    } else {
      return (position.liquidationPrice - markPrice) / markPrice
    }
  }

  private assessRiskLevel(distance: number): RiskLevel {
    if (distance < 0.02) return "critical"  // < 2% from liquidation
    if (distance < 0.05) return "high"      // < 5% from liquidation
    if (distance < 0.10) return "elevated"  // < 10% from liquidation
    return "normal"
  }

  private async handleCriticalRisk(
    position: MonitoredPosition,
    exchange: PerpetualExchange,
    config: MonitorConfig
  ): Promise<void> {
    this.emitAlert(position, "critical")

    if (!config.autoProtect) return

    // Option 1: Add margin
    const marginToAdd = this.calculateMarginForSafety(position, 0.1) // 10% buffer

    if (config.autoAddMargin && await this.hasAvailableMargin(marginToAdd)) {
      await exchange.depositMargin(position.id, marginToAdd)
      return
    }

    // Option 2: Reduce position
    if (config.autoReduce) {
      const reduceAmount = position.size * 30n / 100n // Reduce 30%
      await exchange.createOrder({
        market: position.market,
        side: position.side === "long" ? "short" : "long",
        size: reduceAmount,
        reduceOnly: true,
        orderType: "market"
      })
    }
  }

  async setTrailingStop(
    positionId: string,
    exchange: PerpetualExchange,
    trailPercent: number
  ): Promise<void> {
    const position = this.positions.get(positionId)
    if (!position) throw new Error("Position not found")

    let highWaterMark = position.entryPrice

    const updateStop = async () => {
      const currentPosition = this.positions.get(positionId)
      if (!currentPosition || currentPosition.status !== "open") return

      const markPrice = await exchange.getMarkPrice(currentPosition.market)

      // Update high water mark
      if (currentPosition.side === "long" && markPrice > highWaterMark) {
        highWaterMark = markPrice
      } else if (currentPosition.side === "short" && markPrice < highWaterMark) {
        highWaterMark = markPrice
      }

      // Calculate stop price
      const stopPrice = currentPosition.side === "long"
        ? highWaterMark * (1 - trailPercent)
        : highWaterMark * (1 + trailPercent)

      // Check if stop triggered
      if (
        (currentPosition.side === "long" && markPrice <= stopPrice) ||
        (currentPosition.side === "short" && markPrice >= stopPrice)
      ) {
        await exchange.createOrder({
          market: currentPosition.market,
          side: currentPosition.side === "long" ? "short" : "long",
          size: currentPosition.size,
          reduceOnly: true,
          orderType: "market"
        })
      }
    }

    setInterval(updateStop, 5000)
  }
}
```

## Best Practices

1. **Monitor liquidation prices** continuously
2. **Use funding rate** as income source in delta-neutral strategies
3. **Set appropriate leverage** based on volatility
4. **Implement trailing stops** for profit protection
5. **Account for slippage** in large positions

## Related Skills

- [Leverage Agent](./leverage-agent.md) - Leverage strategies
- [Risk Assessment Agent](./risk-assessment-agent.md) - Risk management
- [Price Oracle Agent](./price-oracle-agent.md) - Price feeds
