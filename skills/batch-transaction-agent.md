# Batch Transaction Agent Skill

> **⚠️ Prerequisites**: Complete [SDK Setup](./00-sdk-setup.md) first to configure your environment.

Build agents that efficiently process multiple transactions in optimized batches on Demos Network.

## Overview

Batch Transaction processing enables agents to submit multiple operations atomically, reducing gas costs and improving throughput. Essential for airdrops, mass payments, data migrations, and high-volume operations.

## SDK Reference

```typescript
import { Demos } from "@kynesyslabs/demosdk/websdk"
import { DemosWork, BaseOperation, WorkStep } from "@kynesyslabs/demosdk/demoswork"

// Batch Methods
demos.prepareBatchTransactions(transactions)  // Prepare batch
demos.insertBatchTransactions(batch)          // Submit batch
demos.getBatchStatus(batchId)                 // Check batch status

// Batch Limits
const MAX_BATCH_SIZE = 100                    // Max transactions per batch
const BATCH_FEE_DISCOUNT = 0.8                // 20% fee discount
```

## Agent Use Cases

### 1. Airdrop Distribution Agent

Efficiently distribute tokens to many recipients:

```typescript
class AirdropAgent {
  private demos: Demos

  async distributeAirdrop(
    recipients: AirdropRecipient[],
    tokenAmount: bigint
  ): Promise<AirdropResult> {
    const batches: AirdropRecipient[][] = []
    const batchSize = 100

    // Split into batches
    for (let i = 0; i < recipients.length; i += batchSize) {
      batches.push(recipients.slice(i, i + batchSize))
    }

    const results: BatchResult[] = []
    let totalDistributed = 0n

    for (const batch of batches) {
      const transactions = batch.map(r => ({
        type: "transfer",
        content: {
          to: r.address,
          amount: (tokenAmount * BigInt(r.share)) / 10000n
        }
      }))

      const batchTx = await this.demos.prepareBatchTransactions(transactions)
      const result = await this.demos.insertBatchTransactions(batchTx)

      results.push({
        batchId: result.batchId,
        count: batch.length,
        txHash: result.hash
      })

      totalDistributed += batch.reduce(
        (sum, r) => sum + (tokenAmount * BigInt(r.share)) / 10000n,
        0n
      )
    }

    return {
      totalRecipients: recipients.length,
      totalDistributed,
      batches: results,
      completedAt: Date.now()
    }
  }
}
```

### 2. Mass Payment Agent

Process payroll or vendor payments:

```typescript
class MassPaymentAgent {
  private demos: Demos

  async processPayroll(
    payments: PayrollEntry[]
  ): Promise<PayrollResult> {
    // Validate total against balance
    const total = payments.reduce((sum, p) => sum + p.amount, 0n)
    const balance = await this.getBalance()

    if (balance < total) {
      throw new Error(`Insufficient balance: need ${total}, have ${balance}`)
    }

    // Prepare batch transaction
    const transactions = payments.map(p => ({
      type: "transfer",
      content: {
        to: p.employeeAddress,
        amount: p.amount.toString(),
        memo: `Payroll ${p.period}`
      }
    }))

    const batchTx = await this.demos.prepareBatchTransactions(transactions)
    const result = await this.demos.insertBatchTransactions(batchTx)

    // Wait for confirmation
    await this.waitForBatch(result.batchId)

    return {
      batchId: result.batchId,
      txHash: result.hash,
      paymentsProcessed: payments.length,
      totalPaid: total
    }
  }

  async scheduleRecurringPayments(
    payments: RecurringPayment[],
    schedule: PaymentSchedule
  ): Promise<void> {
    // Store scheduled payments
    for (const payment of payments) {
      await this.storeScheduledPayment({
        ...payment,
        schedule,
        nextRun: this.calculateNextRun(schedule)
      })
    }

    // Start scheduler
    this.startPaymentScheduler()
  }
}
```

### 3. Data Migration Agent

Migrate data in batches:

```typescript
class DataMigrationAgent {
  private demos: Demos

  async migrateStorage(
    sourcePrograms: string[],
    transformation: (data: any) => any
  ): Promise<MigrationResult> {
    const batches: Transaction[][] = []
    const batchSize = 50

    // Read all source data
    const sourceData = await Promise.all(
      sourcePrograms.map(addr => this.readStorageProgram(addr))
    )

    // Transform and prepare transactions
    const transactions = sourceData.map((data, i) => ({
      type: "storageProgram",
      content: {
        action: "create",
        data: transformation(data),
        originalAddress: sourcePrograms[i]
      }
    }))

    // Split into batches
    for (let i = 0; i < transactions.length; i += batchSize) {
      batches.push(transactions.slice(i, i + batchSize))
    }

    // Process batches
    const results: BatchResult[] = []
    for (const batch of batches) {
      const batchTx = await this.demos.prepareBatchTransactions(batch)
      const result = await this.demos.insertBatchTransactions(batchTx)
      results.push(result)
    }

    return {
      totalMigrated: transactions.length,
      batches: results.length,
      success: true
    }
  }
}
```

## Best Practices

1. **Respect batch limits** - max 100 transactions per batch
2. **Validate before submit** - check balances and addresses
3. **Handle partial failures** - some transactions may fail
4. **Monitor batch status** - poll for completion
5. **Use for bulk operations** - not single transactions

## Related Skills

- [Workflow Orchestration](./workflow-orchestration-agent.md) - Multi-step workflows
- [Airdrop Distribution](./airdrop-agent.md) - Token distributions
