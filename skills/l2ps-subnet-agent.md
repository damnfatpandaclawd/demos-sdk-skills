# L2PS Private Subnet Agent Skill

> **⚠️ Prerequisites**: Complete [SDK Setup](./00-sdk-setup.md) first to configure your environment.

Build agents that operate within Layer 2 Private Subnets for confidential transaction processing on Demos Network.

## Overview

L2PS (Layer 2 Private Subnets) enables agents to process encrypted transactions with AES-GCM authenticated encryption while maintaining compatibility with the standard Demos transaction format. Essential for privacy-preserving operations, confidential data exchange, and secure multi-party computations.

## SDK Reference

```typescript
import { L2PS } from "@kynesyslabs/demosdk/l2ps"
import type { L2PSConfig, L2PSEncryptedPayload, Transaction } from "@kynesyslabs/demosdk/types"

// Factory Methods
L2PS.create(privateKey?, iv?)           // Create new L2PS instance
L2PS.getInstance(id)                     // Get existing instance by ID
L2PS.getInstances()                      // Get all active instances
L2PS.hasInstance(id)                     // Check if instance exists
L2PS.removeInstance(id)                  // Remove instance from registry

// Instance Methods
l2ps.encryptTx(tx, senderIdentity?)     // Encrypt a transaction
l2ps.decryptTx(encryptedTx)             // Decrypt a transaction
l2ps.getId()                             // Get unique instance ID
l2ps.getConfig()                         // Get L2PS configuration
l2ps.setConfig(config)                   // Set L2PS configuration
l2ps.getKeyFingerprint()                 // Get 16-char key fingerprint
```

## Key Features

| Feature | Description |
|---------|-------------|
| AES-GCM Encryption | Authenticated encryption for confidentiality and integrity |
| Multi-Singleton | Manage multiple L2PS networks simultaneously |
| Standard Compatibility | Encrypted txs work with standard transaction pipeline |
| SHA-256 Identification | Secure instance identification |

## Agent Use Cases

### 1. Private Transaction Processor

Process confidential transactions within a private subnet:

```typescript
class PrivateTransactionAgent {
  private l2ps: L2PS
  private demos: Demos

  async initialize(subnetKey?: string): Promise<void> {
    // Create or join existing subnet
    if (subnetKey) {
      this.l2ps = await L2PS.create(subnetKey)
    } else {
      this.l2ps = await L2PS.create()
    }

    // Configure subnet
    this.l2ps.setConfig({
      uid: this.l2ps.getId(),
      name: "Private Agent Subnet",
      description: "Confidential transaction processing",
      allowedParticipants: []
    })
  }

  async sendPrivateTransaction(
    recipient: string,
    amount: bigint,
    metadata: any
  ): Promise<TransactionResult> {
    // Create standard transaction
    const tx: Transaction = {
      type: "transfer",
      content: {
        to: recipient,
        amount: amount.toString(),
        metadata
      },
      hash: "",
      status: "pending"
    }

    // Encrypt transaction for private subnet
    const encryptedTx = await this.l2ps.encryptTx(
      tx,
      await this.demos.wallet.getPublicKey()
    )

    // Submit encrypted transaction to mempool
    const result = await this.demos.insertTransaction(encryptedTx)

    return {
      txHash: result.hash,
      subnetId: this.l2ps.getId(),
      encrypted: true
    }
  }

  async receivePrivateTransaction(
    encryptedTx: Transaction
  ): Promise<Transaction> {
    // Verify transaction belongs to our subnet
    if (encryptedTx.type !== "l2psEncryptedTx") {
      throw new Error("Not an L2PS encrypted transaction")
    }

    // Decrypt and validate
    const decryptedTx = await this.l2ps.decryptTx(encryptedTx)

    return decryptedTx
  }
}
```

### 2. Multi-Subnet Router Agent

Route transactions across multiple private subnets:

```typescript
class SubnetRouterAgent {
  private subnets: Map<string, L2PS> = new Map()
  private demos: Demos

  async joinSubnet(
    subnetId: string,
    privateKey: string
  ): Promise<void> {
    // Check if already joined
    if (L2PS.hasInstance(subnetId)) {
      this.subnets.set(subnetId, L2PS.getInstance(subnetId))
      return
    }

    // Create new instance with provided key
    const l2ps = await L2PS.create(privateKey)
    this.subnets.set(l2ps.getId(), l2ps)
  }

  async routeTransaction(
    tx: Transaction,
    sourceSubnet: string,
    targetSubnet: string
  ): Promise<RoutedTransaction> {
    const source = this.subnets.get(sourceSubnet)
    const target = this.subnets.get(targetSubnet)

    if (!source || !target) {
      throw new Error("Subnet not found")
    }

    // Decrypt from source subnet
    const decryptedTx = await source.decryptTx(tx)

    // Re-encrypt for target subnet
    const reEncryptedTx = await target.encryptTx(
      decryptedTx,
      await this.demos.wallet.getPublicKey()
    )

    // Submit to target subnet
    const result = await this.demos.insertTransaction(reEncryptedTx)

    return {
      originalTx: tx.hash,
      routedTx: result.hash,
      sourceSubnet,
      targetSubnet,
      timestamp: Date.now()
    }
  }

  async broadcastToSubnets(
    tx: Transaction,
    targetSubnets: string[]
  ): Promise<BroadcastResult[]> {
    const results: BroadcastResult[] = []

    for (const subnetId of targetSubnets) {
      const subnet = this.subnets.get(subnetId)
      if (!subnet) continue

      const encryptedTx = await subnet.encryptTx(tx)
      const result = await this.demos.insertTransaction(encryptedTx)

      results.push({
        subnetId,
        txHash: result.hash,
        success: true
      })
    }

    return results
  }

  getActiveSubnets(): SubnetInfo[] {
    return L2PS.getInstances().map(l2ps => ({
      id: l2ps.getId(),
      config: l2ps.getConfig(),
      isActive: true
    }))
  }
}
```

### 3. Confidential Data Exchange Agent

Exchange sensitive data between parties:

```typescript
class ConfidentialExchangeAgent {
  private l2ps: L2PS
  private demos: Demos
  private pendingExchanges: Map<string, PendingExchange> = new Map()

  async initiateExchange(
    counterparty: string,
    data: any,
    terms: ExchangeTerms
  ): Promise<ExchangeSession> {
    // Create exchange-specific subnet
    const exchangeL2ps = await L2PS.create()

    // Create exchange proposal transaction
    const proposalTx: Transaction = {
      type: "exchangeProposal",
      content: {
        initiator: await this.demos.wallet.getPublicKey(),
        counterparty,
        terms,
        subnetId: exchangeL2ps.getId(),
        // Share encrypted key for counterparty
        encryptedSubnetKey: await this.encryptKeyForCounterparty(
          exchangeL2ps,
          counterparty
        )
      },
      hash: "",
      status: "pending"
    }

    // Encrypt and submit
    const encryptedProposal = await this.l2ps.encryptTx(proposalTx)
    await this.demos.insertTransaction(encryptedProposal)

    // Store pending exchange
    const session: ExchangeSession = {
      id: exchangeL2ps.getId(),
      counterparty,
      terms,
      status: "pending",
      createdAt: Date.now()
    }

    this.pendingExchanges.set(session.id, {
      session,
      l2ps: exchangeL2ps,
      data
    })

    return session
  }

  async acceptExchange(
    sessionId: string,
    counterpartyData: any
  ): Promise<ExchangeResult> {
    const exchange = this.pendingExchanges.get(sessionId)
    if (!exchange) {
      throw new Error("Exchange session not found")
    }

    // Create acceptance transaction with counterparty data
    const acceptanceTx: Transaction = {
      type: "exchangeAcceptance",
      content: {
        sessionId,
        counterpartyData: await this.encryptData(counterpartyData),
        acceptedAt: Date.now()
      },
      hash: "",
      status: "pending"
    }

    // Encrypt and submit
    const encryptedAcceptance = await exchange.l2ps.encryptTx(acceptanceTx)
    await this.demos.insertTransaction(encryptedAcceptance)

    // Exchange data
    const result: ExchangeResult = {
      sessionId,
      initiatorReceived: counterpartyData,
      counterpartyReceived: exchange.data,
      completedAt: Date.now()
    }

    // Clean up
    L2PS.removeInstance(sessionId)
    this.pendingExchanges.delete(sessionId)

    return result
  }
}
```

### 4. Private Voting Agent

Conduct confidential voting within a subnet:

```typescript
class PrivateVotingAgent {
  private votingSubnet: L2PS
  private demos: Demos
  private elections: Map<string, Election> = new Map()

  async createElection(
    title: string,
    options: string[],
    eligibleVoters: string[],
    endTime: number
  ): Promise<Election> {
    // Create election-specific subnet
    this.votingSubnet = await L2PS.create()

    const election: Election = {
      id: this.votingSubnet.getId(),
      title,
      options,
      eligibleVoters,
      endTime,
      votes: new Map(),
      status: "active"
    }

    // Distribute subnet keys to eligible voters
    for (const voter of eligibleVoters) {
      await this.distributeVotingKey(voter, election.id)
    }

    this.elections.set(election.id, election)

    // Create election announcement transaction
    const announcementTx: Transaction = {
      type: "electionAnnouncement",
      content: {
        electionId: election.id,
        title,
        options,
        endTime,
        voterCount: eligibleVoters.length
      },
      hash: "",
      status: "pending"
    }

    await this.demos.insertTransaction(announcementTx)

    return election
  }

  async castVote(
    electionId: string,
    choice: number,
    voterProof: string
  ): Promise<VoteReceipt> {
    const election = this.elections.get(electionId)
    if (!election) {
      throw new Error("Election not found")
    }

    if (Date.now() > election.endTime) {
      throw new Error("Election has ended")
    }

    // Verify voter eligibility without revealing identity
    const voterHash = await this.hashVoterProof(voterProof)

    if (election.votes.has(voterHash)) {
      throw new Error("Already voted")
    }

    // Create encrypted vote transaction
    const voteTx: Transaction = {
      type: "encryptedVote",
      content: {
        electionId,
        choice,
        voterHash,
        timestamp: Date.now(),
        // Zero-knowledge proof of eligibility
        eligibilityProof: await this.generateEligibilityProof(voterProof)
      },
      hash: "",
      status: "pending"
    }

    // Encrypt vote for privacy
    const encryptedVote = await this.votingSubnet.encryptTx(voteTx)
    const result = await this.demos.insertTransaction(encryptedVote)

    // Record vote (only hash, not identity)
    election.votes.set(voterHash, choice)

    return {
      electionId,
      voteHash: result.hash,
      timestamp: Date.now(),
      receipt: await this.generateReceipt(result.hash, voterHash)
    }
  }

  async tallyResults(electionId: string): Promise<ElectionResults> {
    const election = this.elections.get(electionId)
    if (!election) {
      throw new Error("Election not found")
    }

    if (Date.now() < election.endTime) {
      throw new Error("Election still in progress")
    }

    // Count votes
    const counts: Record<number, number> = {}
    for (const choice of election.votes.values()) {
      counts[choice] = (counts[choice] || 0) + 1
    }

    // Determine winner
    let winner = 0
    let maxVotes = 0
    for (const [choice, count] of Object.entries(counts)) {
      if (count > maxVotes) {
        maxVotes = count
        winner = parseInt(choice)
      }
    }

    const results: ElectionResults = {
      electionId,
      title: election.title,
      totalVotes: election.votes.size,
      results: election.options.map((option, i) => ({
        option,
        votes: counts[i] || 0,
        percentage: ((counts[i] || 0) / election.votes.size) * 100
      })),
      winner: election.options[winner],
      endedAt: Date.now()
    }

    // Clean up subnet
    L2PS.removeInstance(electionId)

    return results
  }
}
```

### 5. Secure Multi-Party Computation Agent

Coordinate secure computations across parties:

```typescript
class SecureMPCAgent {
  private computationSubnet: L2PS
  private demos: Demos

  async initializeComputation(
    participants: string[],
    computationType: ComputationType
  ): Promise<ComputationSession> {
    // Create computation-specific subnet
    this.computationSubnet = await L2PS.create()

    const session: ComputationSession = {
      id: this.computationSubnet.getId(),
      participants,
      computationType,
      inputs: new Map(),
      status: "collecting",
      createdAt: Date.now()
    }

    // Distribute keys to participants
    for (const participant of participants) {
      await this.sendSubnetInvitation(participant, session.id)
    }

    return session
  }

  async submitInput(
    sessionId: string,
    participantId: string,
    encryptedInput: any
  ): Promise<void> {
    // Create input submission transaction
    const inputTx: Transaction = {
      type: "mpcInput",
      content: {
        sessionId,
        participantId: await this.hashParticipant(participantId),
        encryptedInput,
        timestamp: Date.now()
      },
      hash: "",
      status: "pending"
    }

    // Double encrypt: first for MPC, then for subnet
    const encryptedTx = await this.computationSubnet.encryptTx(inputTx)
    await this.demos.insertTransaction(encryptedTx)
  }

  async executeComputation(
    sessionId: string,
    computeFunction: (inputs: any[]) => any
  ): Promise<ComputationResult> {
    // Collect all encrypted inputs from subnet
    const inputs = await this.collectInputs(sessionId)

    // Decrypt inputs within secure environment
    const decryptedInputs = await Promise.all(
      inputs.map(async (input) => {
        const decrypted = await this.computationSubnet.decryptTx(input)
        return decrypted.content.encryptedInput
      })
    )

    // Execute computation
    const result = computeFunction(decryptedInputs)

    // Encrypt and publish result
    const resultTx: Transaction = {
      type: "mpcResult",
      content: {
        sessionId,
        result,
        participantCount: inputs.length,
        computedAt: Date.now()
      },
      hash: "",
      status: "pending"
    }

    const encryptedResult = await this.computationSubnet.encryptTx(resultTx)
    await this.demos.insertTransaction(encryptedResult)

    // Clean up
    L2PS.removeInstance(sessionId)

    return {
      sessionId,
      result,
      participantCount: inputs.length,
      completedAt: Date.now()
    }
  }
}
```

### 6. Private Messaging Agent

Implement end-to-end encrypted messaging:

```typescript
class PrivateMessagingAgent {
  private channelSubnets: Map<string, L2PS> = new Map()
  private demos: Demos

  async createChannel(
    participants: string[]
  ): Promise<Channel> {
    // Create channel-specific subnet
    const channelL2ps = await L2PS.create()

    const channel: Channel = {
      id: channelL2ps.getId(),
      participants,
      createdAt: Date.now()
    }

    this.channelSubnets.set(channel.id, channelL2ps)

    // Distribute channel keys to participants
    for (const participant of participants) {
      await this.sendChannelInvitation(participant, channel)
    }

    return channel
  }

  async sendMessage(
    channelId: string,
    content: string,
    attachments?: Attachment[]
  ): Promise<MessageReceipt> {
    const channelL2ps = this.channelSubnets.get(channelId)
    if (!channelL2ps) {
      throw new Error("Channel not found")
    }

    const message: Message = {
      id: this.generateMessageId(),
      channelId,
      sender: await this.demos.wallet.getPublicKey(),
      content,
      attachments,
      timestamp: Date.now()
    }

    // Create message transaction
    const messageTx: Transaction = {
      type: "privateMessage",
      content: message,
      hash: "",
      status: "pending"
    }

    // Encrypt for channel subnet
    const encryptedMessage = await channelL2ps.encryptTx(messageTx)
    const result = await this.demos.insertTransaction(encryptedMessage)

    return {
      messageId: message.id,
      channelId,
      txHash: result.hash,
      timestamp: message.timestamp
    }
  }

  async receiveMessages(
    channelId: string,
    since?: number
  ): Promise<Message[]> {
    const channelL2ps = this.channelSubnets.get(channelId)
    if (!channelL2ps) {
      throw new Error("Channel not found")
    }

    // Fetch encrypted messages from chain
    const encryptedMessages = await this.fetchChannelMessages(channelId, since)

    // Decrypt each message
    const messages: Message[] = []
    for (const encryptedTx of encryptedMessages) {
      try {
        const decryptedTx = await channelL2ps.decryptTx(encryptedTx)
        messages.push(decryptedTx.content as Message)
      } catch {
        // Skip messages we can't decrypt (not for us)
        continue
      }
    }

    return messages.sort((a, b) => a.timestamp - b.timestamp)
  }
}
```

## Error Handling

```typescript
try {
  const decryptedTx = await l2ps.decryptTx(encryptedTx)
} catch (error) {
  switch (error.message) {
    case 'Not an L2PS encrypted transaction':
      // Transaction type mismatch
      break
    case 'Wrong L2PS UID':
      // Transaction belongs to different subnet
      break
    case 'Authentication failed':
      // AES-GCM authentication failed - tampered data
      break
    case 'Hash mismatch':
      // Transaction integrity check failed
      break
  }
}
```

## Best Practices

1. **Rotate subnet keys** periodically for forward secrecy
2. **Validate participants** before sharing subnet keys
3. **Use unique subnets** for different purposes/groups
4. **Clean up subnets** when no longer needed
5. **Store key fingerprints** for audit trails

## Integration with DemosWork

```typescript
const privateWorkflow = new DemosWork()

// Step 1: Create private subnet
privateWorkflow.push(new BaseOperation(
  new NativeWorkStep({
    method: "l2ps.create",
    params: {}
  })
))

// Step 2: Encrypt sensitive operation
privateWorkflow.push(new BaseOperation(
  new NativeWorkStep({
    method: "l2ps.encryptTx",
    params: {
      subnetId: "{{step1.result.id}}",
      transaction: sensitiveTransaction
    }
  })
))

// Step 3: Submit to network
privateWorkflow.push(new BaseOperation(
  new NativeWorkStep({
    method: "demos.insertTransaction",
    params: { tx: "{{step2.result}}" }
  })
))
```

## Related Skills

- [FHE Computation Agent](./fhe-computation-agent.md) - Homomorphic encryption operations
- [ZK Identity Agent](./zk-identity-agent.md) - Zero-knowledge proofs
- [Workflow Orchestration](./workflow-orchestration-agent.md) - Multi-step workflows
