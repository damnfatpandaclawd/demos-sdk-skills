# Cross-Chain Bridge Agent

> **⚠️ Prerequisites**: Complete [SDK Setup](./00-sdk-setup.md) first to configure your environment.

Build agents that perform gasless cross-chain asset transfers using Demos Network's native bridge and Rubic integration.

## SDK Reference

```typescript
import { NativeBridgeMethods, RubicBridge, validateChain } from "@kynesyslabs/demosdk/bridge"
import { Demos } from "@kynesyslabs/demosdk/websdk"
```

## Core Concepts

### Native Bridge (Gasless)
The Demos native bridge enables gasless cross-chain transfers through meta-transactions. Users sign authorization messages, and the network executes transfers without requiring gas on either chain.

### Supported Chains
- **EVM**: Ethereum, Polygon, Base, Arbitrum, Optimism, Avalanche, BSC
- **Non-EVM**: Solana
- **Tokens**: USDC (primary), ETH

### Key Methods

| Method | Description |
|--------|-------------|
| `generateAtomicDepositAndBridge()` | Complete atomic deposit + bridge in one operation |
| `generateCompleteGaslessBridge()` | Full gasless bridge with separate deposit/bridge |
| `generateGaslessBridgeSignature()` | Create signature for bridge authorization |
| `generateOperationTx()` | Generate transaction from compiled bridge operation |

---

## Use Case 1: Atomic Cross-Chain Transfer Agent

Automatically bridge assets between chains in a single atomic operation.

```typescript
import { Demos } from "@kynesyslabs/demosdk/websdk"
import { NativeBridgeMethods } from "@kynesyslabs/demosdk/bridge"

interface BridgeConfig {
  originChain: string
  destChain: string
  token: "usdc" | "eth"
  amount: string
  recipient: string
}

class AtomicBridgeAgent {
  private demos: Demos
  private privateKey: string
  private publicKey: string

  constructor(demos: Demos, privateKey: string, publicKey: string) {
    this.demos = demos
    this.privateKey = privateKey
    this.publicKey = publicKey
  }

  /**
   * Execute atomic deposit and bridge in one transaction
   */
  async atomicBridge(config: BridgeConfig): Promise<{
    success: boolean
    txHash?: string
    error?: string
  }> {
    try {
      // Get current nonce
      const addressInfo = await this.demos.getAddressInfo(this.publicKey)
      const nonce = addressInfo.nonce || 0

      // Generate atomic operation (combines deposit + bridge)
      const { operation, signature } = NativeBridgeMethods.generateAtomicDepositAndBridge(
        this.privateKey,
        this.publicKey,
        nonce,
        config.token,           // "usdc" or "eth"
        config.amount,          // Amount to bridge
        config.destChain,       // Destination chain
        config.recipient,       // Recipient address
        0,                      // Bridge fee in basis points (0 = no extra fee)
        11155111,               // Chain ID (Sepolia)
        "0x...",                // Contract address
        "eth.sepolia"           // Origin chain key
      )

      // Execute the operation
      const response = await this.demos.nodeCall("executeOperation", operation)

      if (response.success) {
        console.log(`✅ Atomic bridge initiated: ${response.txHash}`)
        return { success: true, txHash: response.txHash }
      }

      return { success: false, error: response.error }

    } catch (error) {
      console.error("Bridge failed:", error)
      return { success: false, error: String(error) }
    }
  }

  /**
   * Monitor bridge completion
   */
  async waitForCompletion(txHash: string, timeout = 300000): Promise<boolean> {
    const startTime = Date.now()

    while (Date.now() - startTime < timeout) {
      const tx = await this.demos.getTransaction(txHash)

      if (tx?.status === "completed") {
        console.log("✅ Bridge completed!")
        return true
      }

      if (tx?.status === "failed") {
        console.log("❌ Bridge failed")
        return false
      }

      await new Promise(r => setTimeout(r, 5000))
    }

    console.log("⏰ Bridge timeout")
    return false
  }
}

// Usage
const demos = new Demos()
await demos.connect("https://demosnode.discus.sh/")

const agent = new AtomicBridgeAgent(demos, privateKey, publicKey)

// Bridge 100 USDC from Ethereum to Polygon
const result = await agent.atomicBridge({
  originChain: "eth",
  destChain: "polygon",
  token: "usdc",
  amount: "100000000",  // 100 USDC (6 decimals)
  recipient: "0x..."
})
```

---

## Use Case 2: Multi-Step Gasless Bridge Agent

Execute bridges with separate deposit and bridge steps for more control.

```typescript
import { NativeBridgeMethods } from "@kynesyslabs/demosdk/bridge"
import { Demos } from "@kynesyslabs/demosdk/websdk"

interface GaslessBridgeResult {
  depositTx: string
  bridgeTx: string
  totalTime: number
}

class GaslessBridgeAgent {
  private demos: Demos
  private privateKey: string
  private publicKey: string

  constructor(demos: Demos, privateKey: string, publicKey: string) {
    this.demos = demos
    this.privateKey = privateKey
    this.publicKey = publicKey
  }

  /**
   * Execute gasless bridge with separate deposit and bridge operations
   */
  async executeGaslessBridge(
    originChain: string,
    destChain: string,
    tokenAddress: string,
    recipient: string,
    amount: string
  ): Promise<GaslessBridgeResult> {
    const startTime = Date.now()

    // Get nonce
    const addressInfo = await this.demos.getAddressInfo(this.publicKey)
    const nonce = addressInfo.nonce || 0

    // Generate complete gasless bridge flow
    const {
      signature,
      depositOperation,
      bridgeOperation
    } = NativeBridgeMethods.generateCompleteGaslessBridge(
      this.privateKey,
      this.publicKey,
      nonce,
      originChain,
      destChain,
      tokenAddress,
      recipient,
      amount,
      0  // Bridge fee basis points
    )

    console.log("📝 Generated signature:", signature.slice(0, 20) + "...")

    // Step 1: Execute deposit
    console.log("💰 Executing gasless deposit...")
    const depositResponse = await this.demos.nodeCall(
      "executeGaslessDeposit",
      depositOperation
    )

    if (!depositResponse.success) {
      throw new Error(`Deposit failed: ${depositResponse.error}`)
    }

    console.log(`✅ Deposit tx: ${depositResponse.txHash}`)

    // Wait for deposit confirmation
    await this.waitForConfirmation(depositResponse.txHash)

    // Step 2: Execute bridge
    console.log("🌉 Executing gasless bridge...")
    const bridgeResponse = await this.demos.nodeCall(
      "executeGaslessBridge",
      bridgeOperation
    )

    if (!bridgeResponse.success) {
      throw new Error(`Bridge failed: ${bridgeResponse.error}`)
    }

    console.log(`✅ Bridge tx: ${bridgeResponse.txHash}`)

    return {
      depositTx: depositResponse.txHash,
      bridgeTx: bridgeResponse.txHash,
      totalTime: Date.now() - startTime
    }
  }

  /**
   * Generate just the deposit signature
   */
  generateDepositAuth(
    usdcAddress: string,
    amount: string,
    chainKey: string
  ): { signature: string; operation: any } {
    const addressInfo = this.demos.getAddressInfo(this.publicKey)
    const nonce = addressInfo?.nonce || 0

    const signature = NativeBridgeMethods.generateGaslessDepositSignature(
      this.privateKey,
      this.publicKey,
      nonce,
      usdcAddress,
      amount,
      chainKey
    )

    const operation = NativeBridgeMethods.generateGaslessDepositOperation(
      this.publicKey,
      signature,
      nonce,
      chainKey,
      usdcAddress,
      amount
    )

    return { signature, operation }
  }

  private async waitForConfirmation(txHash: string): Promise<void> {
    let attempts = 0
    while (attempts < 30) {
      const tx = await this.demos.getTransaction(txHash)
      if (tx?.confirmed) return
      await new Promise(r => setTimeout(r, 2000))
      attempts++
    }
    throw new Error("Transaction confirmation timeout")
  }
}

// Usage
const agent = new GaslessBridgeAgent(demos, privateKey, publicKey)

const result = await agent.executeGaslessBridge(
  "eth",
  "arbitrum",
  "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48", // USDC on Ethereum
  "0x...",  // Recipient on Arbitrum
  "50000000"  // 50 USDC
)

console.log(`Bridge completed in ${result.totalTime}ms`)
```

---

## Use Case 3: Rubic DEX Aggregator Bridge

Use Rubic integration for best-rate cross-chain swaps.

```typescript
import { RubicBridge } from "@kynesyslabs/demosdk/bridge"
import { Demos } from "@kynesyslabs/demosdk/websdk"

interface SwapRoute {
  fromChain: string
  toChain: string
  fromToken: string
  toToken: string
  fromAmount: string
  expectedOutput: string
  priceImpact: number
  providers: string[]
}

class RubicBridgeAgent {
  private bridge: RubicBridge
  private demos: Demos

  constructor(demos: Demos) {
    this.bridge = new RubicBridge()
    this.demos = demos
  }

  /**
   * Get best trade route via Rubic
   */
  async findBestRoute(
    fromChain: string,
    toChain: string,
    fromToken: string,
    toToken: string,
    amount: string
  ): Promise<SwapRoute | null> {
    try {
      const payload = {
        fromBlockchain: fromChain,
        toBlockchain: toChain,
        fromTokenAddress: fromToken,
        toTokenAddress: toToken,
        fromAmount: amount
      }

      const response = await this.bridge.getTrade(this.demos, fromChain, payload)

      if (!response.success || !response.data) {
        return null
      }

      const trade = response.data

      return {
        fromChain,
        toChain,
        fromToken,
        toToken,
        fromAmount: amount,
        expectedOutput: trade.toAmount,
        priceImpact: trade.priceImpact || 0,
        providers: trade.providers || []
      }

    } catch (error) {
      console.error("Route finding failed:", error)
      return null
    }
  }

  /**
   * Execute cross-chain swap via Rubic
   */
  async executeSwap(
    fromChain: string,
    payload: {
      fromBlockchain: string
      toBlockchain: string
      fromTokenAddress: string
      toTokenAddress: string
      fromAmount: string
      slippage?: number
    }
  ): Promise<{ success: boolean; txHash?: string }> {
    try {
      // Add slippage tolerance
      const tradePayload = {
        ...payload,
        slippage: payload.slippage || 0.5  // 0.5% default slippage
      }

      const response = await this.bridge.executeTrade(
        this.demos,
        fromChain,
        tradePayload
      )

      if (response.success) {
        console.log(`✅ Rubic swap executed: ${response.txHash}`)
        return { success: true, txHash: response.txHash }
      }

      return { success: false }

    } catch (error) {
      console.error("Swap execution failed:", error)
      return { success: false }
    }
  }

  /**
   * Compare rates across multiple routes
   */
  async findBestRateAcrossChains(
    fromToken: string,
    toToken: string,
    amount: string,
    targetChains: string[]
  ): Promise<SwapRoute[]> {
    const routes: SwapRoute[] = []

    // Check routes to each target chain
    await Promise.all(
      targetChains.map(async (toChain) => {
        const route = await this.findBestRoute(
          "eth",  // Origin chain
          toChain,
          fromToken,
          toToken,
          amount
        )

        if (route) {
          routes.push(route)
        }
      })
    )

    // Sort by expected output (best rate first)
    return routes.sort((a, b) =>
      parseFloat(b.expectedOutput) - parseFloat(a.expectedOutput)
    )
  }
}

// Usage
const rubicAgent = new RubicBridgeAgent(demos)

// Find best route
const route = await rubicAgent.findBestRoute(
  "ETH",
  "POLYGON",
  "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48",  // USDC on ETH
  "0x2791Bca1f2de4661ED88A30C99A7a9449Aa84174",  // USDC on Polygon
  "1000000000"  // 1000 USDC
)

console.log(`Expected output: ${route?.expectedOutput}`)
console.log(`Price impact: ${route?.priceImpact}%`)

// Execute if route is acceptable
if (route && route.priceImpact < 1) {
  await rubicAgent.executeSwap("ETH", {
    fromBlockchain: "ETH",
    toBlockchain: "POLYGON",
    fromTokenAddress: route.fromToken,
    toTokenAddress: route.toToken,
    fromAmount: route.fromAmount,
    slippage: 0.5
  })
}
```

---

## Use Case 4: Automated Arbitrage Bridge Agent

Monitor and execute cross-chain arbitrage opportunities.

```typescript
import { NativeBridgeMethods, RubicBridge } from "@kynesyslabs/demosdk/bridge"
import { EvmCoinFinder } from "@kynesyslabs/demosdk/abstraction"
import { DemosWork, BaseOperation, WorkStep } from "@kynesyslabs/demosdk/demoswork"

interface ArbitrageOpportunity {
  token: string
  buyChain: string
  sellChain: string
  buyPrice: number
  sellPrice: number
  profitPercent: number
  volume: string
}

class ArbitrageBridgeAgent {
  private demos: Demos
  private rubic: RubicBridge
  private coinFinder: EvmCoinFinder
  private minProfitPercent: number
  private maxBridgeTime: number

  constructor(
    demos: Demos,
    config: {
      minProfitPercent?: number
      maxBridgeTime?: number
    } = {}
  ) {
    this.demos = demos
    this.rubic = new RubicBridge()
    this.coinFinder = new EvmCoinFinder()
    this.minProfitPercent = config.minProfitPercent || 0.5
    this.maxBridgeTime = config.maxBridgeTime || 300000  // 5 minutes
  }

  /**
   * Scan for arbitrage opportunities across chains
   */
  async scanOpportunities(
    token: string,
    chains: string[],
    amount: string
  ): Promise<ArbitrageOpportunity[]> {
    const opportunities: ArbitrageOpportunity[] = []
    const prices: Map<string, number> = new Map()

    // Get token prices on each chain
    await Promise.all(
      chains.map(async (chain) => {
        try {
          const route = await this.rubic.getTrade(this.demos, chain, {
            fromBlockchain: chain,
            toBlockchain: chain,
            fromTokenAddress: token,
            toTokenAddress: "USDC",
            fromAmount: amount
          })

          if (route.success && route.data) {
            const price = parseFloat(route.data.toAmount) / parseFloat(amount)
            prices.set(chain, price)
          }
        } catch (error) {
          console.warn(`Failed to get price on ${chain}:`, error)
        }
      })
    )

    // Find arbitrage pairs
    const chainList = Array.from(prices.keys())

    for (let i = 0; i < chainList.length; i++) {
      for (let j = i + 1; j < chainList.length; j++) {
        const chainA = chainList[i]
        const chainB = chainList[j]
        const priceA = prices.get(chainA)!
        const priceB = prices.get(chainB)!

        // Calculate profit potential
        const profitAtoB = ((priceB - priceA) / priceA) * 100
        const profitBtoA = ((priceA - priceB) / priceB) * 100

        if (profitAtoB > this.minProfitPercent) {
          opportunities.push({
            token,
            buyChain: chainA,
            sellChain: chainB,
            buyPrice: priceA,
            sellPrice: priceB,
            profitPercent: profitAtoB,
            volume: amount
          })
        }

        if (profitBtoA > this.minProfitPercent) {
          opportunities.push({
            token,
            buyChain: chainB,
            sellChain: chainA,
            buyPrice: priceB,
            sellPrice: priceA,
            profitPercent: profitBtoA,
            volume: amount
          })
        }
      }
    }

    // Sort by profit (highest first)
    return opportunities.sort((a, b) => b.profitPercent - a.profitPercent)
  }

  /**
   * Execute arbitrage via DemosWork pipeline
   */
  async executeArbitrage(
    opportunity: ArbitrageOpportunity,
    privateKey: string,
    publicKey: string
  ): Promise<{ success: boolean; profit?: string }> {
    const work = new DemosWork()

    // Step 1: Bridge token to buy chain
    const bridgeStep = new WorkStep({
      context: "bridge",
      content: {
        action: "atomicBridge",
        token: opportunity.token,
        amount: opportunity.volume,
        destChain: opportunity.buyChain
      },
      critical: true
    })

    // Step 2: Swap on destination chain (if different token)
    const swapStep = new WorkStep({
      context: "dex",
      content: {
        action: "swap",
        chain: opportunity.sellChain,
        tokenIn: opportunity.token,
        tokenOut: "USDC",
        amount: opportunity.volume
      },
      critical: true
    })

    // Step 3: Bridge profit back
    const returnStep = new WorkStep({
      context: "bridge",
      content: {
        action: "atomicBridge",
        token: "USDC",
        destChain: "eth",  // Return to main chain
        amount: "AUTO"  // All proceeds
      },
      critical: false
    })

    work.push(new BaseOperation(bridgeStep))
    work.push(new BaseOperation(swapStep))
    work.push(new BaseOperation(returnStep))

    try {
      const txPayload = await work.compile(this.demos, publicKey)
      const tx = await this.demos.signAndBroadcast(txPayload, privateKey)

      console.log(`🎯 Arbitrage executed: ${tx.hash}`)

      return {
        success: true,
        profit: `~${opportunity.profitPercent.toFixed(2)}%`
      }

    } catch (error) {
      console.error("Arbitrage execution failed:", error)
      return { success: false }
    }
  }

  /**
   * Start continuous arbitrage monitoring
   */
  async startMonitoring(
    tokens: string[],
    chains: string[],
    amount: string,
    privateKey: string,
    publicKey: string,
    interval = 30000
  ): Promise<void> {
    console.log("🔄 Starting arbitrage monitor...")

    const monitor = async () => {
      for (const token of tokens) {
        const opportunities = await this.scanOpportunities(token, chains, amount)

        if (opportunities.length > 0) {
          const best = opportunities[0]
          console.log(`\n💰 Opportunity found:`)
          console.log(`   Token: ${token}`)
          console.log(`   Buy on: ${best.buyChain} @ ${best.buyPrice}`)
          console.log(`   Sell on: ${best.sellChain} @ ${best.sellPrice}`)
          console.log(`   Profit: ${best.profitPercent.toFixed(2)}%`)

          // Auto-execute if profit exceeds threshold
          if (best.profitPercent > this.minProfitPercent * 2) {
            console.log("🚀 Executing arbitrage...")
            await this.executeArbitrage(best, privateKey, publicKey)
          }
        }
      }
    }

    // Run immediately and then on interval
    await monitor()
    setInterval(monitor, interval)
  }
}

// Usage
const arbAgent = new ArbitrageBridgeAgent(demos, {
  minProfitPercent: 0.5,  // 0.5% minimum profit
  maxBridgeTime: 300000   // 5 minute max bridge time
})

// Scan for opportunities
const opportunities = await arbAgent.scanOpportunities(
  "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48",  // USDC
  ["eth", "polygon", "arbitrum", "base"],
  "10000000000"  // 10,000 USDC
)

// Start monitoring
await arbAgent.startMonitoring(
  ["USDC", "USDT"],
  ["eth", "polygon", "arbitrum", "optimism"],
  "5000000000",  // 5,000 USDC equivalent
  privateKey,
  publicKey
)
```

---

## Best Practices

### Chain Validation
```typescript
import { validateChain } from "@kynesyslabs/demosdk/bridge"

// Always validate chains before operations
try {
  validateChain("polygon", "EVM", true)  // isOrigin = true
  validateChain("arbitrum", "EVM", false)  // isDestination
} catch (error) {
  console.error("Invalid chain:", error)
}
```

### Fee Estimation
```typescript
// Bridge fees are in basis points (1 bp = 0.01%)
const bridgeFeeBps = 50  // 0.5% fee

// Calculate expected fee
const amount = BigInt("1000000000")  // 1000 USDC
const feeAmount = (amount * BigInt(bridgeFeeBps)) / BigInt(10000)
console.log(`Fee: ${feeAmount} (${bridgeFeeBps / 100}%)`)
```

### Error Recovery
```typescript
// Handle bridge failures gracefully
async function safeBridge(config: BridgeConfig, maxRetries = 3) {
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      return await agent.atomicBridge(config)
    } catch (error) {
      console.warn(`Attempt ${attempt} failed:`, error)
      if (attempt < maxRetries) {
        await new Promise(r => setTimeout(r, 5000 * attempt))
      }
    }
  }
  throw new Error("Bridge failed after max retries")
}
```

---

## DemosWork Integration

Combine bridge operations with other actions:

```typescript
import { DemosWork, BaseOperation, ConditionalOperation, WorkStep } from "@kynesyslabs/demosdk/demoswork"

// Multi-chain rebalancing workflow
const work = new DemosWork()

// Check balances across chains
const checkStep = new WorkStep({
  context: "query",
  content: { action: "getBalances", chains: ["eth", "polygon", "arbitrum"] }
})

// Conditional bridge if imbalanced
const bridgeCondition = new ConditionalOperation(
  checkStep,
  "balance.eth > balance.polygon * 2",  // If ETH balance is 2x Polygon
  new WorkStep({
    context: "bridge",
    content: {
      action: "atomicBridge",
      from: "eth",
      to: "polygon",
      amount: "AUTO_REBALANCE"
    },
    critical: true
  })
)

work.push(bridgeCondition)
```

---

## Related Skills

- [Token Discovery Agent](./token-discovery-agent.md) - Find tokens across chains
- [Transaction Builder Agent](./transaction-builder-agent.md) - Complex tx construction
- [DEX Integration Agent](./dex-integration-agent.md) - Swap routing
- [Event Monitoring Agent](./event-monitoring-agent.md) - Track bridge events
