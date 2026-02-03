# Cross-Chain Treasury Agent

> **⚠️ Prerequisites**: Complete [SDK Setup](./00-sdk-setup.md) first to configure your environment.

Build autonomous treasury management agents that move assets across chains using Demos Native Bridge and Rubic aggregator with gasless meta-transactions.

## Agent Use Cases

| Use Case | Description |
|----------|-------------|
| **Multi-Chain Treasury** | Agent holds assets across ETH, BSC, Polygon, Solana - rebalances automatically |
| **Yield Chaser** | Moves stablecoins to highest-yield chain/protocol |
| **Gas Optimizer** | Bridges to cheapest chain for batch operations |
| **Cross-Chain Payroll** | Pays team members on their preferred chains |
| **Liquidity Provider** | Distributes LP positions across chains |
| **Emergency Evacuator** | Auto-bridges assets during protocol emergencies |

## Supported Chains

### Native Bridge

| Chain | Type | Stablecoins |
|-------|------|-------------|
| Ethereum | EVM | USDC |
| Polygon | EVM | USDC |
| Base | EVM | USDC |
| BSC | EVM | USDC |
| Arbitrum | EVM | USDC |
| Optimism | EVM | USDC |
| Avalanche | EVM | USDC |
| Solana | Non-EVM | USDC |

### Rubic Aggregator

Supports 70+ chains with automatic route optimization for any token pair.

## Import

```typescript
import {
  NativeBridgeMethods,
  NativeBridgeSupportedChains,
  NativeBridgeSupportedStablecoins,
  NativeBridgeUSDCContracts,
  RubicBridge,
  validateChain
} from '@kynesyslabs/demosdk/bridge'
```

## Native Bridge Methods

| Method | Purpose |
|--------|---------|
| `generateAtomicDepositAndBridge` | **Recommended**: Single atomic operation for deposit + bridge |
| `generateCompleteGaslessBridge` | Gasless bridge with separate deposit/bridge ops |
| `generateOperation` | Manual operation creation |
| `generateOperationTx` | Create transaction from compiled operation |
| `validateChain` | Validate chain is supported |

## Treasury Agent Example

```typescript
import { Demos } from '@kynesyslabs/demosdk/websdk'
import {
  NativeBridgeMethods,
  NativeBridgeUSDCContracts,
  RubicBridge
} from '@kynesyslabs/demosdk/bridge'

class TreasuryAgent {
  private demos: Demos
  private rubic: RubicBridge
  private walletPrivateKey: string
  private walletPublicKey: string

  async initialize(nodeUrl: string, privateKey: string) {
    this.demos = new Demos()
    await this.demos.connect(nodeUrl)
    await this.demos.connectWallet(privateKey)
    
    this.walletPrivateKey = privateKey
    this.walletPublicKey = this.demos.wallet.getPublicKey()
    this.rubic = new RubicBridge()
  }

  // Atomic deposit and bridge (RECOMMENDED)
  async bridgeStablecoins(
    amount: string,
    destChain: string,
    recipient: string
  ): Promise<{ txHash: string }> {
    const nonce = await this.demos.getNonce()
    
    // Generate atomic operation (deposit + bridge in one tx)
    const { operation, signature } = NativeBridgeMethods.generateAtomicDepositAndBridge(
      this.walletPrivateKey,
      this.walletPublicKey,
      nonce,
      'usdc',           // Token name
      amount,           // Amount to bridge
      destChain,        // e.g., 'polygon', 'base', 'arbitrum'
      recipient,        // Destination address
      0,                // Bridge fee in basis points (0 = no fee)
      11155111,         // Chain ID (Sepolia)
      NativeBridgeUSDCContracts['eth.sepolia'],
      'eth.sepolia'     // Origin chain key
    )
    
    // Execute on Demos network
    const result = await this.demos.nodeCall('compileBridgeOperation', operation)
    const tx = await NativeBridgeMethods.generateOperationTx(result, this.demos)
    
    await this.demos.confirm(tx)
    const txHash = await this.demos.broadcast(tx)
    
    return { txHash }
  }

  // Gasless bridge (separate deposit + bridge operations)
  async gaslessBridge(
    amount: string,
    originChain: string,
    destChain: string,
    recipient: string
  ): Promise<{ depositTx: string; bridgeTx: string }> {
    const nonce = await this.demos.getNonce()
    const usdcAddress = NativeBridgeUSDCContracts[`${originChain}.sepolia`]
    
    // Generate complete gasless bridge flow
    const { 
      depositOperation, 
      bridgeOperation, 
      signature 
    } = NativeBridgeMethods.generateCompleteGaslessBridge(
      this.walletPrivateKey,
      this.walletPublicKey,
      nonce,
      originChain,
      destChain,
      usdcAddress,
      recipient,
      amount,
      0  // No bridge fee
    )
    
    // Execute deposit
    const depositResult = await this.demos.nodeCall('executeGaslessDeposit', depositOperation)
    
    // Execute bridge
    const bridgeResult = await this.demos.nodeCall('executeGaslessBridge', bridgeOperation)
    
    return {
      depositTx: depositResult.txHash,
      bridgeTx: bridgeResult.txHash
    }
  }
}
```

## Multi-Chain Balance Monitor

```typescript
import { EVM, Solana } from '@kynesyslabs/demosdk/xm-websdk'

class BalanceMonitorAgent {
  private evmChains: Map<string, EVM> = new Map()
  private solana: Solana

  async initializeChains(rpcEndpoints: Record<string, string>) {
    // Initialize EVM chains
    for (const [chain, rpc] of Object.entries(rpcEndpoints)) {
      if (chain !== 'solana') {
        const evm = await EVM.create(rpc)
        this.evmChains.set(chain, evm)
      }
    }
    
    // Initialize Solana
    if (rpcEndpoints.solana) {
      this.solana = await Solana.create(rpcEndpoints.solana)
    }
  }

  async getMultiChainBalances(address: string): Promise<{
    chain: string
    balance: string
    usdValue: number
  }[]> {
    const balances = []
    
    // Get EVM balances
    for (const [chain, evm] of this.evmChains) {
      const balance = await evm.getBalance(address)
      balances.push({
        chain,
        balance: balance.toString(),
        usdValue: parseFloat(balance) * await this.getPrice(chain)
      })
    }
    
    // Get Solana balance
    if (this.solana) {
      const balance = await this.solana.getBalance(address)
      balances.push({
        chain: 'solana',
        balance: balance.toString(),
        usdValue: parseFloat(balance) * await this.getPrice('solana')
      })
    }
    
    return balances
  }

  async findOptimalChain(minBalance: number): Promise<string> {
    // Find chain with lowest gas fees that has sufficient balance
    const balances = await this.getMultiChainBalances(this.address)
    const gasPrices = await this.getGasPrices()
    
    return balances
      .filter(b => parseFloat(b.balance) >= minBalance)
      .sort((a, b) => gasPrices[a.chain] - gasPrices[b.chain])[0]?.chain
  }
}
```

## Yield Chaser Agent

```typescript
class YieldChaserAgent extends TreasuryAgent {
  private yieldSources: Record<string, { chain: string; apy: number }[]> = {}

  async findBestYield(token: string): Promise<{
    chain: string
    protocol: string
    apy: number
  }> {
    // Fetch yields from multiple sources
    const yields = await Promise.all([
      this.fetchAaveYields(token),
      this.fetchCompoundYields(token),
      this.fetchYearnYields(token)
    ])
    
    return yields.flat().sort((a, b) => b.apy - a.apy)[0]
  }

  async rebalanceForYield(
    currentChain: string,
    amount: string
  ): Promise<void> {
    const bestYield = await this.findBestYield('USDC')
    
    // Only bridge if yield difference is significant (> 1%)
    const currentYield = await this.getCurrentYield(currentChain)
    if (bestYield.apy - currentYield < 1) {
      console.log('Yield difference too small, skipping rebalance')
      return
    }
    
    // Bridge to better yield chain
    if (bestYield.chain !== currentChain) {
      await this.bridgeStablecoins(
        amount,
        bestYield.chain,
        this.walletPublicKey
      )
    }
  }
}
```

## Rubic Bridge for Any Token

```typescript
import { RubicBridge } from '@kynesyslabs/demosdk/bridge'

class RubicSwapAgent {
  private rubic: RubicBridge
  private demos: Demos

  async swapCrossChain(
    fromChain: string,
    toChain: string,
    fromToken: string,
    toToken: string,
    amount: string
  ): Promise<{ txHash: string; estimatedOutput: string }> {
    // Get best route via Rubic aggregator
    const trade = await this.rubic.getTrade(this.demos, fromChain, {
      fromChain,
      toChain,
      fromToken,
      toToken,
      amount
    })
    
    // Execute the swap
    const result = await this.rubic.executeTrade(this.demos, fromChain, {
      ...trade,
      slippage: 0.5  // 0.5% slippage tolerance
    })
    
    return {
      txHash: result.txHash,
      estimatedOutput: trade.estimatedOutput
    }
  }
}
```

## Emergency Evacuation Agent

```typescript
class EmergencyEvacuationAgent extends TreasuryAgent {
  private safeHavenChain = 'base'  // Default safe chain
  private alertWebhook: string

  async monitorAndEvacuate(
    watchedProtocols: string[],
    minTVLThreshold: number
  ): Promise<void> {
    for (const protocol of watchedProtocols) {
      const tvl = await this.getTVL(protocol)
      
      if (tvl < minTVLThreshold) {
        // Emergency: TVL dropped significantly
        await this.evacuatePosition(protocol)
        await this.sendAlert(`⚠️ Evacuated ${protocol} - TVL dropped to ${tvl}`)
      }
    }
  }

  async evacuatePosition(protocol: string): Promise<void> {
    // 1. Withdraw from protocol
    const amount = await this.withdrawAll(protocol)
    
    // 2. Bridge to safe haven chain
    await this.bridgeStablecoins(
      amount,
      this.safeHavenChain,
      this.walletPublicKey
    )
  }
}
```

## Cross-Chain Payroll Agent

```typescript
interface PayrollEntry {
  recipient: string
  amount: string
  chain: string
}

class PayrollAgent extends TreasuryAgent {
  async executePayroll(payroll: PayrollEntry[]): Promise<{
    success: PayrollEntry[]
    failed: PayrollEntry[]
  }> {
    const success: PayrollEntry[] = []
    const failed: PayrollEntry[] = []
    
    // Group by destination chain for efficiency
    const byChain = this.groupByChain(payroll)
    
    for (const [chain, entries] of Object.entries(byChain)) {
      for (const entry of entries) {
        try {
          await this.bridgeStablecoins(
            entry.amount,
            chain,
            entry.recipient
          )
          success.push(entry)
        } catch (error) {
          failed.push(entry)
          console.error(`Failed to pay ${entry.recipient}: ${error.message}`)
        }
      }
    }
    
    return { success, failed }
  }

  private groupByChain(payroll: PayrollEntry[]): Record<string, PayrollEntry[]> {
    return payroll.reduce((acc, entry) => {
      acc[entry.chain] = acc[entry.chain] || []
      acc[entry.chain].push(entry)
      return acc
    }, {} as Record<string, PayrollEntry[]>)
  }
}
```

## Chain Validation

```typescript
import { validateChain, NativeBridgeSupportedChains } from '@kynesyslabs/demosdk/bridge'

// Validate before bridging
function validateBridgeParams(origin: string, dest: string) {
  validateChain(origin, 'EVM', true)   // isOrigin = true
  validateChain(dest, 'EVM', false)    // isOrigin = false
}

// Check supported chains
const supportedChains = NativeBridgeSupportedChains
console.log('Supported chains:', supportedChains)
// ['eth', 'polygon', 'base', 'bsc', 'arbitrum', 'optimism', 'avalanche', 'SOLANA']
```

## Quick Reference

| Task | Method |
|------|--------|
| Atomic bridge (recommended) | `NativeBridgeMethods.generateAtomicDepositAndBridge()` |
| Gasless bridge | `NativeBridgeMethods.generateCompleteGaslessBridge()` |
| Generate tx from compiled | `NativeBridgeMethods.generateOperationTx()` |
| Validate chain | `validateChain(chain, type, isOrigin)` |
| Rubic swap | `rubic.getTrade() → rubic.executeTrade()` |
| Get USDC address | `NativeBridgeUSDCContracts['chain.network']` |
