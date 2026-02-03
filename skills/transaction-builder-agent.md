# Transaction Builder Agent Skill

> **⚠️ Prerequisites**: Complete [SDK Setup](./00-sdk-setup.md) first to configure your environment.

Build sophisticated transaction construction agents using Demos Network's transaction payload preparation and cross-chain execution capabilities.

## Overview

Transaction building enables agents to construct, batch, and execute complex transaction sequences across Demos native and cross-chain (XM) operations - essential for DeFi automation, batch operations, and multi-step protocols.

## SDK Reference

```typescript
import { Demos } from "@kynesyslabs/demosdk/websdk"
import { prepareXMPayload } from "@kynesyslabs/demosdk/websdk"
import { prepareDemosWorkPayload } from "@kynesyslabs/demosdk/demoswork"
import { EVM, Solana } from "@kynesyslabs/demosdk/xm-websdk"

// Native Demos transactions
await demos.transfer(recipient, amount)
await demos.nodeCall(method, params)

// Cross-chain transaction preparation
const evmTx = await evm.preparePay(recipient, amount)
const evmTransfer = await evm.prepareTransfer(token, recipient, amount)
await prepareXMPayload(xmScript, demos)

// DemosWork payload
await prepareDemosWorkPayload(work, demos)
```

## Transaction Types

| Type | Module | Use Case |
|------|--------|----------|
| `native` | websdk | Native DEMOS transfers |
| `crosschainOperation` | xmwebsdk | Cross-chain transactions |
| `demoswork` | demoswork | Multi-step workflows |
| `identity` | websdk | Identity operations |
| `web2Request` | web2 | DAHR proxy requests |
| `instantMessaging` | instantMessaging | P2P messages |

## Agent Use Cases

### 1. Batch Transaction Agent

Execute multiple transactions efficiently:

```typescript
class BatchTransactionAgent {
  private demos: Demos

  async executeBatch(
    transactions: TransactionRequest[]
  ): Promise<BatchResult> {
    // Group transactions by type
    const grouped = this.groupByType(transactions)

    const results: TransactionResult[] = []

    // Execute native transactions
    if (grouped.native.length > 0) {
      const nativeResults = await this.executeNativeBatch(grouped.native)
      results.push(...nativeResults)
    }

    // Execute cross-chain transactions
    if (grouped.crosschain.length > 0) {
      const xmResults = await this.executeCrossChainBatch(grouped.crosschain)
      results.push(...xmResults)
    }

    return {
      total: transactions.length,
      successful: results.filter(r => r.success).length,
      failed: results.filter(r => !r.success).length,
      results,
      totalGas: this.calculateTotalGas(results)
    }
  }

  private async executeNativeBatch(
    transactions: NativeTransactionRequest[]
  ): Promise<TransactionResult[]> {
    const results: TransactionResult[] = []

    for (const tx of transactions) {
      try {
        const result = await this.demos.transfer(tx.recipient, tx.amount)
        results.push({
          type: "native",
          success: true,
          hash: result.hash,
          request: tx
        })
      } catch (error) {
        results.push({
          type: "native",
          success: false,
          error: error.message,
          request: tx
        })
      }
    }

    return results
  }

  private async executeCrossChainBatch(
    transactions: CrossChainTransactionRequest[]
  ): Promise<TransactionResult[]> {
    const results: TransactionResult[] = []

    // Group by chain for efficiency
    const byChain = this.groupByChain(transactions)

    for (const [chainId, chainTxs] of byChain.entries()) {
      const instance = await this.getChainInstance(chainId)

      for (const tx of chainTxs) {
        try {
          let payload
          if (tx.token) {
            payload = await instance.prepareTransfer(tx.token, tx.recipient, tx.amount)
          } else {
            payload = await instance.preparePay(tx.recipient, tx.amount)
          }

          const xmPayload = await prepareXMPayload(payload, this.demos)
          const result = await this.demos.broadcastTransaction(xmPayload)

          results.push({
            type: "crosschain",
            chain: chainId,
            success: true,
            hash: result.hash,
            request: tx
          })
        } catch (error) {
          results.push({
            type: "crosschain",
            chain: chainId,
            success: false,
            error: error.message,
            request: tx
          })
        }
      }

      await instance.disconnect()
    }

    return results
  }
}
```

### 2. Conditional Transaction Agent

Build transactions with conditions:

```typescript
class ConditionalTransactionAgent {
  private demos: Demos

  async buildConditionalTransaction(
    conditions: Condition[],
    transaction: TransactionRequest
  ): Promise<ConditionalTx> {
    // Evaluate all conditions
    const conditionResults = await Promise.all(
      conditions.map(c => this.evaluateCondition(c))
    )

    const allPassed = conditionResults.every(r => r.passed)

    if (!allPassed) {
      const failedConditions = conditions.filter((_, i) => !conditionResults[i].passed)
      return {
        execute: false,
        reason: `Conditions not met: ${failedConditions.map(c => c.name).join(", ")}`,
        conditionResults
      }
    }

    // Build and execute transaction
    const tx = await this.buildTransaction(transaction)

    return {
      execute: true,
      transaction: tx,
      conditionResults
    }
  }

  async evaluateCondition(condition: Condition): Promise<ConditionResult> {
    switch (condition.type) {
      case "balance_check":
        return await this.checkBalance(condition)

      case "price_threshold":
        return await this.checkPrice(condition)

      case "time_window":
        return this.checkTimeWindow(condition)

      case "gas_limit":
        return await this.checkGasPrice(condition)

      case "custom":
        return await this.evaluateCustomCondition(condition)

      default:
        throw new Error(`Unknown condition type: ${condition.type}`)
    }
  }

  private async checkBalance(condition: BalanceCondition): Promise<ConditionResult> {
    const balance = await this.getBalance(condition.address, condition.token)

    const passed = this.compare(balance, condition.operator, condition.threshold)

    return {
      conditionId: condition.id,
      passed,
      actualValue: balance,
      threshold: condition.threshold,
      operator: condition.operator
    }
  }

  private async checkPrice(condition: PriceCondition): Promise<ConditionResult> {
    const price = await this.getPrice(condition.asset)

    const passed = this.compare(price, condition.operator, condition.threshold)

    return {
      conditionId: condition.id,
      passed,
      actualValue: price,
      threshold: condition.threshold,
      operator: condition.operator
    }
  }

  private compare(value: bigint | number, operator: string, threshold: bigint | number): boolean {
    switch (operator) {
      case ">": return value > threshold
      case "<": return value < threshold
      case ">=": return value >= threshold
      case "<=": return value <= threshold
      case "==": return value === threshold
      case "!=": return value !== threshold
      default: throw new Error(`Unknown operator: ${operator}`)
    }
  }
}
```

### 3. Multi-Step Transaction Agent

Chain complex operations:

```typescript
class MultiStepTransactionAgent {
  private demos: Demos

  async buildPipeline(steps: TransactionStep[]): Promise<TransactionPipeline> {
    const pipeline: TransactionPipeline = {
      id: crypto.randomUUID(),
      steps: [],
      status: "building",
      createdAt: Date.now()
    }

    for (let i = 0; i < steps.length; i++) {
      const step = steps[i]

      // Resolve dependencies from previous steps
      const resolvedStep = await this.resolveStepDependencies(step, pipeline.steps)

      // Build transaction for this step
      const tx = await this.buildStepTransaction(resolvedStep)

      pipeline.steps.push({
        index: i,
        ...resolvedStep,
        transaction: tx,
        status: "pending"
      })
    }

    pipeline.status = "ready"
    return pipeline
  }

  async executePipeline(
    pipeline: TransactionPipeline,
    options: ExecutionOptions = {}
  ): Promise<PipelineResult> {
    const results: StepResult[] = []

    for (const step of pipeline.steps) {
      // Check if we should continue after failure
      if (results.some(r => !r.success) && !options.continueOnError) {
        // Mark remaining steps as skipped
        results.push({
          stepIndex: step.index,
          status: "skipped",
          reason: "Previous step failed"
        })
        continue
      }

      try {
        // Execute step transaction
        const result = await this.executeStep(step, results)

        results.push({
          stepIndex: step.index,
          status: "success",
          success: true,
          hash: result.hash,
          output: result.output
        })

      } catch (error) {
        results.push({
          stepIndex: step.index,
          status: "failed",
          success: false,
          error: error.message
        })

        if (options.rollbackOnError) {
          await this.rollbackPipeline(pipeline, results)
        }
      }
    }

    return {
      pipelineId: pipeline.id,
      totalSteps: pipeline.steps.length,
      successful: results.filter(r => r.success).length,
      failed: results.filter(r => !r.success).length,
      results
    }
  }

  private async resolveStepDependencies(
    step: TransactionStep,
    previousSteps: BuildStep[]
  ): Promise<TransactionStep> {
    // Replace {{stepN.output}} placeholders with actual values
    const resolved = { ...step }

    if (step.params) {
      for (const [key, value] of Object.entries(step.params)) {
        if (typeof value === "string" && value.includes("{{step")) {
          const match = value.match(/\{\{step(\d+)\.output\.(\w+)\}\}/)
          if (match) {
            const stepIndex = parseInt(match[1])
            const outputKey = match[2]
            const previousStep = previousSteps[stepIndex]
            resolved.params[key] = previousStep?.result?.output?.[outputKey]
          }
        }
      }
    }

    return resolved
  }
}
```

### 4. Gas Optimization Agent

Optimize transaction costs:

```typescript
class GasOptimizationAgent {
  async optimizeTransaction(
    transaction: TransactionRequest
  ): Promise<OptimizedTransaction> {
    // Get current gas prices
    const gasPrices = await this.getGasPrices(transaction.chainId)

    // Estimate gas for transaction
    const gasEstimate = await this.estimateGas(transaction)

    // Calculate costs at different priority levels
    const costOptions = {
      low: {
        gasPrice: gasPrices.low,
        totalCost: gasEstimate * gasPrices.low,
        expectedTime: "10-30 minutes"
      },
      medium: {
        gasPrice: gasPrices.medium,
        totalCost: gasEstimate * gasPrices.medium,
        expectedTime: "1-5 minutes"
      },
      high: {
        gasPrice: gasPrices.high,
        totalCost: gasEstimate * gasPrices.high,
        expectedTime: "15-60 seconds"
      }
    }

    // Check if batching would save gas
    const batchSavings = await this.calculateBatchSavings(transaction)

    // Check if different route would be cheaper
    const alternativeRoutes = await this.findCheaperRoutes(transaction)

    return {
      original: transaction,
      gasEstimate,
      costOptions,
      recommendation: this.generateRecommendation(costOptions, batchSavings, alternativeRoutes),
      batchSavings,
      alternativeRoutes
    }
  }

  async waitForOptimalGas(
    maxGasPrice: bigint,
    timeout: number = 3600000 // 1 hour
  ): Promise<GasWindow> {
    const startTime = Date.now()

    while (Date.now() - startTime < timeout) {
      const currentGas = await this.getGasPrices()

      if (currentGas.medium <= maxGasPrice) {
        return {
          gasPrice: currentGas.medium,
          waitTime: Date.now() - startTime,
          status: "optimal"
        }
      }

      // Wait and check again
      await new Promise(r => setTimeout(r, 30000)) // 30 seconds
    }

    return {
      gasPrice: await this.getGasPrices().then(g => g.medium),
      waitTime: timeout,
      status: "timeout"
    }
  }

  async buildEIP1559Transaction(
    transaction: TransactionRequest
  ): Promise<EIP1559Transaction> {
    const baseFee = await this.getBaseFee(transaction.chainId)
    const priorityFee = await this.estimatePriorityFee(transaction.chainId)

    // Calculate max fee with buffer
    const maxFeePerGas = baseFee * 2n + priorityFee
    const maxPriorityFeePerGas = priorityFee

    return {
      ...transaction,
      type: 2, // EIP-1559
      maxFeePerGas,
      maxPriorityFeePerGas
    }
  }
}
```

### 5. Cross-Chain Transaction Coordinator

Coordinate transactions across multiple chains:

```typescript
class CrossChainCoordinator {
  private demos: Demos
  private chainInstances: Map<number, any> = new Map()

  async coordinateMultiChainTx(
    operations: ChainOperation[]
  ): Promise<CoordinationResult> {
    // Initialize all required chain instances
    const uniqueChains = [...new Set(operations.map(o => o.chainId))]
    await this.initializeChains(uniqueChains)

    // Group operations by execution order
    const ordered = this.orderOperations(operations)

    const results: OperationResult[] = []

    for (const batch of ordered) {
      // Execute batch in parallel
      const batchResults = await Promise.allSettled(
        batch.map(op => this.executeChainOperation(op))
      )

      for (let i = 0; i < batchResults.length; i++) {
        const result = batchResults[i]
        if (result.status === "fulfilled") {
          results.push({
            operation: batch[i],
            success: true,
            ...result.value
          })
        } else {
          results.push({
            operation: batch[i],
            success: false,
            error: result.reason.message
          })
        }
      }

      // Check if any critical operations failed
      const criticalFailure = batch.some((op, i) =>
        op.critical && batchResults[i].status === "rejected"
      )

      if (criticalFailure) {
        // Attempt recovery
        await this.handleCriticalFailure(results)
        break
      }
    }

    // Cleanup chain instances
    await this.cleanupChains()

    return {
      totalOperations: operations.length,
      successful: results.filter(r => r.success).length,
      failed: results.filter(r => !r.success).length,
      results,
      gasSpent: this.calculateTotalGasSpent(results)
    }
  }

  private async executeChainOperation(
    operation: ChainOperation
  ): Promise<OperationResult> {
    const instance = this.chainInstances.get(operation.chainId)

    let payload
    switch (operation.type) {
      case "transfer":
        payload = await instance.prepareTransfer(
          operation.token,
          operation.recipient,
          operation.amount
        )
        break

      case "pay":
        payload = await instance.preparePay(
          operation.recipient,
          operation.amount
        )
        break

      case "swap":
        payload = await instance.prepareSwap(
          operation.tokenIn,
          operation.tokenOut,
          operation.amountIn
        )
        break

      case "approve":
        payload = await instance.prepareApprove(
          operation.token,
          operation.spender,
          operation.amount
        )
        break

      default:
        throw new Error(`Unknown operation type: ${operation.type}`)
    }

    // Execute through Demos
    const xmPayload = await prepareXMPayload(payload, this.demos)
    return await this.demos.broadcastTransaction(xmPayload)
  }

  private orderOperations(operations: ChainOperation[]): ChainOperation[][] {
    // Sort by dependencies
    const ordered: ChainOperation[][] = []
    const remaining = [...operations]
    const completed = new Set<string>()

    while (remaining.length > 0) {
      const batch = remaining.filter(op =>
        !op.dependsOn || op.dependsOn.every(dep => completed.has(dep))
      )

      if (batch.length === 0 && remaining.length > 0) {
        throw new Error("Circular dependency detected")
      }

      ordered.push(batch)
      batch.forEach(op => {
        completed.add(op.id)
        remaining.splice(remaining.indexOf(op), 1)
      })
    }

    return ordered
  }
}
```

### 6. Transaction Simulation Agent

Simulate before executing:

```typescript
class TransactionSimulationAgent {
  async simulate(transaction: TransactionRequest): Promise<SimulationResult> {
    // Simulate without broadcasting
    const simulation = await this.runSimulation(transaction)

    return {
      success: simulation.success,
      gasUsed: simulation.gasUsed,
      stateChanges: simulation.stateChanges,
      logs: simulation.logs,
      returnValue: simulation.returnValue,
      warnings: this.analyzeWarnings(simulation),
      recommendations: this.generateRecommendations(simulation)
    }
  }

  async simulateBatch(transactions: TransactionRequest[]): Promise<BatchSimulationResult> {
    // Simulate entire batch as atomic unit
    const results: SimulationResult[] = []
    let cumulativeState = await this.getCurrentState()

    for (const tx of transactions) {
      const result = await this.simulateWithState(tx, cumulativeState)
      results.push(result)

      if (result.success) {
        // Apply state changes for next simulation
        cumulativeState = this.applyStateChanges(cumulativeState, result.stateChanges)
      } else {
        // Mark remaining as would-fail
        break
      }
    }

    return {
      totalTransactions: transactions.length,
      wouldSucceed: results.filter(r => r.success).length,
      wouldFail: results.filter(r => !r.success).length,
      results,
      totalGasEstimate: results.reduce((acc, r) => acc + r.gasUsed, 0n),
      finalStateChanges: results.flatMap(r => r.stateChanges || [])
    }
  }

  private analyzeWarnings(simulation: RawSimulation): Warning[] {
    const warnings: Warning[] = []

    // Check for high gas usage
    if (simulation.gasUsed > 500000n) {
      warnings.push({
        type: "high_gas",
        message: "Transaction uses more gas than typical",
        severity: "medium"
      })
    }

    // Check for reverts
    if (simulation.revertReason) {
      warnings.push({
        type: "would_revert",
        message: `Transaction would revert: ${simulation.revertReason}`,
        severity: "high"
      })
    }

    // Check for suspicious state changes
    const suspicious = this.detectSuspiciousChanges(simulation.stateChanges)
    warnings.push(...suspicious)

    return warnings
  }
}
```

## Transaction Payload Types

```typescript
interface Transaction {
  blockNumber: number
  content: TransactionContent
  ed25519_signature: Uint8Array
  hash: string
  signature: Uint8Array
  status: "pending" | "confirmed" | "failed"
}

interface TransactionContent {
  type: "native" | "crosschainOperation" | "demoswork" | "identity" | "web2Request"
  data: any
}
```

## Best Practices

1. **Simulate first** - Always simulate transactions before execution
2. **Handle failures** - Implement proper error handling and rollbacks
3. **Optimize gas** - Use batching and timing for cost efficiency
4. **Order dependencies** - Ensure correct execution order for multi-step operations
5. **Clean up resources** - Disconnect chain instances after use

## Integration with DemosWork

```typescript
const txBuilderWorkflow = new DemosWork()

// Step 1: Build transaction
txBuilderWorkflow.push(new BaseOperation(
  new NativeWorkStep({
    method: "tx.build",
    params: { type: "transfer", recipient, amount }
  })
))

// Step 2: Simulate
txBuilderWorkflow.push(new BaseOperation(
  new NativeWorkStep({
    method: "tx.simulate",
    params: { transaction: "{{step1.result}}" }
  })
))

// Step 3: Conditional execute
const conditional = new ConditionalOperation()
conditional.if("{{step2.result.success}}", "==", true)
  .then(new BaseOperation(
    new NativeWorkStep({ method: "tx.execute", params: { tx: "{{step1.result}}" } })
  ))
  .else(new BaseOperation(
    new NativeWorkStep({ method: "tx.abort", params: { reason: "{{step2.result.error}}" } })
  ))

txBuilderWorkflow.push(conditional)
```

## Related Skills

- [DemosWork Pipelines](./demoswork-agent-pipelines.md) - Multi-step automation
- [Cross-Chain Treasury](./crosschain-treasury-agent.md) - Asset management
- [Token Discovery](./token-discovery-agent.md) - Find tokens for transactions
