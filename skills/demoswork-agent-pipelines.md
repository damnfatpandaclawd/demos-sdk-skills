# DemosWork Agent Pipelines

> **⚠️ Prerequisites**: Complete [SDK Setup](./00-sdk-setup.md) first to configure your environment.

Build intelligent agent workflows with multi-step operations, conditionals, cross-chain actions, and Web2 integrations using DemosWork scripting engine.

## Agent Use Cases

| Use Case | Description |
|----------|-------------|
| **Arbitrage Agent** | If price difference > threshold, execute cross-chain swap |
| **DCA Agent** | Scheduled buy operations with balance checks |
| **Portfolio Rebalancer** | Check allocations, execute trades if out of bounds |
| **Notification Agent** | Monitor conditions, trigger Web2 webhooks |
| **Multi-Sig Executor** | Collect signatures, execute when threshold met |
| **Yield Optimizer** | Compare APYs across chains, move funds to best yield |

## Architecture

```
┌─────────────────────────────────────────────────────────┐
│                    DemosWork Script                      │
├─────────────────────────────────────────────────────────┤
│  ┌─────────┐    ┌─────────┐    ┌─────────┐             │
│  │  Step 1 │───▶│  Step 2 │───▶│  Step 3 │             │
│  │ Native  │    │   XM    │    │  Web2   │             │
│  └─────────┘    └─────────┘    └─────────┘             │
│       │              │              │                   │
│       ▼              ▼              ▼                   │
│  ┌─────────────────────────────────────────────┐       │
│  │            Conditional Logic                 │       │
│  │  if (step1.balance > 100)                   │       │
│  │    then → executeSwap                       │       │
│  │    else → notifyLowBalance                  │       │
│  └─────────────────────────────────────────────┘       │
└─────────────────────────────────────────────────────────┘
```

## Import

```typescript
import {
  DemosWork,
  BaseOperation,
  ConditionalOperation,
  Condition,
  WorkStep,
  NativeWorkStep,
  XmWorkStep,
  Web2WorkStep,
  prepareDemosWorkPayload,
  prepareNativeStep,
  prepareXMStep,
  prepareWeb2Step,
  runSanityChecks
} from '@kynesyslabs/demosdk/demoswork'
```

## Core Classes

### DemosWork

The main workflow container.

| Method | Purpose |
|--------|---------|
| `push(operation)` | Add operation to workflow |
| `validate(script)` | Validate the workflow script |
| `toJSON()` | Export workflow as JSON |
| `fromJSON(script)` | Import workflow from JSON |

### Operation Types

| Type | Class | Use Case |
|------|-------|----------|
| **Base** | `BaseOperation` | Simple sequential steps |
| **Conditional** | `ConditionalOperation` | If/elif/else branching |

### Step Types

| Type | Class | Example |
|------|-------|---------|
| **Native** | `NativeWorkStep` | Demos transfers, storage ops |
| **XM** | `XmWorkStep` | Cross-chain EVM/SOL/etc |
| **Web2** | `Web2WorkStep` | HTTP requests via DAHR |

## Simple Sequential Workflow

```typescript
import { Demos } from '@kynesyslabs/demosdk/websdk'
import { 
  DemosWork, 
  BaseOperation, 
  WorkStep,
  prepareDemosWorkPayload 
} from '@kynesyslabs/demosdk/demoswork'

async function createSimpleWorkflow(demos: Demos) {
  const work = new DemosWork()
  
  // Step 1: Native Demos transfer
  const step1 = new WorkStep({
    context: 'native',
    content: {
      action: 'transfer',
      recipient: 'demos1234...',
      amount: 100
    },
    critical: true  // Abort workflow if this fails
  })
  
  // Step 2: Cross-chain EVM transfer
  const step2 = new WorkStep({
    context: 'xm',
    content: {
      chain: 'ethereum',
      action: 'transfer',
      to: '0x1234...',
      amount: '1000000000000000000'  // 1 ETH in wei
    },
    critical: true
  })
  
  // Create operation with steps
  const operation = new BaseOperation(step1, step2)
  work.push(operation)
  
  // Execute workflow
  const payload = await prepareDemosWorkPayload(work, demos)
  const result = await demos.sendTransaction(payload)
  
  return result
}
```

## Conditional Workflow (Arbitrage Agent)

```typescript
import {
  DemosWork,
  ConditionalOperation,
  Condition,
  WorkStep,
  Web2WorkStep,
  XmWorkStep
} from '@kynesyslabs/demosdk/demoswork'

class ArbitrageAgent {
  async createArbitrageWorkflow(
    priceThreshold: number,
    swapAmount: number
  ): Promise<DemosWork> {
    const work = new DemosWork()
    
    // Step 1: Fetch price from DEX A via Web2
    const fetchPriceA = new Web2WorkStep({
      url: 'https://api.dexA.com/price/ETH',
      method: 'GET',
      outputKey: 'priceA'  // Store result for conditional check
    })
    
    // Step 2: Fetch price from DEX B
    const fetchPriceB = new Web2WorkStep({
      url: 'https://api.dexB.com/price/ETH',
      method: 'GET',
      outputKey: 'priceB'
    })
    
    // Conditional: Execute swap if price difference > threshold
    const conditional = new ConditionalOperation()
    
    // Create condition: priceA - priceB > threshold
    const priceDiff = new Condition()
      .subtract(work.results.priceA, work.results.priceB)
    
    conditional
      .if(priceDiff, '>', priceThreshold)
      .then(new XmWorkStep({
        chain: 'ethereum',
        action: 'swap',
        fromToken: 'ETH',
        toToken: 'USDC',
        amount: swapAmount,
        dex: 'dexB'  // Buy on cheaper DEX
      }))
      .elif(priceDiff, '<', -priceThreshold)
      .then(new XmWorkStep({
        chain: 'ethereum',
        action: 'swap',
        fromToken: 'ETH',
        toToken: 'USDC',
        amount: swapAmount,
        dex: 'dexA'
      }))
      .else(new Web2WorkStep({
        url: 'https://webhook.site/notify',
        method: 'POST',
        body: { message: 'No arbitrage opportunity' }
      }))
    
    // Add operations to workflow
    work.push(new BaseOperation(fetchPriceA))
    work.push(new BaseOperation(fetchPriceB))
    work.push(conditional)
    
    return work
  }
}
```

## Portfolio Rebalancer Agent

```typescript
class PortfolioRebalancerAgent {
  private targetAllocations = {
    ETH: 0.40,   // 40%
    BTC: 0.35,   // 35%
    USDC: 0.25   // 25%
  }
  
  async createRebalanceWorkflow(portfolioValue: number): Promise<DemosWork> {
    const work = new DemosWork()
    
    // Step 1: Check current ETH balance
    const checkEthBalance = new XmWorkStep({
      chain: 'ethereum',
      action: 'getBalance',
      token: 'ETH',
      outputKey: 'ethBalance'
    })
    
    // Step 2: Check current BTC balance  
    const checkBtcBalance = new XmWorkStep({
      chain: 'bitcoin',
      action: 'getBalance',
      outputKey: 'btcBalance'
    })
    
    // Create conditional rebalance logic
    const rebalanceEth = new ConditionalOperation()
    const targetEth = portfolioValue * this.targetAllocations.ETH
    
    rebalanceEth
      .if(work.results.ethBalance, '<', targetEth * 0.95)  // 5% tolerance
      .then(new XmWorkStep({
        chain: 'ethereum',
        action: 'swap',
        fromToken: 'USDC',
        toToken: 'ETH',
        amount: targetEth - work.results.ethBalance
      }))
      .elif(work.results.ethBalance, '>', targetEth * 1.05)
      .then(new XmWorkStep({
        chain: 'ethereum',
        action: 'swap',
        fromToken: 'ETH',
        toToken: 'USDC',
        amount: work.results.ethBalance - targetEth
      }))
    
    work.push(new BaseOperation(checkEthBalance, checkBtcBalance))
    work.push(rebalanceEth)
    
    return work
  }
}
```

## DCA (Dollar Cost Averaging) Agent

```typescript
class DCAAgent {
  async createDCAWorkflow(
    buyAmount: number,
    minBalance: number
  ): Promise<DemosWork> {
    const work = new DemosWork()
    
    // Step 1: Check USDC balance
    const checkBalance = new XmWorkStep({
      chain: 'ethereum',
      action: 'getBalance',
      token: 'USDC',
      outputKey: 'usdcBalance'
    })
    
    // Conditional: Only buy if we have enough balance
    const buyConditional = new ConditionalOperation()
    
    buyConditional
      .if(work.results.usdcBalance, '>=', buyAmount + minBalance)
      .then(new XmWorkStep({
        chain: 'ethereum',
        action: 'swap',
        fromToken: 'USDC',
        toToken: 'ETH',
        amount: buyAmount
      }))
      .else(new Web2WorkStep({
        url: process.env.DISCORD_WEBHOOK,
        method: 'POST',
        body: {
          content: `⚠️ DCA skipped: Insufficient balance (${work.results.usdcBalance} USDC)`
        }
      }))
    
    work.push(new BaseOperation(checkBalance))
    work.push(buyConditional)
    
    return work
  }
}
```

## Multi-Chain Notification Agent

```typescript
class NotificationAgent {
  async createMonitorWorkflow(): Promise<DemosWork> {
    const work = new DemosWork()
    
    // Monitor multiple conditions across chains
    const checkEthGas = new Web2WorkStep({
      url: 'https://api.etherscan.io/api?module=gastracker&action=gasoracle',
      method: 'GET',
      outputKey: 'ethGas'
    })
    
    const checkSolTps = new Web2WorkStep({
      url: 'https://api.solana.com/tps',
      method: 'GET',
      outputKey: 'solTps'
    })
    
    // Notify on low gas
    const gasAlert = new ConditionalOperation()
    gasAlert
      .if(work.results.ethGas.SafeGasPrice, '<', 20)
      .then(new Web2WorkStep({
        url: process.env.TELEGRAM_BOT_URL,
        method: 'POST',
        body: {
          chat_id: process.env.TELEGRAM_CHAT_ID,
          text: `🟢 ETH gas is low: ${work.results.ethGas.SafeGasPrice} gwei`
        }
      }))
    
    // Notify on high Solana TPS
    const tpsAlert = new ConditionalOperation()
    tpsAlert
      .if(work.results.solTps, '>', 4000)
      .then(new Web2WorkStep({
        url: process.env.DISCORD_WEBHOOK,
        method: 'POST',
        body: {
          content: `🔥 Solana TPS is high: ${work.results.solTps}`
        }
      }))
    
    work.push(new BaseOperation(checkEthGas, checkSolTps))
    work.push(gasAlert)
    work.push(tpsAlert)
    
    return work
  }
}
```

## Workflow Execution

```typescript
import { prepareDemosWorkPayload, runSanityChecks } from '@kynesyslabs/demosdk/demoswork'

async function executeWorkflow(work: DemosWork, demos: Demos) {
  // Validate before execution
  runSanityChecks(work.toJSON())
  
  // Prepare signed transaction payload
  const payload = await prepareDemosWorkPayload(work, demos)
  
  // Execute on network
  const result = await demos.sendTransaction(payload)
  
  // Access step results
  console.log('Step results:', work.results)
  
  return result
}
```

## Condition Operators

| Operator | Description |
|----------|-------------|
| `>` | Greater than |
| `<` | Less than |
| `>=` | Greater than or equal |
| `<=` | Less than or equal |
| `==` | Equal |
| `!=` | Not equal |
| `contains` | String contains |
| `exists` | Value exists (not null/undefined) |

## Best Practices

1. **Mark critical steps**: Set `critical: true` for steps that must succeed
2. **Use outputKeys**: Store intermediate results for conditional logic
3. **Validate before execute**: Always run `runSanityChecks()`
4. **Handle failures**: Use else branches for error handling
5. **Atomic operations**: Group related steps in single operations

## Quick Reference

| Task | Pattern |
|------|---------|
| Sequential steps | `new BaseOperation(step1, step2, step3)` |
| Conditional branch | `conditional.if(value, op, threshold).then(step)` |
| Multiple conditions | `.elif(value, op, threshold).then(step)` |
| Default action | `.else(fallbackStep)` |
| Cross-chain action | `new XmWorkStep({ chain, action, ... })` |
| Web2 API call | `new Web2WorkStep({ url, method, body })` |
| Native Demos op | `new NativeWorkStep({ action, params })` |
| Execute workflow | `prepareDemosWorkPayload(work, demos)` |
