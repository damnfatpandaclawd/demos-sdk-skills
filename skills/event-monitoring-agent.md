# Event Monitoring Agent Skill

Build real-time event monitoring agents that watch blockchain events, price movements, and system state changes on Demos Network and connected chains.

## Overview

Event Monitoring enables agents to subscribe to blockchain events, detect specific patterns, and trigger automated responses - essential for trading bots, alert systems, and reactive automation.

## SDK Reference

```typescript
import { Demos } from "@kynesyslabs/demosdk/websdk"
import { EVM, Solana } from "@kynesyslabs/demosdk/xm-websdk"

// Demos node events
await demos.nodeCall("subscribe", { channel: "blocks" })
await demos.nodeCall("subscribe", { channel: "transactions" })
await demos.nodeCall("subscribe", { channel: "mempool" })

// Cross-chain event monitoring
const evm = await EVM.create(rpcUrl)
evm.provider.on("block", callback)
evm.provider.on(filter, callback)

// WebSocket connection
await demos.connectWebSocket(wsUrl)
demos.onMessage(callback)
```

## Event Types

| Event | Source | Use Case |
|-------|--------|----------|
| Block | Demos/XM | New block confirmation |
| Transaction | Demos/XM | Specific tx monitoring |
| Mempool | Demos | Pending tx detection |
| Price | Oracles | Price threshold alerts |
| Contract | EVM | Smart contract events |
| Transfer | All | Token movement tracking |

## Agent Use Cases

### 1. Price Alert Agent

Monitor prices and trigger actions:

```typescript
class PriceAlertAgent {
  private alerts: Map<string, PriceAlert>
  private priceFeeds: Map<string, PriceFeed>

  async addAlert(alert: PriceAlertConfig): Promise<string> {
    const alertId = crypto.randomUUID()

    this.alerts.set(alertId, {
      id: alertId,
      asset: alert.asset,
      condition: alert.condition, // "above" | "below" | "change"
      threshold: alert.threshold,
      callback: alert.callback,
      active: true,
      createdAt: Date.now()
    })

    // Start monitoring if not already
    if (!this.priceFeeds.has(alert.asset)) {
      await this.startPriceFeed(alert.asset)
    }

    return alertId
  }

  private async startPriceFeed(asset: string) {
    const feed = await this.createPriceFeed(asset)

    feed.onPrice(async (price: number) => {
      // Check all alerts for this asset
      for (const [id, alert] of this.alerts.entries()) {
        if (alert.asset !== asset || !alert.active) continue

        const triggered = this.checkCondition(price, alert)

        if (triggered) {
          await this.triggerAlert(alert, price)
        }
      }
    })

    this.priceFeeds.set(asset, feed)
  }

  private checkCondition(price: number, alert: PriceAlert): boolean {
    switch (alert.condition) {
      case "above":
        return price >= alert.threshold

      case "below":
        return price <= alert.threshold

      case "change":
        const changePercent = Math.abs((price - alert.lastPrice) / alert.lastPrice * 100)
        alert.lastPrice = price
        return changePercent >= alert.threshold

      default:
        return false
    }
  }

  private async triggerAlert(alert: PriceAlert, currentPrice: number) {
    // Mark as triggered to prevent duplicates
    alert.lastTriggered = Date.now()

    // Execute callback
    await alert.callback({
      alertId: alert.id,
      asset: alert.asset,
      condition: alert.condition,
      threshold: alert.threshold,
      currentPrice,
      timestamp: Date.now()
    })

    // One-time alerts become inactive
    if (alert.oneTime) {
      alert.active = false
    }
  }

  async removeAlert(alertId: string) {
    this.alerts.delete(alertId)
  }
}

// Usage
const priceAgent = new PriceAlertAgent()

await priceAgent.addAlert({
  asset: "ETH",
  condition: "above",
  threshold: 4000,
  callback: async (event) => {
    console.log(`ETH crossed $4000! Current: $${event.currentPrice}`)
    // Trigger sell order, notification, etc.
  }
})
```

### 2. Whale Watcher Agent

Monitor large transactions:

```typescript
class WhaleWatcherAgent {
  private demos: Demos
  private watchedAssets: Map<string, WhaleConfig>
  private observers: Map<string, Observer>

  async watchAsset(
    asset: string,
    config: WhaleConfig
  ): Promise<void> {
    this.watchedAssets.set(asset, config)

    // Subscribe to mempool for early detection
    await this.demos.nodeCall("subscribe", {
      channel: "mempool",
      filter: { asset }
    })

    // Subscribe to confirmed transactions
    await this.demos.nodeCall("subscribe", {
      channel: "transactions",
      filter: { asset }
    })
  }

  async handleTransaction(tx: Transaction) {
    const asset = this.extractAsset(tx)
    const config = this.watchedAssets.get(asset)

    if (!config) return

    const amount = this.extractAmount(tx)

    // Check if whale threshold met
    if (amount >= config.whaleThreshold) {
      const whaleEvent = await this.analyzeWhaleActivity(tx, amount)
      await this.notifyObservers(whaleEvent)
    }
  }

  private async analyzeWhaleActivity(
    tx: Transaction,
    amount: bigint
  ): Promise<WhaleEvent> {
    // Get sender/receiver info
    const sender = tx.content.sender
    const receiver = tx.content.receiver

    // Check if known whale address
    const isKnownWhale = await this.checkKnownWhales(sender)

    // Analyze intent
    const intent = await this.analyzeIntent(tx)

    // Check for related transactions
    const relatedTxs = await this.findRelatedTransactions(sender, receiver)

    return {
      txHash: tx.hash,
      amount,
      sender,
      receiver,
      isKnownWhale,
      intent,
      relatedTransactions: relatedTxs,
      timestamp: Date.now(),
      significance: this.calculateSignificance(amount, intent)
    }
  }

  private async analyzeIntent(tx: Transaction): Promise<WhaleIntent> {
    const receiver = tx.content.receiver

    // Check if receiver is an exchange
    if (await this.isExchangeAddress(receiver)) {
      return { type: "potential_sell", confidence: 0.8 }
    }

    // Check if receiver is a DeFi protocol
    if (await this.isDeFiProtocol(receiver)) {
      return { type: "defi_activity", confidence: 0.7 }
    }

    // Check if it's a cold storage address
    if (await this.isColdStorage(receiver)) {
      return { type: "accumulation", confidence: 0.6 }
    }

    return { type: "unknown", confidence: 0.3 }
  }

  registerObserver(observer: WhaleObserver) {
    this.observers.set(observer.id, observer)
  }

  private async notifyObservers(event: WhaleEvent) {
    for (const observer of this.observers.values()) {
      if (this.matchesFilters(event, observer.filters)) {
        await observer.onWhaleActivity(event)
      }
    }
  }
}
```

### 3. Contract Event Monitor Agent

Watch smart contract events:

```typescript
class ContractEventAgent {
  private evmInstances: Map<number, any>
  private subscriptions: Map<string, EventSubscription>

  async watchContract(
    chainId: number,
    contractAddress: string,
    eventSignatures: string[],
    callback: EventCallback
  ): Promise<string> {
    const subscriptionId = crypto.randomUUID()

    // Get or create EVM instance
    let evm = this.evmInstances.get(chainId)
    if (!evm) {
      evm = await EVM.create(this.getRpcUrl(chainId))
      this.evmInstances.set(chainId, evm)
    }

    // Create event filters
    const filters = eventSignatures.map(sig => ({
      address: contractAddress,
      topics: [this.getEventTopic(sig)]
    }))

    // Subscribe to each event
    for (const filter of filters) {
      evm.provider.on(filter, async (log: any) => {
        const decoded = await this.decodeEvent(log, eventSignatures)

        await callback({
          subscriptionId,
          chainId,
          contractAddress,
          eventName: decoded.name,
          args: decoded.args,
          blockNumber: log.blockNumber,
          transactionHash: log.transactionHash,
          timestamp: Date.now()
        })
      })
    }

    this.subscriptions.set(subscriptionId, {
      id: subscriptionId,
      chainId,
      contractAddress,
      eventSignatures,
      callback,
      active: true
    })

    return subscriptionId
  }

  async watchUniswapSwaps(
    poolAddress: string,
    chainId: number = 1
  ): Promise<string> {
    return await this.watchContract(
      chainId,
      poolAddress,
      ["Swap(address,uint256,uint256,uint256,uint256,address)"],
      async (event) => {
        const swap = {
          sender: event.args.sender,
          recipient: event.args.recipient,
          amount0In: event.args.amount0In,
          amount1In: event.args.amount1In,
          amount0Out: event.args.amount0Out,
          amount1Out: event.args.amount1Out
        }

        console.log(`Uniswap swap detected:`, swap)
        await this.processSwapEvent(swap)
      }
    )
  }

  async watchERC20Transfers(
    tokenAddress: string,
    chainId: number,
    options: { minAmount?: bigint; addresses?: string[] } = {}
  ): Promise<string> {
    return await this.watchContract(
      chainId,
      tokenAddress,
      ["Transfer(address,address,uint256)"],
      async (event) => {
        const transfer = {
          from: event.args.from,
          to: event.args.to,
          amount: event.args.value
        }

        // Apply filters
        if (options.minAmount && transfer.amount < options.minAmount) return
        if (options.addresses && !options.addresses.includes(transfer.from) && !options.addresses.includes(transfer.to)) return

        await this.processTransferEvent(transfer)
      }
    )
  }

  async unsubscribe(subscriptionId: string) {
    const sub = this.subscriptions.get(subscriptionId)
    if (!sub) return

    sub.active = false
    this.subscriptions.delete(subscriptionId)
  }
}
```

### 4. Block Monitor Agent

Monitor new blocks and extract insights:

```typescript
class BlockMonitorAgent {
  private demos: Demos
  private blockHandlers: Map<string, BlockHandler>
  private lastProcessedBlock: number = 0

  async startMonitoring(options: BlockMonitorOptions = {}) {
    // Subscribe to new blocks
    await this.demos.nodeCall("subscribe", { channel: "blocks" })

    // Process blocks as they arrive
    this.demos.onMessage(async (message: any) => {
      if (message.channel === "blocks") {
        await this.processBlock(message.data)
      }
    })

    // If starting from a past block, catch up
    if (options.startBlock) {
      await this.catchUpFromBlock(options.startBlock)
    }
  }

  async processBlock(block: Block) {
    // Prevent duplicate processing
    if (block.number <= this.lastProcessedBlock) return
    this.lastProcessedBlock = block.number

    // Extract block metrics
    const metrics = this.extractBlockMetrics(block)

    // Run all registered handlers
    for (const handler of this.blockHandlers.values()) {
      if (this.matchesHandlerFilters(block, handler)) {
        await handler.callback({
          block,
          metrics,
          timestamp: Date.now()
        })
      }
    }
  }

  private extractBlockMetrics(block: Block): BlockMetrics {
    const txs = block.transactions || []

    return {
      blockNumber: block.number,
      transactionCount: txs.length,
      totalValue: txs.reduce((acc, tx) => acc + (tx.value || 0n), 0n),
      avgGasPrice: this.calculateAvgGasPrice(txs),
      topSenders: this.getTopSenders(txs),
      topReceivers: this.getTopReceivers(txs),
      contractCreations: txs.filter(tx => !tx.to).length,
      timestamp: block.timestamp
    }
  }

  registerBlockHandler(
    id: string,
    handler: BlockHandler
  ) {
    this.blockHandlers.set(id, handler)
  }

  async detectMEVActivity(block: Block): Promise<MEVActivity[]> {
    const activities: MEVActivity[] = []
    const txs = block.transactions

    // Detect sandwich attacks
    const sandwiches = this.detectSandwichAttacks(txs)
    activities.push(...sandwiches)

    // Detect frontrunning
    const frontRuns = this.detectFrontrunning(txs)
    activities.push(...frontRuns)

    // Detect backrunning
    const backRuns = this.detectBackrunning(txs)
    activities.push(...backRuns)

    return activities
  }

  private detectSandwichAttacks(txs: Transaction[]): MEVActivity[] {
    const sandwiches: MEVActivity[] = []

    // Look for pattern: buy -> victim tx -> sell
    for (let i = 0; i < txs.length - 2; i++) {
      const potential = {
        frontTx: txs[i],
        victimTx: txs[i + 1],
        backTx: txs[i + 2]
      }

      if (this.isSandwichPattern(potential)) {
        sandwiches.push({
          type: "sandwich",
          attacker: potential.frontTx.from,
          victim: potential.victimTx.from,
          profit: this.calculateSandwichProfit(potential),
          transactions: [potential.frontTx.hash, potential.victimTx.hash, potential.backTx.hash]
        })
      }
    }

    return sandwiches
  }
}
```

### 5. Mempool Monitor Agent

Watch pending transactions before confirmation:

```typescript
class MempoolMonitorAgent {
  private demos: Demos
  private pendingTxs: Map<string, PendingTx>
  private patterns: Map<string, MempoolPattern>

  async startMonitoring() {
    await this.demos.nodeCall("subscribe", { channel: "mempool" })

    this.demos.onMessage(async (message: any) => {
      if (message.channel === "mempool") {
        await this.handleMempoolUpdate(message.data)
      }
    })
  }

  async handleMempoolUpdate(update: MempoolUpdate) {
    switch (update.type) {
      case "new":
        await this.handleNewTransaction(update.transaction)
        break

      case "removed":
        this.pendingTxs.delete(update.hash)
        break

      case "replaced":
        await this.handleReplacement(update.oldHash, update.newTransaction)
        break
    }
  }

  private async handleNewTransaction(tx: Transaction) {
    const analysis = await this.analyzePendingTx(tx)

    this.pendingTxs.set(tx.hash, {
      transaction: tx,
      analysis,
      detectedAt: Date.now()
    })

    // Check against registered patterns
    for (const [patternId, pattern] of this.patterns.entries()) {
      if (this.matchesPattern(tx, analysis, pattern)) {
        await pattern.callback({
          patternId,
          transaction: tx,
          analysis,
          timestamp: Date.now()
        })
      }
    }
  }

  private async analyzePendingTx(tx: Transaction): Promise<TxAnalysis> {
    return {
      type: this.classifyTransaction(tx),
      value: tx.value,
      gasBid: tx.gasPrice,
      priorityLevel: this.calculatePriority(tx),
      estimatedConfirmation: this.estimateConfirmationTime(tx),
      potentialMEV: await this.detectMEVOpportunity(tx),
      relatedPendingTxs: this.findRelatedPending(tx)
    }
  }

  registerPattern(
    patternId: string,
    pattern: MempoolPattern
  ) {
    this.patterns.set(patternId, pattern)
  }

  // Watch for specific address activity in mempool
  async watchAddress(
    address: string,
    callback: AddressCallback
  ): Promise<string> {
    const patternId = `address-${address}-${Date.now()}`

    this.registerPattern(patternId, {
      filter: (tx) => tx.from === address || tx.to === address,
      callback: async (event) => {
        await callback({
          address,
          direction: event.transaction.from === address ? "outgoing" : "incoming",
          ...event
        })
      }
    })

    return patternId
  }

  // Detect frontrunning opportunities
  async detectFrontrunOpportunities(): Promise<FrontrunOpportunity[]> {
    const opportunities: FrontrunOpportunity[] = []

    for (const [hash, pending] of this.pendingTxs.entries()) {
      if (pending.analysis.potentialMEV > 0) {
        opportunities.push({
          targetTx: hash,
          estimatedProfit: pending.analysis.potentialMEV,
          requiredGas: pending.transaction.gasPrice * 1.1, // 10% higher
          strategy: pending.analysis.mevStrategy
        })
      }
    }

    return opportunities.sort((a, b) => b.estimatedProfit - a.estimatedProfit)
  }
}
```

### 6. Health Monitor Agent

Monitor system and network health:

```typescript
class HealthMonitorAgent {
  private demos: Demos
  private healthChecks: Map<string, HealthCheck>
  private status: SystemStatus

  async startMonitoring(interval: number = 30000) {
    // Run health checks periodically
    setInterval(async () => {
      await this.runHealthChecks()
    }, interval)

    // Initial check
    await this.runHealthChecks()
  }

  async runHealthChecks(): Promise<HealthReport> {
    const results: HealthCheckResult[] = []

    // Check Demos node connectivity
    results.push(await this.checkDemosNode())

    // Check peer count
    results.push(await this.checkPeerCount())

    // Check block production
    results.push(await this.checkBlockProduction())

    // Check mempool size
    results.push(await this.checkMempoolHealth())

    // Check connected chains
    for (const chainId of this.monitoredChains) {
      results.push(await this.checkChainHealth(chainId))
    }

    // Custom health checks
    for (const [id, check] of this.healthChecks.entries()) {
      results.push(await this.runCustomCheck(id, check))
    }

    // Update status
    this.status = this.calculateOverallStatus(results)

    // Alert if unhealthy
    if (this.status.level === "critical" || this.status.level === "warning") {
      await this.sendHealthAlert(this.status, results)
    }

    return {
      timestamp: Date.now(),
      status: this.status,
      checks: results
    }
  }

  private async checkDemosNode(): Promise<HealthCheckResult> {
    try {
      const start = Date.now()
      await this.demos.getLastBlockNumber()
      const latency = Date.now() - start

      return {
        name: "demos_node",
        status: latency < 1000 ? "healthy" : latency < 3000 ? "degraded" : "unhealthy",
        latency,
        message: `Node responding in ${latency}ms`
      }
    } catch (error) {
      return {
        name: "demos_node",
        status: "unhealthy",
        error: error.message
      }
    }
  }

  private async checkBlockProduction(): Promise<HealthCheckResult> {
    const latestBlock = await this.demos.getLastBlockNumber()
    const blockTime = await this.getLastBlockTime()
    const timeSinceBlock = Date.now() - blockTime

    if (timeSinceBlock > 60000) { // 1 minute
      return {
        name: "block_production",
        status: "unhealthy",
        message: `No new blocks for ${Math.round(timeSinceBlock / 1000)}s`
      }
    }

    return {
      name: "block_production",
      status: "healthy",
      message: `Latest block: ${latestBlock}, ${Math.round(timeSinceBlock / 1000)}s ago`
    }
  }

  registerHealthCheck(
    id: string,
    check: HealthCheck
  ) {
    this.healthChecks.set(id, check)
  }

  getStatus(): SystemStatus {
    return this.status
  }
}
```

## Event Patterns

```typescript
// Common event patterns
const patterns = {
  // Large transfers
  whaleTransfer: (tx) => tx.value > BigInt("1000000000000000000000"), // > 1000 tokens

  // Contract interactions
  contractCall: (tx) => tx.data && tx.data.length > 2,

  // Specific method calls
  swapCall: (tx) => tx.data?.startsWith("0x38ed1739"), // Uniswap swap

  // Time-based
  recentTx: (tx) => Date.now() - tx.timestamp < 60000, // < 1 min old
}
```

## Best Practices

1. **Handle reconnections** - Network drops happen; implement automatic reconnection
2. **Rate limit callbacks** - Don't overwhelm systems with too many events
3. **Filter early** - Apply filters as early as possible to reduce processing
4. **Store state** - Track last processed block for recovery
5. **Clean up subscriptions** - Unsubscribe when no longer needed

## Integration with DemosWork

```typescript
const monitoringWorkflow = new DemosWork()

// Step 1: Set up monitoring
monitoringWorkflow.push(new BaseOperation(
  new NativeWorkStep({
    method: "events.subscribe",
    params: { channel: "transactions", filter: { minValue: threshold } }
  })
))

// Step 2: On event, execute action
monitoringWorkflow.push(new BaseOperation(
  new NativeWorkStep({
    method: "events.onTrigger",
    params: {
      callback: "{{step1.subscriptionId}}",
      action: { type: "alert", message: "Whale detected!" }
    }
  })
))
```

## Related Skills

- [Price Oracle Agent](./tlsnotary-oracle-agent.md) - Get verified price data
- [Transaction Builder](./transaction-builder-agent.md) - React to events with transactions
- [Messaging Agent](./messaging-agent.md) - Send alerts via messaging
