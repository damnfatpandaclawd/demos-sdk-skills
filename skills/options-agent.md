# Options Agent Skill

> **⚠️ Prerequisites**: Complete [SDK Setup](./00-sdk-setup.md) first to configure your environment.

Build agents that trade and manage on-chain options contracts.

## Overview

Options Agent enables automated options trading, pricing, and portfolio management on decentralized options protocols. Essential for hedging, yield generation, and volatility trading.

## SDK Reference

```typescript
import { Demos } from "@kynesyslabs/demosdk/websdk"
import { EVM } from "@kynesyslabs/demosdk/xm-websdk"
import { DemosWork, BaseOperation } from "@kynesyslabs/demoswork"

// Options protocol interactions
const evm = await EVM.create("https://rpc.ankr.com/arbitrum")
```

## Agent Use Cases

### 1. Options Pricing Engine

Calculate fair value for options:

```typescript
class OptionsPricingEngine {
  async calculateBlackScholes(params: BSParams): Promise<OptionPrice> {
    const { spotPrice, strikePrice, timeToExpiry, volatility, riskFreeRate, optionType } = params

    const d1 = (Math.log(spotPrice / strikePrice) +
      (riskFreeRate + (volatility ** 2) / 2) * timeToExpiry) /
      (volatility * Math.sqrt(timeToExpiry))

    const d2 = d1 - volatility * Math.sqrt(timeToExpiry)

    let price: number
    let delta: number
    let gamma: number
    let theta: number
    let vega: number

    if (optionType === "call") {
      price = spotPrice * this.normalCDF(d1) -
        strikePrice * Math.exp(-riskFreeRate * timeToExpiry) * this.normalCDF(d2)
      delta = this.normalCDF(d1)
    } else {
      price = strikePrice * Math.exp(-riskFreeRate * timeToExpiry) * this.normalCDF(-d2) -
        spotPrice * this.normalCDF(-d1)
      delta = this.normalCDF(d1) - 1
    }

    // Calculate Greeks
    gamma = this.normalPDF(d1) / (spotPrice * volatility * Math.sqrt(timeToExpiry))

    theta = optionType === "call"
      ? (-spotPrice * this.normalPDF(d1) * volatility / (2 * Math.sqrt(timeToExpiry)) -
         riskFreeRate * strikePrice * Math.exp(-riskFreeRate * timeToExpiry) * this.normalCDF(d2)) / 365
      : (-spotPrice * this.normalPDF(d1) * volatility / (2 * Math.sqrt(timeToExpiry)) +
         riskFreeRate * strikePrice * Math.exp(-riskFreeRate * timeToExpiry) * this.normalCDF(-d2)) / 365

    vega = spotPrice * this.normalPDF(d1) * Math.sqrt(timeToExpiry) / 100

    return {
      price,
      greeks: { delta, gamma, theta, vega },
      impliedVolatility: volatility,
      intrinsicValue: Math.max(0, optionType === "call"
        ? spotPrice - strikePrice
        : strikePrice - spotPrice),
      timeValue: price - Math.max(0, optionType === "call"
        ? spotPrice - strikePrice
        : strikePrice - spotPrice)
    }
  }

  async calculateImpliedVolatility(
    marketPrice: number,
    params: BSParams
  ): Promise<number> {
    // Newton-Raphson method
    let vol = 0.5 // Initial guess
    const tolerance = 0.0001
    const maxIterations = 100

    for (let i = 0; i < maxIterations; i++) {
      const result = await this.calculateBlackScholes({
        ...params,
        volatility: vol
      })

      const diff = result.price - marketPrice

      if (Math.abs(diff) < tolerance) {
        return vol
      }

      // Adjust volatility
      vol = vol - diff / result.greeks.vega / 100
      vol = Math.max(0.01, Math.min(5, vol)) // Bound between 1% and 500%
    }

    throw new Error("IV calculation did not converge")
  }

  async analyzeVolatilitySurface(
    market: string,
    protocol: OptionsProtocol
  ): Promise<VolatilitySurface> {
    const options = await protocol.getActiveOptions(market)
    const spotPrice = await protocol.getSpotPrice(market)

    const surface: VolatilityPoint[] = []

    for (const option of options) {
      const marketPrice = await protocol.getOptionPrice(option.id)
      const timeToExpiry = (option.expiry - Date.now()) / (365 * 24 * 60 * 60 * 1000)

      const iv = await this.calculateImpliedVolatility(marketPrice, {
        spotPrice,
        strikePrice: option.strike,
        timeToExpiry,
        volatility: 0.5,
        riskFreeRate: 0.05,
        optionType: option.type
      })

      const moneyness = option.strike / spotPrice

      surface.push({
        strike: option.strike,
        expiry: option.expiry,
        moneyness,
        timeToExpiry,
        impliedVolatility: iv,
        optionType: option.type
      })
    }

    return {
      market,
      spotPrice,
      points: surface,
      skew: this.calculateSkew(surface),
      term: this.calculateTermStructure(surface),
      timestamp: Date.now()
    }
  }

  private normalCDF(x: number): number {
    const a1 = 0.254829592
    const a2 = -0.284496736
    const a3 = 1.421413741
    const a4 = -1.453152027
    const a5 = 1.061405429
    const p = 0.3275911

    const sign = x < 0 ? -1 : 1
    x = Math.abs(x) / Math.sqrt(2)

    const t = 1.0 / (1.0 + p * x)
    const y = 1.0 - (((((a5 * t + a4) * t) + a3) * t + a2) * t + a1) * t * Math.exp(-x * x)

    return 0.5 * (1.0 + sign * y)
  }

  private normalPDF(x: number): number {
    return Math.exp(-0.5 * x * x) / Math.sqrt(2 * Math.PI)
  }
}
```

### 2. Options Strategy Builder

Build and manage options strategies:

```typescript
class OptionsStrategyBuilder {
  private protocol: OptionsProtocol
  private positions: Map<string, OptionsStrategy> = new Map()

  async buildCoveredCall(
    asset: string,
    spotAmount: bigint,
    strikePrice: number,
    expiry: number
  ): Promise<OptionsStrategy> {
    // Buy spot and sell call
    const [spotTx, callOption] = await Promise.all([
      this.protocol.buySpot(asset, spotAmount),
      this.protocol.sellOption({
        asset,
        type: "call",
        strike: strikePrice,
        expiry,
        amount: spotAmount
      })
    ])

    const strategy: OptionsStrategy = {
      id: this.generateStrategyId(),
      name: "covered_call",
      legs: [
        { type: "spot", side: "long", amount: spotAmount, asset },
        {
          type: "option",
          side: "short",
          optionType: "call",
          strike: strikePrice,
          expiry,
          amount: spotAmount,
          premium: callOption.premium
        }
      ],
      maxProfit: (BigInt(Math.floor(strikePrice * 1e8)) - spotTx.avgPrice) * spotAmount / BigInt(1e8) + callOption.premium,
      maxLoss: spotTx.avgPrice * spotAmount, // Spot goes to zero
      breakeven: spotTx.avgPrice - callOption.premium / spotAmount,
      openedAt: Date.now()
    }

    this.positions.set(strategy.id, strategy)
    return strategy
  }

  async buildProtectivePut(
    asset: string,
    spotAmount: bigint,
    strikePrice: number,
    expiry: number
  ): Promise<OptionsStrategy> {
    // Buy spot and buy put
    const [spotTx, putOption] = await Promise.all([
      this.protocol.buySpot(asset, spotAmount),
      this.protocol.buyOption({
        asset,
        type: "put",
        strike: strikePrice,
        expiry,
        amount: spotAmount
      })
    ])

    const strategy: OptionsStrategy = {
      id: this.generateStrategyId(),
      name: "protective_put",
      legs: [
        { type: "spot", side: "long", amount: spotAmount, asset },
        {
          type: "option",
          side: "long",
          optionType: "put",
          strike: strikePrice,
          expiry,
          amount: spotAmount,
          premium: putOption.premium
        }
      ],
      maxProfit: "unlimited",
      maxLoss: (spotTx.avgPrice - BigInt(Math.floor(strikePrice * 1e8))) * spotAmount / BigInt(1e8) + putOption.premium,
      breakeven: spotTx.avgPrice + putOption.premium / spotAmount,
      openedAt: Date.now()
    }

    this.positions.set(strategy.id, strategy)
    return strategy
  }

  async buildIronCondor(
    asset: string,
    amount: bigint,
    strikes: { putBuy: number; putSell: number; callSell: number; callBuy: number },
    expiry: number
  ): Promise<OptionsStrategy> {
    // Buy OTM put, sell closer put, sell OTM call, buy further OTM call
    const [buyPut, sellPut, sellCall, buyCall] = await Promise.all([
      this.protocol.buyOption({ asset, type: "put", strike: strikes.putBuy, expiry, amount }),
      this.protocol.sellOption({ asset, type: "put", strike: strikes.putSell, expiry, amount }),
      this.protocol.sellOption({ asset, type: "call", strike: strikes.callSell, expiry, amount }),
      this.protocol.buyOption({ asset, type: "call", strike: strikes.callBuy, expiry, amount })
    ])

    const netCredit = sellPut.premium + sellCall.premium - buyPut.premium - buyCall.premium

    const strategy: OptionsStrategy = {
      id: this.generateStrategyId(),
      name: "iron_condor",
      legs: [
        { type: "option", side: "long", optionType: "put", strike: strikes.putBuy, expiry, amount, premium: buyPut.premium },
        { type: "option", side: "short", optionType: "put", strike: strikes.putSell, expiry, amount, premium: sellPut.premium },
        { type: "option", side: "short", optionType: "call", strike: strikes.callSell, expiry, amount, premium: sellCall.premium },
        { type: "option", side: "long", optionType: "call", strike: strikes.callBuy, expiry, amount, premium: buyCall.premium }
      ],
      maxProfit: netCredit,
      maxLoss: BigInt(Math.floor((strikes.putSell - strikes.putBuy) * 1e8)) * amount / BigInt(1e8) - netCredit,
      breakeven: [
        strikes.putSell - Number(netCredit) / Number(amount),
        strikes.callSell + Number(netCredit) / Number(amount)
      ],
      openedAt: Date.now()
    }

    this.positions.set(strategy.id, strategy)
    return strategy
  }

  async buildStraddle(
    asset: string,
    strikePrice: number,
    amount: bigint,
    expiry: number,
    direction: "long" | "short"
  ): Promise<OptionsStrategy> {
    const [callOption, putOption] = direction === "long"
      ? await Promise.all([
          this.protocol.buyOption({ asset, type: "call", strike: strikePrice, expiry, amount }),
          this.protocol.buyOption({ asset, type: "put", strike: strikePrice, expiry, amount })
        ])
      : await Promise.all([
          this.protocol.sellOption({ asset, type: "call", strike: strikePrice, expiry, amount }),
          this.protocol.sellOption({ asset, type: "put", strike: strikePrice, expiry, amount })
        ])

    const totalPremium = callOption.premium + putOption.premium

    const strategy: OptionsStrategy = {
      id: this.generateStrategyId(),
      name: direction === "long" ? "long_straddle" : "short_straddle",
      legs: [
        { type: "option", side: direction, optionType: "call", strike: strikePrice, expiry, amount, premium: callOption.premium },
        { type: "option", side: direction, optionType: "put", strike: strikePrice, expiry, amount, premium: putOption.premium }
      ],
      maxProfit: direction === "long" ? "unlimited" : totalPremium,
      maxLoss: direction === "long" ? totalPremium : "unlimited",
      breakeven: [
        strikePrice - Number(totalPremium) / Number(amount),
        strikePrice + Number(totalPremium) / Number(amount)
      ],
      openedAt: Date.now()
    }

    this.positions.set(strategy.id, strategy)
    return strategy
  }
}
```

### 3. Options Portfolio Manager

Manage options portfolio risk:

```typescript
class OptionsPortfolioManager {
  private positions: Map<string, OptionPosition[]> = new Map()
  private pricingEngine: OptionsPricingEngine

  async getPortfolioGreeks(): Promise<PortfolioGreeks> {
    let totalDelta = 0
    let totalGamma = 0
    let totalTheta = 0
    let totalVega = 0
    let totalValue = 0

    for (const [asset, positions] of this.positions) {
      const spotPrice = await this.getSpotPrice(asset)

      for (const pos of positions) {
        const timeToExpiry = (pos.expiry - Date.now()) / (365 * 24 * 60 * 60 * 1000)

        const pricing = await this.pricingEngine.calculateBlackScholes({
          spotPrice,
          strikePrice: pos.strike,
          timeToExpiry,
          volatility: pos.impliedVolatility,
          riskFreeRate: 0.05,
          optionType: pos.optionType
        })

        const multiplier = pos.side === "long" ? Number(pos.amount) : -Number(pos.amount)

        totalDelta += pricing.greeks.delta * multiplier
        totalGamma += pricing.greeks.gamma * multiplier
        totalTheta += pricing.greeks.theta * multiplier
        totalVega += pricing.greeks.vega * multiplier
        totalValue += pricing.price * Number(pos.amount)
      }
    }

    return {
      delta: totalDelta,
      gamma: totalGamma,
      theta: totalTheta,
      vega: totalVega,
      totalValue,
      timestamp: Date.now()
    }
  }

  async hedgeDelta(targetDelta: number = 0): Promise<HedgeResult> {
    const greeks = await this.getPortfolioGreeks()
    const deltaToHedge = greeks.delta - targetDelta

    if (Math.abs(deltaToHedge) < 0.01) {
      return { hedged: false, reason: "Delta already at target" }
    }

    // Hedge with spot or futures
    const hedgeAmount = BigInt(Math.abs(Math.floor(deltaToHedge * 1e18)))
    const hedgeSide = deltaToHedge > 0 ? "sell" : "buy"

    const tx = hedgeSide === "sell"
      ? await this.protocol.sellSpot(hedgeAmount)
      : await this.protocol.buySpot(hedgeAmount)

    return {
      hedged: true,
      previousDelta: greeks.delta,
      targetDelta,
      hedgeAmount,
      hedgeSide,
      txHash: tx.hash
    }
  }

  async rollPosition(
    positionId: string,
    newExpiry: number,
    newStrike?: number
  ): Promise<RollResult> {
    const position = this.findPosition(positionId)
    if (!position) throw new Error("Position not found")

    // Close current position
    const closeTx = position.side === "long"
      ? await this.protocol.sellOption({
          asset: position.asset,
          type: position.optionType,
          strike: position.strike,
          expiry: position.expiry,
          amount: position.amount
        })
      : await this.protocol.buyOption({
          asset: position.asset,
          type: position.optionType,
          strike: position.strike,
          expiry: position.expiry,
          amount: position.amount
        })

    // Open new position
    const strike = newStrike || position.strike
    const openTx = position.side === "long"
      ? await this.protocol.buyOption({
          asset: position.asset,
          type: position.optionType,
          strike,
          expiry: newExpiry,
          amount: position.amount
        })
      : await this.protocol.sellOption({
          asset: position.asset,
          type: position.optionType,
          strike,
          expiry: newExpiry,
          amount: position.amount
        })

    const rollCost = position.side === "long"
      ? openTx.premium - closeTx.premium
      : closeTx.premium - openTx.premium

    return {
      originalPosition: position,
      newExpiry,
      newStrike: strike,
      rollCost,
      closeTx: closeTx.hash,
      openTx: openTx.hash
    }
  }
}
```

## Best Practices

1. **Use Greeks** for portfolio risk management
2. **Monitor implied volatility** for mispricing
3. **Roll positions** before expiry to avoid exercise
4. **Hedge delta** for market-neutral strategies
5. **Account for theta decay** in long positions

## Related Skills

- [Perpetuals Agent](./perpetuals-agent.md) - Delta hedging
- [Volatility Tracker Agent](./volatility-tracker-agent.md) - Volatility analysis
- [Risk Assessment Agent](./risk-assessment-agent.md) - Position risk
