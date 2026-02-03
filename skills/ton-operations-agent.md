# TON Operations Agent

Build agents that interact with The Open Network (TON) blockchain through the Demos Network XM SDK.

## SDK Reference

```typescript
import { TON } from "@kynesyslabs/demosdk/xm-websdk"
// or
import { TON } from "@kynesyslabs/demosdk/xm-localsdk"
```

### Core Methods

| Method | Purpose |
|--------|---------|
| `create(rpc_url)` | Create and connect to TON RPC |
| `connectWallet(privateKey)` | Connect wallet with private key |
| `createWallet()` | Generate new TON wallet |
| `getBalance(address)` | Get TON balance |
| `preparePay(receiver, amount)` | Prepare TON transfer |
| `preparePays(payments)` | Batch multiple transfers |
| `signMessage(message)` | Sign arbitrary message |
| `verifyMessage(message, signature, publicKey)` | Verify signature |
| `cellsToSendableFile(cells)` | Convert cells to sendable format |
| `estimateFee(transaction)` | Estimate transaction fee |

### RPC Endpoints

| Network | URL |
|---------|-----|
| Mainnet | `https://toncenter.com/api/v2/jsonRPC` |
| Testnet | `https://testnet.toncenter.com/api/v2/jsonRPC` |

## Use Cases

### 1. TON Payment Agent

Process TON transfers with fee estimation through Demos.

```typescript
import { TON } from "@kynesyslabs/demosdk/xm-websdk"
import { Demos } from "@kynesyslabs/demosdk/websdk"

interface PaymentRequest {
  recipient: string
  amount: string
  comment?: string
}

class TonPaymentAgent {
  private ton: TON
  private demos: Demos

  async initialize(rpcUrl: string, privateKey: string): Promise<void> {
    this.ton = await TON.create(rpcUrl)
    await this.ton.connectWallet(privateKey)

    this.demos = new Demos()
    await this.demos.connect("https://demosnode.discus.sh/")

    console.log(`Connected: ${this.ton.getAddress()}`)
  }

  async estimatePayment(request: PaymentRequest): Promise<string> {
    // Prepare transaction to estimate
    const signedTx = await this.ton.preparePay(
      request.recipient,
      request.amount
    )

    // Estimate fee
    const fee = await this.ton.estimateFee(signedTx)
    console.log(`Estimated fee: ${fee} TON`)

    return fee
  }

  async sendPayment(request: PaymentRequest): Promise<string> {
    // Get current balance
    const balance = await this.ton.getBalance(this.ton.getAddress())
    console.log(`Current balance: ${balance} TON`)

    // Estimate fee first
    const fee = await this.estimatePayment(request)
    const totalNeeded = parseFloat(request.amount) + parseFloat(fee)

    if (parseFloat(balance) < totalNeeded) {
      throw new Error(`Insufficient balance. Need ${totalNeeded} TON`)
    }

    // Prepare signed transaction
    const signedTx = await this.ton.preparePay(
      request.recipient,
      request.amount
    )

    // Submit through Demos for cross-chain orchestration
    const txHash = await this.demos.submitXmTransaction({
      chain: "ton",
      signedTransaction: signedTx,
      metadata: { comment: request.comment }
    })

    console.log(`Payment sent: ${txHash}`)
    return txHash
  }

  async sendBatchPayments(payments: PaymentRequest[]): Promise<string[]> {
    const payOptions = payments.map(p => ({
      receiver: p.recipient,
      amount: p.amount
    }))

    const signedTxs = await this.ton.preparePays(payOptions)

    const txHashes: string[] = []
    for (const signedTx of signedTxs) {
      const txHash = await this.demos.submitXmTransaction({
        chain: "ton",
        signedTransaction: signedTx
      })
      txHashes.push(txHash)
    }

    return txHashes
  }

  async getBalance(): Promise<string> {
    return await this.ton.getBalance(this.ton.getAddress())
  }

  async disconnect(): Promise<void> {
    await this.ton.disconnect()
  }
}
```

### 2. TON Wallet Factory Agent

Create and manage multiple TON wallets programmatically.

```typescript
import { TON } from "@kynesyslabs/demosdk/xm-websdk"
import { WalletContractV5R1 } from "@ton/ton"

interface WalletInfo {
  address: string
  publicKey: string
  privateKey: string
  version: string
  createdAt: number
}

class TonWalletFactoryAgent {
  private ton: TON
  private wallets: Map<string, WalletInfo> = new Map()

  async initialize(rpcUrl: string): Promise<void> {
    this.ton = await TON.create(rpcUrl)
  }

  async createWallet(label: string): Promise<WalletInfo> {
    // Generate new wallet using V5R1 contract
    const { keypair, address } = await this.ton.createWallet()

    const walletInfo: WalletInfo = {
      address: address.toString(),
      publicKey: keypair.publicKey.toString("hex"),
      privateKey: keypair.secretKey.toString("hex"),
      version: "V5R1",
      createdAt: Date.now()
    }

    this.wallets.set(label, walletInfo)
    console.log(`Wallet created: ${label} -> ${walletInfo.address}`)

    return walletInfo
  }

  async createMultipleWallets(count: number, prefix: string): Promise<WalletInfo[]> {
    const wallets: WalletInfo[] = []

    for (let i = 0; i < count; i++) {
      const label = `${prefix}_${i}`
      const wallet = await this.createWallet(label)
      wallets.push(wallet)
    }

    return wallets
  }

  async getWalletBalances(): Promise<Map<string, string>> {
    const balances = new Map<string, string>()

    for (const [label, wallet] of this.wallets) {
      const balance = await this.ton.getBalance(wallet.address)
      balances.set(label, balance)
    }

    return balances
  }

  async fundWallet(
    label: string,
    fromPrivateKey: string,
    amount: string
  ): Promise<string> {
    const wallet = this.wallets.get(label)
    if (!wallet) throw new Error(`Wallet ${label} not found`)

    // Connect funding wallet
    await this.ton.connectWallet(fromPrivateKey)

    // Send funds
    const signedTx = await this.ton.preparePay(wallet.address, amount)

    // In real implementation, submit through Demos
    console.log(`Funded ${label} with ${amount} TON`)

    return wallet.address
  }

  getWallet(label: string): WalletInfo | undefined {
    return this.wallets.get(label)
  }

  getAllWallets(): WalletInfo[] {
    return Array.from(this.wallets.values())
  }

  exportWallets(): string {
    return JSON.stringify(Array.from(this.wallets.entries()), null, 2)
  }
}
```

### 3. TON Message Signing Agent

Sign and verify messages for authentication and attestation.

```typescript
import { TON } from "@kynesyslabs/demosdk/xm-websdk"

interface SignedMessage {
  message: string
  signature: string
  publicKey: string
  timestamp: number
}

interface VerificationResult {
  valid: boolean
  signer: string
  timestamp: number
}

class TonMessageSigningAgent {
  private ton: TON

  async initialize(rpcUrl: string, privateKey: string): Promise<void> {
    this.ton = await TON.create(rpcUrl)
    await this.ton.connectWallet(privateKey)
  }

  async signMessage(message: string): Promise<SignedMessage> {
    const signature = await this.ton.signMessage(message)

    return {
      message,
      signature,
      publicKey: this.ton.getPublicKey(),
      timestamp: Date.now()
    }
  }

  async signStructuredData(data: object): Promise<SignedMessage> {
    const message = JSON.stringify(data)
    return await this.signMessage(message)
  }

  async createAuthChallenge(domain: string, nonce: string): Promise<SignedMessage> {
    const challenge = {
      domain,
      nonce,
      address: this.ton.getAddress(),
      issuedAt: new Date().toISOString(),
      expiresAt: new Date(Date.now() + 5 * 60 * 1000).toISOString() // 5 min
    }

    return await this.signStructuredData(challenge)
  }

  async verifyMessage(signedMessage: SignedMessage): Promise<VerificationResult> {
    const valid = await this.ton.verifyMessage(
      signedMessage.message,
      signedMessage.signature,
      signedMessage.publicKey
    )

    return {
      valid,
      signer: signedMessage.publicKey,
      timestamp: signedMessage.timestamp
    }
  }

  async verifyAuthChallenge(
    signedMessage: SignedMessage,
    expectedDomain: string
  ): Promise<{ valid: boolean; reason?: string }> {
    // First verify signature
    const verification = await this.verifyMessage(signedMessage)
    if (!verification.valid) {
      return { valid: false, reason: "Invalid signature" }
    }

    // Parse and verify challenge data
    try {
      const challenge = JSON.parse(signedMessage.message)

      if (challenge.domain !== expectedDomain) {
        return { valid: false, reason: "Domain mismatch" }
      }

      const expiresAt = new Date(challenge.expiresAt).getTime()
      if (Date.now() > expiresAt) {
        return { valid: false, reason: "Challenge expired" }
      }

      return { valid: true }
    } catch {
      return { valid: false, reason: "Invalid challenge format" }
    }
  }

  getAddress(): string {
    return this.ton.getAddress()
  }

  getPublicKey(): string {
    return this.ton.getPublicKey()
  }
}
```

### 4. TON Cell Operations Agent

Work with TON cells for smart contract interactions.

```typescript
import { TON } from "@kynesyslabs/demosdk/xm-websdk"
import { Cell, beginCell, Address } from "@ton/core"

interface CellData {
  raw: Cell
  boc: string
  hash: string
}

class TonCellOperationsAgent {
  private ton: TON

  async initialize(rpcUrl: string, privateKey: string): Promise<void> {
    this.ton = await TON.create(rpcUrl)
    await this.ton.connectWallet(privateKey)
  }

  createPayloadCell(data: {
    op: number
    queryId?: bigint
    payload?: Buffer
  }): CellData {
    const builder = beginCell()
      .storeUint(data.op, 32)
      .storeUint(data.queryId || 0n, 64)

    if (data.payload) {
      builder.storeBuffer(data.payload)
    }

    const cell = builder.endCell()

    return {
      raw: cell,
      boc: cell.toBoc().toString("base64"),
      hash: cell.hash().toString("hex")
    }
  }

  async prepareContractCall(
    contractAddress: string,
    payload: CellData,
    amount: string = "0.05"
  ): Promise<string> {
    // Convert cells to sendable format
    const sendableData = await this.ton.cellsToSendableFile([payload.raw])

    // This would integrate with contract-specific logic
    console.log(`Prepared call to ${contractAddress}`)
    console.log(`Payload hash: ${payload.hash}`)

    return sendableData
  }

  createJettonTransferCell(params: {
    queryId: bigint
    amount: bigint
    destination: string
    responseAddress: string
    forwardAmount: bigint
    forwardPayload?: Cell
  }): CellData {
    // Jetton transfer op code
    const OP_TRANSFER = 0xf8a7ea5

    const builder = beginCell()
      .storeUint(OP_TRANSFER, 32)
      .storeUint(params.queryId, 64)
      .storeCoins(params.amount)
      .storeAddress(Address.parse(params.destination))
      .storeAddress(Address.parse(params.responseAddress))
      .storeBit(false) // null custom_payload
      .storeCoins(params.forwardAmount)

    if (params.forwardPayload) {
      builder.storeBit(true).storeRef(params.forwardPayload)
    } else {
      builder.storeBit(false)
    }

    const cell = builder.endCell()

    return {
      raw: cell,
      boc: cell.toBoc().toString("base64"),
      hash: cell.hash().toString("hex")
    }
  }

  createNftTransferCell(params: {
    queryId: bigint
    newOwner: string
    responseAddress: string
    forwardAmount: bigint
  }): CellData {
    // NFT transfer op code
    const OP_TRANSFER = 0x5fcc3d14

    const cell = beginCell()
      .storeUint(OP_TRANSFER, 32)
      .storeUint(params.queryId, 64)
      .storeAddress(Address.parse(params.newOwner))
      .storeAddress(Address.parse(params.responseAddress))
      .storeBit(false) // null custom_payload
      .storeCoins(params.forwardAmount)
      .storeBit(false) // null forward_payload
      .endCell()

    return {
      raw: cell,
      boc: cell.toBoc().toString("base64"),
      hash: cell.hash().toString("hex")
    }
  }

  async estimateContractCall(
    contractAddress: string,
    payload: CellData,
    amount: string
  ): Promise<string> {
    // Create mock transaction for fee estimation
    const mockTx = {
      to: contractAddress,
      amount,
      payload: payload.boc
    }

    const fee = await this.ton.estimateFee(mockTx)
    return fee
  }
}
```

## Integration with Demos

### Cross-Chain TON Operations

```typescript
import { DemosWork, WorkStep } from "@kynesyslabs/demosdk/demoswork"
import { TON } from "@kynesyslabs/demosdk/xm-websdk"

async function crossChainToTon(
  demos: Demos,
  ton: TON,
  evmSourceChain: string,
  amount: string
): Promise<DemosWork> {
  const work = new DemosWork()

  // Step 1: Bridge from EVM to TON
  const bridgeStep = new WorkStep({
    context: "xm",
    content: {
      action: "bridge",
      from: evmSourceChain,
      to: "ton",
      amount
    },
    critical: true
  })
  work.push(new BaseOperation(bridgeStep))

  // Step 2: Execute TON operation
  const tonTx = await ton.preparePay("recipient", amount)
  const tonStep = new WorkStep({
    context: "xm",
    content: {
      chain: "ton",
      signedTransaction: tonTx
    }
  })
  work.push(new BaseOperation(tonStep))

  return work
}
```

## Best Practices

1. **Estimate fees** - Always call `estimateFee()` before transactions
2. **Use V5R1 wallets** - Latest wallet contract version with best features
3. **Handle cells properly** - Use `cellsToSendableFile()` for complex payloads
4. **Batch when possible** - Use `preparePays()` for multiple transfers
5. **Clean up connections** - Call `disconnect()` when done

## Related Skills

- [Cross-Chain Bridge Agent](./crosschain-bridge-agent.md) - Bridge to/from TON
- [EVM Operations Agent](./evm-operations-agent.md) - Multi-chain EVM operations
- [Wallet Security Agent](./wallet-security-agent.md) - Secure key management
