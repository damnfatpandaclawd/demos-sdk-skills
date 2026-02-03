# Data Indexing Agent Skill

> **⚠️ Prerequisites**: Complete [SDK Setup](./00-sdk-setup.md) first to configure your environment.

Build blockchain data indexing agents for querying, aggregating, and analyzing on-chain data across Demos Network and connected chains.

## Overview

Data Indexing enables agents to efficiently query blockchain data, build custom indexes, and maintain synchronized state - essential for analytics, dashboards, and real-time data applications.

## SDK Reference

```typescript
import { Demos } from "@kynesyslabs/demosdk/websdk"
import { EVM, Solana } from "@kynesyslabs/demosdk/xm-websdk"

// Demos Data Queries
await demos.nodeCall("getTransactions", { filter, limit, offset })
await demos.nodeCall("getBlocks", { startBlock, endBlock })
await demos.getAddressInfo(address)
await demos.getMempool()

// Cross-Chain Queries
const evm = await EVM.create(rpcUrl)
await evm.getLogs(filter)
await evm.getBlock(blockNumber)
await evm.getTransaction(txHash)
```

## Query Patterns

| Pattern | Use Case | Performance |
|---------|----------|-------------|
| Direct RPC | Single queries | Low latency |
| Event logs | Contract events | Efficient filtering |
| Block range | Historical data | Batch processing |
| State queries | Current state | Real-time |

## Agent Use Cases

### 1. Transaction Indexer Agent

Index and search transactions:

```typescript
class TransactionIndexerAgent {
  private demos: Demos
  private index: TransactionIndex
  private lastIndexedBlock: number = 0

  async startIndexing(startBlock?: number) {
    this.lastIndexedBlock = startBlock || await this.getLastIndexedBlock()

    while (true) {
      const latestBlock = await this.demos.getLastBlockNumber()

      if (this.lastIndexedBlock < latestBlock) {
        await this.indexBlockRange(this.lastIndexedBlock + 1, latestBlock)
        this.lastIndexedBlock = latestBlock
      }

      // Wait for new blocks
      await this.sleep(1000)
    }
  }

  private async indexBlockRange(startBlock: number, endBlock: number) {
    const BATCH_SIZE = 100

    for (let i = startBlock; i <= endBlock; i += BATCH_SIZE) {
      const batchEnd = Math.min(i + BATCH_SIZE - 1, endBlock)

      // Fetch blocks in batch
      const blocks = await this.demos.nodeCall("getBlocks", {
        startBlock: i,
        endBlock: batchEnd
      })

      // Index transactions from each block
      for (const block of blocks) {
        for (const tx of block.transactions) {
          await this.indexTransaction(tx, block)
        }
      }

      // Emit progress
      this.emit("indexing_progress", {
        currentBlock: batchEnd,
        latestBlock: endBlock,
        progress: (batchEnd - startBlock) / (endBlock - startBlock) * 100
      })
    }
  }

  private async indexTransaction(tx: Transaction, block: Block) {
    // Extract searchable fields
    const indexed: IndexedTransaction = {
      hash: tx.hash,
      blockNumber: block.number,
      timestamp: block.timestamp,
      from: tx.from,
      to: tx.to,
      value: tx.value,
      type: tx.type,
      status: tx.status,

      // Derived fields
      method: this.extractMethod(tx),
      tokens: await this.extractTokens(tx),
      tags: this.generateTags(tx)
    }

    // Store in index
    await this.index.put(indexed)

    // Update address indexes
    await this.updateAddressIndex(tx.from, indexed)
    if (tx.to) {
      await this.updateAddressIndex(tx.to, indexed)
    }
  }

  async search(query: TransactionQuery): Promise<SearchResult> {
    const filters: Filter[] = []

    if (query.address) {
      filters.push({ field: "addresses", operator: "contains", value: query.address })
    }

    if (query.type) {
      filters.push({ field: "type", operator: "eq", value: query.type })
    }

    if (query.minValue) {
      filters.push({ field: "value", operator: "gte", value: query.minValue })
    }

    if (query.startTime) {
      filters.push({ field: "timestamp", operator: "gte", value: query.startTime })
    }

    if (query.endTime) {
      filters.push({ field: "timestamp", operator: "lte", value: query.endTime })
    }

    const results = await this.index.query(filters, {
      limit: query.limit || 100,
      offset: query.offset || 0,
      orderBy: query.orderBy || "timestamp",
      orderDir: query.orderDir || "desc"
    })

    return {
      transactions: results.items,
      total: results.total,
      hasMore: results.total > (query.offset || 0) + results.items.length
    }
  }

  async getAddressHistory(address: string): Promise<AddressHistory> {
    const transactions = await this.search({ address, limit: 1000 })

    return {
      address,
      totalTransactions: transactions.total,
      firstActivity: transactions.transactions[transactions.transactions.length - 1]?.timestamp,
      lastActivity: transactions.transactions[0]?.timestamp,
      sent: transactions.transactions.filter(tx => tx.from === address),
      received: transactions.transactions.filter(tx => tx.to === address),
      totalSent: this.sumValues(transactions.transactions.filter(tx => tx.from === address)),
      totalReceived: this.sumValues(transactions.transactions.filter(tx => tx.to === address))
    }
  }
}
```

### 2. Event Log Indexer Agent

Index smart contract events:

```typescript
class EventLogIndexerAgent {
  private evmInstances: Map<number, any>
  private eventIndex: EventIndex

  async indexContractEvents(
    contracts: ContractConfig[]
  ): Promise<void> {
    for (const contract of contracts) {
      await this.indexContract(contract)
    }
  }

  private async indexContract(contract: ContractConfig) {
    const evm = await this.getEVMInstance(contract.chainId)

    // Get historical events
    const latestBlock = await evm.provider.getBlockNumber()
    const fromBlock = contract.deployBlock || 0

    // Process in batches
    const BATCH_SIZE = 10000

    for (let i = fromBlock; i <= latestBlock; i += BATCH_SIZE) {
      const toBlock = Math.min(i + BATCH_SIZE - 1, latestBlock)

      const logs = await evm.getLogs({
        address: contract.address,
        fromBlock: i,
        toBlock
      })

      for (const log of logs) {
        await this.indexEvent(contract, log)
      }
    }

    // Subscribe to new events
    await this.subscribeToEvents(contract)
  }

  private async indexEvent(contract: ContractConfig, log: Log) {
    // Decode event
    const decoded = await this.decodeEvent(contract.abi, log)

    const indexed: IndexedEvent = {
      contractAddress: contract.address,
      chainId: contract.chainId,
      blockNumber: log.blockNumber,
      transactionHash: log.transactionHash,
      logIndex: log.logIndex,
      eventName: decoded.name,
      args: decoded.args,
      timestamp: await this.getBlockTimestamp(contract.chainId, log.blockNumber),
      topics: log.topics,
      data: log.data
    }

    await this.eventIndex.put(indexed)
  }

  async queryEvents(query: EventQuery): Promise<EventSearchResult> {
    const filters: Filter[] = []

    if (query.contractAddress) {
      filters.push({ field: "contractAddress", operator: "eq", value: query.contractAddress })
    }

    if (query.eventName) {
      filters.push({ field: "eventName", operator: "eq", value: query.eventName })
    }

    if (query.chainId) {
      filters.push({ field: "chainId", operator: "eq", value: query.chainId })
    }

    // Filter by event args
    if (query.argFilters) {
      for (const [argName, argValue] of Object.entries(query.argFilters)) {
        filters.push({ field: `args.${argName}`, operator: "eq", value: argValue })
      }
    }

    return await this.eventIndex.query(filters, {
      limit: query.limit || 100,
      offset: query.offset || 0
    })
  }

  async aggregateEvents(
    query: EventAggregationQuery
  ): Promise<EventAggregation> {
    const events = await this.queryEvents({
      contractAddress: query.contractAddress,
      eventName: query.eventName,
      startTime: query.startTime,
      endTime: query.endTime,
      limit: 10000
    })

    // Aggregate by time period
    const buckets = this.bucketByTime(events.events, query.interval)

    return {
      contractAddress: query.contractAddress,
      eventName: query.eventName,
      interval: query.interval,
      buckets: buckets.map(bucket => ({
        timestamp: bucket.start,
        count: bucket.events.length,
        ...query.aggregations.reduce((acc, agg) => {
          acc[agg.name] = this.aggregate(bucket.events, agg)
          return acc
        }, {})
      }))
    }
  }
}
```

### 3. State Sync Agent

Maintain synchronized state:

```typescript
class StateSyncAgent {
  private demos: Demos
  private state: StateStore
  private subscriptions: Map<string, StateSubscription>

  async syncState(
    addresses: string[],
    options: SyncOptions = {}
  ): Promise<void> {
    // Initial sync
    for (const address of addresses) {
      await this.syncAddressState(address)
    }

    // Subscribe to changes
    await this.subscribeToStateChanges(addresses)
  }

  private async syncAddressState(address: string) {
    // Get current state
    const info = await this.demos.getAddressInfo(address)

    // Store state
    await this.state.put(address, {
      balance: info.balance,
      nonce: info.nonce,
      lastUpdated: Date.now()
    })

    // Get token balances
    const tokens = await this.getTokenBalances(address)
    for (const token of tokens) {
      await this.state.put(`${address}:${token.address}`, {
        balance: token.balance,
        lastUpdated: Date.now()
      })
    }
  }

  async getState(address: string): Promise<AddressState> {
    const state = await this.state.get(address)

    if (!state || Date.now() - state.lastUpdated > 60000) {
      // Refresh if stale
      await this.syncAddressState(address)
      return await this.state.get(address)
    }

    return state
  }

  async watchAddress(
    address: string,
    callback: StateChangeCallback
  ): Promise<string> {
    const subscriptionId = crypto.randomUUID()

    // Get initial state
    const initialState = await this.getState(address)

    // Create subscription
    this.subscriptions.set(subscriptionId, {
      address,
      callback,
      lastState: initialState
    })

    // Start watching
    this.startWatching(subscriptionId)

    return subscriptionId
  }

  private async startWatching(subscriptionId: string) {
    const sub = this.subscriptions.get(subscriptionId)
    if (!sub) return

    // Poll for changes (or use WebSocket if available)
    const interval = setInterval(async () => {
      if (!this.subscriptions.has(subscriptionId)) {
        clearInterval(interval)
        return
      }

      const currentState = await this.syncAddressState(sub.address)
      const newState = await this.state.get(sub.address)

      // Detect changes
      const changes = this.detectChanges(sub.lastState, newState)

      if (changes.length > 0) {
        sub.lastState = newState
        await sub.callback({
          address: sub.address,
          changes,
          newState
        })
      }
    }, 5000)
  }

  private detectChanges(oldState: AddressState, newState: AddressState): StateChange[] {
    const changes: StateChange[] = []

    if (oldState.balance !== newState.balance) {
      changes.push({
        type: "balance",
        oldValue: oldState.balance,
        newValue: newState.balance,
        delta: newState.balance - oldState.balance
      })
    }

    if (oldState.nonce !== newState.nonce) {
      changes.push({
        type: "nonce",
        oldValue: oldState.nonce,
        newValue: newState.nonce
      })
    }

    return changes
  }
}
```

### 4. Analytics Aggregator Agent

Build analytics from indexed data:

```typescript
class AnalyticsAggregatorAgent {
  private transactionIndex: TransactionIndexerAgent
  private eventIndex: EventLogIndexerAgent

  async getNetworkStats(
    timeRange: TimeRange
  ): Promise<NetworkStats> {
    const transactions = await this.transactionIndex.search({
      startTime: timeRange.start,
      endTime: timeRange.end,
      limit: 100000
    })

    return {
      timeRange,
      totalTransactions: transactions.total,
      totalVolume: this.calculateTotalVolume(transactions.transactions),
      uniqueAddresses: this.countUniqueAddresses(transactions.transactions),
      avgTransactionValue: this.calculateAverage(transactions.transactions),
      txsByType: this.groupByType(transactions.transactions),
      txsByHour: this.groupByHour(transactions.transactions)
    }
  }

  async getAddressAnalytics(
    address: string,
    timeRange: TimeRange
  ): Promise<AddressAnalytics> {
    const history = await this.transactionIndex.getAddressHistory(address)

    // Filter by time range
    const filtered = history.sent.concat(history.received)
      .filter(tx => tx.timestamp >= timeRange.start && tx.timestamp <= timeRange.end)

    return {
      address,
      timeRange,
      transactionCount: filtered.length,
      sentCount: filtered.filter(tx => tx.from === address).length,
      receivedCount: filtered.filter(tx => tx.to === address).length,
      netFlow: history.totalReceived - history.totalSent,
      topCounterparties: this.getTopCounterparties(filtered, address),
      activityByDay: this.groupByDay(filtered),
      avgTransactionSize: this.calculateAverage(filtered)
    }
  }

  async getTokenAnalytics(
    tokenAddress: string,
    chainId: number,
    timeRange: TimeRange
  ): Promise<TokenAnalytics> {
    // Get transfer events
    const transfers = await this.eventIndex.queryEvents({
      contractAddress: tokenAddress,
      chainId,
      eventName: "Transfer",
      startTime: timeRange.start,
      endTime: timeRange.end,
      limit: 100000
    })

    // Calculate metrics
    const uniqueHolders = new Set<string>()
    let totalVolume = 0n
    const volumeByDay: Record<string, bigint> = {}

    for (const event of transfers.events) {
      uniqueHolders.add(event.args.from)
      uniqueHolders.add(event.args.to)
      totalVolume += event.args.value

      const day = this.getDay(event.timestamp)
      volumeByDay[day] = (volumeByDay[day] || 0n) + event.args.value
    }

    return {
      tokenAddress,
      chainId,
      timeRange,
      totalTransfers: transfers.total,
      totalVolume,
      uniqueHolders: uniqueHolders.size,
      volumeByDay: Object.entries(volumeByDay).map(([day, volume]) => ({ day, volume })),
      topHolders: await this.getTopHolders(tokenAddress, chainId)
    }
  }

  async buildDashboardData(config: DashboardConfig): Promise<DashboardData> {
    const [
      networkStats,
      topTokens,
      topAddresses,
      recentActivity
    ] = await Promise.all([
      this.getNetworkStats(config.timeRange),
      this.getTopTokens(config.chainIds, config.timeRange),
      this.getTopAddresses(config.timeRange),
      this.getRecentActivity(config.limit)
    ])

    return {
      networkStats,
      topTokens,
      topAddresses,
      recentActivity,
      generatedAt: Date.now()
    }
  }
}
```

### 5. Real-time Feed Agent

Provide real-time data feeds:

```typescript
class RealTimeFeedAgent {
  private demos: Demos
  private subscribers: Map<string, FeedSubscriber[]>

  async startFeed(feedType: FeedType): Promise<void> {
    switch (feedType) {
      case "transactions":
        await this.startTransactionFeed()
        break

      case "blocks":
        await this.startBlockFeed()
        break

      case "prices":
        await this.startPriceFeed()
        break

      case "events":
        await this.startEventFeed()
        break
    }
  }

  private async startTransactionFeed() {
    // Subscribe to new transactions
    await this.demos.nodeCall("subscribe", { channel: "transactions" })

    this.demos.onMessage(async (message: any) => {
      if (message.channel === "transactions") {
        const enriched = await this.enrichTransaction(message.data)

        // Notify all subscribers
        const subscribers = this.subscribers.get("transactions") || []
        for (const sub of subscribers) {
          if (this.matchesFilters(enriched, sub.filters)) {
            await sub.callback(enriched)
          }
        }
      }
    })
  }

  async subscribe(
    feedType: FeedType,
    callback: FeedCallback,
    filters?: FeedFilters
  ): Promise<string> {
    const subscriptionId = crypto.randomUUID()

    const subscribers = this.subscribers.get(feedType) || []
    subscribers.push({
      id: subscriptionId,
      callback,
      filters
    })
    this.subscribers.set(feedType, subscribers)

    return subscriptionId
  }

  async unsubscribe(subscriptionId: string): Promise<void> {
    for (const [feedType, subscribers] of this.subscribers.entries()) {
      const filtered = subscribers.filter(s => s.id !== subscriptionId)
      this.subscribers.set(feedType, filtered)
    }
  }

  private async enrichTransaction(tx: Transaction): Promise<EnrichedTransaction> {
    return {
      ...tx,
      // Add derived data
      method: await this.decodeMethod(tx),
      tokenTransfers: await this.extractTokenTransfers(tx),
      valueUSD: await this.convertToUSD(tx.value),
      tags: this.generateTags(tx)
    }
  }

  async createWebSocketEndpoint(port: number): Promise<void> {
    const wss = new WebSocketServer({ port })

    wss.on("connection", (ws) => {
      const clientSubscriptions: string[] = []

      ws.on("message", async (message) => {
        const { action, feedType, filters } = JSON.parse(message.toString())

        if (action === "subscribe") {
          const subId = await this.subscribe(feedType, (data) => {
            ws.send(JSON.stringify({ feedType, data }))
          }, filters)
          clientSubscriptions.push(subId)
        }

        if (action === "unsubscribe") {
          for (const subId of clientSubscriptions) {
            await this.unsubscribe(subId)
          }
        }
      })

      ws.on("close", async () => {
        for (const subId of clientSubscriptions) {
          await this.unsubscribe(subId)
        }
      })
    })
  }
}
```

### 6. Cross-Chain Data Aggregator

Aggregate data across chains:

```typescript
class CrossChainAggregatorAgent {
  private indexers: Map<number, TransactionIndexerAgent>

  async aggregateAcrossChains(
    addresses: string[],
    chainIds: number[]
  ): Promise<CrossChainAggregation> {
    const results: ChainData[] = []

    for (const chainId of chainIds) {
      const indexer = this.indexers.get(chainId)
      if (!indexer) continue

      for (const address of addresses) {
        const history = await indexer.getAddressHistory(address)
        results.push({
          chainId,
          address,
          ...history
        })
      }
    }

    // Aggregate across chains
    const totalTransactions = results.reduce((acc, r) => acc + r.totalTransactions, 0)
    const totalSent = results.reduce((acc, r) => acc + r.totalSent, 0n)
    const totalReceived = results.reduce((acc, r) => acc + r.totalReceived, 0n)

    return {
      addresses,
      chainIds,
      totalTransactions,
      totalSent,
      totalReceived,
      byChain: this.groupByChain(results),
      byAddress: this.groupByAddress(results),
      crossChainTransfers: await this.detectCrossChainTransfers(results)
    }
  }

  async findCrossChainActivity(address: string): Promise<CrossChainActivity> {
    const chainIds = Array.from(this.indexers.keys())
    const activity: ChainActivity[] = []

    for (const chainId of chainIds) {
      const indexer = this.indexers.get(chainId)!
      const history = await indexer.getAddressHistory(address)

      if (history.totalTransactions > 0) {
        activity.push({
          chainId,
          chainName: this.getChainName(chainId),
          firstSeen: history.firstActivity,
          lastSeen: history.lastActivity,
          transactionCount: history.totalTransactions,
          totalVolume: history.totalSent + history.totalReceived
        })
      }
    }

    return {
      address,
      activeChains: activity.length,
      activity,
      mostActiveChain: activity.sort((a, b) => b.transactionCount - a.transactionCount)[0],
      bridgeTransactions: await this.findBridgeTransactions(address)
    }
  }
}
```

## Index Storage Patterns

| Storage | Use Case | Characteristics |
|---------|----------|-----------------|
| LevelDB | Local indexing | Fast, embedded |
| PostgreSQL | Complex queries | SQL, relations |
| Elasticsearch | Full-text search | Scalable search |
| Redis | Real-time cache | In-memory speed |

## Best Practices

1. **Index incrementally** - Don't reindex everything
2. **Use batching** for bulk operations
3. **Implement checkpoints** for recovery
4. **Cache frequently accessed data**
5. **Monitor index health** and latency

## Integration with DemosWork

```typescript
const indexingWorkflow = new DemosWork()

// Step 1: Query indexed data
indexingWorkflow.push(new BaseOperation(
  new NativeWorkStep({
    method: "index.search",
    params: { query: searchParams }
  })
))

// Step 2: Aggregate results
indexingWorkflow.push(new BaseOperation(
  new NativeWorkStep({
    method: "analytics.aggregate",
    params: { data: "{{step1.result}}" }
  })
))
```

## Related Skills

- [Event Monitoring](./event-monitoring-agent.md) - Real-time event capture
- [Transaction Builder](./transaction-builder-agent.md) - Data for transaction analysis
- [Token Discovery](./token-discovery-agent.md) - Token indexing
