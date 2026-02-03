# Address Monitoring Agent Skill

> **⚠️ Prerequisites**: Complete [SDK Setup](./00-sdk-setup.md) first to configure your environment.

Build agents that monitor addresses for transactions, balance changes, and activity patterns.

## Overview

Address Monitoring enables real-time tracking of wallet activities, transaction notifications, and balance alerts. Essential for custody services, compliance monitoring, and automated response systems.

## SDK Reference

```typescript
import { Demos } from "@kynesyslabs/demosdk/websdk"

// Monitoring Methods
demos.subscribeToAddress(address, callback)   // Real-time monitoring
demos.getAddressInfo(address)                 // Current state
demos.getTransactionHistory(address, options) // Historical txs
demos.unsubscribe(subscriptionId)             // Stop monitoring
```

## Agent Use Cases

### 1. Whale Watcher Agent

Monitor large-value transactions:

```typescript
class WhaleWatcherAgent {
  private demos: Demos
  private whaleThreshold: bigint = 1000000000000n // 1000 DEM

  async monitorWhales(
    addresses: string[],
    onWhaleActivity: (activity: WhaleActivity) => void
  ): Promise<string[]> {
    const subscriptions: string[] = []

    for (const address of addresses) {
      const subId = await this.demos.subscribeToAddress(address, async (event) => {
        if (event.type === "transfer" && BigInt(event.amount) >= this.whaleThreshold) {
          onWhaleActivity({
            address,
            type: event.direction,
            amount: BigInt(event.amount),
            counterparty: event.counterparty,
            txHash: event.txHash,
            timestamp: Date.now()
          })
        }
      })
      subscriptions.push(subId)
    }

    return subscriptions
  }

  async getTopHolders(limit: number = 100): Promise<Holder[]> {
    // Query rich list
    const holders = await this.demos.nodeCall("getTopHolders", { limit })
    return holders.map((h: any) => ({
      address: h.address,
      balance: BigInt(h.balance),
      lastActive: h.lastTransaction
    }))
  }
}
```

### 2. Balance Alert Agent

Alert on balance thresholds:

```typescript
class BalanceAlertAgent {
  private demos: Demos
  private alerts: Map<string, BalanceAlert[]> = new Map()

  async setBalanceAlert(
    address: string,
    threshold: bigint,
    direction: "above" | "below",
    callback: (balance: bigint) => void
  ): Promise<string> {
    const alertId = this.generateAlertId()

    const addressAlerts = this.alerts.get(address) || []
    addressAlerts.push({ id: alertId, threshold, direction, callback, active: true })
    this.alerts.set(address, addressAlerts)

    // Start monitoring if first alert for this address
    if (addressAlerts.length === 1) {
      await this.startMonitoring(address)
    }

    return alertId
  }

  private async startMonitoring(address: string): Promise<void> {
    await this.demos.subscribeToAddress(address, async () => {
      const info = await this.demos.getAddressInfo(address)
      const balance = BigInt(info.balance)

      const alerts = this.alerts.get(address) || []
      for (const alert of alerts) {
        if (!alert.active) continue

        const shouldTrigger = alert.direction === "above"
          ? balance > alert.threshold
          : balance < alert.threshold

        if (shouldTrigger) {
          alert.callback(balance)
        }
      }
    })
  }

  async getLowBalanceAddresses(
    addresses: string[],
    minBalance: bigint
  ): Promise<LowBalanceAddress[]> {
    const lowBalance: LowBalanceAddress[] = []

    for (const address of addresses) {
      const info = await this.demos.getAddressInfo(address)
      if (BigInt(info.balance) < minBalance) {
        lowBalance.push({
          address,
          balance: BigInt(info.balance),
          deficit: minBalance - BigInt(info.balance)
        })
      }
    }

    return lowBalance
  }
}
```

### 3. Transaction Monitor Agent

Track all transactions for an address:

```typescript
class TransactionMonitorAgent {
  private demos: Demos

  async monitorTransactions(
    address: string,
    filters: TransactionFilters,
    onTransaction: (tx: Transaction) => void
  ): Promise<string> {
    return await this.demos.subscribeToAddress(address, (event) => {
      // Apply filters
      if (filters.minAmount && BigInt(event.amount) < filters.minAmount) return
      if (filters.types && !filters.types.includes(event.type)) return
      if (filters.direction && event.direction !== filters.direction) return

      onTransaction({
        hash: event.txHash,
        type: event.type,
        amount: BigInt(event.amount),
        direction: event.direction,
        counterparty: event.counterparty,
        timestamp: event.timestamp
      })
    })
  }

  async getActivitySummary(
    address: string,
    days: number = 30
  ): Promise<ActivitySummary> {
    const since = Date.now() - days * 24 * 60 * 60 * 1000
    const history = await this.demos.getTransactionHistory(address, { since })

    const summary: ActivitySummary = {
      totalTransactions: history.length,
      totalSent: 0n,
      totalReceived: 0n,
      uniqueCounterparties: new Set(),
      transactionsByType: {},
      transactionsByDay: {}
    }

    for (const tx of history) {
      if (tx.direction === "outgoing") {
        summary.totalSent += BigInt(tx.amount)
      } else {
        summary.totalReceived += BigInt(tx.amount)
      }

      summary.uniqueCounterparties.add(tx.counterparty)
      summary.transactionsByType[tx.type] = (summary.transactionsByType[tx.type] || 0) + 1

      const day = new Date(tx.timestamp).toISOString().split('T')[0]
      summary.transactionsByDay[day] = (summary.transactionsByDay[day] || 0) + 1
    }

    return summary
  }
}
```

## Best Practices

1. **Debounce callbacks** to avoid overwhelming downstream systems
2. **Use filters** to reduce noise
3. **Store history** for compliance and analytics
4. **Handle reconnection** gracefully
5. **Rate limit alerts** to prevent spam

## Related Skills

- [Event Monitoring Agent](./event-monitoring-agent.md) - Network events
- [Compliance Agent](./compliance-monitoring-agent.md) - Regulatory monitoring
