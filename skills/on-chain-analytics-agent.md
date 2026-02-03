# On-Chain Analytics Agent Skill

Build agents that analyze blockchain data for insights and patterns.

## Overview

On-Chain Analytics Agent enables deep analysis of transaction patterns, address behaviors, and protocol metrics. Essential for research, alpha generation, and risk assessment.

## SDK Reference

```typescript
import { Demos } from "@kynesyslabs/demosdk/websdk"
import { EVM } from "@kynesyslabs/demosdk/xm-websdk"

// Query blockchain data
const blockNumber = await demos.getLastBlockNumber()
const txs = await demos.nodeCall("getTransactions", params)
```

## Agent Use Cases

### 1. Transaction Pattern Analyzer

Analyze transaction patterns:

```typescript
class TransactionPatternAnalyzer {
  private demos: Demos

  async analyzeAddressPatterns(
    address: string,
    days: number = 30
  ): Promise<AddressAnalysis> {
    const txs = await this.getTransactions(address, days)

    return {
      address,
      summary: this.calculateSummary(txs),
      patterns: this.detectPatterns(txs),
      behaviors: this.classifyBehaviors(txs),
      riskScore: this.calculateRiskScore(txs),
      timeline: this.buildTimeline(txs)
    }
  }

  private calculateSummary(txs: Transaction[]): TxSummary {
    const incoming = txs.filter(tx => tx.direction === "in")
    const outgoing = txs.filter(tx => tx.direction === "out")

    return {
      totalTransactions: txs.length,
      incomingCount: incoming.length,
      outgoingCount: outgoing.length,
      totalInflow: incoming.reduce((sum, tx) => sum + tx.value, 0n),
      totalOutflow: outgoing.reduce((sum, tx) => sum + tx.value, 0n),
      netFlow: incoming.reduce((sum, tx) => sum + tx.value, 0n) -
               outgoing.reduce((sum, tx) => sum + tx.value, 0n),
      uniqueCounterparties: new Set(txs.map(tx => tx.counterparty)).size,
      avgTransactionSize: txs.reduce((sum, tx) => sum + tx.value, 0n) /
                          BigInt(txs.length || 1),
      firstActivity: Math.min(...txs.map(tx => tx.timestamp)),
      lastActivity: Math.max(...txs.map(tx => tx.timestamp))
    }
  }

  private detectPatterns(txs: Transaction[]): Pattern[] {
    const patterns: Pattern[] = []

    // Detect regular transfers (salary, subscriptions)
    const regularPattern = this.detectRegularTransfers(txs)
    if (regularPattern) patterns.push(regularPattern)

    // Detect DCA pattern
    const dcaPattern = this.detectDCAPattern(txs)
    if (dcaPattern) patterns.push(dcaPattern)

    // Detect accumulation/distribution
    const accDistPattern = this.detectAccDistPattern(txs)
    if (accDistPattern) patterns.push(accDistPattern)

    // Detect circular transactions (potential wash trading)
    const circularPattern = this.detectCircularTx(txs)
    if (circularPattern) patterns.push(circularPattern)

    return patterns
  }

  private detectRegularTransfers(txs: Transaction[]): Pattern | null {
    // Group by counterparty
    const byCounterparty = new Map<string, Transaction[]>()
    for (const tx of txs) {
      if (!byCounterparty.has(tx.counterparty)) {
        byCounterparty.set(tx.counterparty, [])
      }
      byCounterparty.get(tx.counterparty)!.push(tx)
    }

    // Find regular patterns
    for (const [counterparty, counterpartyTxs] of byCounterparty) {
      if (counterpartyTxs.length < 3) continue

      const sorted = counterpartyTxs.sort((a, b) => a.timestamp - b.timestamp)
      const intervals: number[] = []

      for (let i = 1; i < sorted.length; i++) {
        intervals.push(sorted[i].timestamp - sorted[i - 1].timestamp)
      }

      const avgInterval = intervals.reduce((a, b) => a + b) / intervals.length
      const variance = intervals.reduce(
        (sum, i) => sum + Math.pow(i - avgInterval, 2), 0
      ) / intervals.length

      // Low variance = regular pattern
      if (variance < avgInterval * 0.1) {
        const periodDays = Math.round(avgInterval / (24 * 60 * 60 * 1000))
        return {
          type: "regular_transfer",
          counterparty,
          frequency: `Every ${periodDays} days`,
          avgAmount: counterpartyTxs.reduce((sum, tx) => sum + tx.value, 0n) /
                     BigInt(counterpartyTxs.length),
          confidence: 0.9
        }
      }
    }

    return null
  }

  private classifyBehaviors(txs: Transaction[]): Behavior[] {
    const behaviors: Behavior[] = []

    // Check if trader
    const swapTxs = txs.filter(tx => tx.type === "swap")
    if (swapTxs.length > txs.length * 0.3) {
      behaviors.push({
        type: "trader",
        score: swapTxs.length / txs.length,
        description: "Frequent trading activity"
      })
    }

    // Check if DeFi user
    const defiTxs = txs.filter(tx =>
      ["stake", "unstake", "lend", "borrow", "farm"].includes(tx.type)
    )
    if (defiTxs.length > 0) {
      behaviors.push({
        type: "defi_user",
        score: defiTxs.length / txs.length,
        description: "Active DeFi participant"
      })
    }

    // Check if NFT collector
    const nftTxs = txs.filter(tx => tx.type === "nft_transfer")
    if (nftTxs.length > 5) {
      behaviors.push({
        type: "nft_collector",
        score: Math.min(nftTxs.length / 20, 1),
        description: "NFT collection activity"
      })
    }

    return behaviors
  }
}
```

### 2. Protocol Metrics Analyzer

Analyze protocol-level metrics:

```typescript
class ProtocolMetricsAnalyzer {
  async analyzeProtocol(
    protocolAddress: string,
    days: number = 30
  ): Promise<ProtocolMetrics> {
    const [
      tvlHistory,
      volumeHistory,
      userHistory,
      revenueHistory
    ] = await Promise.all([
      this.getTVLHistory(protocolAddress, days),
      this.getVolumeHistory(protocolAddress, days),
      this.getUserHistory(protocolAddress, days),
      this.getRevenueHistory(protocolAddress, days)
    ])

    return {
      tvl: {
        current: tvlHistory[tvlHistory.length - 1].value,
        change24h: this.calculateChange(tvlHistory, 1),
        change7d: this.calculateChange(tvlHistory, 7),
        change30d: this.calculateChange(tvlHistory, 30),
        history: tvlHistory
      },
      volume: {
        daily: this.calculateDailyAvg(volumeHistory),
        weekly: this.calculateWeeklyAvg(volumeHistory),
        change: this.calculateVolumeChange(volumeHistory)
      },
      users: {
        total: userHistory[userHistory.length - 1].total,
        daily: userHistory[userHistory.length - 1].daily,
        retention: this.calculateRetention(userHistory),
        growth: this.calculateUserGrowth(userHistory)
      },
      revenue: {
        total: revenueHistory.reduce((sum, r) => sum + r.value, 0n),
        daily: this.calculateDailyAvg(revenueHistory),
        perUser: this.calculateRevenuePerUser(revenueHistory, userHistory)
      },
      health: this.calculateHealthScore(tvlHistory, volumeHistory, userHistory)
    }
  }

  private calculateHealthScore(
    tvl: DataPoint[],
    volume: DataPoint[],
    users: UserDataPoint[]
  ): HealthScore {
    let score = 50 // Base score

    // TVL trend (max +20 points)
    const tvlChange = this.calculateChange(tvl, 7)
    score += Math.min(20, Math.max(-20, tvlChange * 100))

    // Volume trend (max +15 points)
    const volumeChange = this.calculateVolumeChange(volume)
    score += Math.min(15, Math.max(-15, volumeChange * 50))

    // User growth (max +15 points)
    const userGrowth = this.calculateUserGrowth(users)
    score += Math.min(15, Math.max(-15, userGrowth * 50))

    return {
      score: Math.max(0, Math.min(100, score)),
      grade: score >= 80 ? "A" : score >= 60 ? "B" : score >= 40 ? "C" : "D",
      factors: {
        tvlTrend: tvlChange > 0 ? "positive" : "negative",
        volumeTrend: volumeChange > 0 ? "positive" : "negative",
        userTrend: userGrowth > 0 ? "growing" : "declining"
      }
    }
  }
}
```

### 3. Network Analysis Agent

Analyze address relationships:

```typescript
class NetworkAnalysisAgent {
  async analyzeAddressNetwork(
    address: string,
    depth: number = 2
  ): Promise<NetworkAnalysis> {
    const network = new Map<string, AddressNode>()
    const edges: Edge[] = []

    await this.buildNetwork(address, depth, network, edges, new Set())

    return {
      centerAddress: address,
      nodes: Array.from(network.values()),
      edges,
      clusters: this.detectClusters(network, edges),
      metrics: this.calculateNetworkMetrics(network, edges),
      risks: this.identifyRisks(network, edges)
    }
  }

  private async buildNetwork(
    address: string,
    depth: number,
    network: Map<string, AddressNode>,
    edges: Edge[],
    visited: Set<string>
  ): Promise<void> {
    if (depth === 0 || visited.has(address)) return
    visited.add(address)

    // Get address info
    const info = await this.getAddressInfo(address)
    network.set(address, {
      address,
      label: info.label,
      type: info.type,
      balance: info.balance,
      txCount: info.txCount
    })

    // Get transactions
    const txs = await this.getTransactions(address, 30)

    // Process counterparties
    const counterparties = new Map<string, { count: number; volume: bigint }>()

    for (const tx of txs) {
      const cp = tx.counterparty
      if (!counterparties.has(cp)) {
        counterparties.set(cp, { count: 0, volume: 0n })
      }
      const data = counterparties.get(cp)!
      data.count++
      data.volume += tx.value
    }

    // Add edges for significant relationships
    for (const [counterparty, data] of counterparties) {
      if (data.count >= 2 || data.volume > BigInt(1e18)) {
        edges.push({
          source: address,
          target: counterparty,
          weight: data.count,
          volume: data.volume
        })

        // Recurse for significant counterparties
        if (data.count >= 5) {
          await this.buildNetwork(counterparty, depth - 1, network, edges, visited)
        }
      }
    }
  }

  private detectClusters(
    network: Map<string, AddressNode>,
    edges: Edge[]
  ): Cluster[] {
    // Simple clustering based on connectivity
    const clusters: Cluster[] = []
    const assigned = new Set<string>()

    for (const [address] of network) {
      if (assigned.has(address)) continue

      const cluster = this.expandCluster(address, edges, assigned)
      if (cluster.size > 1) {
        clusters.push({
          id: `cluster-${clusters.length}`,
          addresses: Array.from(cluster),
          size: cluster.size,
          totalVolume: this.calculateClusterVolume(cluster, edges)
        })
      }
    }

    return clusters
  }

  private identifyRisks(
    network: Map<string, AddressNode>,
    edges: Edge[]
  ): Risk[] {
    const risks: Risk[] = []

    // Check for mixer/tumbler patterns
    const highVolumeNodes = Array.from(network.values())
      .filter(n => n.txCount > 100 && !n.label)

    if (highVolumeNodes.length > 0) {
      risks.push({
        type: "potential_mixer",
        severity: "medium",
        addresses: highVolumeNodes.map(n => n.address),
        description: "High transaction count unlabeled addresses"
      })
    }

    // Check for circular transactions
    const circular = this.findCircularPaths(edges)
    if (circular.length > 0) {
      risks.push({
        type: "circular_transactions",
        severity: "high",
        paths: circular,
        description: "Potential wash trading or money laundering"
      })
    }

    return risks
  }
}
```

## Best Practices

1. **Index data efficiently** for fast queries
2. **Cache results** to reduce RPC calls
3. **Use sampling** for large datasets
4. **Track metrics over time** for trend analysis
5. **Combine multiple signals** for robust conclusions

## Related Skills

- [Data Indexing](./data-indexing-agent.md) - Data storage
- [Whale Tracker](./whale-tracker-agent.md) - Large holder analysis
- [Compliance Monitoring](./compliance-monitoring-agent.md) - Risk detection
