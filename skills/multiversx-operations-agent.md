# MultiversX Operations Agent

> **⚠️ Prerequisites**: Complete [SDK Setup](./00-sdk-setup.md) first to configure your environment.

Build agents that interact with the MultiversX (formerly Elrond) blockchain through the Demos Network XM SDK.

## SDK Reference

```typescript
import { MULTIVERSX } from "@kynesyslabs/demosdk/xm-websdk"
// or
import { MULTIVERSX } from "@kynesyslabs/demosdk/xm-localsdk"
```

### Core Methods

| Method | Purpose |
|--------|---------|
| `create(rpc_url)` | Create and connect to MultiversX API |
| `connectWallet(privateKey)` | Connect wallet with private key |
| `connectKeyFileWallet(keyFile, password)` | Connect with keyfile |
| `createWallet()` | Generate new MultiversX wallet |
| `getBalance(address)` | Get EGLD balance |
| `getTokenBalance(address, tokenId)` | Get ESDT token balance |
| `getNFTs(address)` | Get owned NFTs |
| `preparePay(receiver, amount)` | Prepare EGLD transfer |
| `preparePays(payments)` | Batch multiple transfers |
| `signMessage(message)` | Sign arbitrary message |
| `verifyMessage(message, signature, publicKey)` | Verify signature |

### API Endpoints

| Network | URL |
|---------|-----|
| Mainnet | `https://api.multiversx.com` |
| Devnet | `https://devnet-api.multiversx.com` |
| Testnet | `https://testnet-api.multiversx.com` |

## Use Cases

### 1. MultiversX Payment Agent

Process EGLD and ESDT token transfers through Demos.

```typescript
import { MULTIVERSX } from "@kynesyslabs/demosdk/xm-websdk"
import { Demos } from "@kynesyslabs/demosdk/websdk"

interface PaymentRequest {
  receiver: string
  amount: string
  tokenId?: string
  data?: string
}

class MultiversXPaymentAgent {
  private mvx: MULTIVERSX
  private demos: Demos

  async initialize(apiUrl: string, privateKey: string): Promise<void> {
    this.mvx = await MULTIVERSX.create(apiUrl)
    await this.mvx.connectWallet(privateKey)

    this.demos = new Demos()
    await this.demos.connect("https://demosnode.discus.sh/")

    console.log(`Connected: ${this.mvx.getAddress()}`)
  }

  async initializeWithKeyFile(
    apiUrl: string,
    keyFilePath: string,
    password: string
  ): Promise<void> {
    this.mvx = await MULTIVERSX.create(apiUrl)

    // Read keyfile content
    const keyFileContent = await this.readKeyFile(keyFilePath)
    await this.mvx.connectKeyFileWallet(keyFileContent, password)

    this.demos = new Demos()
    await this.demos.connect("https://demosnode.discus.sh/")

    console.log(`Connected with keyfile: ${this.mvx.getAddress()}`)
  }

  async sendEgldPayment(request: PaymentRequest): Promise<string> {
    // Get current balance
    const balance = await this.mvx.getBalance(this.mvx.getAddress())
    console.log(`Current balance: ${balance} EGLD`)

    if (parseFloat(balance) < parseFloat(request.amount)) {
      throw new Error("Insufficient balance")
    }

    // Prepare signed transaction
    const signedTx = await this.mvx.preparePay(
      request.receiver,
      request.amount
    )

    // Submit through Demos for cross-chain orchestration
    const txHash = await this.demos.submitXmTransaction({
      chain: "multiversx",
      signedTransaction: signedTx,
      metadata: { data: request.data }
    })

    console.log(`EGLD payment sent: ${txHash}`)
    return txHash
  }

  async sendTokenPayment(request: PaymentRequest): Promise<string> {
    if (!request.tokenId) {
      throw new Error("Token ID required for token payments")
    }

    // Get token balance
    const tokenBalance = await this.mvx.getTokenBalance(
      this.mvx.getAddress(),
      request.tokenId
    )

    if (parseFloat(tokenBalance) < parseFloat(request.amount)) {
      throw new Error("Insufficient token balance")
    }

    // Prepare ESDT transfer
    const signedTx = await this.mvx.prepareEsdtTransfer({
      receiver: request.receiver,
      tokenId: request.tokenId,
      amount: request.amount,
      data: request.data
    })

    const txHash = await this.demos.submitXmTransaction({
      chain: "multiversx",
      signedTransaction: signedTx
    })

    console.log(`Token payment sent: ${txHash}`)
    return txHash
  }

  async sendBatchPayments(payments: PaymentRequest[]): Promise<string[]> {
    const payOptions = payments.map(p => ({
      receiver: p.receiver,
      amount: p.amount
    }))

    const signedTxs = await this.mvx.preparePays(payOptions)

    const txHashes: string[] = []
    for (const signedTx of signedTxs) {
      const txHash = await this.demos.submitXmTransaction({
        chain: "multiversx",
        signedTransaction: signedTx
      })
      txHashes.push(txHash)
    }

    return txHashes
  }

  async getBalance(): Promise<string> {
    return await this.mvx.getBalance(this.mvx.getAddress())
  }

  async getTokenBalance(tokenId: string): Promise<string> {
    return await this.mvx.getTokenBalance(this.mvx.getAddress(), tokenId)
  }

  private async readKeyFile(path: string): Promise<string> {
    // In Node.js environment
    const fs = await import("fs/promises")
    return await fs.readFile(path, "utf8")
  }

  async disconnect(): Promise<void> {
    await this.mvx.disconnect()
  }
}
```

### 2. MultiversX NFT Agent

Manage and interact with NFTs on MultiversX.

```typescript
import { MULTIVERSX } from "@kynesyslabs/demosdk/xm-websdk"

interface NFTInfo {
  identifier: string
  collection: string
  nonce: number
  type: "NonFungibleESDT" | "SemiFungibleESDT" | "MetaESDT"
  name: string
  creator: string
  attributes?: string
  uris: string[]
  balance?: string
}

interface NFTCollection {
  collection: string
  name: string
  type: string
  owner: string
  totalNfts: number
}

class MultiversXNftAgent {
  private mvx: MULTIVERSX

  async initialize(apiUrl: string, privateKey: string): Promise<void> {
    this.mvx = await MULTIVERSX.create(apiUrl)
    await this.mvx.connectWallet(privateKey)
  }

  async getOwnedNFTs(address?: string): Promise<NFTInfo[]> {
    const account = address || this.mvx.getAddress()
    const nfts = await this.mvx.getNFTs(account)

    return nfts.map(nft => ({
      identifier: nft.identifier,
      collection: nft.collection,
      nonce: nft.nonce,
      type: nft.type,
      name: nft.name,
      creator: nft.creator,
      attributes: nft.attributes,
      uris: nft.uris || [],
      balance: nft.balance
    }))
  }

  async getNFTsByCollection(
    collection: string,
    address?: string
  ): Promise<NFTInfo[]> {
    const allNfts = await this.getOwnedNFTs(address)
    return allNfts.filter(nft => nft.collection === collection)
  }

  async transferNFT(
    collection: string,
    nonce: number,
    receiver: string,
    quantity: number = 1
  ): Promise<string> {
    const signedTx = await this.mvx.prepareNftTransfer({
      collection,
      nonce,
      receiver,
      quantity
    })

    // Submit transaction
    const result = await this.mvx.submitTransaction(signedTx)

    console.log(`NFT transferred: ${collection}-${nonce} to ${receiver}`)
    return result.hash
  }

  async transferMultipleNFTs(
    transfers: Array<{
      collection: string
      nonce: number
      receiver: string
      quantity?: number
    }>
  ): Promise<string> {
    const signedTx = await this.mvx.prepareMultiNftTransfer({
      receiver: transfers[0].receiver,
      tokens: transfers.map(t => ({
        collection: t.collection,
        nonce: t.nonce,
        quantity: t.quantity || 1
      }))
    })

    const result = await this.mvx.submitTransaction(signedTx)

    console.log(`Transferred ${transfers.length} NFTs`)
    return result.hash
  }

  async getCollectionInfo(collection: string): Promise<NFTCollection> {
    const info = await this.mvx.getCollectionInfo(collection)

    return {
      collection: info.collection,
      name: info.name,
      type: info.type,
      owner: info.owner,
      totalNfts: info.totalNfts
    }
  }

  async getNFTMetadata(identifier: string): Promise<any> {
    const nft = await this.mvx.getNFTInfo(identifier)

    // Decode attributes if base64
    let decodedAttributes = null
    if (nft.attributes) {
      try {
        decodedAttributes = JSON.parse(
          Buffer.from(nft.attributes, "base64").toString()
        )
      } catch {
        decodedAttributes = nft.attributes
      }
    }

    return {
      ...nft,
      decodedAttributes
    }
  }

  async listOwnedCollections(): Promise<string[]> {
    const nfts = await this.getOwnedNFTs()
    const collections = new Set(nfts.map(nft => nft.collection))
    return Array.from(collections)
  }
}
```

### 3. MultiversX Token Agent

Interact with ESDT tokens on MultiversX.

```typescript
import { MULTIVERSX } from "@kynesyslabs/demosdk/xm-websdk"

interface TokenInfo {
  identifier: string
  name: string
  ticker: string
  owner: string
  decimals: number
  supply: string
  burnt: string
  isPaused: boolean
  canFreeze: boolean
  canMint: boolean
  canBurn: boolean
}

interface TokenBalance {
  identifier: string
  name: string
  balance: string
  decimals: number
  valueUsd?: number
}

class MultiversXTokenAgent {
  private mvx: MULTIVERSX

  async initialize(apiUrl: string, privateKey: string): Promise<void> {
    this.mvx = await MULTIVERSX.create(apiUrl)
    await this.mvx.connectWallet(privateKey)
  }

  async getTokenInfo(tokenId: string): Promise<TokenInfo> {
    const info = await this.mvx.getTokenInfo(tokenId)

    return {
      identifier: info.identifier,
      name: info.name,
      ticker: info.ticker,
      owner: info.owner,
      decimals: info.decimals,
      supply: info.supply,
      burnt: info.burnt || "0",
      isPaused: info.isPaused,
      canFreeze: info.canFreeze,
      canMint: info.canMint,
      canBurn: info.canBurn
    }
  }

  async getAllTokenBalances(address?: string): Promise<TokenBalance[]> {
    const account = address || this.mvx.getAddress()
    const tokens = await this.mvx.getAccountTokens(account)

    return tokens.map(t => ({
      identifier: t.identifier,
      name: t.name,
      balance: t.balance,
      decimals: t.decimals,
      valueUsd: t.valueUsd
    }))
  }

  async getTokenBalance(tokenId: string, address?: string): Promise<string> {
    const account = address || this.mvx.getAddress()
    return await this.mvx.getTokenBalance(account, tokenId)
  }

  async transferToken(
    tokenId: string,
    receiver: string,
    amount: string
  ): Promise<string> {
    const tokenInfo = await this.getTokenInfo(tokenId)
    const rawAmount = BigInt(
      Math.floor(parseFloat(amount) * Math.pow(10, tokenInfo.decimals))
    ).toString()

    const signedTx = await this.mvx.prepareEsdtTransfer({
      receiver,
      tokenId,
      amount: rawAmount
    })

    const result = await this.mvx.submitTransaction(signedTx)

    console.log(`Transferred ${amount} ${tokenInfo.ticker} to ${receiver}`)
    return result.hash
  }

  async issueToken(params: {
    name: string
    ticker: string
    initialSupply: string
    decimals: number
    properties?: {
      canFreeze?: boolean
      canWipe?: boolean
      canPause?: boolean
      canMint?: boolean
      canBurn?: boolean
      canChangeOwner?: boolean
      canUpgrade?: boolean
    }
  }): Promise<string> {
    const signedTx = await this.mvx.prepareIssueToken({
      tokenName: params.name,
      tokenTicker: params.ticker,
      initialSupply: params.initialSupply,
      numDecimals: params.decimals,
      ...params.properties
    })

    const result = await this.mvx.submitTransaction(signedTx)

    console.log(`Token issue transaction: ${result.hash}`)
    return result.hash
  }

  async mintToken(tokenId: string, amount: string): Promise<string> {
    const signedTx = await this.mvx.prepareMintToken({
      tokenId,
      amount
    })

    const result = await this.mvx.submitTransaction(signedTx)

    console.log(`Minted ${amount} of ${tokenId}`)
    return result.hash
  }

  async burnToken(tokenId: string, amount: string): Promise<string> {
    const signedTx = await this.mvx.prepareBurnToken({
      tokenId,
      amount
    })

    const result = await this.mvx.submitTransaction(signedTx)

    console.log(`Burned ${amount} of ${tokenId}`)
    return result.hash
  }

  async getTopTokenHolders(
    tokenId: string,
    limit: number = 10
  ): Promise<Array<{ address: string; balance: string }>> {
    return await this.mvx.getTokenHolders(tokenId, limit)
  }
}
```

### 4. MultiversX Smart Contract Agent

Interact with smart contracts on MultiversX.

```typescript
import { MULTIVERSX } from "@kynesyslabs/demosdk/xm-websdk"

interface ContractCallParams {
  contract: string
  function: string
  args: any[]
  value?: string
  gasLimit?: number
}

class MultiversXContractAgent {
  private mvx: MULTIVERSX

  async initialize(apiUrl: string, privateKey: string): Promise<void> {
    this.mvx = await MULTIVERSX.create(apiUrl)
    await this.mvx.connectWallet(privateKey)
  }

  async callContract(params: ContractCallParams): Promise<string> {
    const {
      contract,
      function: funcName,
      args,
      value = "0",
      gasLimit = 60000000
    } = params

    const signedTx = await this.mvx.prepareContractCall({
      receiver: contract,
      function: funcName,
      args,
      value,
      gasLimit
    })

    const result = await this.mvx.submitTransaction(signedTx)

    console.log(`Contract call: ${contract}.${funcName} -> ${result.hash}`)
    return result.hash
  }

  async queryContract(
    contract: string,
    funcName: string,
    args: any[] = []
  ): Promise<any> {
    const result = await this.mvx.queryContract({
      contract,
      function: funcName,
      args
    })

    return result
  }

  async deployContract(
    wasmCode: Uint8Array,
    args: any[] = [],
    metadata?: {
      upgradeable?: boolean
      readable?: boolean
      payable?: boolean
      payableBySc?: boolean
    }
  ): Promise<{ hash: string; contractAddress: string }> {
    const signedTx = await this.mvx.prepareDeployContract({
      code: wasmCode,
      args,
      metadata: metadata || {
        upgradeable: true,
        readable: true,
        payable: false,
        payableBySc: false
      }
    })

    const result = await this.mvx.submitTransaction(signedTx)

    // Extract contract address from logs
    const contractAddress = this.extractContractAddress(result)

    console.log(`Contract deployed: ${contractAddress}`)
    return {
      hash: result.hash,
      contractAddress
    }
  }

  async upgradeContract(
    contract: string,
    newCode: Uint8Array,
    args: any[] = []
  ): Promise<string> {
    const signedTx = await this.mvx.prepareUpgradeContract({
      contract,
      code: newCode,
      args
    })

    const result = await this.mvx.submitTransaction(signedTx)

    console.log(`Contract upgraded: ${contract}`)
    return result.hash
  }

  async getContractInfo(contract: string): Promise<any> {
    return await this.mvx.getContractInfo(contract)
  }

  private extractContractAddress(result: any): string {
    // Parse transaction logs to find deployed address
    const scDeploy = result.logs?.events?.find(
      (e: any) => e.identifier === "SCDeploy"
    )
    return scDeploy?.address || ""
  }
}
```

## Integration with Demos

### Cross-Chain MultiversX Operations

```typescript
import { DemosWork, WorkStep } from "@kynesyslabs/demosdk/demoswork"
import { MULTIVERSX } from "@kynesyslabs/demosdk/xm-websdk"

async function crossChainToMultiversX(
  demos: Demos,
  mvx: MULTIVERSX,
  evmSourceChain: string,
  amount: string
): Promise<DemosWork> {
  const work = new DemosWork()

  // Step 1: Bridge from EVM to MultiversX
  const bridgeStep = new WorkStep({
    context: "xm",
    content: {
      action: "bridge",
      from: evmSourceChain,
      to: "multiversx",
      amount
    },
    critical: true
  })
  work.push(new BaseOperation(bridgeStep))

  // Step 2: Execute MultiversX operation
  const mvxTx = await mvx.preparePay("erd1...", amount)
  const mvxStep = new WorkStep({
    context: "xm",
    content: {
      chain: "multiversx",
      signedTransaction: mvxTx
    }
  })
  work.push(new BaseOperation(mvxStep))

  return work
}
```

## Best Practices

1. **Use keyfile authentication** - More secure than raw private keys
2. **Handle ESDT transfers** - Different from EGLD native transfers
3. **Check token properties** - Verify canFreeze, canMint before operations
4. **Gas estimation** - Use appropriate gas limits for contract calls
5. **Clean up connections** - Call `disconnect()` when done

## Related Skills

- [Cross-Chain Bridge Agent](./crosschain-bridge-agent.md) - Bridge to/from MultiversX
- [NFT Operations Agent](./nft-operations-agent.md) - Cross-chain NFT patterns
- [Token Discovery Agent](./token-discovery-agent.md) - Discover MultiversX tokens
