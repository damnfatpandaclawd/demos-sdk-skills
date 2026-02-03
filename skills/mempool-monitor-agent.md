# Mempool Monitor Agent Skill

> **⚠️ Prerequisites**: Complete [SDK Setup](./00-sdk-setup.md) first to configure your environment.

Build agents that monitor and analyze mempool transactions.

## Overview

Mempool Monitor Agent enables real-time transaction monitoring, pending transaction analysis, and MEV opportunity detection. Essential for trading bots, arbitrage, and transaction management.

## SDK Reference

```typescript
import { Demos } from "@kynesyslabs/demosdk/websdk"
import { EVM } from "@kynesyslabs/demosdk/xm-websdk"

// Mempool access
const mempool = await demos.getMempool()
```

## Agent Use Cases

### 1. Pending Transaction Monitor

Monitor and analyze pending transactions:

```typescript
class PendingTransactionMonitor {
  private demos: Demos
  private pendingTxs: Map<string, PendingTransaction> = new Map()
  private callbacks: TransactionCallback[] = []

  async startMonitoring(): Promise<void> {
    // Subscribe to mempool
    this.demos.provider.on("pending", async (txHash: string) => {
      try {
        const tx = await this.demos.provider.getTransaction(txHash)
        if (tx) {
          await this.processPendingTransaction(tx)
        }
      } catch {
        // Transaction may have been mined already
      }
    })
  }

  private async processPendingTransaction(tx: Transaction): Promise<void> {
    const analyzed: PendingTransaction = {
      hash: tx.hash,
      from: tx.from,
      to: tx.to,
      value: tx.value,
      gasPrice: tx.gasPrice || tx.maxFeePerGas,
      gasLimit: tx.gasLimit,
      nonce: tx.nonce,
      data: tx.data,
      timestamp: Date.now(),
      decoded: await this.decodeTransaction(tx),
      classification: this.classifyTransaction(tx)
    }

    this.pendingTxs.set(tx.hash, analyzed)

    // Notify callbacks
    for (const callback of this.callbacks) {
      if (this.matchesFilter(analyzed, callback.filter)) {
        callback.handler(analyzed)
      }
    }

    // Cleanup old entries
    this.cleanupOld()
  }

  private async decodeTransaction(tx: Transaction): Promise<DecodedTx | null> {
    if (!tx.data || tx.data === "0x") return null

    // Try to decode using known ABIs
    const selector = tx.data.slice(0, 10)

    // Common DEX selectors
    const knownSelectors: Record<string, string> = {
      "0x38ed1739": "swapExactTokensForTokens",
      "0x8803dbee": "swapTokensForExactTokens",
      "0x7ff36ab5": "swapExactETHForTokens",
      "0x4a25d94a": "swapTokensForExactETH",
      "0x18cbafe5": "swapExactTokensForETH",
      "0xa9059cbb": "transfer",
      "0x23b872dd": "transferFrom",
      "0x095ea7b3": "approve"
    }

    const methodName = knownSelectors[selector]
    if (!methodName) return null

    return {
      method: methodName,
      selector,
      params: this.decodeParams(tx.data, methodName)
    }
  }

  private classifyTransaction(tx: Transaction): TxClassification {
    if (!tx.to) return { type: "contract_deployment", priority: "high" }

    if (!tx.data || tx.data === "0x") {
      return { type: "transfer", priority: "normal" }
    }

    const selector = tx.data.slice(0, 10)

    // DEX transactions
    if (["0x38ed1739", "0x8803dbee", "0x7ff36ab5"].includes(selector)) {
      return { type: "swap", priority: "high" }
    }

    // Token operations
    if (["0xa9059cbb", "0x23b872dd"].includes(selector)) {
      return { type: "token_transfer", priority: "normal" }
    }

    if (selector === "0x095ea7b3") {
      return { type: "approval", priority: "low" }
    }

    return { type: "contract_call", priority: "normal" }
  }

  async getPendingForAddress(address: string): Promise<PendingTransaction[]> {
    return Array.from(this.pendingTxs.values())
      .filter(tx => tx.from === address || tx.to === address)
  }

  async getPendingSwaps(): Promise<PendingTransaction[]> {
    return Array.from(this.pendingTxs.values())
      .filter(tx => tx.classification.type === "swap")
  }

  onTransaction(
    filter: TransactionFilter,
    handler: (tx: PendingTransaction) => void
  ): () => void {
    const callback = { filter, handler }
    this.callbacks.push(callback)

    return () => {
      const index = this.callbacks.indexOf(callback)
      if (index > -1) this.callbacks.splice(index, 1)
    }
  }
}
```

### 2. MEV Opportunity Detector

Detect MEV opportunities in mempool:

```typescript
class MEVOpportunityDetector {
  private monitor: PendingTransactionMonitor
  private opportunities: MEVOpportunity[] = []

  async startDetection(): Promise<void> {
    // Listen for swap transactions
    this.monitor.onTransaction(
      { type: "swap" },
      async tx => await this.analyzeForMEV(tx)
    )
  }

  private async analyzeForMEV(tx: PendingTransaction): Promise<void> {
    // Check for sandwich opportunity
    const sandwich = await this.checkSandwichOpportunity(tx)
    if (sandwich) {
      this.opportunities.push(sandwich)
      this.emitOpportunity(sandwich)
    }

    // Check for backrun opportunity
    const backrun = await this.checkBackrunOpportunity(tx)
    if (backrun) {
      this.opportunities.push(backrun)
      this.emitOpportunity(backrun)
    }

    // Check for arbitrage trigger
    const arb = await this.checkArbitrageOpportunity(tx)
    if (arb) {
      this.opportunities.push(arb)
      this.emitOpportunity(arb)
    }
  }

  private async checkSandwichOpportunity(
    tx: PendingTransaction
  ): Promise<MEVOpportunity | null> {
    if (!tx.decoded || tx.decoded.method !== "swapExactTokensForTokens") {
      return null
    }

    const params = tx.decoded.params
    const amountIn = params.amountIn
    const amountOutMin = params.amountOutMin
    const path = params.path

    // Calculate potential slippage
    const slippageTolerance = (amountIn - amountOutMin) / amountIn

    // Only target transactions with significant slippage
    if (slippageTolerance < 0.01) return null

    // Simulate sandwich attack
    const simulation = await this.simulateSandwich(tx, path, amountIn)

    if (simulation.profit > 0n) {
      return {
        type: "sandwich",
        targetTx: tx.hash,
        estimatedProfit: simulation.profit,
        gasRequired: simulation.gasRequired,
        frontrunTx: simulation.frontrunData,
        backrunTx: simulation.backrunData,
        confidence: 0.8,
        expiresAt: Date.now() + 10000 // 10 seconds
      }
    }

    return null
  }

  private async checkBackrunOpportunity(
    tx: PendingTransaction
  ): Promise<MEVOpportunity | null> {
    // Check if this swap creates an arbitrage opportunity
    if (!tx.decoded || !tx.decoded.params.path) return null

    const path = tx.decoded.params.path
    const amountIn = tx.decoded.params.amountIn

    // Get current prices
    const preBuyPrice = await this.getPrice(path[0], path[path.length - 1])

    // Estimate price impact
    const priceImpact = await this.estimatePriceImpact(
      path,
      amountIn
    )

    // If significant price impact, check for reverse arbitrage
    if (priceImpact > 0.005) { // 0.5% impact
      const arbProfit = await this.calculateArbProfit(
        path.reverse(),
        priceImpact
      )

      if (arbProfit > 0n) {
        return {
          type: "backrun",
          targetTx: tx.hash,
          estimatedProfit: arbProfit,
          gasRequired: 200000n,
          backrunTx: await this.buildBackrunTx(path, priceImpact),
          confidence: 0.7,
          expiresAt: Date.now() + 10000
        }
      }
    }

    return null
  }

  getRecentOpportunities(
    type?: MEVType,
    limit: number = 10
  ): MEVOpportunity[] {
    let filtered = this.opportunities

    if (type) {
      filtered = filtered.filter(o => o.type === type)
    }

    return filtered
      .filter(o => o.expiresAt > Date.now())
      .slice(-limit)
  }
}
```

### 3. Transaction Tracker

Track transaction lifecycle:

```typescript
class TransactionTracker {
  private tracked: Map<string, TrackedTransaction> = new Map()

  async trackTransaction(txHash: string): Promise<TrackedTransaction> {
    const tx = await this.demos.provider.getTransaction(txHash)

    if (!tx) {
      throw new Error("Transaction not found")
    }

    const tracked: TrackedTransaction = {
      hash: txHash,
      status: "pending",
      firstSeen: Date.now(),
      from: tx.from,
      to: tx.to,
      value: tx.value,
      gasPrice: tx.gasPrice,
      nonce: tx.nonce,
      history: [{
        status: "pending",
        timestamp: Date.now()
      }]
    }

    this.tracked.set(txHash, tracked)

    // Start monitoring
    this.monitorTransaction(tracked)

    return tracked
  }

  private async monitorTransaction(tx: TrackedTransaction): Promise<void> {
    const checkInterval = setInterval(async () => {
      try {
        const receipt = await this.demos.provider.getTransactionReceipt(tx.hash)

        if (receipt) {
          clearInterval(checkInterval)

          tx.status = receipt.status === 1 ? "confirmed" : "failed"
          tx.confirmedAt = Date.now()
          tx.blockNumber = receipt.blockNumber
          tx.gasUsed = receipt.gasUsed

          tx.history.push({
            status: tx.status,
            timestamp: Date.now(),
            blockNumber: receipt.blockNumber
          })

          this.emitStatusChange(tx)
        } else {
          // Check for replacement
          const currentNonce = await this.demos.provider.getTransactionCount(
            tx.from,
            "pending"
          )

          if (currentNonce > tx.nonce) {
            // Transaction was replaced or cancelled
            clearInterval(checkInterval)

            tx.status = "replaced"
            tx.history.push({
              status: "replaced",
              timestamp: Date.now()
            })

            this.emitStatusChange(tx)
          }
        }
      } catch (error) {
        // Continue monitoring
      }
    }, 1000)

    // Timeout after 30 minutes
    setTimeout(() => {
      clearInterval(checkInterval)
      if (tx.status === "pending") {
        tx.status = "timeout"
        tx.history.push({
          status: "timeout",
          timestamp: Date.now()
        })
      }
    }, 30 * 60 * 1000)
  }

  async speedUpTransaction(
    txHash: string,
    gasPriceMultiplier: number = 1.2
  ): Promise<string> {
    const tracked = this.tracked.get(txHash)
    if (!tracked || tracked.status !== "pending") {
      throw new Error("Cannot speed up transaction")
    }

    const originalTx = await this.demos.provider.getTransaction(txHash)
    if (!originalTx) throw new Error("Original transaction not found")

    const newGasPrice = originalTx.gasPrice
      ? originalTx.gasPrice * BigInt(Math.floor(gasPriceMultiplier * 100)) / 100n
      : undefined

    const speedUpTx = {
      to: originalTx.to,
      value: originalTx.value,
      data: originalTx.data,
      nonce: originalTx.nonce,
      gasLimit: originalTx.gasLimit,
      gasPrice: newGasPrice
    }

    const signedTx = await this.signer.sendTransaction(speedUpTx)

    // Track the new transaction
    tracked.replacementHash = signedTx.hash
    tracked.history.push({
      status: "speed_up",
      timestamp: Date.now(),
      newHash: signedTx.hash
    })

    return signedTx.hash
  }

  async cancelTransaction(txHash: string): Promise<string> {
    const tracked = this.tracked.get(txHash)
    if (!tracked || tracked.status !== "pending") {
      throw new Error("Cannot cancel transaction")
    }

    const originalTx = await this.demos.provider.getTransaction(txHash)
    if (!originalTx) throw new Error("Original transaction not found")

    // Send 0 ETH to self with same nonce but higher gas
    const cancelTx = {
      to: originalTx.from,
      value: 0n,
      nonce: originalTx.nonce,
      gasLimit: 21000n,
      gasPrice: originalTx.gasPrice
        ? originalTx.gasPrice * 2n
        : undefined
    }

    const signedTx = await this.signer.sendTransaction(cancelTx)

    tracked.status = "cancelling"
    tracked.replacementHash = signedTx.hash
    tracked.history.push({
      status: "cancel_attempt",
      timestamp: Date.now(),
      newHash: signedTx.hash
    })

    return signedTx.hash
  }
}
```

## Best Practices

1. **Handle transaction lifecycle** states properly
2. **Implement timeout handling** for stuck transactions
3. **Monitor for replacements** and cancellations
4. **Decode transactions** for better analysis
5. **Rate limit mempool queries** to avoid overload

## Related Skills

- [MEV Protection](./mev-protection-agent.md) - MEV defense
- [Transaction Builder](./transaction-builder-agent.md) - TX construction
- [Gas Tracker](./gas-tracker-agent.md) - Gas optimization
