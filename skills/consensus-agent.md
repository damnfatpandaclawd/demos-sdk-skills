# Consensus Agent Skill

Build agents that implement distributed consensus mechanisms for multi-agent decisions.

## Overview

Consensus Agent enables Byzantine fault-tolerant decision making across agent networks. Essential for oracle networks, validator coordination, and distributed task verification.

## SDK Reference

```typescript
import { Demos } from "@kynesyslabs/demosdk/websdk"
import { Messaging } from "@kynesyslabs/demosdk/messaging"

// Inter-agent consensus messaging
const messaging = await demos.messaging.create()
```

## Agent Use Cases

### 1. Byzantine Fault Tolerant Consensus

Implement BFT consensus for critical decisions:

```typescript
class BFTConsensus {
  private messaging: Messaging
  private participants: AgentProfile[]
  private faultTolerance: number // Max byzantine nodes: (n-1)/3

  async proposeValue<T>(
    roundId: string,
    value: T,
    timeout: number = 30000
  ): Promise<ConsensusResult<T>> {
    const n = this.participants.length
    this.faultTolerance = Math.floor((n - 1) / 3)
    const requiredVotes = 2 * this.faultTolerance + 1

    // Phase 1: Pre-prepare
    const prePrepareResponses = await this.broadcastPrePrepare(roundId, value)

    if (prePrepareResponses.length < requiredVotes) {
      return { success: false, error: "Pre-prepare quorum not reached" }
    }

    // Phase 2: Prepare
    const prepareResponses = await this.broadcastPrepare(roundId, value)

    if (prepareResponses.length < requiredVotes) {
      return { success: false, error: "Prepare quorum not reached" }
    }

    // Phase 3: Commit
    const commitResponses = await this.broadcastCommit(roundId, value)

    if (commitResponses.length < requiredVotes) {
      return { success: false, error: "Commit quorum not reached" }
    }

    return {
      success: true,
      value,
      votes: commitResponses.length,
      round: roundId
    }
  }

  private async broadcastPrePrepare<T>(
    roundId: string,
    value: T
  ): Promise<ConsensusResponse[]> {
    const responses: ConsensusResponse[] = []

    const promises = this.participants.map(async participant => {
      try {
        const response = await this.messaging.sendRequest(
          participant.publicKey,
          {
            type: "bft_pre_prepare",
            roundId,
            value,
            proposer: this.getOwnId(),
            timestamp: Date.now()
          },
          { timeout: 10000 }
        )

        if (this.validatePrePrepareResponse(response)) {
          return response
        }
      } catch {
        return null
      }
    })

    const results = await Promise.all(promises)
    return results.filter((r): r is ConsensusResponse => r !== null)
  }

  private async broadcastPrepare<T>(
    roundId: string,
    value: T
  ): Promise<ConsensusResponse[]> {
    const responses: ConsensusResponse[] = []

    const promises = this.participants.map(async participant => {
      try {
        const response = await this.messaging.sendRequest(
          participant.publicKey,
          {
            type: "bft_prepare",
            roundId,
            value,
            sender: this.getOwnId(),
            digest: this.hashValue(value)
          },
          { timeout: 10000 }
        )

        if (this.validatePrepareResponse(response, value)) {
          return response
        }
      } catch {
        return null
      }
    })

    const results = await Promise.all(promises)
    return results.filter((r): r is ConsensusResponse => r !== null)
  }

  private async broadcastCommit<T>(
    roundId: string,
    value: T
  ): Promise<ConsensusResponse[]> {
    const promises = this.participants.map(async participant => {
      try {
        const response = await this.messaging.sendRequest(
          participant.publicKey,
          {
            type: "bft_commit",
            roundId,
            value,
            sender: this.getOwnId(),
            signature: await this.signCommit(roundId, value)
          },
          { timeout: 10000 }
        )

        if (this.verifyCommitSignature(response)) {
          return response
        }
      } catch {
        return null
      }
    })

    const results = await Promise.all(promises)
    return results.filter((r): r is ConsensusResponse => r !== null)
  }
}
```

### 2. Raft Consensus for Leader Election

Implement leader election and log replication:

```typescript
class RaftConsensus {
  private state: "follower" | "candidate" | "leader" = "follower"
  private currentTerm: number = 0
  private votedFor: string | null = null
  private log: LogEntry[] = []
  private commitIndex: number = 0
  private lastApplied: number = 0

  // Leader state
  private nextIndex: Map<string, number> = new Map()
  private matchIndex: Map<string, number> = new Map()

  private electionTimeout: NodeJS.Timeout | null = null
  private heartbeatInterval: NodeJS.Timeout | null = null

  async startNode(): Promise<void> {
    this.resetElectionTimeout()
    this.startMessageHandler()
  }

  private resetElectionTimeout(): void {
    if (this.electionTimeout) {
      clearTimeout(this.electionTimeout)
    }

    // Random timeout between 150-300ms
    const timeout = 150 + Math.random() * 150

    this.electionTimeout = setTimeout(() => {
      this.startElection()
    }, timeout)
  }

  private async startElection(): Promise<void> {
    this.state = "candidate"
    this.currentTerm++
    this.votedFor = this.getOwnId()

    let votesReceived = 1 // Vote for self
    const votesNeeded = Math.floor(this.participants.length / 2) + 1

    const voteRequests = this.participants
      .filter(p => p.id !== this.getOwnId())
      .map(async participant => {
        try {
          const response = await this.messaging.sendRequest(
            participant.publicKey,
            {
              type: "raft_request_vote",
              term: this.currentTerm,
              candidateId: this.getOwnId(),
              lastLogIndex: this.log.length - 1,
              lastLogTerm: this.log.length > 0
                ? this.log[this.log.length - 1].term
                : 0
            },
            { timeout: 5000 }
          )

          if (response.voteGranted) {
            votesReceived++
          } else if (response.term > this.currentTerm) {
            this.currentTerm = response.term
            this.state = "follower"
            this.votedFor = null
          }
        } catch {
          // Node unreachable
        }
      })

    await Promise.all(voteRequests)

    if (this.state === "candidate" && votesReceived >= votesNeeded) {
      this.becomeLeader()
    } else {
      this.state = "follower"
      this.resetElectionTimeout()
    }
  }

  private becomeLeader(): void {
    this.state = "leader"

    // Initialize leader state
    for (const participant of this.participants) {
      this.nextIndex.set(participant.id, this.log.length)
      this.matchIndex.set(participant.id, 0)
    }

    // Start heartbeats
    this.heartbeatInterval = setInterval(() => {
      this.sendHeartbeats()
    }, 50)

    console.log(`Node ${this.getOwnId()} became leader for term ${this.currentTerm}`)
  }

  private async sendHeartbeats(): Promise<void> {
    const promises = this.participants
      .filter(p => p.id !== this.getOwnId())
      .map(async participant => {
        const prevLogIndex = this.nextIndex.get(participant.id)! - 1
        const prevLogTerm = prevLogIndex >= 0
          ? this.log[prevLogIndex].term
          : 0

        const entries = this.log.slice(this.nextIndex.get(participant.id)!)

        try {
          const response = await this.messaging.sendRequest(
            participant.publicKey,
            {
              type: "raft_append_entries",
              term: this.currentTerm,
              leaderId: this.getOwnId(),
              prevLogIndex,
              prevLogTerm,
              entries,
              leaderCommit: this.commitIndex
            },
            { timeout: 3000 }
          )

          if (response.success) {
            this.nextIndex.set(participant.id, this.log.length)
            this.matchIndex.set(participant.id, this.log.length - 1)
            this.updateCommitIndex()
          } else if (response.term > this.currentTerm) {
            this.currentTerm = response.term
            this.state = "follower"
            this.stopHeartbeats()
          } else {
            // Decrement nextIndex and retry
            this.nextIndex.set(
              participant.id,
              Math.max(0, this.nextIndex.get(participant.id)! - 1)
            )
          }
        } catch {
          // Node unreachable
        }
      })

    await Promise.all(promises)
  }

  async appendEntry(command: any): Promise<boolean> {
    if (this.state !== "leader") {
      return false
    }

    const entry: LogEntry = {
      term: this.currentTerm,
      command,
      index: this.log.length
    }

    this.log.push(entry)

    // Wait for replication
    return await this.waitForCommit(entry.index)
  }
}
```

### 3. Proof of Stake Consensus

Implement stake-weighted consensus:

```typescript
class ProofOfStakeConsensus {
  private validators: Map<string, ValidatorInfo> = new Map()
  private totalStake: bigint = 0n
  private currentEpoch: number = 0
  private slashingConditions: SlashingCondition[] = []

  async selectProposer(slot: number): Promise<string> {
    // Weighted random selection based on stake
    const seed = this.generateRandomSeed(this.currentEpoch, slot)
    const target = this.pseudoRandomBigInt(seed, this.totalStake)

    let cumulative = 0n
    for (const [validatorId, info] of this.validators) {
      cumulative += info.stake
      if (cumulative > target) {
        return validatorId
      }
    }

    // Fallback to first validator
    return this.validators.keys().next().value
  }

  async proposeBlock(
    slot: number,
    transactions: Transaction[]
  ): Promise<ProposedBlock | null> {
    const proposer = await this.selectProposer(slot)

    if (proposer !== this.getOwnId()) {
      return null // Not our turn to propose
    }

    const block: ProposedBlock = {
      slot,
      epoch: this.currentEpoch,
      proposer,
      transactions,
      parentHash: await this.getLatestBlockHash(),
      stateRoot: await this.computeStateRoot(transactions),
      timestamp: Date.now()
    }

    // Sign the block
    block.signature = await this.signBlock(block)

    // Broadcast to validators
    await this.broadcastProposal(block)

    return block
  }

  async attestBlock(block: ProposedBlock): Promise<Attestation | null> {
    // Validate block
    if (!await this.validateBlock(block)) {
      return null
    }

    // Check slashing conditions
    if (await this.wouldCauseSlashing(block)) {
      return null
    }

    const attestation: Attestation = {
      blockHash: this.hashBlock(block),
      slot: block.slot,
      epoch: this.currentEpoch,
      validator: this.getOwnId(),
      stake: this.validators.get(this.getOwnId())?.stake || 0n,
      timestamp: Date.now()
    }

    attestation.signature = await this.signAttestation(attestation)

    return attestation
  }

  async finalizeBlock(
    block: ProposedBlock,
    attestations: Attestation[]
  ): Promise<FinalizedBlock | null> {
    // Calculate total attesting stake
    let attestingStake = 0n
    const validAttestations: Attestation[] = []

    for (const attestation of attestations) {
      if (await this.verifyAttestation(attestation, block)) {
        attestingStake += attestation.stake
        validAttestations.push(attestation)
      }
    }

    // Require 2/3 stake to finalize
    const threshold = (this.totalStake * 2n) / 3n

    if (attestingStake < threshold) {
      return null // Not enough stake
    }

    const finalized: FinalizedBlock = {
      ...block,
      attestations: validAttestations,
      attestingStake,
      finalizedAt: Date.now()
    }

    // Apply rewards
    await this.distributeRewards(finalized)

    return finalized
  }

  private async distributeRewards(block: FinalizedBlock): Promise<void> {
    // Proposer reward
    const proposerReward = this.calculateProposerReward(block)
    await this.creditValidator(block.proposer, proposerReward)

    // Attester rewards
    for (const attestation of block.attestations) {
      const attesterReward = this.calculateAttesterReward(
        attestation.stake,
        this.totalStake
      )
      await this.creditValidator(attestation.validator, attesterReward)
    }
  }

  async slashValidator(
    validatorId: string,
    evidence: SlashingEvidence
  ): Promise<SlashingResult> {
    const validator = this.validators.get(validatorId)
    if (!validator) {
      return { success: false, error: "Validator not found" }
    }

    // Verify evidence
    if (!await this.verifySlashingEvidence(evidence)) {
      return { success: false, error: "Invalid evidence" }
    }

    // Calculate slash amount
    const slashAmount = this.calculateSlashAmount(validator.stake, evidence.type)

    // Apply slash
    validator.stake -= slashAmount
    this.totalStake -= slashAmount

    // Remove if stake too low
    if (validator.stake < this.minimumStake) {
      this.validators.delete(validatorId)
    }

    return {
      success: true,
      slashedAmount: slashAmount,
      remainingStake: validator.stake
    }
  }
}
```

## Best Practices

1. **Use appropriate consensus** for the use case (BFT for security, Raft for speed)
2. **Implement timeouts** to handle unresponsive nodes
3. **Verify all signatures** before accepting votes
4. **Handle network partitions** gracefully
5. **Log all consensus decisions** for auditability

## Related Skills

- [Multi-Agent Coordinator](./multi-agent-coordinator-agent.md) - Task coordination
- [Agent Reputation Agent](./agent-reputation-agent.md) - Validator selection
- [Price Oracle Agent](./price-oracle-agent.md) - Oracle consensus
