# XRPL Operations Agent

Build agents that interact with the XRP Ledger through the Demos Network XM SDK.

## SDK Reference

```typescript
import { XRPL } from "@kynesyslabs/demosdk/xm-websdk"
// or
import { XRPL } from "@kynesyslabs/demosdk/xm-localsdk"
```

### Core Methods

| Method | Purpose |
|--------|---------|
| `create(rpc_url)` | Create and connect to XRPL node |
| `connectWallet(privateKey)` | Connect wallet with private key |
| `createWallet()` | Generate new XRPL wallet |
| `getBalance(address)` | Get XRP balance |
| `getBalances(address)` | Get all token balances |
| `preparePay(receiver, amount)` | Prepare XRP transfer |
| `preparePays(payments)` | Batch multiple transfers |
| `signMessage(message)` | Sign arbitrary message |
| `verifyMessage(message, signature, publicKey)` | Verify signature |

### RPC Endpoints

| Network | URL |
|---------|-----|
| Mainnet | `wss://xrplcluster.com` |
| Testnet | `wss://s.altnet.rippletest.net:51233` |
| Devnet | `wss://s.devnet.rippletest.net:51233` |

## Use Cases

### 1. XRPL Payment Agent

Process XRP and token transfers through Demos.

```typescript
import { XRPL } from "@kynesyslabs/demosdk/xm-websdk"
import { Demos } from "@kynesyslabs/demosdk/websdk"

interface PaymentRequest {
  destination: string
  amount: string
  currency?: string
  issuer?: string
  destinationTag?: number
  memo?: string
}

class XrplPaymentAgent {
  private xrpl: XRPL
  private demos: Demos

  async initialize(rpcUrl: string, privateKey: string): Promise<void> {
    this.xrpl = await XRPL.create(rpcUrl)
    await this.xrpl.connectWallet(privateKey)

    this.demos = new Demos()
    await this.demos.connect("https://demosnode.discus.sh/")

    console.log(`Connected: ${this.xrpl.getAddress()}`)
  }

  async sendXrpPayment(request: PaymentRequest): Promise<string> {
    // Get current balance
    const balance = await this.xrpl.getBalance(this.xrpl.getAddress())
    console.log(`Current balance: ${balance} XRP`)

    // XRP requires minimum reserve (10 XRP base + 2 XRP per object)
    const minReserve = 10
    const availableBalance = parseFloat(balance) - minReserve

    if (availableBalance < parseFloat(request.amount)) {
      throw new Error(`Insufficient balance after reserve. Available: ${availableBalance} XRP`)
    }

    // Prepare signed transaction
    const signedTx = await this.xrpl.preparePay(
      request.destination,
      request.amount
    )

    // Submit through Demos for cross-chain orchestration
    const txHash = await this.demos.submitXmTransaction({
      chain: "xrpl",
      signedTransaction: signedTx,
      metadata: {
        destinationTag: request.destinationTag,
        memo: request.memo
      }
    })

    console.log(`Payment sent: ${txHash}`)
    return txHash
  }

  async sendTokenPayment(request: PaymentRequest): Promise<string> {
    if (!request.currency || !request.issuer) {
      throw new Error("Token payments require currency and issuer")
    }

    // Check token balance
    const balances = await this.xrpl.getBalances(this.xrpl.getAddress())
    const tokenBalance = balances.find(
      b => b.currency === request.currency && b.issuer === request.issuer
    )

    if (!tokenBalance || parseFloat(tokenBalance.value) < parseFloat(request.amount)) {
      throw new Error("Insufficient token balance")
    }

    // Prepare Payment transaction with issued currency
    const signedTx = await this.xrpl.preparePayment({
      destination: request.destination,
      amount: {
        currency: request.currency,
        issuer: request.issuer,
        value: request.amount
      },
      destinationTag: request.destinationTag
    })

    const txHash = await this.demos.submitXmTransaction({
      chain: "xrpl",
      signedTransaction: signedTx
    })

    console.log(`Token payment sent: ${txHash}`)
    return txHash
  }

  async sendBatchPayments(payments: PaymentRequest[]): Promise<string[]> {
    const payOptions = payments.map(p => ({
      receiver: p.destination,
      amount: p.amount
    }))

    const signedTxs = await this.xrpl.preparePays(payOptions)

    const txHashes: string[] = []
    for (const signedTx of signedTxs) {
      const txHash = await this.demos.submitXmTransaction({
        chain: "xrpl",
        signedTransaction: signedTx
      })
      txHashes.push(txHash)
    }

    return txHashes
  }

  async getBalance(): Promise<string> {
    return await this.xrpl.getBalance(this.xrpl.getAddress())
  }

  async getAllBalances(): Promise<Balance[]> {
    return await this.xrpl.getBalances(this.xrpl.getAddress())
  }

  async disconnect(): Promise<void> {
    await this.xrpl.disconnect()
  }
}
```

### 2. XRPL Trust Line Agent

Manage trust lines for issued currencies.

```typescript
import { XRPL } from "@kynesyslabs/demosdk/xm-websdk"

interface TrustLine {
  currency: string
  issuer: string
  limit: string
  balance: string
  qualityIn?: number
  qualityOut?: number
}

class XrplTrustLineAgent {
  private xrpl: XRPL

  async initialize(rpcUrl: string, privateKey: string): Promise<void> {
    this.xrpl = await XRPL.create(rpcUrl)
    await this.xrpl.connectWallet(privateKey)
  }

  async createTrustLine(
    currency: string,
    issuer: string,
    limit: string
  ): Promise<string> {
    // Create TrustSet transaction
    const trustSetTx = {
      TransactionType: "TrustSet",
      Account: this.xrpl.getAddress(),
      LimitAmount: {
        currency,
        issuer,
        value: limit
      }
    }

    const signedTx = await this.xrpl.signTransaction(trustSetTx)
    const result = await this.xrpl.submitTransaction(signedTx)

    console.log(`Trust line created for ${currency}:${issuer}`)
    return result.hash
  }

  async removeTrustLine(
    currency: string,
    issuer: string
  ): Promise<string> {
    // First check if balance is zero
    const balances = await this.xrpl.getBalances(this.xrpl.getAddress())
    const trustLine = balances.find(
      b => b.currency === currency && b.issuer === issuer
    )

    if (trustLine && parseFloat(trustLine.value) !== 0) {
      throw new Error("Cannot remove trust line with non-zero balance")
    }

    // Set limit to 0 to remove trust line
    return await this.createTrustLine(currency, issuer, "0")
  }

  async getTrustLines(): Promise<TrustLine[]> {
    const balances = await this.xrpl.getBalances(this.xrpl.getAddress())

    // Filter out XRP (native currency has no issuer)
    return balances
      .filter(b => b.issuer)
      .map(b => ({
        currency: b.currency,
        issuer: b.issuer,
        limit: b.limit || "0",
        balance: b.value,
        qualityIn: b.quality_in,
        qualityOut: b.quality_out
      }))
  }

  async checkTrustLineExists(
    currency: string,
    issuer: string
  ): Promise<boolean> {
    const trustLines = await this.getTrustLines()
    return trustLines.some(
      t => t.currency === currency && t.issuer === issuer
    )
  }

  async getIssuedTokens(issuerAddress: string): Promise<TrustLine[]> {
    // Get all trust lines where this account is the issuer
    const accountLines = await this.xrpl.getAccountLines(issuerAddress)

    return accountLines.map(line => ({
      currency: line.currency,
      issuer: issuerAddress,
      limit: line.limit,
      balance: line.balance
    }))
  }

  async setTrustLineQuality(
    currency: string,
    issuer: string,
    qualityIn: number,
    qualityOut: number
  ): Promise<string> {
    const trustSetTx = {
      TransactionType: "TrustSet",
      Account: this.xrpl.getAddress(),
      LimitAmount: {
        currency,
        issuer,
        value: "1000000000" // High limit
      },
      QualityIn: qualityIn,
      QualityOut: qualityOut
    }

    const signedTx = await this.xrpl.signTransaction(trustSetTx)
    const result = await this.xrpl.submitTransaction(signedTx)

    return result.hash
  }
}
```

### 3. XRPL DEX Agent

Interact with XRPL's built-in decentralized exchange.

```typescript
import { XRPL } from "@kynesyslabs/demosdk/xm-websdk"

interface Offer {
  sequence: number
  takerGets: Amount
  takerPays: Amount
  quality: string
}

interface Amount {
  currency: string
  issuer?: string
  value: string
}

class XrplDexAgent {
  private xrpl: XRPL

  async initialize(rpcUrl: string, privateKey: string): Promise<void> {
    this.xrpl = await XRPL.create(rpcUrl)
    await this.xrpl.connectWallet(privateKey)
  }

  async createOffer(
    takerGets: Amount,
    takerPays: Amount,
    expiration?: number
  ): Promise<{ hash: string; sequence: number }> {
    const offerCreateTx: any = {
      TransactionType: "OfferCreate",
      Account: this.xrpl.getAddress(),
      TakerGets: this.formatAmount(takerGets),
      TakerPays: this.formatAmount(takerPays)
    }

    if (expiration) {
      // Convert to Ripple epoch (seconds since 2000-01-01)
      offerCreateTx.Expiration = Math.floor(expiration / 1000) - 946684800
    }

    const signedTx = await this.xrpl.signTransaction(offerCreateTx)
    const result = await this.xrpl.submitTransaction(signedTx)

    console.log(`Offer created: ${result.hash}`)
    return {
      hash: result.hash,
      sequence: result.sequence
    }
  }

  async cancelOffer(offerSequence: number): Promise<string> {
    const offerCancelTx = {
      TransactionType: "OfferCancel",
      Account: this.xrpl.getAddress(),
      OfferSequence: offerSequence
    }

    const signedTx = await this.xrpl.signTransaction(offerCancelTx)
    const result = await this.xrpl.submitTransaction(signedTx)

    console.log(`Offer ${offerSequence} cancelled`)
    return result.hash
  }

  async getOpenOffers(): Promise<Offer[]> {
    const offers = await this.xrpl.getAccountOffers(this.xrpl.getAddress())

    return offers.map(o => ({
      sequence: o.seq,
      takerGets: this.parseAmount(o.taker_gets),
      takerPays: this.parseAmount(o.taker_pays),
      quality: o.quality
    }))
  }

  async getOrderBook(
    takerGets: { currency: string; issuer?: string },
    takerPays: { currency: string; issuer?: string }
  ): Promise<{ bids: Offer[]; asks: Offer[] }> {
    const orderBook = await this.xrpl.getOrderBook({
      taker_gets: takerGets,
      taker_pays: takerPays
    })

    return {
      bids: orderBook.bids.map(this.formatOffer),
      asks: orderBook.asks.map(this.formatOffer)
    }
  }

  async marketBuy(
    currency: string,
    issuer: string,
    amount: string,
    maxXrpCost: string
  ): Promise<string> {
    // Create offer that will immediately cross existing offers
    const { hash } = await this.createOffer(
      { currency: "XRP", value: maxXrpCost },
      { currency, issuer, value: amount }
    )

    return hash
  }

  async marketSell(
    currency: string,
    issuer: string,
    amount: string,
    minXrpReturn: string
  ): Promise<string> {
    const { hash } = await this.createOffer(
      { currency, issuer, value: amount },
      { currency: "XRP", value: minXrpReturn }
    )

    return hash
  }

  private formatAmount(amount: Amount): any {
    if (amount.currency === "XRP") {
      return (parseFloat(amount.value) * 1000000).toString() // drops
    }
    return {
      currency: amount.currency,
      issuer: amount.issuer,
      value: amount.value
    }
  }

  private parseAmount(amount: any): Amount {
    if (typeof amount === "string") {
      return {
        currency: "XRP",
        value: (parseInt(amount) / 1000000).toString()
      }
    }
    return {
      currency: amount.currency,
      issuer: amount.issuer,
      value: amount.value
    }
  }

  private formatOffer(offer: any): Offer {
    return {
      sequence: offer.Sequence,
      takerGets: this.parseAmount(offer.TakerGets),
      takerPays: this.parseAmount(offer.TakerPays),
      quality: offer.quality
    }
  }
}
```

### 4. XRPL Escrow Agent

Create and manage escrow transactions on XRPL.

```typescript
import { XRPL } from "@kynesyslabs/demosdk/xm-websdk"

interface EscrowInfo {
  owner: string
  destination: string
  amount: string
  sequence: number
  condition?: string
  cancelAfter?: number
  finishAfter?: number
}

class XrplEscrowAgent {
  private xrpl: XRPL

  async initialize(rpcUrl: string, privateKey: string): Promise<void> {
    this.xrpl = await XRPL.create(rpcUrl)
    await this.xrpl.connectWallet(privateKey)
  }

  async createTimeLockedEscrow(
    destination: string,
    amount: string,
    finishAfterSeconds: number,
    cancelAfterSeconds?: number
  ): Promise<{ hash: string; sequence: number }> {
    const now = Math.floor(Date.now() / 1000) - 946684800 // Ripple epoch

    const escrowCreateTx: any = {
      TransactionType: "EscrowCreate",
      Account: this.xrpl.getAddress(),
      Destination: destination,
      Amount: (parseFloat(amount) * 1000000).toString(),
      FinishAfter: now + finishAfterSeconds
    }

    if (cancelAfterSeconds) {
      escrowCreateTx.CancelAfter = now + cancelAfterSeconds
    }

    const signedTx = await this.xrpl.signTransaction(escrowCreateTx)
    const result = await this.xrpl.submitTransaction(signedTx)

    console.log(`Time-locked escrow created: ${result.hash}`)
    return {
      hash: result.hash,
      sequence: result.sequence
    }
  }

  async createConditionalEscrow(
    destination: string,
    amount: string,
    condition: string,
    cancelAfterSeconds: number
  ): Promise<{ hash: string; sequence: number }> {
    const now = Math.floor(Date.now() / 1000) - 946684800

    const escrowCreateTx = {
      TransactionType: "EscrowCreate",
      Account: this.xrpl.getAddress(),
      Destination: destination,
      Amount: (parseFloat(amount) * 1000000).toString(),
      Condition: condition,
      CancelAfter: now + cancelAfterSeconds
    }

    const signedTx = await this.xrpl.signTransaction(escrowCreateTx)
    const result = await this.xrpl.submitTransaction(signedTx)

    console.log(`Conditional escrow created: ${result.hash}`)
    return {
      hash: result.hash,
      sequence: result.sequence
    }
  }

  async finishEscrow(
    owner: string,
    offerSequence: number,
    fulfillment?: string
  ): Promise<string> {
    const escrowFinishTx: any = {
      TransactionType: "EscrowFinish",
      Account: this.xrpl.getAddress(),
      Owner: owner,
      OfferSequence: offerSequence
    }

    if (fulfillment) {
      escrowFinishTx.Fulfillment = fulfillment
    }

    const signedTx = await this.xrpl.signTransaction(escrowFinishTx)
    const result = await this.xrpl.submitTransaction(signedTx)

    console.log(`Escrow finished: ${result.hash}`)
    return result.hash
  }

  async cancelEscrow(
    owner: string,
    offerSequence: number
  ): Promise<string> {
    const escrowCancelTx = {
      TransactionType: "EscrowCancel",
      Account: this.xrpl.getAddress(),
      Owner: owner,
      OfferSequence: offerSequence
    }

    const signedTx = await this.xrpl.signTransaction(escrowCancelTx)
    const result = await this.xrpl.submitTransaction(signedTx)

    console.log(`Escrow cancelled: ${result.hash}`)
    return result.hash
  }

  async getAccountEscrows(address?: string): Promise<EscrowInfo[]> {
    const account = address || this.xrpl.getAddress()
    const escrows = await this.xrpl.getAccountObjects(account, "escrow")

    return escrows.map(e => ({
      owner: e.Account,
      destination: e.Destination,
      amount: (parseInt(e.Amount) / 1000000).toString(),
      sequence: e.Sequence,
      condition: e.Condition,
      cancelAfter: e.CancelAfter ? (e.CancelAfter + 946684800) * 1000 : undefined,
      finishAfter: e.FinishAfter ? (e.FinishAfter + 946684800) * 1000 : undefined
    }))
  }
}
```

## Integration with Demos

### Cross-Chain XRPL Operations

```typescript
import { DemosWork, WorkStep } from "@kynesyslabs/demosdk/demoswork"
import { XRPL } from "@kynesyslabs/demosdk/xm-websdk"

async function crossChainToXrpl(
  demos: Demos,
  xrpl: XRPL,
  evmSourceChain: string,
  amount: string
): Promise<DemosWork> {
  const work = new DemosWork()

  // Step 1: Bridge from EVM to XRPL
  const bridgeStep = new WorkStep({
    context: "xm",
    content: {
      action: "bridge",
      from: evmSourceChain,
      to: "xrpl",
      amount
    },
    critical: true
  })
  work.push(new BaseOperation(bridgeStep))

  // Step 2: Execute XRPL operation
  const xrplTx = await xrpl.preparePay("rDestination...", amount)
  const xrplStep = new WorkStep({
    context: "xm",
    content: {
      chain: "xrpl",
      signedTransaction: xrplTx
    }
  })
  work.push(new BaseOperation(xrplStep))

  return work
}
```

## Best Practices

1. **Account reserve** - XRPL requires 10 XRP base reserve plus 2 XRP per object
2. **Trust lines first** - Create trust lines before receiving tokens
3. **Destination tags** - Use destination tags for exchange deposits
4. **Auto-reconnect** - XRPL SDK handles connection drops automatically
5. **Clean up connections** - Call `disconnect()` when done

## Related Skills

- [Cross-Chain Bridge Agent](./crosschain-bridge-agent.md) - Bridge to/from XRPL
- [Escrow Agent](./escrow-agent.md) - General escrow patterns
- [DEX Integration Agent](./dex-integration-agent.md) - Cross-chain DEX routing
