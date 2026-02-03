# Escrow Agent

Build agents that manage trustless escrow transactions on the Demos Network using the escrow module.

## SDK Reference

```typescript
import { EscrowTransaction, EscrowQueries } from "@kynesyslabs/demosdk/escrow"
```

### Core Classes

| Class | Purpose |
|-------|---------|
| `EscrowTransaction` | Create and manage escrow deposits |
| `EscrowQueries` | Query escrow balances and claims |

### Key Interfaces

```typescript
interface ClaimableEscrow {
  id: string
  sender: string
  amount: string
  condition: EscrowCondition
  expiresAt: number
  claimable: boolean
}

interface SentEscrow {
  id: string
  recipient: string
  amount: string
  status: "pending" | "claimed" | "expired" | "refunded"
  createdAt: number
}

interface EscrowBalance {
  locked: string
  claimable: string
  total: string
}
```

## Use Cases

### 1. P2P Trade Escrow Agent

Facilitate trustless peer-to-peer trades with automatic release conditions.

```typescript
import { Demos } from "@kynesyslabs/demosdk/websdk"
import { EscrowTransaction, EscrowQueries } from "@kynesyslabs/demosdk/escrow"

class P2PTradeEscrowAgent {
  private demos: Demos
  private escrowTx: EscrowTransaction
  private escrowQueries: EscrowQueries

  async initiateTrade(
    counterparty: string,
    amount: string,
    tradeConditions: TradeConditions
  ): Promise<string> {
    // Create escrow with release conditions
    const escrowId = await this.escrowTx.createEscrow({
      recipient: counterparty,
      amount,
      conditions: {
        type: "multi-sig",
        requiredSignatures: 2,
        signers: [this.demos.getAddress(), counterparty],
        timeout: tradeConditions.timeoutHours * 3600
      },
      metadata: {
        tradeType: tradeConditions.type,
        description: tradeConditions.description
      }
    })

    console.log(`Trade escrow created: ${escrowId}`)
    return escrowId
  }

  async confirmDelivery(escrowId: string): Promise<void> {
    // Buyer confirms receipt, releases funds
    await this.escrowTx.releaseEscrow(escrowId, {
      signature: await this.demos.wallet.sign(`release:${escrowId}`)
    })
  }

  async disputeTrade(escrowId: string, reason: string): Promise<void> {
    // Initiate dispute - funds held for arbitration
    await this.escrowTx.initiateDispute(escrowId, {
      reason,
      evidence: [],
      requestedOutcome: "refund"
    })
  }

  async getActiveEscrows(): Promise<SentEscrow[]> {
    return await this.escrowQueries.getSentEscrows({
      status: "pending",
      limit: 50
    })
  }
}
```

### 2. Milestone Payment Agent

Release payments based on project milestone completion.

```typescript
import { EscrowTransaction } from "@kynesyslabs/demosdk/escrow"

interface Milestone {
  id: string
  description: string
  amount: string
  dueDate: number
  deliverables: string[]
}

class MilestonePaymentAgent {
  private escrowTx: EscrowTransaction
  private projectEscrows: Map<string, string[]> = new Map()

  async createProjectEscrow(
    projectId: string,
    contractor: string,
    milestones: Milestone[]
  ): Promise<string[]> {
    const escrowIds: string[] = []

    // Create separate escrow for each milestone
    for (const milestone of milestones) {
      const escrowId = await this.escrowTx.createEscrow({
        recipient: contractor,
        amount: milestone.amount,
        conditions: {
          type: "approval",
          approver: this.demos.getAddress(),
          timeout: milestone.dueDate,
          autoRefundOnTimeout: true
        },
        metadata: {
          projectId,
          milestoneId: milestone.id,
          description: milestone.description,
          deliverables: milestone.deliverables
        }
      })

      escrowIds.push(escrowId)
    }

    this.projectEscrows.set(projectId, escrowIds)
    return escrowIds
  }

  async approveMilestone(
    projectId: string,
    milestoneIndex: number,
    feedback?: string
  ): Promise<void> {
    const escrowIds = this.projectEscrows.get(projectId)
    if (!escrowIds || !escrowIds[milestoneIndex]) {
      throw new Error("Milestone escrow not found")
    }

    await this.escrowTx.releaseEscrow(escrowIds[milestoneIndex], {
      approvalNote: feedback || "Milestone approved"
    })

    console.log(`Milestone ${milestoneIndex + 1} payment released`)
  }

  async getProjectStatus(projectId: string): Promise<MilestoneStatus[]> {
    const escrowIds = this.projectEscrows.get(projectId) || []
    const statuses: MilestoneStatus[] = []

    for (const escrowId of escrowIds) {
      const escrow = await this.escrowQueries.getEscrow(escrowId)
      statuses.push({
        escrowId,
        status: escrow.status,
        amount: escrow.amount,
        releasedAt: escrow.releasedAt
      })
    }

    return statuses
  }
}
```

### 3. Conditional Escrow Arbitration Agent

Automated arbitration for escrow disputes.

```typescript
import { EscrowTransaction, EscrowQueries } from "@kynesyslabs/demosdk/escrow"

interface DisputeEvidence {
  type: "text" | "image" | "document" | "transaction"
  content: string
  timestamp: number
  submittedBy: string
}

class EscrowArbitrationAgent {
  private escrowTx: EscrowTransaction
  private escrowQueries: EscrowQueries

  async reviewDispute(escrowId: string): Promise<ArbitrationDecision> {
    const escrow = await this.escrowQueries.getEscrow(escrowId)
    const dispute = await this.escrowQueries.getDispute(escrowId)

    if (!dispute) {
      throw new Error("No dispute found for this escrow")
    }

    // Analyze evidence from both parties
    const senderEvidence = dispute.evidence.filter(
      e => e.submittedBy === escrow.sender
    )
    const recipientEvidence = dispute.evidence.filter(
      e => e.submittedBy === escrow.recipient
    )

    // Apply arbitration rules
    const decision = await this.evaluateEvidence({
      escrow,
      senderEvidence,
      recipientEvidence,
      disputeReason: dispute.reason
    })

    return decision
  }

  async executeArbitration(
    escrowId: string,
    decision: ArbitrationDecision
  ): Promise<void> {
    switch (decision.outcome) {
      case "release":
        // Release to recipient
        await this.escrowTx.arbitrateRelease(escrowId, {
          decision: decision.reasoning,
          arbitrator: this.demos.getAddress()
        })
        break

      case "refund":
        // Refund to sender
        await this.escrowTx.arbitrateRefund(escrowId, {
          decision: decision.reasoning,
          arbitrator: this.demos.getAddress()
        })
        break

      case "split":
        // Split between parties
        await this.escrowTx.arbitrateSplit(escrowId, {
          senderShare: decision.senderPercentage,
          recipientShare: decision.recipientPercentage,
          decision: decision.reasoning,
          arbitrator: this.demos.getAddress()
        })
        break
    }
  }

  private async evaluateEvidence(params: EvidenceParams): Promise<ArbitrationDecision> {
    // Scoring based on evidence quality and completeness
    let senderScore = 0
    let recipientScore = 0

    for (const evidence of params.senderEvidence) {
      senderScore += this.scoreEvidence(evidence)
    }

    for (const evidence of params.recipientEvidence) {
      recipientScore += this.scoreEvidence(evidence)
    }

    // Determine outcome based on scores
    const totalScore = senderScore + recipientScore
    if (senderScore > recipientScore * 1.5) {
      return { outcome: "refund", reasoning: "Sender evidence stronger" }
    } else if (recipientScore > senderScore * 1.5) {
      return { outcome: "release", reasoning: "Recipient evidence stronger" }
    } else {
      return {
        outcome: "split",
        senderPercentage: Math.round((senderScore / totalScore) * 100),
        recipientPercentage: Math.round((recipientScore / totalScore) * 100),
        reasoning: "Evidence inconclusive, splitting proportionally"
      }
    }
  }

  private scoreEvidence(evidence: DisputeEvidence): number {
    const typeScores = { transaction: 10, document: 7, image: 5, text: 3 }
    return typeScores[evidence.type] || 1
  }
}
```

### 4. Time-Locked Savings Escrow Agent

Self-escrow for enforced savings with time locks.

```typescript
import { EscrowTransaction, EscrowQueries } from "@kynesyslabs/demosdk/escrow"

interface SavingsGoal {
  name: string
  targetAmount: string
  unlockDate: number
  earlyWithdrawalPenalty: number // percentage
}

class SavingsEscrowAgent {
  private escrowTx: EscrowTransaction
  private escrowQueries: EscrowQueries
  private savingsEscrows: Map<string, string> = new Map()

  async createSavingsGoal(goal: SavingsGoal): Promise<string> {
    // Self-escrow with time lock
    const escrowId = await this.escrowTx.createEscrow({
      recipient: this.demos.getAddress(), // Self-escrow
      amount: "0", // Will deposit incrementally
      conditions: {
        type: "timelock",
        unlockTime: goal.unlockDate,
        earlyWithdrawalPenalty: goal.earlyWithdrawalPenalty
      },
      metadata: {
        goalName: goal.name,
        targetAmount: goal.targetAmount,
        createdAt: Date.now()
      }
    })

    this.savingsEscrows.set(goal.name, escrowId)
    return escrowId
  }

  async deposit(goalName: string, amount: string): Promise<void> {
    const escrowId = this.savingsEscrows.get(goalName)
    if (!escrowId) throw new Error("Savings goal not found")

    await this.escrowTx.addToEscrow(escrowId, { amount })

    const balance = await this.escrowQueries.getEscrowBalance(escrowId)
    console.log(`Deposited ${amount}. New balance: ${balance.total}`)
  }

  async checkProgress(goalName: string): Promise<SavingsProgress> {
    const escrowId = this.savingsEscrows.get(goalName)
    if (!escrowId) throw new Error("Savings goal not found")

    const escrow = await this.escrowQueries.getEscrow(escrowId)
    const targetAmount = parseFloat(escrow.metadata.targetAmount)
    const currentAmount = parseFloat(escrow.amount)

    return {
      goalName,
      currentAmount: escrow.amount,
      targetAmount: escrow.metadata.targetAmount,
      progressPercent: (currentAmount / targetAmount) * 100,
      unlockDate: new Date(escrow.conditions.unlockTime),
      daysRemaining: Math.ceil(
        (escrow.conditions.unlockTime - Date.now()) / (1000 * 60 * 60 * 24)
      )
    }
  }

  async withdraw(goalName: string, early: boolean = false): Promise<string> {
    const escrowId = this.savingsEscrows.get(goalName)
    if (!escrowId) throw new Error("Savings goal not found")

    const escrow = await this.escrowQueries.getEscrow(escrowId)

    if (early && Date.now() < escrow.conditions.unlockTime) {
      // Apply penalty for early withdrawal
      const penalty = escrow.conditions.earlyWithdrawalPenalty
      console.warn(`Early withdrawal penalty: ${penalty}%`)

      return await this.escrowTx.earlyWithdraw(escrowId, {
        acceptPenalty: true
      })
    }

    // Normal withdrawal after unlock
    return await this.escrowTx.releaseEscrow(escrowId)
  }

  async getAllSavingsGoals(): Promise<SavingsProgress[]> {
    const goals: SavingsProgress[] = []

    for (const [goalName] of this.savingsEscrows) {
      goals.push(await this.checkProgress(goalName))
    }

    return goals.sort((a, b) => a.daysRemaining - b.daysRemaining)
  }
}
```

## Integration Patterns

### Escrow with DemosWork Pipeline

```typescript
import { DemosWork, ConditionalOperation, WorkStep } from "@kynesyslabs/demosdk/demoswork"
import { EscrowTransaction } from "@kynesyslabs/demosdk/escrow"

async function createEscrowPipeline(
  escrowId: string,
  releaseCondition: () => Promise<boolean>
): Promise<DemosWork> {
  const work = new DemosWork()

  // Step 1: Check condition
  const checkStep = new WorkStep({
    context: "native",
    content: { action: "check_condition", escrowId }
  })

  // Step 2: Release if condition met
  const releaseStep = new WorkStep({
    context: "native",
    content: { action: "release_escrow", escrowId }
  })

  // Conditional release
  work.push(new ConditionalOperation(
    checkStep,
    releaseStep,
    { condition: "result.conditionMet === true" }
  ))

  return work
}
```

### Multi-Party Escrow

```typescript
async function createMultiPartyEscrow(
  parties: string[],
  amounts: Map<string, string>,
  releaseThreshold: number
): Promise<string> {
  const escrowTx = new EscrowTransaction(demos)

  const escrowId = await escrowTx.createEscrow({
    recipient: null, // Will be determined by vote
    amount: Array.from(amounts.values()).reduce(
      (sum, amt) => (BigInt(sum) + BigInt(amt)).toString(),
      "0"
    ),
    conditions: {
      type: "multi-party-vote",
      parties,
      threshold: releaseThreshold,
      votingPeriod: 7 * 24 * 3600 // 7 days
    }
  })

  return escrowId
}
```

## Best Practices

1. **Always set timeouts** - Prevent funds from being locked indefinitely
2. **Use appropriate condition types** - Match escrow type to use case
3. **Store escrow IDs securely** - Track all active escrows
4. **Handle disputes gracefully** - Implement clear arbitration paths
5. **Monitor expiring escrows** - Alert before auto-refund triggers

## Related Skills

- [Cross-Chain Treasury Agent](./crosschain-treasury-agent.md) - Multi-chain escrow
- [Governance Agent](./governance-agent.md) - Voting-based release conditions
- [Identity Resolution Agent](./identity-resolution-agent.md) - Verify escrow participants
