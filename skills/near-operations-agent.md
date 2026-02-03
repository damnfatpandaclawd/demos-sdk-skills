# NEAR Operations Agent

> **⚠️ Prerequisites**: Complete [SDK Setup](./00-sdk-setup.md) first to configure your environment.

Build agents that interact with the NEAR Protocol blockchain through the Demos Network XM SDK.

## SDK Reference

```typescript
import { NEAR } from "@kynesyslabs/demosdk/xm-websdk"
// or
import { NEAR } from "@kynesyslabs/demosdk/xm-localsdk"
```

### Core Methods

| Method | Purpose |
|--------|---------|
| `create(rpc_url)` | Create and connect to NEAR RPC |
| `connectWallet(privateKey)` | Connect wallet with private key |
| `createWallet()` | Generate new NEAR wallet |
| `createAccount(accountId, publicKey)` | Create named account |
| `deleteAccount(beneficiaryId)` | Delete account and transfer funds |
| `getBalance(accountId)` | Get NEAR balance |
| `preparePay(receiver, amount)` | Prepare NEAR transfer |
| `preparePays(payments)` | Batch multiple transfers |
| `signMessage(message)` | Sign arbitrary message |
| `verifyMessage(message, signature, publicKey)` | Verify signature |

### RPC Endpoints

| Network | URL |
|---------|-----|
| Mainnet | `https://rpc.mainnet.near.org` |
| Testnet | `https://rpc.testnet.near.org` |

## Use Cases

### 1. NEAR Payment Agent

Process NEAR transfers with account-based addressing.

```typescript
import { NEAR } from "@kynesyslabs/demosdk/xm-websdk"
import { Demos } from "@kynesyslabs/demosdk/websdk"

interface PaymentRequest {
  recipientAccountId: string
  amount: string
  memo?: string
}

class NearPaymentAgent {
  private near: NEAR
  private demos: Demos

  async initialize(rpcUrl: string, privateKey: string): Promise<void> {
    this.near = await NEAR.create(rpcUrl)
    await this.near.connectWallet(privateKey)

    this.demos = new Demos()
    await this.demos.connect("https://demosnode.discus.sh/")

    console.log(`Connected: ${this.near.getAccountId()}`)
  }

  async sendPayment(request: PaymentRequest): Promise<string> {
    // Validate account exists
    const accountExists = await this.checkAccountExists(request.recipientAccountId)
    if (!accountExists) {
      throw new Error(`Account ${request.recipientAccountId} does not exist`)
    }

    // Get current balance
    const balance = await this.near.getBalance(this.near.getAccountId())
    console.log(`Current balance: ${balance} NEAR`)

    if (parseFloat(balance) < parseFloat(request.amount)) {
      throw new Error("Insufficient balance")
    }

    // Prepare signed transaction
    const signedTx = await this.near.preparePay(
      request.recipientAccountId,
      request.amount
    )

    // Submit through Demos for cross-chain orchestration
    const txHash = await this.demos.submitXmTransaction({
      chain: "near",
      signedTransaction: signedTx,
      metadata: { memo: request.memo }
    })

    console.log(`Payment sent: ${txHash}`)
    return txHash
  }

  async sendBatchPayments(payments: PaymentRequest[]): Promise<string[]> {
    // Validate all accounts exist
    for (const payment of payments) {
      const exists = await this.checkAccountExists(payment.recipientAccountId)
      if (!exists) {
        throw new Error(`Account ${payment.recipientAccountId} does not exist`)
      }
    }

    const payOptions = payments.map(p => ({
      receiver: p.recipientAccountId,
      amount: p.amount
    }))

    const signedTxs = await this.near.preparePays(payOptions)

    const txHashes: string[] = []
    for (const signedTx of signedTxs) {
      const txHash = await this.demos.submitXmTransaction({
        chain: "near",
        signedTransaction: signedTx
      })
      txHashes.push(txHash)
    }

    return txHashes
  }

  async checkAccountExists(accountId: string): Promise<boolean> {
    try {
      await this.near.getBalance(accountId)
      return true
    } catch {
      return false
    }
  }

  async getBalance(): Promise<string> {
    return await this.near.getBalance(this.near.getAccountId())
  }

  getAccountId(): string {
    return this.near.getAccountId()
  }

  async disconnect(): Promise<void> {
    await this.near.disconnect()
  }
}
```

### 2. NEAR Account Management Agent

Create, manage, and delete NEAR accounts programmatically.

```typescript
import { NEAR } from "@kynesyslabs/demosdk/xm-websdk"

interface AccountInfo {
  accountId: string
  publicKey: string
  balance: string
  createdAt: number
  status: "active" | "pending" | "deleted"
}

class NearAccountManagementAgent {
  private near: NEAR
  private managedAccounts: Map<string, AccountInfo> = new Map()

  async initialize(rpcUrl: string, masterPrivateKey: string): Promise<void> {
    this.near = await NEAR.create(rpcUrl)
    await this.near.connectWallet(masterPrivateKey)
  }

  async createSubAccount(
    subAccountName: string,
    initialBalance: string = "0.1"
  ): Promise<AccountInfo> {
    const masterAccountId = this.near.getAccountId()
    const newAccountId = `${subAccountName}.${masterAccountId}`

    // Generate keypair for new account
    const { keypair } = await this.near.createWallet()

    // Create the account
    await this.near.createAccount(newAccountId, keypair.publicKey.toString())

    // Fund the account
    await this.near.preparePay(newAccountId, initialBalance)

    const accountInfo: AccountInfo = {
      accountId: newAccountId,
      publicKey: keypair.publicKey.toString(),
      balance: initialBalance,
      createdAt: Date.now(),
      status: "active"
    }

    this.managedAccounts.set(newAccountId, accountInfo)
    console.log(`Created account: ${newAccountId}`)

    return accountInfo
  }

  async createNamedAccount(
    accountId: string,
    publicKey: string
  ): Promise<AccountInfo> {
    // For top-level accounts, requires registrar contract interaction
    await this.near.createAccount(accountId, publicKey)

    const accountInfo: AccountInfo = {
      accountId,
      publicKey,
      balance: "0",
      createdAt: Date.now(),
      status: "active"
    }

    this.managedAccounts.set(accountId, accountInfo)
    return accountInfo
  }

  async deleteAccount(
    accountId: string,
    beneficiaryId?: string
  ): Promise<void> {
    const beneficiary = beneficiaryId || this.near.getAccountId()

    // Delete account and transfer remaining funds to beneficiary
    await this.near.deleteAccount(beneficiary)

    const accountInfo = this.managedAccounts.get(accountId)
    if (accountInfo) {
      accountInfo.status = "deleted"
    }

    console.log(`Deleted account: ${accountId}, funds sent to: ${beneficiary}`)
  }

  async getAccountInfo(accountId: string): Promise<AccountInfo | null> {
    try {
      const balance = await this.near.getBalance(accountId)

      const existing = this.managedAccounts.get(accountId)
      if (existing) {
        existing.balance = balance
        return existing
      }

      return {
        accountId,
        publicKey: "unknown",
        balance,
        createdAt: 0,
        status: "active"
      }
    } catch {
      return null
    }
  }

  async listManagedAccounts(): Promise<AccountInfo[]> {
    const accounts: AccountInfo[] = []

    for (const [accountId, info] of this.managedAccounts) {
      if (info.status === "active") {
        const balance = await this.near.getBalance(accountId)
        info.balance = balance
        accounts.push(info)
      }
    }

    return accounts
  }

  async getTotalManagedBalance(): Promise<string> {
    let total = 0n

    for (const [accountId, info] of this.managedAccounts) {
      if (info.status === "active") {
        const balance = await this.near.getBalance(accountId)
        total += BigInt(Math.floor(parseFloat(balance) * 1e24))
      }
    }

    return (Number(total) / 1e24).toFixed(4)
  }
}
```

### 3. NEAR Actions Agent

Execute complex NEAR actions including function calls and access key management.

```typescript
import { NEAR } from "@kynesyslabs/demosdk/xm-websdk"
import { actions } from "@kynesyslabs/demosdk/xm-websdk"

interface FunctionCallParams {
  contractId: string
  methodName: string
  args: object
  gas?: string
  deposit?: string
}

class NearActionsAgent {
  private near: NEAR

  async initialize(rpcUrl: string, privateKey: string): Promise<void> {
    this.near = await NEAR.create(rpcUrl)
    await this.near.connectWallet(privateKey)
  }

  async callFunction(params: FunctionCallParams): Promise<any> {
    const {
      contractId,
      methodName,
      args,
      gas = "30000000000000", // 30 TGas
      deposit = "0"
    } = params

    // Create function call action
    const action = actions.functionCall(
      methodName,
      args,
      BigInt(gas),
      BigInt(deposit)
    )

    // Execute action
    const result = await this.near.executeAction(contractId, action)

    console.log(`Called ${contractId}.${methodName}`)
    return result
  }

  async viewFunction(
    contractId: string,
    methodName: string,
    args: object = {}
  ): Promise<any> {
    // View calls don't require signing
    const result = await this.near.viewFunction({
      contractId,
      methodName,
      args
    })

    return result
  }

  async addAccessKey(
    publicKey: string,
    contractId: string,
    methodNames: string[],
    allowance: string = "0.25"
  ): Promise<void> {
    const action = actions.addKey(
      publicKey,
      {
        receiverId: contractId,
        methodNames,
        allowance: BigInt(Math.floor(parseFloat(allowance) * 1e24))
      }
    )

    await this.near.executeAction(this.near.getAccountId(), action)
    console.log(`Added function call access key for ${contractId}`)
  }

  async deleteAccessKey(publicKey: string): Promise<void> {
    const action = actions.deleteKey(publicKey)

    await this.near.executeAction(this.near.getAccountId(), action)
    console.log(`Deleted access key: ${publicKey}`)
  }

  async deployContract(wasmCode: Uint8Array): Promise<void> {
    const action = actions.deployContract(wasmCode)

    await this.near.executeAction(this.near.getAccountId(), action)
    console.log(`Deployed contract to ${this.near.getAccountId()}`)
  }

  async stakeTokens(
    validatorId: string,
    amount: string,
    publicKey: string
  ): Promise<void> {
    const action = actions.stake(
      BigInt(Math.floor(parseFloat(amount) * 1e24)),
      publicKey
    )

    await this.near.executeAction(validatorId, action)
    console.log(`Staked ${amount} NEAR with ${validatorId}`)
  }

  async batchActions(
    receiverId: string,
    actionList: any[]
  ): Promise<void> {
    await this.near.executeBatchActions(receiverId, actionList)
    console.log(`Executed ${actionList.length} actions on ${receiverId}`)
  }
}
```

### 4. NEAR Token Agent

Interact with NEP-141 fungible tokens on NEAR.

```typescript
import { NEAR } from "@kynesyslabs/demosdk/xm-websdk"

interface TokenMetadata {
  spec: string
  name: string
  symbol: string
  decimals: number
  icon?: string
}

interface TokenBalance {
  contractId: string
  symbol: string
  balance: string
  decimals: number
}

class NearTokenAgent {
  private near: NEAR
  private tokenContracts: Map<string, TokenMetadata> = new Map()

  async initialize(rpcUrl: string, privateKey: string): Promise<void> {
    this.near = await NEAR.create(rpcUrl)
    await this.near.connectWallet(privateKey)
  }

  async getTokenMetadata(contractId: string): Promise<TokenMetadata> {
    if (this.tokenContracts.has(contractId)) {
      return this.tokenContracts.get(contractId)!
    }

    const metadata = await this.near.viewFunction({
      contractId,
      methodName: "ft_metadata",
      args: {}
    })

    this.tokenContracts.set(contractId, metadata)
    return metadata
  }

  async getTokenBalance(
    contractId: string,
    accountId?: string
  ): Promise<TokenBalance> {
    const account = accountId || this.near.getAccountId()

    const [metadata, balance] = await Promise.all([
      this.getTokenMetadata(contractId),
      this.near.viewFunction({
        contractId,
        methodName: "ft_balance_of",
        args: { account_id: account }
      })
    ])

    const formattedBalance = (
      Number(balance) / Math.pow(10, metadata.decimals)
    ).toString()

    return {
      contractId,
      symbol: metadata.symbol,
      balance: formattedBalance,
      decimals: metadata.decimals
    }
  }

  async transferToken(
    contractId: string,
    receiverId: string,
    amount: string,
    memo?: string
  ): Promise<string> {
    const metadata = await this.getTokenMetadata(contractId)
    const rawAmount = BigInt(
      Math.floor(parseFloat(amount) * Math.pow(10, metadata.decimals))
    ).toString()

    const result = await this.near.callFunction({
      contractId,
      methodName: "ft_transfer",
      args: {
        receiver_id: receiverId,
        amount: rawAmount,
        memo: memo || null
      },
      deposit: "1" // 1 yoctoNEAR required for transfer
    })

    console.log(`Transferred ${amount} ${metadata.symbol} to ${receiverId}`)
    return result.transaction.hash
  }

  async registerAccount(
    contractId: string,
    accountId?: string
  ): Promise<void> {
    const account = accountId || this.near.getAccountId()

    // Check if already registered
    const balance = await this.near.viewFunction({
      contractId,
      methodName: "ft_balance_of",
      args: { account_id: account }
    }).catch(() => null)

    if (balance !== null) {
      console.log(`Account ${account} already registered`)
      return
    }

    // Register account with storage deposit
    await this.near.callFunction({
      contractId,
      methodName: "storage_deposit",
      args: { account_id: account },
      deposit: "0.00125" // Standard storage deposit
    })

    console.log(`Registered ${account} for token ${contractId}`)
  }

  async getAllTokenBalances(
    contractIds: string[],
    accountId?: string
  ): Promise<TokenBalance[]> {
    const account = accountId || this.near.getAccountId()
    const balances: TokenBalance[] = []

    for (const contractId of contractIds) {
      try {
        const balance = await this.getTokenBalance(contractId, account)
        if (parseFloat(balance.balance) > 0) {
          balances.push(balance)
        }
      } catch {
        // Token not found or account not registered
      }
    }

    return balances
  }
}
```

## Integration with Demos

### Cross-Chain NEAR Operations

```typescript
import { DemosWork, WorkStep } from "@kynesyslabs/demosdk/demoswork"
import { NEAR } from "@kynesyslabs/demosdk/xm-websdk"

async function crossChainToNear(
  demos: Demos,
  near: NEAR,
  evmSourceChain: string,
  amount: string
): Promise<DemosWork> {
  const work = new DemosWork()

  // Step 1: Bridge from EVM to NEAR
  const bridgeStep = new WorkStep({
    context: "xm",
    content: {
      action: "bridge",
      from: evmSourceChain,
      to: "near",
      amount
    },
    critical: true
  })
  work.push(new BaseOperation(bridgeStep))

  // Step 2: Execute NEAR operation
  const nearTx = await near.preparePay("recipient.near", amount)
  const nearStep = new WorkStep({
    context: "xm",
    content: {
      chain: "near",
      signedTransaction: nearTx
    }
  })
  work.push(new BaseOperation(nearStep))

  return work
}
```

## Best Practices

1. **Validate account IDs** - NEAR uses human-readable account names
2. **Check account existence** - Verify recipient accounts before transfers
3. **Use sub-accounts** - Create hierarchical account structures
4. **Manage access keys** - Use function-call keys for limited permissions
5. **Register for tokens** - Always register before receiving NEP-141 tokens

## Related Skills

- [Cross-Chain Bridge Agent](./crosschain-bridge-agent.md) - Bridge to/from NEAR
- [EVM Operations Agent](./evm-operations-agent.md) - Multi-chain EVM operations
- [Token Discovery Agent](./token-discovery-agent.md) - Discover NEAR tokens
