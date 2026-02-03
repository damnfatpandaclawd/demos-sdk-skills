# Solana Operations Agent

> **⚠️ Prerequisites**: Complete [SDK Setup](./00-sdk-setup.md) first to configure your environment.

Build agents that interact with the Solana blockchain through the Demos Network XM SDK.

## SDK Reference

```typescript
import { SOLANA } from "@kynesyslabs/demosdk/xm-websdk"
// or
import { SOLANA } from "@kynesyslabs/demosdk/xm-localsdk"
```

### Core Methods

| Method | Purpose |
|--------|---------|
| `create(rpc_url)` | Create and connect to Solana RPC |
| `connectWallet(privateKey)` | Connect wallet with private key |
| `createWallet()` | Generate new Solana wallet |
| `getBalance(address)` | Get SOL balance |
| `preparePay(receiver, amount)` | Prepare SOL transfer |
| `preparePays(payments)` | Batch multiple transfers |
| `signMessage(message)` | Sign arbitrary message |
| `verifyMessage(message, signature, publicKey)` | Verify signature |
| `runAnchorProgram(programId, params)` | Execute Anchor program |
| `runRawProgram(programId, params)` | Execute raw program instruction |
| `fetchAccount(address, options)` | Read program account data |
| `getProgramIdl(programId)` | Fetch program IDL |

### RPC Endpoints

| Network | URL |
|---------|-----|
| Mainnet | `https://api.mainnet-beta.solana.com` |
| Devnet | `https://api.devnet.solana.com` |
| Testnet | `https://api.testnet.solana.com` |

## Use Cases

### 1. Solana Payment Agent

Process SOL and SPL token payments through Demos.

```typescript
import { SOLANA } from "@kynesyslabs/demosdk/xm-websdk"
import { Demos } from "@kynesyslabs/demosdk/websdk"

interface PaymentRequest {
  recipient: string
  amount: string
  memo?: string
}

class SolanaPaymentAgent {
  private solana: SOLANA
  private demos: Demos

  async initialize(rpcUrl: string, privateKey: string): Promise<void> {
    this.solana = await SOLANA.create(rpcUrl)
    await this.solana.connectWallet(privateKey)

    this.demos = new Demos()
    await this.demos.connect("https://demosnode.discus.sh/")

    console.log(`Connected: ${this.solana.getAddress()}`)
  }

  async sendPayment(request: PaymentRequest): Promise<string> {
    // Get current balance
    const balance = await this.solana.getBalance(this.solana.getAddress())
    console.log(`Current balance: ${balance} SOL`)

    if (parseFloat(balance) < parseFloat(request.amount)) {
      throw new Error("Insufficient balance")
    }

    // Prepare signed transaction
    const signedTx = await this.solana.preparePay(
      request.recipient,
      request.amount
    )

    // Submit through Demos for cross-chain orchestration
    const txHash = await this.demos.submitXmTransaction({
      chain: "solana",
      signedTransaction: signedTx,
      metadata: { memo: request.memo }
    })

    console.log(`Payment sent: ${txHash}`)
    return txHash
  }

  async sendBatchPayments(payments: PaymentRequest[]): Promise<string[]> {
    const payOptions = payments.map(p => ({
      receiver: p.recipient,
      amount: p.amount
    }))

    const signedTxs = await this.solana.preparePays(payOptions)

    const txHashes: string[] = []
    for (const signedTx of signedTxs) {
      const txHash = await this.demos.submitXmTransaction({
        chain: "solana",
        signedTransaction: signedTx
      })
      txHashes.push(txHash)
    }

    return txHashes
  }

  async getBalance(): Promise<string> {
    return await this.solana.getBalance(this.solana.getAddress())
  }

  async disconnect(): Promise<void> {
    await this.solana.disconnect()
  }
}
```

### 2. Anchor Program Interaction Agent

Interact with Solana Anchor programs.

```typescript
import { SOLANA } from "@kynesyslabs/demosdk/xm-websdk"
import { Idl } from "@coral-xyz/anchor"

interface ProgramInteraction {
  method: string
  accounts: Record<string, string>
  args: any[]
}

class AnchorProgramAgent {
  private solana: SOLANA
  private programIdls: Map<string, Idl> = new Map()

  async initialize(rpcUrl: string, privateKey: string): Promise<void> {
    this.solana = await SOLANA.create(rpcUrl)
    await this.solana.connectWallet(privateKey)
  }

  async loadProgram(programId: string): Promise<Idl> {
    if (this.programIdls.has(programId)) {
      return this.programIdls.get(programId)!
    }

    const idl = await this.solana.getProgramIdl(programId)
    this.programIdls.set(programId, idl)

    console.log(`Loaded program: ${programId}`)
    console.log(`Available methods: ${idl.instructions.map(i => i.name).join(", ")}`)

    return idl
  }

  async callProgram(
    programId: string,
    interaction: ProgramInteraction
  ): Promise<Buffer> {
    const idl = await this.loadProgram(programId)

    // Validate method exists
    const instruction = idl.instructions.find(i => i.name === interaction.method)
    if (!instruction) {
      throw new Error(`Method ${interaction.method} not found in program`)
    }

    // Execute program
    const result = await this.solana.runAnchorProgram(programId, {
      method: interaction.method,
      accounts: interaction.accounts,
      args: interaction.args
    })

    return result
  }

  async readAccount<T>(
    programId: string,
    accountAddress: string,
    accountType: string
  ): Promise<T> {
    const idl = await this.loadProgram(programId)

    const data = await this.solana.fetchAccount(accountAddress, {
      idl,
      accountType
    })

    return data as T
  }

  async executeSwap(
    dexProgramId: string,
    poolAddress: string,
    inputMint: string,
    outputMint: string,
    amount: string,
    slippage: number
  ): Promise<Buffer> {
    return await this.callProgram(dexProgramId, {
      method: "swap",
      accounts: {
        pool: poolAddress,
        inputMint,
        outputMint,
        user: this.solana.getAddress(),
        userInputAccount: await this.getAssociatedTokenAddress(inputMint),
        userOutputAccount: await this.getAssociatedTokenAddress(outputMint)
      },
      args: [amount, Math.floor(slippage * 100)]
    })
  }

  private async getAssociatedTokenAddress(mint: string): Promise<string> {
    // Implementation to derive ATA
    return "" // Placeholder
  }
}
```

### 3. Solana NFT Minting Agent

Mint and manage NFTs on Solana via Demos.

```typescript
import { SOLANA } from "@kynesyslabs/demosdk/xm-websdk"
import { IPFSOperations } from "@kynesyslabs/demosdk/ipfs"

interface NFTMetadata {
  name: string
  symbol: string
  description: string
  image: string
  attributes: Array<{ trait_type: string; value: string }>
  sellerFeeBasisPoints: number
  creators: Array<{ address: string; share: number }>
}

class SolanaNFTAgent {
  private solana: SOLANA
  private ipfs: IPFSOperations
  private metaplexProgramId = "metaqbxxUerdq28cj1RbAWkYQm3ybzjb6a8bt518x1s"

  async initialize(rpcUrl: string, privateKey: string): Promise<void> {
    this.solana = await SOLANA.create(rpcUrl)
    await this.solana.connectWallet(privateKey)
  }

  async uploadMetadata(
    imageData: Uint8Array,
    metadata: Omit<NFTMetadata, "image">
  ): Promise<string> {
    // Upload image to IPFS
    const imageResult = await this.ipfs.add(imageData)
    await this.ipfs.pin(imageResult.cid)

    // Create full metadata
    const fullMetadata: NFTMetadata = {
      ...metadata,
      image: `ipfs://${imageResult.cid}`
    }

    // Upload metadata JSON
    const metadataBuffer = new TextEncoder().encode(JSON.stringify(fullMetadata))
    const metadataResult = await this.ipfs.add(metadataBuffer)
    await this.ipfs.pin(metadataResult.cid)

    return `ipfs://${metadataResult.cid}`
  }

  async mintNFT(metadataUri: string, collection?: string): Promise<string> {
    // Create mint account
    const { keypair: mintKeypair } = await this.solana.createWallet()

    // Mint NFT using Metaplex
    const result = await this.solana.runAnchorProgram(this.metaplexProgramId, {
      method: "create",
      accounts: {
        mint: mintKeypair.publicKey.toString(),
        authority: this.solana.getAddress(),
        payer: this.solana.getAddress(),
        updateAuthority: this.solana.getAddress(),
        collection: collection || null
      },
      args: [{
        uri: metadataUri,
        name: "NFT",
        symbol: "NFT",
        sellerFeeBasisPoints: 500,
        creators: [{
          address: this.solana.getAddress(),
          share: 100
        }]
      }]
    })

    console.log(`NFT minted: ${mintKeypair.publicKey.toString()}`)
    return mintKeypair.publicKey.toString()
  }

  async transferNFT(mintAddress: string, recipient: string): Promise<Buffer> {
    return await this.solana.runAnchorProgram(this.metaplexProgramId, {
      method: "transfer",
      accounts: {
        mint: mintAddress,
        source: this.solana.getAddress(),
        destination: recipient
      },
      args: []
    })
  }

  async listNFTsOwned(): Promise<string[]> {
    // Query token accounts owned by wallet
    // Implementation depends on RPC method availability
    return []
  }
}
```

### 4. Solana DeFi Agent

Interact with Solana DeFi protocols.

```typescript
import { SOLANA } from "@kynesyslabs/demosdk/xm-websdk"

interface LiquidityPosition {
  pool: string
  tokenA: { mint: string; amount: string }
  tokenB: { mint: string; amount: string }
  lpTokens: string
}

class SolanaDeFiAgent {
  private solana: SOLANA

  // Popular Solana DEX program IDs
  private readonly RAYDIUM_AMM = "675kPX9MHTjS2zt1qfr1NYHuzeLXfQM9H24wFSUt1Mp8"
  private readonly ORCA_WHIRLPOOL = "whirLbMiicVdio4qvUfM5KAg6Ct8VwpYzGff3uctyCc"

  async initialize(rpcUrl: string, privateKey: string): Promise<void> {
    this.solana = await SOLANA.create(rpcUrl)
    await this.solana.connectWallet(privateKey)
  }

  async swapOnRaydium(
    inputMint: string,
    outputMint: string,
    amountIn: string,
    minAmountOut: string,
    poolAddress: string
  ): Promise<Buffer> {
    return await this.solana.runAnchorProgram(this.RAYDIUM_AMM, {
      method: "swap",
      accounts: {
        amm: poolAddress,
        ammAuthority: await this.getAmmAuthority(poolAddress),
        ammOpenOrders: await this.getOpenOrders(poolAddress),
        poolCoinTokenAccount: await this.getPoolToken(poolAddress, inputMint),
        poolPcTokenAccount: await this.getPoolToken(poolAddress, outputMint),
        serumProgram: "9xQeWvG816bUx9EPjHmaT23yvVM2ZWbrrpZb9PusVFin",
        serumMarket: await this.getSerumMarket(poolAddress),
        userSourceTokenAccount: await this.getATA(inputMint),
        userDestTokenAccount: await this.getATA(outputMint),
        userOwner: this.solana.getAddress()
      },
      args: [amountIn, minAmountOut]
    })
  }

  async addLiquidity(
    poolAddress: string,
    tokenAAmount: string,
    tokenBAmount: string
  ): Promise<Buffer> {
    const poolInfo = await this.getPoolInfo(poolAddress)

    return await this.solana.runAnchorProgram(this.RAYDIUM_AMM, {
      method: "deposit",
      accounts: {
        amm: poolAddress,
        ammAuthority: poolInfo.authority,
        userTokenA: await this.getATA(poolInfo.tokenAMint),
        userTokenB: await this.getATA(poolInfo.tokenBMint),
        userLpToken: await this.getATA(poolInfo.lpMint),
        poolTokenA: poolInfo.tokenAVault,
        poolTokenB: poolInfo.tokenBVault,
        lpMint: poolInfo.lpMint,
        userOwner: this.solana.getAddress()
      },
      args: [tokenAAmount, tokenBAmount, "0"] // min LP tokens
    })
  }

  async removeLiquidity(
    poolAddress: string,
    lpAmount: string
  ): Promise<Buffer> {
    const poolInfo = await this.getPoolInfo(poolAddress)

    return await this.solana.runAnchorProgram(this.RAYDIUM_AMM, {
      method: "withdraw",
      accounts: {
        amm: poolAddress,
        ammAuthority: poolInfo.authority,
        userTokenA: await this.getATA(poolInfo.tokenAMint),
        userTokenB: await this.getATA(poolInfo.tokenBMint),
        userLpToken: await this.getATA(poolInfo.lpMint),
        poolTokenA: poolInfo.tokenAVault,
        poolTokenB: poolInfo.tokenBVault,
        lpMint: poolInfo.lpMint,
        userOwner: this.solana.getAddress()
      },
      args: [lpAmount]
    })
  }

  async getPoolInfo(poolAddress: string): Promise<any> {
    return await this.solana.fetchAccount(poolAddress, {
      accountType: "AmmInfo"
    })
  }

  // Helper methods (implementations depend on specific protocol)
  private async getAmmAuthority(pool: string): Promise<string> { return "" }
  private async getOpenOrders(pool: string): Promise<string> { return "" }
  private async getPoolToken(pool: string, mint: string): Promise<string> { return "" }
  private async getSerumMarket(pool: string): Promise<string> { return "" }
  private async getATA(mint: string): Promise<string> { return "" }
}
```

## Integration with Demos

### Cross-Chain Solana Operations

```typescript
import { DemosWork, WorkStep } from "@kynesyslabs/demosdk/demoswork"
import { SOLANA } from "@kynesyslabs/demosdk/xm-websdk"

async function crossChainSolanaSwap(
  demos: Demos,
  solana: SOLANA,
  evmSourceChain: string,
  amount: string
): Promise<DemosWork> {
  const work = new DemosWork()

  // Step 1: Bridge from EVM to Solana
  const bridgeStep = new WorkStep({
    context: "xm",
    content: {
      action: "bridge",
      from: evmSourceChain,
      to: "solana",
      amount
    },
    critical: true
  })
  work.push(new BaseOperation(bridgeStep))

  // Step 2: Swap on Solana DEX
  const swapTx = await solana.preparePay(
    "swap-destination",
    amount
  )
  const swapStep = new WorkStep({
    context: "xm",
    content: {
      chain: "solana",
      signedTransaction: swapTx
    }
  })
  work.push(new BaseOperation(swapStep))

  return work
}
```

## Best Practices

1. **Use appropriate RPC** - Choose Mainnet/Devnet based on environment
2. **Handle account rent** - Ensure accounts have minimum rent balance
3. **Batch transactions** - Use `preparePays` for multiple transfers
4. **Verify signatures** - Always verify messages server-side
5. **Clean up connections** - Call `disconnect()` when done

## Related Skills

- [Cross-Chain Bridge Agent](./crosschain-bridge-agent.md) - Bridge to/from Solana
- [DEX Integration Agent](./dex-integration-agent.md) - Cross-chain DEX routing
- [Token Discovery Agent](./token-discovery-agent.md) - Find Solana tokens
