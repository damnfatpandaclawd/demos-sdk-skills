# Bitcoin Operations Agent

> **⚠️ Prerequisites**: Complete [SDK Setup](./00-sdk-setup.md) first to configure your environment.

Build agents that interact with the Bitcoin blockchain through the Demos Network XM SDK.

## SDK Reference

```typescript
import { BTC } from "@kynesyslabs/demosdk/xm-websdk"
// or
import { BTC } from "@kynesyslabs/demosdk/xm-localsdk"
```

### Core Methods

| Method | Purpose |
|--------|---------|
| `create(rpc_url, network?)` | Create and connect to Bitcoin RPC |
| `connectWallet(privateKeyOrMnemonic)` | Connect wallet (WIF or mnemonic) |
| `generatePrivateKey(seed?)` | Generate new private key |
| `getBalance()` | Get BTC balance |
| `preparePay(address, amount)` | Prepare BTC transfer |
| `preparePays(payments)` | Batch multiple transfers |
| `fetchUTXOs(address)` | Get UTXOs for address |
| `fetchAllUTXOs()` | Get all wallet UTXOs |
| `getFeeRate()` | Get current fee rate |
| `signMessage(message)` | Sign message with wallet |
| `verifyMessage(message, signature, address)` | Verify signature |
| `getLegacyAddress()` | Get P2PKH address for signatures |
| `inferNetworkFromAddress(address)` | Detect mainnet/testnet |

### Networks

```typescript
import { BTC } from "@kynesyslabs/demosdk/xm-websdk"

// Access network configs
const mainnet = BTC.networks.bitcoin
const testnet = BTC.networks.testnet
const regtest = BTC.networks.regtest
```

### RPC Endpoints

| Network | URL Example |
|---------|-------------|
| Mainnet | `https://blockstream.info/api` |
| Testnet | `https://blockstream.info/testnet/api` |
| Mempool | `https://mempool.space/api` |

## Use Cases

### 1. Bitcoin Payment Agent

Process Bitcoin payments with UTXO management.

```typescript
import { BTC } from "@kynesyslabs/demosdk/xm-websdk"
import { Demos } from "@kynesyslabs/demosdk/websdk"

interface BTCPayment {
  recipient: string
  amountBTC: string
  priority: "low" | "medium" | "high"
}

class BitcoinPaymentAgent {
  private btc: BTC
  private demos: Demos

  async initialize(rpcUrl: string, privateKey: string): Promise<void> {
    // Auto-detect network from URL
    this.btc = await BTC.create(rpcUrl)
    await this.btc.connectWallet(privateKey)

    this.demos = new Demos()
    await this.demos.connect("https://demosnode.discus.sh/")

    const address = this.btc.getAddress()
    const legacyAddress = this.btc.getLegacyAddress()
    console.log(`Connected: ${address}`)
    console.log(`Legacy address: ${legacyAddress}`)
  }

  async sendPayment(payment: BTCPayment): Promise<string> {
    // Get current balance and UTXOs
    const balance = await this.btc.getBalance()
    console.log(`Balance: ${balance} BTC`)

    if (parseFloat(balance) < parseFloat(payment.amountBTC)) {
      throw new Error("Insufficient balance")
    }

    // Get fee rate based on priority
    const feeRate = await this.getFeeRateForPriority(payment.priority)
    console.log(`Using fee rate: ${feeRate} sat/vB`)

    // Prepare signed transaction
    const signedTx = await this.btc.preparePay(
      payment.recipient,
      payment.amountBTC,
      feeRate
    )

    // Submit through Demos
    const txId = await this.demos.submitXmTransaction({
      chain: "bitcoin",
      signedTransaction: signedTx,
      metadata: { priority: payment.priority }
    })

    console.log(`Transaction broadcast: ${txId}`)
    return txId
  }

  async sendBatchPayments(payments: BTCPayment[]): Promise<string[]> {
    const payOptions = payments.map(p => ({
      receiver: p.recipient,
      amount: p.amountBTC
    }))

    const feeRate = await this.btc.getFeeRate()
    const signedTxs = await this.btc.preparePays(payOptions, feeRate)

    const txIds: string[] = []
    for (const signedTx of signedTxs) {
      const txId = await this.demos.submitXmTransaction({
        chain: "bitcoin",
        signedTransaction: signedTx
      })
      txIds.push(txId)
    }

    return txIds
  }

  private async getFeeRateForPriority(
    priority: "low" | "medium" | "high"
  ): Promise<number> {
    const baseFee = await this.btc.getFeeRate()

    switch (priority) {
      case "low": return Math.floor(baseFee * 0.5)
      case "medium": return baseFee
      case "high": return Math.floor(baseFee * 2)
    }
  }

  async getUTXOSummary(): Promise<UTXOSummary> {
    const utxos = await this.btc.fetchAllUTXOs()

    let totalValue = 0
    for (const utxo of utxos) {
      totalValue += utxo.value
    }

    return {
      count: utxos.length,
      totalValueSats: totalValue,
      totalValueBTC: (totalValue / 100_000_000).toFixed(8),
      utxos
    }
  }
}
```

### 2. UTXO Consolidation Agent

Optimize wallet UTXOs for efficient transactions.

```typescript
import { BTC } from "@kynesyslabs/demosdk/xm-websdk"

interface UTXO {
  txid: string
  vout: number
  value: number
  confirmations: number
}

class UTXOConsolidationAgent {
  private btc: BTC

  async initialize(rpcUrl: string, privateKey: string): Promise<void> {
    this.btc = await BTC.create(rpcUrl)
    await this.btc.connectWallet(privateKey)
  }

  async analyzeUTXOs(): Promise<UTXOAnalysis> {
    const utxos = await this.btc.fetchAllUTXOs()

    // Categorize UTXOs
    const dust: UTXO[] = []
    const small: UTXO[] = []
    const medium: UTXO[] = []
    const large: UTXO[] = []

    for (const utxo of utxos) {
      if (utxo.value < 1000) dust.push(utxo)
      else if (utxo.value < 10000) small.push(utxo)
      else if (utxo.value < 100000) medium.push(utxo)
      else large.push(utxo)
    }

    // Calculate consolidation benefit
    const feeRate = await this.btc.getFeeRate()
    const inputSize = 68 // bytes per input (approx)
    const consolidationCost = utxos.length * inputSize * feeRate

    return {
      total: utxos.length,
      categories: {
        dust: { count: dust.length, totalSats: this.sumValues(dust) },
        small: { count: small.length, totalSats: this.sumValues(small) },
        medium: { count: medium.length, totalSats: this.sumValues(medium) },
        large: { count: large.length, totalSats: this.sumValues(large) }
      },
      recommendConsolidation: utxos.length > 10 || dust.length > 5,
      estimatedConsolidationCost: consolidationCost
    }
  }

  async consolidateUTXOs(
    targetUTXOCount: number = 1,
    maxFeeRate?: number
  ): Promise<string> {
    const utxos = await this.btc.fetchAllUTXOs()

    if (utxos.length <= targetUTXOCount) {
      console.log("No consolidation needed")
      return ""
    }

    const feeRate = maxFeeRate || await this.btc.getFeeRate()
    const myAddress = this.btc.getAddress()

    // Calculate total value minus estimated fee
    const totalValue = this.sumValues(utxos)
    const estimatedSize = utxos.length * 68 + 34 + 10 // inputs + output + overhead
    const fee = estimatedSize * feeRate
    const outputValue = totalValue - fee

    if (outputValue <= 0) {
      throw new Error("Consolidation not economical at current fee rate")
    }

    // Create consolidation transaction
    const signedTx = await this.btc.preparePay(
      myAddress,
      (outputValue / 100_000_000).toFixed(8),
      feeRate
    )

    console.log(`Consolidating ${utxos.length} UTXOs into 1`)
    console.log(`Fee: ${fee} sats`)

    return signedTx
  }

  async removesDust(dustThreshold: number = 1000): Promise<string[]> {
    const utxos = await this.btc.fetchAllUTXOs()
    const dustUTXOs = utxos.filter(u => u.value < dustThreshold)

    if (dustUTXOs.length === 0) {
      console.log("No dust UTXOs found")
      return []
    }

    // Consolidate dust into a single UTXO
    // Note: May not be economical if fee > dust value
    const totalDust = this.sumValues(dustUTXOs)
    const feeRate = await this.btc.getFeeRate()
    const estimatedFee = dustUTXOs.length * 68 * feeRate

    if (estimatedFee > totalDust) {
      console.log("Dust removal not economical")
      return []
    }

    const signedTx = await this.btc.preparePay(
      this.btc.getAddress(),
      ((totalDust - estimatedFee) / 100_000_000).toFixed(8),
      feeRate
    )

    return [signedTx]
  }

  private sumValues(utxos: UTXO[]): number {
    return utxos.reduce((sum, u) => sum + u.value, 0)
  }
}
```

### 3. Bitcoin Signature Agent

Sign and verify messages for authentication.

```typescript
import { BTC } from "@kynesyslabs/demosdk/xm-websdk"

interface SignedProof {
  message: string
  signature: string
  address: string
  publicKey: string
  timestamp: number
}

class BitcoinSignatureAgent {
  private btc: BTC

  async initialize(rpcUrl: string, privateKey: string): Promise<void> {
    this.btc = await BTC.create(rpcUrl)
    await this.btc.connectWallet(privateKey)
  }

  async createOwnershipProof(domain: string): Promise<SignedProof> {
    const timestamp = Date.now()
    const message = `I own this Bitcoin address.\nDomain: ${domain}\nTimestamp: ${timestamp}`

    const signature = await this.btc.signMessage(message)

    // Use legacy address for verification compatibility
    const legacyAddress = this.btc.getLegacyAddress()
    const publicKey = this.btc.getPublicKey()

    return {
      message,
      signature,
      address: legacyAddress,
      publicKey,
      timestamp
    }
  }

  async verifyOwnershipProof(proof: SignedProof): Promise<boolean> {
    // Verify timestamp is recent (within 1 hour)
    const oneHour = 60 * 60 * 1000
    if (Date.now() - proof.timestamp > oneHour) {
      console.log("Proof expired")
      return false
    }

    // Verify signature
    const valid = await this.btc.verifyMessage(
      proof.message,
      proof.signature,
      proof.address
    )

    return valid
  }

  async signTransaction(psbtHex: string): Promise<string> {
    // Sign a PSBT (Partially Signed Bitcoin Transaction)
    // Useful for multi-sig scenarios
    const psbt = bitcoin.Psbt.fromHex(psbtHex)
    const signedPsbt = await this.btc.signTransaction(psbt)
    return signedPsbt
  }

  async createMultiSigMessage(
    participants: string[],
    message: string
  ): Promise<{ message: string; mySignature: string }> {
    // Create a message that multiple parties can sign
    const fullMessage = JSON.stringify({
      content: message,
      participants,
      initiator: this.btc.getAddress(),
      timestamp: Date.now()
    })

    const signature = await this.btc.signMessage(fullMessage)

    return {
      message: fullMessage,
      mySignature: signature
    }
  }
}
```

### 4. Bitcoin Treasury Agent

Manage a Bitcoin treasury with multi-sig support.

```typescript
import { BTC } from "@kynesyslabs/demosdk/xm-websdk"

interface TreasuryConfig {
  coldStorageThreshold: string // BTC amount
  hotWalletMax: string // Max in hot wallet
  consolidationThreshold: number // UTXO count trigger
}

interface TreasuryStatus {
  hotWalletBalance: string
  utxoCount: number
  pendingTransactions: number
  lastConsolidation: number
}

class BitcoinTreasuryAgent {
  private btc: BTC
  private config: TreasuryConfig
  private coldStorageAddress: string

  async initialize(
    rpcUrl: string,
    privateKey: string,
    coldStorageAddress: string,
    config: TreasuryConfig
  ): Promise<void> {
    this.btc = await BTC.create(rpcUrl)
    await this.btc.connectWallet(privateKey)
    this.coldStorageAddress = coldStorageAddress
    this.config = config
  }

  async getStatus(): Promise<TreasuryStatus> {
    const balance = await this.btc.getBalance()
    const utxos = await this.btc.fetchAllUTXOs()

    return {
      hotWalletBalance: balance,
      utxoCount: utxos.length,
      pendingTransactions: 0, // Would need mempool query
      lastConsolidation: 0 // Would need to track
    }
  }

  async sweepToColdStorage(): Promise<string | null> {
    const balance = parseFloat(await this.btc.getBalance())
    const hotMax = parseFloat(this.config.hotWalletMax)

    if (balance <= hotMax) {
      console.log("Balance within hot wallet limit")
      return null
    }

    const sweepAmount = balance - hotMax
    const feeRate = await this.btc.getFeeRate()

    console.log(`Sweeping ${sweepAmount} BTC to cold storage`)

    const signedTx = await this.btc.preparePay(
      this.coldStorageAddress,
      sweepAmount.toFixed(8),
      feeRate
    )

    return signedTx
  }

  async processWithdrawal(
    recipient: string,
    amountBTC: string,
    approvals: string[] // Signatures from approvers
  ): Promise<string> {
    // Verify approvals (simplified - real impl would verify signatures)
    if (approvals.length < 2) {
      throw new Error("Insufficient approvals for withdrawal")
    }

    const balance = await this.btc.getBalance()
    if (parseFloat(balance) < parseFloat(amountBTC)) {
      throw new Error("Insufficient hot wallet balance")
    }

    const feeRate = await this.btc.getFeeRate()
    const signedTx = await this.btc.preparePay(recipient, amountBTC, feeRate)

    console.log(`Withdrawal processed: ${amountBTC} BTC to ${recipient}`)
    return signedTx
  }

  async runMaintenanceCycle(): Promise<MaintenanceResult> {
    const result: MaintenanceResult = {
      consolidated: false,
      sweptToCold: false,
      actions: []
    }

    // Check UTXO consolidation
    const utxos = await this.btc.fetchAllUTXOs()
    if (utxos.length > this.config.consolidationThreshold) {
      result.actions.push("UTXO consolidation recommended")
      result.consolidated = true
    }

    // Check cold storage sweep
    const balance = parseFloat(await this.btc.getBalance())
    if (balance > parseFloat(this.config.hotWalletMax)) {
      const sweepTx = await this.sweepToColdStorage()
      if (sweepTx) {
        result.actions.push(`Cold storage sweep: ${sweepTx}`)
        result.sweptToCold = true
      }
    }

    return result
  }

  async estimateTransactionFee(
    outputs: number,
    priority: "low" | "medium" | "high"
  ): Promise<number> {
    const feeRate = await this.btc.getFeeRate()
    const utxos = await this.btc.fetchAllUTXOs()

    // Estimate transaction size
    const inputSize = 68 // P2WPKH input
    const outputSize = 34 // P2WPKH output
    const overhead = 10

    const estimatedSize = utxos.length * inputSize + outputs * outputSize + overhead

    const multiplier = priority === "low" ? 0.5 : priority === "high" ? 2 : 1
    return Math.ceil(estimatedSize * feeRate * multiplier)
  }
}
```

## Network Detection

```typescript
// Detect network from address format
const network = BTC.inferNetworkFromAddress("bc1q...") // mainnet
const network2 = BTC.inferNetworkFromAddress("tb1q...") // testnet

// Detect network from RPC URL
const network3 = BTC.inferNetworkFromUrl("https://blockstream.info/testnet/api")
```

## Integration with Demos

```typescript
import { DemosWork, WorkStep } from "@kynesyslabs/demosdk/demoswork"

// Cross-chain operation involving Bitcoin
async function crossChainBTCOperation(
  demos: Demos,
  btc: BTC,
  recipient: string,
  amount: string
): Promise<DemosWork> {
  const work = new DemosWork()

  // Prepare Bitcoin transaction
  const signedTx = await btc.preparePay(recipient, amount)

  const btcStep = new WorkStep({
    context: "xm",
    content: {
      chain: "bitcoin",
      signedTransaction: signedTx
    },
    critical: true
  })

  work.push(new BaseOperation(btcStep))
  return work
}
```

## Best Practices

1. **Use correct network** - Always verify mainnet vs testnet
2. **Monitor fee rates** - Adjust priority based on urgency
3. **Manage UTXOs** - Consolidate periodically to reduce fees
4. **Use SegWit** - Prefer bc1 addresses for lower fees
5. **Verify signatures** - Always use legacy address for verification

## Related Skills

- [Cross-Chain Bridge Agent](./crosschain-bridge-agent.md) - Bridge BTC to other chains
- [Transaction Builder Agent](./transaction-builder-agent.md) - Complex transaction construction
- [Event Monitoring Agent](./event-monitoring-agent.md) - Monitor Bitcoin transactions
