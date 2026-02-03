# Price Oracle Agent Skill

> **⚠️ Prerequisites**: Complete [SDK Setup](./00-sdk-setup.md) first to configure your environment.

Build agents that aggregate and provide reliable price feeds from multiple sources.

## Overview

Price Oracle Agent enables multi-source price aggregation with outlier detection, confidence scoring, and TWAP calculations. Essential for DeFi protocols, trading bots, and financial applications.

## SDK Reference

```typescript
import { Demos } from "@kynesyslabs/demosdk/websdk"

// DAHR for external price APIs
const dahr = await demos.web2.createDahr()
const response = await dahr.startProxy({ url, method: "GET" })

// TLSNotary for attested prices
import { TLSNotaryProver } from "@kynesyslabs/demosdk/tlsnotary"
```

## Agent Use Cases

### 1. Multi-Source Price Aggregator

Aggregate prices from multiple sources:

```typescript
class PriceAggregator {
  private sources: PriceSource[] = []
  private weights: Map<string, number> = new Map()

  async addSource(source: PriceSource, weight: number): Promise<void> {
    this.sources.push(source)
    this.weights.set(source.name, weight)
  }

  async getAggregatedPrice(pair: string): Promise<AggregatedPrice> {
    const prices = await Promise.allSettled(
      this.sources.map(async source => ({
        source: source.name,
        price: await source.getPrice(pair),
        timestamp: Date.now(),
        weight: this.weights.get(source.name) || 1
      }))
    )

    const validPrices = prices
      .filter((r): r is PromiseFulfilledResult<SourcePrice> =>
        r.status === "fulfilled")
      .map(r => r.value)

    if (validPrices.length === 0) {
      throw new Error("No valid prices available")
    }

    // Remove outliers
    const filteredPrices = this.removeOutliers(validPrices)

    // Calculate weighted average
    const weightedSum = filteredPrices.reduce(
      (sum, p) => sum + p.price * p.weight, 0
    )
    const totalWeight = filteredPrices.reduce(
      (sum, p) => sum + p.weight, 0
    )

    const aggregatedPrice = weightedSum / totalWeight

    // Calculate confidence based on source agreement
    const confidence = this.calculateConfidence(filteredPrices, aggregatedPrice)

    return {
      price: aggregatedPrice,
      confidence,
      sources: filteredPrices.length,
      timestamp: Date.now(),
      details: filteredPrices
    }
  }

  private removeOutliers(prices: SourcePrice[]): SourcePrice[] {
    if (prices.length < 3) return prices

    const values = prices.map(p => p.price)
    const median = this.calculateMedian(values)
    const mad = this.calculateMAD(values, median)

    // Remove prices more than 3 MADs from median
    return prices.filter(p =>
      Math.abs(p.price - median) <= 3 * mad * 1.4826
    )
  }

  private calculateConfidence(
    prices: SourcePrice[],
    aggregated: number
  ): number {
    if (prices.length < 2) return 0.5

    const deviations = prices.map(p =>
      Math.abs(p.price - aggregated) / aggregated
    )
    const avgDeviation = deviations.reduce((a, b) => a + b) / deviations.length

    // Higher agreement = higher confidence
    return Math.max(0, Math.min(1, 1 - avgDeviation * 10))
  }

  private calculateMedian(values: number[]): number {
    const sorted = [...values].sort((a, b) => a - b)
    const mid = Math.floor(sorted.length / 2)
    return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2
  }

  private calculateMAD(values: number[], median: number): number {
    const deviations = values.map(v => Math.abs(v - median))
    return this.calculateMedian(deviations)
  }
}
```

### 2. TWAP Oracle

Time-weighted average price calculation:

```typescript
class TWAPOracle {
  private priceHistory: Map<string, PricePoint[]> = new Map()
  private maxHistory: number = 86400000 // 24 hours

  async recordPrice(pair: string, price: number): Promise<void> {
    if (!this.priceHistory.has(pair)) {
      this.priceHistory.set(pair, [])
    }

    const history = this.priceHistory.get(pair)!
    history.push({ price, timestamp: Date.now() })

    // Prune old data
    const cutoff = Date.now() - this.maxHistory
    while (history.length > 0 && history[0].timestamp < cutoff) {
      history.shift()
    }
  }

  calculateTWAP(pair: string, windowMs: number): number | null {
    const history = this.priceHistory.get(pair)
    if (!history || history.length < 2) return null

    const cutoff = Date.now() - windowMs
    const relevantPrices = history.filter(p => p.timestamp >= cutoff)

    if (relevantPrices.length < 2) return null

    let weightedSum = 0
    let totalTime = 0

    for (let i = 1; i < relevantPrices.length; i++) {
      const timeDelta = relevantPrices[i].timestamp - relevantPrices[i - 1].timestamp
      const avgPrice = (relevantPrices[i].price + relevantPrices[i - 1].price) / 2

      weightedSum += avgPrice * timeDelta
      totalTime += timeDelta
    }

    return totalTime > 0 ? weightedSum / totalTime : null
  }

  getVolatility(pair: string, windowMs: number): number | null {
    const history = this.priceHistory.get(pair)
    if (!history || history.length < 10) return null

    const cutoff = Date.now() - windowMs
    const prices = history
      .filter(p => p.timestamp >= cutoff)
      .map(p => p.price)

    if (prices.length < 10) return null

    // Calculate returns
    const returns: number[] = []
    for (let i = 1; i < prices.length; i++) {
      returns.push(Math.log(prices[i] / prices[i - 1]))
    }

    // Calculate standard deviation of returns
    const mean = returns.reduce((a, b) => a + b) / returns.length
    const variance = returns.reduce((sum, r) =>
      sum + Math.pow(r - mean, 2), 0
    ) / returns.length

    return Math.sqrt(variance)
  }
}
```

### 3. Attested Price Oracle

Cryptographically attested price feeds:

```typescript
class AttestedPriceOracle {
  private demos: Demos
  private tlsNotary: TLSNotaryProver

  async getAttestedPrice(
    pair: string,
    source: string
  ): Promise<AttestedPrice> {
    // Fetch price with TLS attestation
    const proof = await this.tlsNotary.prove({
      url: `https://api.${source}.com/price/${pair}`,
      method: "GET",
      redactedPaths: ["$.apiKey"]
    })

    // Extract price from response
    const response = JSON.parse(proof.response)
    const price = parseFloat(response.price)

    // Store attestation on-chain
    const storage = await this.demos.storage.getProgram()
    await storage.set(
      `price:${pair}:${Date.now()}`,
      JSON.stringify({
        price,
        source,
        proof: proof.attestation,
        timestamp: Date.now()
      })
    )

    return {
      price,
      source,
      attestation: proof.attestation,
      timestamp: Date.now(),
      verified: true
    }
  }

  async verifyPrice(attestedPrice: AttestedPrice): Promise<boolean> {
    return await this.tlsNotary.verify(attestedPrice.attestation)
  }

  async getHistoricalAttestedPrices(
    pair: string,
    startTime: number,
    endTime: number
  ): Promise<AttestedPrice[]> {
    const storage = await this.demos.storage.getProgram()
    const prices: AttestedPrice[] = []

    // Scan storage for price entries
    const keys = await storage.list(`price:${pair}:`)

    for (const key of keys) {
      const timestamp = parseInt(key.split(":")[2])
      if (timestamp >= startTime && timestamp <= endTime) {
        const data = await storage.get(key)
        if (data) {
          prices.push(JSON.parse(data))
        }
      }
    }

    return prices.sort((a, b) => a.timestamp - b.timestamp)
  }
}
```

## Best Practices

1. **Use multiple sources** to avoid single points of failure
2. **Implement outlier detection** to filter manipulated prices
3. **Track source reliability** and adjust weights accordingly
4. **Store price history** for TWAP and volatility calculations
5. **Use attestations** for high-value applications

## Related Skills

- [TLSNotary Attestation](./tlsnotary-attestation-agent.md) - Price attestation
- [DAHR Web2 Proxy](./dahr-web2-proxy-agent.md) - API access
- [Data Indexing](./data-indexing-agent.md) - Historical data
