# Staking Operations Agent Skill

> **⚠️ Prerequisites**: Complete [SDK Setup](./00-sdk-setup.md) first to configure your environment.

Build agents that manage staking, delegation, and reward distribution on Demos Network.

## Overview

Staking Operations enables agents to stake tokens, manage delegations, claim rewards, and participate in network consensus. Essential for validators, delegators, and automated yield optimization.

## SDK Reference

```typescript
import { Demos } from "@kynesyslabs/demosdk/websdk"

// Staking Methods
demos.stake(amount, validatorAddress)         // Stake tokens
demos.unstake(amount, validatorAddress)       // Unstake tokens
demos.redelegate(from, to, amount)            // Move delegation
demos.claimRewards(validatorAddress?)         // Claim staking rewards
demos.getStakingInfo(address)                 // Get staking details
demos.getValidators()                         // List active validators
demos.getDelegations(address)                 // Get user delegations
```

## Agent Use Cases

### 1. Auto-Compounding Agent

Automatically compound staking rewards:

```typescript
class AutoCompoundingAgent {
  private demos: Demos
  private compoundThreshold: bigint = 1000000000n // 1 DEM

  async checkAndCompound(): Promise<CompoundResult | null> {
    const address = await this.demos.wallet.getAddress()
    const delegations = await this.demos.getDelegations(address)

    let totalClaimed = 0n

    for (const delegation of delegations) {
      if (delegation.pendingRewards >= this.compoundThreshold) {
        // Claim rewards
        await this.demos.claimRewards(delegation.validatorAddress)
        totalClaimed += delegation.pendingRewards

        // Restake claimed rewards
        await this.demos.stake(
          delegation.pendingRewards,
          delegation.validatorAddress
        )
      }
    }

    if (totalClaimed > 0n) {
      return {
        claimed: totalClaimed,
        restaked: totalClaimed,
        timestamp: Date.now()
      }
    }

    return null
  }

  async startAutoCompounding(intervalMs: number = 86400000): Promise<void> {
    setInterval(async () => {
      const result = await this.checkAndCompound()
      if (result) {
        console.log(`Compounded ${result.claimed} DEM`)
      }
    }, intervalMs)
  }
}
```

### 2. Validator Selection Agent

Intelligently select validators for delegation:

```typescript
class ValidatorSelectionAgent {
  private demos: Demos

  async selectOptimalValidators(
    amount: bigint,
    criteria: SelectionCriteria
  ): Promise<ValidatorAllocation[]> {
    const validators = await this.demos.getValidators()

    // Score validators
    const scored = validators.map(v => ({
      validator: v,
      score: this.calculateScore(v, criteria)
    })).sort((a, b) => b.score - a.score)

    // Allocate across top validators
    const allocations: ValidatorAllocation[] = []
    const numValidators = Math.min(criteria.maxValidators || 5, scored.length)
    const amountPerValidator = amount / BigInt(numValidators)

    for (let i = 0; i < numValidators; i++) {
      allocations.push({
        validatorAddress: scored[i].validator.address,
        amount: amountPerValidator,
        score: scored[i].score
      })
    }

    return allocations
  }

  private calculateScore(
    validator: Validator,
    criteria: SelectionCriteria
  ): number {
    let score = 0

    // APY weight
    score += validator.apy * (criteria.apyWeight || 0.4)

    // Uptime weight
    score += validator.uptime * (criteria.uptimeWeight || 0.3)

    // Commission weight (lower is better)
    score += (1 - validator.commission) * (criteria.commissionWeight || 0.2)

    // Decentralization (prefer smaller validators)
    const stakingRatio = validator.totalStaked / validator.maxCapacity
    score += (1 - stakingRatio) * (criteria.decentralizationWeight || 0.1)

    return score
  }

  async executeDelegation(
    allocations: ValidatorAllocation[]
  ): Promise<DelegationResult[]> {
    const results: DelegationResult[] = []

    for (const allocation of allocations) {
      const result = await this.demos.stake(
        allocation.amount,
        allocation.validatorAddress
      )
      results.push({
        validator: allocation.validatorAddress,
        amount: allocation.amount,
        txHash: result.hash
      })
    }

    return results
  }
}
```

### 3. Reward Distribution Agent

Distribute staking rewards to stakeholders:

```typescript
class RewardDistributionAgent {
  private demos: Demos

  async distributePoolRewards(
    poolAddress: string,
    stakeholders: Stakeholder[]
  ): Promise<DistributionResult> {
    // Claim all rewards for the pool
    const rewards = await this.demos.claimRewards()

    if (rewards.amount === 0n) {
      return { distributed: 0n, recipients: 0 }
    }

    // Calculate shares
    const totalShares = stakeholders.reduce((sum, s) => sum + s.shares, 0n)
    const distributions: Distribution[] = []

    for (const stakeholder of stakeholders) {
      const share = (rewards.amount * stakeholder.shares) / totalShares
      distributions.push({
        address: stakeholder.address,
        amount: share
      })
    }

    // Batch distribute
    const transactions = distributions.map(d => ({
      type: "transfer",
      content: { to: d.address, amount: d.amount.toString() }
    }))

    const batch = await this.demos.prepareBatchTransactions(transactions)
    const result = await this.demos.insertBatchTransactions(batch)

    return {
      distributed: rewards.amount,
      recipients: stakeholders.length,
      txHash: result.hash
    }
  }
}
```

## Best Practices

1. **Diversify delegations** across multiple validators
2. **Monitor validator performance** regularly
3. **Auto-compound** for maximum yield
4. **Consider unbonding periods** before unstaking
5. **Track reward history** for tax purposes

## Related Skills

- [Governance Agent](./governance-agent.md) - Participate in governance
- [Yield Optimization](./yield-optimization-agent.md) - Maximize returns
