# IBC Operations Agent

Build agents that interact with IBC-enabled Cosmos SDK chains through the Demos Network XM SDK.

## SDK Reference

```typescript
import { IBC } from "@kynesyslabs/demosdk/xm-websdk"
// or
import { IBC } from "@kynesyslabs/demosdk/xm-localsdk"
```

### Core Methods

| Method | Purpose |
|--------|---------|
| `create(rpc_url)` | Create and connect to Cosmos RPC |
| `connectWallet(privateKey)` | Connect wallet with private key |
| `createWallet()` | Generate new Cosmos wallet |
| `getBalance(address, denom)` | Get token balance by denomination |
| `getBalances(address)` | Get all token balances |
| `preparePay(receiver, amount, denom)` | Prepare transfer |
| `preparePays(payments)` | Batch multiple transfers |
| `ibcSend(params)` | Send tokens via IBC |
| `signMessage(message)` | Sign arbitrary message |
| `verifyMessage(message, signature, publicKey)` | Verify signature |

### Common RPC Endpoints

| Chain | RPC URL |
|-------|---------|
| Cosmos Hub | `https://rpc.cosmos.network` |
| Osmosis | `https://rpc.osmosis.zone` |
| Juno | `https://rpc.juno.omniflix.co` |
| Stargaze | `https://rpc.stargaze-apis.com` |
| Secret Network | `https://rpc.secret.express` |

## Use Cases

### 1. IBC Payment Agent

Process native and IBC token transfers through Demos.

```typescript
import { IBC } from "@kynesyslabs/demosdk/xm-websdk"
import { Demos } from "@kynesyslabs/demosdk/websdk"
import { SigningStargateClient } from "@cosmjs/stargate"

interface PaymentRequest {
  recipient: string
  amount: string
  denom: string
  memo?: string
}

class IbcPaymentAgent {
  private ibc: IBC
  private demos: Demos

  async initialize(
    rpcUrl: string,
    privateKey: string,
    options?: IBCConnectWalletOptions
  ): Promise<void> {
    this.ibc = await IBC.create(rpcUrl)
    await this.ibc.connectWallet(privateKey, options)

    this.demos = new Demos()
    await this.demos.connect("https://demosnode.discus.sh/")

    console.log(`Connected: ${this.ibc.getAddress()}`)
  }

  async sendPayment(request: PaymentRequest): Promise<string> {
    // Get current balance
    const balance = await this.ibc.getBalance(
      this.ibc.getAddress(),
      request.denom
    )
    console.log(`Current balance: ${balance} ${request.denom}`)

    if (parseFloat(balance) < parseFloat(request.amount)) {
      throw new Error("Insufficient balance")
    }

    // Prepare signed transaction
    const signedTx = await this.ibc.preparePay(
      request.recipient,
      request.amount,
      request.denom
    )

    // Submit through Demos for cross-chain orchestration
    const txHash = await this.demos.submitXmTransaction({
      chain: "cosmos",
      signedTransaction: signedTx,
      metadata: { memo: request.memo }
    })

    console.log(`Payment sent: ${txHash}`)
    return txHash
  }

  async sendBatchPayments(payments: PaymentRequest[]): Promise<string[]> {
    const payOptions = payments.map(p => ({
      receiver: p.recipient,
      amount: p.amount,
      denom: p.denom
    }))

    const signedTxs = await this.ibc.preparePays(payOptions)

    const txHashes: string[] = []
    for (const signedTx of signedTxs) {
      const txHash = await this.demos.submitXmTransaction({
        chain: "cosmos",
        signedTransaction: signedTx
      })
      txHashes.push(txHash)
    }

    return txHashes
  }

  async getBalance(denom: string): Promise<string> {
    return await this.ibc.getBalance(this.ibc.getAddress(), denom)
  }

  async getAllBalances(): Promise<Array<{ denom: string; amount: string }>> {
    return await this.ibc.getBalances(this.ibc.getAddress())
  }

  async disconnect(): Promise<void> {
    await this.ibc.disconnect()
  }
}
```

### 2. IBC Transfer Agent

Execute cross-chain IBC token transfers.

```typescript
import { IBC } from "@kynesyslabs/demosdk/xm-websdk"

interface IBCTransferParams {
  sourceChannel: string
  receiver: string
  amount: string
  denom: string
  timeoutTimestamp?: number
  memo?: string
}

interface IBCChannelInfo {
  channelId: string
  portId: string
  counterpartyChannelId: string
  counterpartyPortId: string
  state: string
  ordering: string
}

class IbcTransferAgent {
  private ibc: IBC

  // Common IBC channels (Cosmos Hub)
  private readonly CHANNELS: Record<string, string> = {
    osmosis: "channel-141",
    juno: "channel-207",
    stargaze: "channel-730",
    secret: "channel-235",
    akash: "channel-184"
  }

  async initialize(rpcUrl: string, privateKey: string): Promise<void> {
    this.ibc = await IBC.create(rpcUrl)
    await this.ibc.connectWallet(privateKey)
  }

  async ibcTransfer(params: IBCTransferParams): Promise<string> {
    const {
      sourceChannel,
      receiver,
      amount,
      denom,
      timeoutTimestamp,
      memo
    } = params

    // Default timeout: 10 minutes from now
    const timeout = timeoutTimestamp || Date.now() + 10 * 60 * 1000

    const result = await this.ibc.ibcSend({
      sourceChannel,
      receiver,
      amount,
      denom,
      timeoutTimestamp: timeout * 1000000, // nanoseconds
      memo
    })

    console.log(`IBC transfer initiated: ${result.transactionHash}`)
    return result.transactionHash
  }

  async transferToChain(
    targetChain: string,
    receiver: string,
    amount: string,
    denom: string
  ): Promise<string> {
    const channel = this.CHANNELS[targetChain.toLowerCase()]
    if (!channel) {
      throw new Error(`Unknown target chain: ${targetChain}`)
    }

    return await this.ibcTransfer({
      sourceChannel: channel,
      receiver,
      amount,
      denom
    })
  }

  async getChannelInfo(channelId: string): Promise<IBCChannelInfo> {
    const channel = await this.ibc.queryChannel(channelId, "transfer")

    return {
      channelId: channel.channelId,
      portId: channel.portId,
      counterpartyChannelId: channel.counterparty.channelId,
      counterpartyPortId: channel.counterparty.portId,
      state: channel.state,
      ordering: channel.ordering
    }
  }

  async getOpenChannels(): Promise<IBCChannelInfo[]> {
    const channels = await this.ibc.queryAllChannels()

    return channels
      .filter(c => c.state === "STATE_OPEN")
      .map(c => ({
        channelId: c.channelId,
        portId: c.portId,
        counterpartyChannelId: c.counterparty.channelId,
        counterpartyPortId: c.counterparty.portId,
        state: c.state,
        ordering: c.ordering
      }))
  }

  async checkPendingPackets(channelId: string): Promise<number> {
    const packets = await this.ibc.queryPendingPackets(channelId, "transfer")
    return packets.length
  }

  getChannelForChain(chainName: string): string | undefined {
    return this.CHANNELS[chainName.toLowerCase()]
  }
}
```

### 3. Cosmos Staking Agent

Manage staking operations on Cosmos SDK chains.

```typescript
import { IBC } from "@kynesyslabs/demosdk/xm-websdk"

interface ValidatorInfo {
  operatorAddress: string
  moniker: string
  commission: string
  status: string
  tokens: string
  delegatorShares: string
}

interface DelegationInfo {
  validatorAddress: string
  shares: string
  balance: { denom: string; amount: string }
}

class CosmosStakingAgent {
  private ibc: IBC
  private stakingDenom: string = "uatom"

  async initialize(
    rpcUrl: string,
    privateKey: string,
    stakingDenom?: string
  ): Promise<void> {
    this.ibc = await IBC.create(rpcUrl)
    await this.ibc.connectWallet(privateKey)

    if (stakingDenom) {
      this.stakingDenom = stakingDenom
    }
  }

  async getValidators(status: string = "BOND_STATUS_BONDED"): Promise<ValidatorInfo[]> {
    const validators = await this.ibc.queryValidators(status)

    return validators.map(v => ({
      operatorAddress: v.operatorAddress,
      moniker: v.description.moniker,
      commission: v.commission.commissionRates.rate,
      status: v.status,
      tokens: v.tokens,
      delegatorShares: v.delegatorShares
    }))
  }

  async delegate(
    validatorAddress: string,
    amount: string
  ): Promise<string> {
    const signedTx = await this.ibc.prepareDelegate({
      validatorAddress,
      amount: {
        denom: this.stakingDenom,
        amount
      }
    })

    const result = await this.ibc.submitTransaction(signedTx)

    console.log(`Delegated ${amount} to ${validatorAddress}`)
    return result.transactionHash
  }

  async undelegate(
    validatorAddress: string,
    amount: string
  ): Promise<string> {
    const signedTx = await this.ibc.prepareUndelegate({
      validatorAddress,
      amount: {
        denom: this.stakingDenom,
        amount
      }
    })

    const result = await this.ibc.submitTransaction(signedTx)

    console.log(`Undelegated ${amount} from ${validatorAddress}`)
    return result.transactionHash
  }

  async redelegate(
    srcValidatorAddress: string,
    dstValidatorAddress: string,
    amount: string
  ): Promise<string> {
    const signedTx = await this.ibc.prepareRedelegate({
      srcValidatorAddress,
      dstValidatorAddress,
      amount: {
        denom: this.stakingDenom,
        amount
      }
    })

    const result = await this.ibc.submitTransaction(signedTx)

    console.log(`Redelegated ${amount} from ${srcValidatorAddress} to ${dstValidatorAddress}`)
    return result.transactionHash
  }

  async claimRewards(validatorAddress?: string): Promise<string> {
    let signedTx

    if (validatorAddress) {
      // Claim from specific validator
      signedTx = await this.ibc.prepareWithdrawRewards({
        validatorAddress
      })
    } else {
      // Claim from all validators
      const delegations = await this.getDelegations()
      const withdrawMsgs = delegations.map(d => ({
        validatorAddress: d.validatorAddress
      }))

      signedTx = await this.ibc.prepareBatchWithdrawRewards(withdrawMsgs)
    }

    const result = await this.ibc.submitTransaction(signedTx)

    console.log(`Rewards claimed: ${result.transactionHash}`)
    return result.transactionHash
  }

  async getDelegations(): Promise<DelegationInfo[]> {
    const delegations = await this.ibc.queryDelegations(this.ibc.getAddress())

    return delegations.map(d => ({
      validatorAddress: d.delegation.validatorAddress,
      shares: d.delegation.shares,
      balance: d.balance
    }))
  }

  async getUnbondingDelegations(): Promise<any[]> {
    return await this.ibc.queryUnbondingDelegations(this.ibc.getAddress())
  }

  async getPendingRewards(): Promise<Array<{
    validatorAddress: string
    rewards: Array<{ denom: string; amount: string }>
  }>> {
    const rewards = await this.ibc.queryDelegationTotalRewards(this.ibc.getAddress())

    return rewards.rewards.map((r: any) => ({
      validatorAddress: r.validatorAddress,
      rewards: r.reward
    }))
  }

  async getTotalStaked(): Promise<string> {
    const delegations = await this.getDelegations()

    const total = delegations.reduce(
      (sum, d) => sum + BigInt(d.balance.amount),
      0n
    )

    return total.toString()
  }
}
```

### 4. Cosmos Governance Agent

Participate in governance on Cosmos SDK chains.

```typescript
import { IBC } from "@kynesyslabs/demosdk/xm-websdk"

interface Proposal {
  proposalId: string
  title: string
  description: string
  status: string
  submitTime: string
  depositEndTime: string
  votingStartTime: string
  votingEndTime: string
  totalDeposit: Array<{ denom: string; amount: string }>
}

type VoteOption = "VOTE_OPTION_YES" | "VOTE_OPTION_ABSTAIN" | "VOTE_OPTION_NO" | "VOTE_OPTION_NO_WITH_VETO"

class CosmosGovernanceAgent {
  private ibc: IBC

  async initialize(rpcUrl: string, privateKey: string): Promise<void> {
    this.ibc = await IBC.create(rpcUrl)
    await this.ibc.connectWallet(privateKey)
  }

  async getActiveProposals(): Promise<Proposal[]> {
    const proposals = await this.ibc.queryProposals("PROPOSAL_STATUS_VOTING_PERIOD")

    return proposals.map(this.formatProposal)
  }

  async getAllProposals(): Promise<Proposal[]> {
    const proposals = await this.ibc.queryProposals()

    return proposals.map(this.formatProposal)
  }

  async getProposal(proposalId: string): Promise<Proposal> {
    const proposal = await this.ibc.queryProposal(proposalId)

    return this.formatProposal(proposal)
  }

  async vote(
    proposalId: string,
    option: VoteOption
  ): Promise<string> {
    const signedTx = await this.ibc.prepareVote({
      proposalId,
      voter: this.ibc.getAddress(),
      option
    })

    const result = await this.ibc.submitTransaction(signedTx)

    console.log(`Voted ${option} on proposal ${proposalId}`)
    return result.transactionHash
  }

  async voteWeighted(
    proposalId: string,
    options: Array<{ option: VoteOption; weight: string }>
  ): Promise<string> {
    const signedTx = await this.ibc.prepareVoteWeighted({
      proposalId,
      voter: this.ibc.getAddress(),
      options
    })

    const result = await this.ibc.submitTransaction(signedTx)

    console.log(`Weighted vote on proposal ${proposalId}`)
    return result.transactionHash
  }

  async deposit(
    proposalId: string,
    amount: string,
    denom: string
  ): Promise<string> {
    const signedTx = await this.ibc.prepareDeposit({
      proposalId,
      depositor: this.ibc.getAddress(),
      amount: [{ denom, amount }]
    })

    const result = await this.ibc.submitTransaction(signedTx)

    console.log(`Deposited ${amount} ${denom} on proposal ${proposalId}`)
    return result.transactionHash
  }

  async getMyVotes(): Promise<Array<{
    proposalId: string
    option: string
  }>> {
    // Query all proposals and check votes
    const proposals = await this.getAllProposals()
    const votes: Array<{ proposalId: string; option: string }> = []

    for (const proposal of proposals) {
      try {
        const vote = await this.ibc.queryVote(
          proposal.proposalId,
          this.ibc.getAddress()
        )

        if (vote) {
          votes.push({
            proposalId: proposal.proposalId,
            option: vote.option
          })
        }
      } catch {
        // No vote for this proposal
      }
    }

    return votes
  }

  async getTally(proposalId: string): Promise<{
    yes: string
    abstain: string
    no: string
    noWithVeto: string
  }> {
    const tally = await this.ibc.queryTally(proposalId)

    return {
      yes: tally.yes,
      abstain: tally.abstain,
      no: tally.no,
      noWithVeto: tally.noWithVeto
    }
  }

  private formatProposal(p: any): Proposal {
    return {
      proposalId: p.proposalId.toString(),
      title: p.content?.title || p.messages?.[0]?.content?.title || "Unknown",
      description: p.content?.description || p.messages?.[0]?.content?.description || "",
      status: p.status,
      submitTime: p.submitTime,
      depositEndTime: p.depositEndTime,
      votingStartTime: p.votingStartTime,
      votingEndTime: p.votingEndTime,
      totalDeposit: p.totalDeposit
    }
  }
}
```

## Integration with Demos

### Cross-Chain IBC Operations

```typescript
import { DemosWork, WorkStep } from "@kynesyslabs/demosdk/demoswork"
import { IBC } from "@kynesyslabs/demosdk/xm-websdk"

async function crossChainToCosmos(
  demos: Demos,
  ibc: IBC,
  evmSourceChain: string,
  amount: string
): Promise<DemosWork> {
  const work = new DemosWork()

  // Step 1: Bridge from EVM to Cosmos
  const bridgeStep = new WorkStep({
    context: "xm",
    content: {
      action: "bridge",
      from: evmSourceChain,
      to: "cosmos",
      amount
    },
    critical: true
  })
  work.push(new BaseOperation(bridgeStep))

  // Step 2: Execute IBC transfer to another Cosmos chain
  const ibcStep = new WorkStep({
    context: "xm",
    content: {
      action: "ibc_transfer",
      sourceChannel: "channel-141",
      receiver: "osmo1...",
      amount,
      denom: "uatom"
    }
  })
  work.push(new BaseOperation(ibcStep))

  return work
}
```

## Best Practices

1. **Use correct denominations** - Native tokens use micro units (uatom, uosmo)
2. **Set appropriate timeouts** - IBC transfers need timeout timestamps
3. **Check channel status** - Verify channels are open before transfers
4. **Handle packet acknowledgements** - Monitor IBC packet status
5. **Use memo field** - Include relevant metadata in memos

## Related Skills

- [Cross-Chain Bridge Agent](./crosschain-bridge-agent.md) - Bridge to/from Cosmos
- [Staking Agent](./staking-agent.md) - General staking patterns
- [Governance Agent](./governance-agent.md) - Cross-chain governance
