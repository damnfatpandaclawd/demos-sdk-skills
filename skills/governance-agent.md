# Governance Agent Skill

> **⚠️ Prerequisites**: Complete [SDK Setup](./00-sdk-setup.md) first to configure your environment.

Build DAO governance agents for voting, proposal creation, and delegation management across multiple governance protocols using Demos Network.

## Overview

Governance Agents automate DAO participation including voting, proposal analysis, delegation, and governance tracking - essential for active DAO members, delegate platforms, and governance aggregators.

## SDK Reference

```typescript
import { EVM } from "@kynesyslabs/demosdk/xm-websdk"

// Governance Operations
const evm = await EVM.create(rpcUrl)
await evm.prepareVote(governorAddress, proposalId, support)
await evm.preparePropose(governorAddress, targets, values, calldatas, description)
await evm.prepareDelegate(tokenAddress, delegatee)
await evm.prepareQueue(governorAddress, proposalId)
await evm.prepareExecute(governorAddress, proposalId)
```

## Governance Standards

| Standard | Examples | Features |
|----------|----------|----------|
| Governor Alpha | Compound, early DAOs | Basic voting |
| Governor Bravo | Compound v2, Uniswap | Voting + delegation |
| OpenZeppelin Governor | Modern DAOs | Modular, customizable |
| Snapshot | Off-chain voting | Gasless |
| Moloch | Ragequit capability | Exit rights |

## Agent Use Cases

### 1. Voting Agent

Automated voting based on preferences:

```typescript
class VotingAgent {
  private demos: Demos
  private preferences: VotingPreferences

  async analyzeProposal(proposal: Proposal): Promise<ProposalAnalysis> {
    // Decode proposal actions
    const actions = await this.decodeProposalActions(proposal)

    // Analyze each action
    const actionAnalysis = actions.map(action => ({
      target: action.target,
      value: action.value,
      function: action.functionName,
      params: action.decodedParams,
      risk: this.assessActionRisk(action),
      impact: this.assessActionImpact(action)
    }))

    // Check against preferences
    const preferenceMatch = this.checkPreferences(actionAnalysis)

    // Calculate overall score
    const score = this.calculateProposalScore({
      actionAnalysis,
      preferenceMatch,
      proposerReputation: await this.getProposerReputation(proposal.proposer),
      discussionSentiment: await this.analyzeDiscussion(proposal.discussionUrl)
    })

    return {
      proposal,
      actions: actionAnalysis,
      score,
      recommendation: score > 0.6 ? "for" : score < 0.4 ? "against" : "abstain",
      reasons: this.generateReasons(actionAnalysis, preferenceMatch)
    }
  }

  async vote(
    governorAddress: string,
    proposalId: string,
    support: "for" | "against" | "abstain",
    reason?: string
  ): Promise<VoteResult> {
    const evm = await EVM.create(this.getRpcUrl(governorAddress))

    // Map support to value
    const supportValue = support === "for" ? 1 : support === "against" ? 0 : 2

    // Prepare vote transaction
    const votePayload = reason
      ? await evm.prepareVoteWithReason(governorAddress, proposalId, supportValue, reason)
      : await evm.prepareVote(governorAddress, proposalId, supportValue)

    await evm.disconnect()

    // Execute through Demos
    const result = await this.executeTx(votePayload)

    return {
      success: true,
      txHash: result.hash,
      proposalId,
      support,
      reason,
      votingPower: await this.getVotingPower(governorAddress)
    }
  }

  async autovote(daos: DAOConfig[]): Promise<AutovoteReport> {
    const results: VoteResult[] = []

    for (const dao of daos) {
      // Get active proposals
      const proposals = await this.getActiveProposals(dao.governorAddress)

      for (const proposal of proposals) {
        // Skip if already voted
        if (await this.hasVoted(dao.governorAddress, proposal.id)) continue

        // Analyze proposal
        const analysis = await this.analyzeProposal(proposal)

        // Skip abstain unless configured otherwise
        if (analysis.recommendation === "abstain" && !dao.voteOnAbstain) continue

        // Vote
        const result = await this.vote(
          dao.governorAddress,
          proposal.id,
          analysis.recommendation,
          analysis.reasons.join("; ")
        )

        results.push(result)
      }
    }

    return {
      totalProposals: results.length,
      votesFor: results.filter(r => r.support === "for").length,
      votesAgainst: results.filter(r => r.support === "against").length,
      abstentions: results.filter(r => r.support === "abstain").length,
      results
    }
  }
}
```

### 2. Proposal Creator Agent

Create and manage proposals:

```typescript
class ProposalCreatorAgent {
  private demos: Demos

  async createProposal(
    dao: DAOConfig,
    proposal: ProposalDraft
  ): Promise<ProposalCreationResult> {
    // Validate proposal
    const validation = await this.validateProposal(proposal)
    if (!validation.valid) {
      return { success: false, errors: validation.errors }
    }

    // Encode actions
    const encodedActions = await this.encodeActions(proposal.actions)

    const evm = await EVM.create(this.getRpcUrl(dao.chainId))

    // Create proposal
    const proposePayload = await evm.preparePropose(
      dao.governorAddress,
      encodedActions.targets,
      encodedActions.values,
      encodedActions.calldatas,
      proposal.description
    )

    await evm.disconnect()

    const result = await this.executeTx(proposePayload)

    // Extract proposal ID
    const proposalId = await this.extractProposalId(result)

    return {
      success: true,
      proposalId,
      txHash: result.hash,
      status: "pending"
    }
  }

  async buildTransferProposal(
    dao: DAOConfig,
    transfers: Transfer[]
  ): Promise<ProposalDraft> {
    const actions: ProposalAction[] = transfers.map(transfer => ({
      target: transfer.token,
      value: transfer.token === "0x0000000000000000000000000000000000000000" ? transfer.amount : 0n,
      signature: transfer.token === "0x0000000000000000000000000000000000000000"
        ? ""
        : "transfer(address,uint256)",
      params: transfer.token === "0x0000000000000000000000000000000000000000"
        ? []
        : [transfer.recipient, transfer.amount]
    }))

    return {
      title: `Treasury Transfer: ${transfers.length} transfers`,
      description: this.generateTransferDescription(transfers),
      actions,
      discussionUrl: undefined
    }
  }

  async buildParameterChangeProposal(
    dao: DAOConfig,
    changes: ParameterChange[]
  ): Promise<ProposalDraft> {
    const actions: ProposalAction[] = changes.map(change => ({
      target: change.contract,
      value: 0n,
      signature: change.setterFunction,
      params: [change.newValue]
    }))

    return {
      title: `Parameter Update: ${changes.map(c => c.parameterName).join(", ")}`,
      description: this.generateParameterDescription(changes),
      actions
    }
  }

  async monitorProposalLifecycle(
    proposalId: string,
    dao: DAOConfig
  ): Promise<void> {
    let status = await this.getProposalStatus(dao.governorAddress, proposalId)

    while (status !== "executed" && status !== "defeated" && status !== "expired") {
      await this.sleep(60000) // Check every minute

      const newStatus = await this.getProposalStatus(dao.governorAddress, proposalId)

      if (newStatus !== status) {
        this.emit("proposal_status_change", {
          proposalId,
          oldStatus: status,
          newStatus
        })

        // Take action based on status change
        if (newStatus === "succeeded") {
          await this.queueProposal(dao.governorAddress, proposalId)
        } else if (newStatus === "queued") {
          // Schedule execution after timelock
          const eta = await this.getProposalEta(dao.governorAddress, proposalId)
          this.scheduleExecution(proposalId, dao, eta)
        }

        status = newStatus
      }
    }
  }
}
```

### 3. Delegation Manager Agent

Manage vote delegation:

```typescript
class DelegationManagerAgent {
  private demos: Demos

  async delegate(
    tokenAddress: string,
    delegatee: string,
    chainId: number
  ): Promise<DelegationResult> {
    const evm = await EVM.create(this.getRpcUrl(chainId))

    const delegatePayload = await evm.prepareDelegate(tokenAddress, delegatee)
    await evm.disconnect()

    const result = await this.executeTx(delegatePayload)

    return {
      success: true,
      txHash: result.hash,
      token: tokenAddress,
      delegatee,
      votingPower: await this.getDelegatedPower(tokenAddress, delegatee)
    }
  }

  async findBestDelegate(
    dao: DAOConfig,
    preferences: DelegatePreferences
  ): Promise<DelegateRecommendation[]> {
    // Get all delegates
    const delegates = await this.getActiveDelegates(dao)

    // Score each delegate
    const scored = await Promise.all(
      delegates.map(async (delegate) => {
        const score = await this.scoreDelegate(delegate, preferences)
        return { delegate, score }
      })
    )

    // Rank by score
    const ranked = scored.sort((a, b) => b.score.total - a.score.total)

    return ranked.slice(0, 10).map(({ delegate, score }) => ({
      delegate,
      score,
      recommendation: this.generateDelegateRecommendation(delegate, score)
    }))
  }

  private async scoreDelegate(
    delegate: Delegate,
    preferences: DelegatePreferences
  ): Promise<DelegateScore> {
    const votingHistory = await this.getDelegateVotingHistory(delegate.address)

    const scores = {
      // Participation rate
      participation: votingHistory.votedProposals / votingHistory.totalProposals,

      // Alignment with user preferences
      alignment: this.calculateAlignmentScore(votingHistory, preferences),

      // Communication/transparency
      transparency: delegate.hasStatement ? 0.8 : 0,

      // Experience
      experience: Math.min(votingHistory.totalProposals / 100, 1),

      // Voting power concentration (lower is better)
      decentralization: 1 - (delegate.votingPower / preferences.totalVotingPower)
    }

    const weights = {
      participation: 0.25,
      alignment: 0.35,
      transparency: 0.15,
      experience: 0.15,
      decentralization: 0.10
    }

    const total = Object.entries(scores).reduce(
      (acc, [key, value]) => acc + value * weights[key],
      0
    )

    return { ...scores, total }
  }

  async monitorDelegations(wallets: string[]): Promise<DelegationReport> {
    const delegations: Delegation[] = []

    for (const wallet of wallets) {
      const walletDelegations = await this.getWalletDelegations(wallet)
      delegations.push(...walletDelegations)
    }

    // Check delegation health
    const issues: DelegationIssue[] = []

    for (const delegation of delegations) {
      // Check if delegate is active
      const delegateActivity = await this.getDelegateActivity(delegation.delegatee)
      if (delegateActivity.lastVote > 30 * 24 * 60 * 60 * 1000) { // 30 days
        issues.push({
          type: "inactive_delegate",
          delegation,
          message: "Delegate hasn't voted in 30+ days"
        })
      }

      // Check if voting power is being used
      const utilization = await this.getVotingPowerUtilization(delegation)
      if (utilization < 0.5) {
        issues.push({
          type: "low_utilization",
          delegation,
          message: `Only ${utilization * 100}% of voting power is being used`
        })
      }
    }

    return {
      totalDelegations: delegations.length,
      totalVotingPower: delegations.reduce((acc, d) => acc + d.votingPower, 0n),
      delegations,
      issues,
      recommendations: this.generateDelegationRecommendations(issues)
    }
  }
}
```

### 4. Governance Tracker Agent

Track governance activity across DAOs:

```typescript
class GovernanceTrackerAgent {
  private demos: Demos
  private trackedDAOs: Map<string, DAOConfig>

  async getGovernanceOverview(): Promise<GovernanceOverview> {
    const daoStatuses: DAOStatus[] = []

    for (const [id, dao] of this.trackedDAOs.entries()) {
      const status = await this.getDAOStatus(dao)
      daoStatuses.push(status)
    }

    return {
      totalDAOs: daoStatuses.length,
      activeProposals: daoStatuses.reduce((acc, d) => acc + d.activeProposals, 0),
      upcomingDeadlines: this.getUpcomingDeadlines(daoStatuses),
      recentActivity: await this.getRecentActivity(daoStatuses),
      myVotingPower: await this.getAggregatedVotingPower()
    }
  }

  async trackProposalChanges(
    daos: DAOConfig[]
  ): Promise<void> {
    // Subscribe to governance events
    for (const dao of daos) {
      await this.subscribeToGovernanceEvents(dao, async (event) => {
        switch (event.type) {
          case "ProposalCreated":
            await this.handleNewProposal(dao, event)
            break

          case "VoteCast":
            await this.handleVote(dao, event)
            break

          case "ProposalExecuted":
            await this.handleExecution(dao, event)
            break

          case "ProposalQueued":
            await this.handleQueued(dao, event)
            break
        }
      })
    }
  }

  private async handleNewProposal(dao: DAOConfig, event: GovernanceEvent) {
    // Analyze proposal
    const analysis = await this.analyzeProposal(event.proposal)

    // Send notification
    this.emit("new_proposal", {
      dao: dao.name,
      proposal: event.proposal,
      analysis,
      voteDeadline: event.proposal.endBlock,
      myVotingPower: await this.getVotingPower(dao)
    })
  }

  async generateGovernanceReport(
    period: "week" | "month" | "quarter"
  ): Promise<GovernanceReport> {
    const startTime = this.getPeriodStart(period)

    const report = {
      period,
      startTime,
      endTime: Date.now(),
      daos: [] as DAOReport[]
    }

    for (const [id, dao] of this.trackedDAOs.entries()) {
      const proposals = await this.getProposalsSince(dao, startTime)
      const votes = await this.getVotesSince(dao, startTime)

      report.daos.push({
        name: dao.name,
        proposalsCreated: proposals.length,
        proposalsPassed: proposals.filter(p => p.status === "executed").length,
        proposalsFailed: proposals.filter(p => p.status === "defeated").length,
        totalVotesCast: votes.length,
        participationRate: this.calculateParticipationRate(proposals, votes),
        topVoters: this.getTopVoters(votes),
        treasuryChanges: await this.getTreasuryChanges(dao, startTime)
      })
    }

    return report
  }
}
```

### 5. Snapshot Integration Agent

Gasless off-chain voting:

```typescript
class SnapshotAgent {
  private snapshotHub: string = "https://hub.snapshot.org"

  async vote(
    space: string,
    proposalId: string,
    choice: number | number[],
    reason?: string
  ): Promise<SnapshotVoteResult> {
    // Create vote message
    const message = {
      space,
      proposal: proposalId,
      type: Array.isArray(choice) ? "approval" : "single-choice",
      choice,
      reason: reason || "",
      app: "demos-agent"
    }

    // Sign message
    const signature = await this.signTypedData(message)

    // Submit to Snapshot
    const response = await fetch(`${this.snapshotHub}/graphql`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        query: `
          mutation {
            vote(
              space: "${space}"
              proposal: "${proposalId}"
              type: "${message.type}"
              choice: ${JSON.stringify(choice)}
              reason: "${reason || ""}"
            ) {
              id
            }
          }
        `
      })
    })

    const result = await response.json()

    return {
      success: !result.errors,
      voteId: result.data?.vote?.id,
      space,
      proposalId,
      choice
    }
  }

  async getActiveProposals(spaces: string[]): Promise<SnapshotProposal[]> {
    const query = `
      query {
        proposals(
          where: {
            space_in: ${JSON.stringify(spaces)},
            state: "active"
          },
          orderBy: "end",
          orderDirection: asc
        ) {
          id
          title
          body
          choices
          start
          end
          snapshot
          state
          author
          space { id name }
          scores_total
          scores
        }
      }
    `

    const response = await fetch(`${this.snapshotHub}/graphql`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ query })
    })

    const result = await response.json()
    return result.data.proposals
  }

  async createProposal(
    space: string,
    proposal: SnapshotProposalDraft
  ): Promise<SnapshotProposalResult> {
    const message = {
      space,
      type: proposal.type || "single-choice",
      title: proposal.title,
      body: proposal.body,
      choices: proposal.choices,
      start: Math.floor(Date.now() / 1000),
      end: Math.floor(Date.now() / 1000) + (proposal.durationDays * 24 * 60 * 60),
      snapshot: await this.getLatestBlock(),
      plugins: JSON.stringify({}),
      app: "demos-agent"
    }

    const signature = await this.signTypedData(message)

    const response = await fetch(`${this.snapshotHub}/graphql`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        query: `
          mutation {
            proposal(
              space: "${space}"
              type: "${message.type}"
              title: "${message.title}"
              body: "${message.body}"
              choices: ${JSON.stringify(message.choices)}
              start: ${message.start}
              end: ${message.end}
              snapshot: ${message.snapshot}
            ) {
              id
            }
          }
        `
      })
    })

    const result = await response.json()

    return {
      success: !result.errors,
      proposalId: result.data?.proposal?.id
    }
  }
}
```

## Governance Events

| Event | Description |
|-------|-------------|
| ProposalCreated | New proposal submitted |
| VoteCast | Vote recorded |
| ProposalQueued | Passed, awaiting timelock |
| ProposalExecuted | Actions executed |
| ProposalCanceled | Cancelled by proposer |

## Best Practices

1. **Read proposals carefully** before voting
2. **Check quorum** before deadline
3. **Monitor timelock** for execution timing
4. **Review delegate activity** regularly
5. **Diversify delegations** to reduce risk

## Integration with DemosWork

```typescript
const governanceWorkflow = new DemosWork()

// Step 1: Analyze proposal
governanceWorkflow.push(new BaseOperation(
  new NativeWorkStep({
    method: "governance.analyzeProposal",
    params: { proposalId }
  })
))

// Step 2: Conditional vote
const conditional = new ConditionalOperation()
conditional.if("{{step1.result.score}}", ">", 0.6)
  .then(new BaseOperation(
    new XmWorkStep({
      chain: "ethereum",
      method: "governance.vote",
      params: { proposalId, support: "for" }
    })
  ))

governanceWorkflow.push(conditional)
```

## Related Skills

- [Identity Resolution](./identity-resolution-agent.md) - Verify delegate identities
- [Event Monitoring](./event-monitoring-agent.md) - Track governance events
- [Messaging Agent](./messaging-agent.md) - Governance notifications
