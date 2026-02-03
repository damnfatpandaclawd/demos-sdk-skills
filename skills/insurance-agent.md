# Insurance Agent Skill

Build agents that provide and manage DeFi insurance coverage.

## Overview

Insurance Agent enables underwriting, claims processing, and risk pooling for DeFi protocols. Essential for protecting against smart contract risks, oracle failures, and protocol exploits.

## SDK Reference

```typescript
import { Demos } from "@kynesyslabs/demosdk/websdk"
import { EVM } from "@kynesyslabs/demosdk/xm-websdk"
import { StorageProgram } from "@kynesyslabs/demosdk/storage"

// Insurance protocol interactions
const storage = await demos.storage.getProgram()
```

## Agent Use Cases

### 1. Underwriting Engine

Assess and price insurance risks:

```typescript
class UnderwritingEngine {
  private riskModels: Map<string, RiskModel> = new Map()
  private historicalData: Map<string, ProtocolHistory> = new Map()

  async assessProtocolRisk(protocol: string): Promise<RiskAssessment> {
    const [
      contractRisk,
      oracleRisk,
      economicRisk,
      operationalRisk,
      historicalRisk
    ] = await Promise.all([
      this.assessContractRisk(protocol),
      this.assessOracleRisk(protocol),
      this.assessEconomicRisk(protocol),
      this.assessOperationalRisk(protocol),
      this.assessHistoricalRisk(protocol)
    ])

    // Weighted risk score
    const weights = {
      contract: 0.30,
      oracle: 0.20,
      economic: 0.25,
      operational: 0.15,
      historical: 0.10
    }

    const totalRiskScore =
      contractRisk.score * weights.contract +
      oracleRisk.score * weights.oracle +
      economicRisk.score * weights.economic +
      operationalRisk.score * weights.operational +
      historicalRisk.score * weights.historical

    return {
      protocol,
      totalRiskScore,
      riskCategory: this.categorizeRisk(totalRiskScore),
      components: {
        contract: contractRisk,
        oracle: oracleRisk,
        economic: economicRisk,
        operational: operationalRisk,
        historical: historicalRisk
      },
      timestamp: Date.now()
    }
  }

  private async assessContractRisk(protocol: string): Promise<ComponentRisk> {
    let score = 0
    const factors: RiskFactor[] = []

    // Check audit status
    const audits = await this.getAudits(protocol)
    if (audits.length === 0) {
      score += 30
      factors.push({ name: "no_audit", impact: 30, description: "No security audits" })
    } else if (audits.some(a => a.severity === "critical")) {
      score += 20
      factors.push({ name: "critical_findings", impact: 20, description: "Critical audit findings" })
    }

    // Check code complexity
    const complexity = await this.analyzeComplexity(protocol)
    score += complexity.score * 0.2
    factors.push({ name: "complexity", impact: complexity.score * 0.2, description: `Complexity: ${complexity.level}` })

    // Check upgrade patterns
    const upgradeability = await this.checkUpgradeability(protocol)
    if (upgradeability.isUpgradeable && !upgradeability.hasTimelock) {
      score += 15
      factors.push({ name: "no_timelock", impact: 15, description: "Upgradeable without timelock" })
    }

    return { score: Math.min(100, score), factors }
  }

  async calculatePremium(params: PremiumParams): Promise<PremiumQuote> {
    const riskAssessment = await this.assessProtocolRisk(params.protocol)

    // Base rate from risk score
    const baseRate = this.riskToBaseRate(riskAssessment.totalRiskScore)

    // Adjust for coverage amount
    const coverageMultiplier = this.getCoverageMultiplier(params.coverageAmount)

    // Adjust for duration
    const durationMultiplier = this.getDurationMultiplier(params.duration)

    // Adjust for pool capacity
    const capacityMultiplier = await this.getCapacityMultiplier(params.protocol)

    const annualPremiumRate = baseRate * coverageMultiplier * durationMultiplier * capacityMultiplier

    const premium = (params.coverageAmount * BigInt(Math.floor(annualPremiumRate * 10000)) *
      BigInt(params.duration)) / (BigInt(365 * 24 * 60 * 60 * 1000) * 10000n)

    return {
      coverageAmount: params.coverageAmount,
      duration: params.duration,
      premium,
      annualPremiumRate,
      riskScore: riskAssessment.totalRiskScore,
      validUntil: Date.now() + 3600000, // 1 hour
      breakdown: {
        baseRate,
        coverageMultiplier,
        durationMultiplier,
        capacityMultiplier
      }
    }
  }

  private riskToBaseRate(riskScore: number): number {
    // Higher risk = higher premium
    if (riskScore >= 80) return 0.15  // 15% annually
    if (riskScore >= 60) return 0.08  // 8% annually
    if (riskScore >= 40) return 0.04  // 4% annually
    if (riskScore >= 20) return 0.02  // 2% annually
    return 0.01 // 1% annually
  }
}
```

### 2. Claims Processor

Handle insurance claims:

```typescript
class ClaimsProcessor {
  private claims: Map<string, InsuranceClaim> = new Map()
  private validators: string[] = []

  async submitClaim(params: ClaimParams): Promise<ClaimSubmission> {
    // Verify active policy
    const policy = await this.getPolicy(params.policyId)
    if (!policy || policy.status !== "active") {
      throw new Error("Invalid or inactive policy")
    }

    // Verify claim is within coverage period
    if (params.incidentDate < policy.startDate || params.incidentDate > policy.endDate) {
      throw new Error("Incident outside coverage period")
    }

    const claimId = this.generateClaimId()

    const claim: InsuranceClaim = {
      id: claimId,
      policyId: params.policyId,
      claimant: params.claimant,
      protocol: policy.protocol,
      incidentDate: params.incidentDate,
      incidentType: params.incidentType,
      claimedAmount: params.claimedAmount,
      evidence: params.evidence,
      status: "submitted",
      submittedAt: Date.now()
    }

    this.claims.set(claimId, claim)

    // Start validation process
    this.startValidation(claimId)

    return {
      claimId,
      status: "submitted",
      expectedResolution: Date.now() + 7 * 24 * 60 * 60 * 1000 // 7 days
    }
  }

  private async startValidation(claimId: string): Promise<void> {
    const claim = this.claims.get(claimId)!

    claim.status = "validating"

    // Verify incident occurred
    const incidentVerified = await this.verifyIncident(claim)

    if (!incidentVerified) {
      claim.status = "rejected"
      claim.rejectionReason = "Incident could not be verified"
      return
    }

    // Verify claimant loss
    const lossVerified = await this.verifyLoss(claim)

    if (!lossVerified) {
      claim.status = "rejected"
      claim.rejectionReason = "Loss could not be verified"
      return
    }

    // Calculate approved amount
    const approvedAmount = await this.calculateApprovedAmount(claim)

    claim.approvedAmount = approvedAmount
    claim.status = "approved"

    // Queue for payout
    await this.queuePayout(claimId)
  }

  private async verifyIncident(claim: InsuranceClaim): Promise<boolean> {
    // Check on-chain evidence
    const incidentType = claim.incidentType

    switch (incidentType) {
      case "exploit":
        return await this.verifyExploit(claim)
      case "oracle_failure":
        return await this.verifyOracleFailure(claim)
      case "liquidation":
        return await this.verifyLiquidation(claim)
      case "rug_pull":
        return await this.verifyRugPull(claim)
      default:
        return false
    }
  }

  private async verifyExploit(claim: InsuranceClaim): Promise<boolean> {
    // Check for abnormal transactions
    const txs = await this.getProtocolTransactions(
      claim.protocol,
      claim.incidentDate - 3600000,
      claim.incidentDate + 3600000
    )

    // Look for signs of exploit
    const suspicious = txs.filter(tx =>
      tx.value > this.getAverageValue(claim.protocol) * 100n ||
      tx.success === false && tx.gasUsed > 1000000n
    )

    return suspicious.length > 0
  }

  private async calculateApprovedAmount(claim: InsuranceClaim): Promise<bigint> {
    const policy = await this.getPolicy(claim.policyId)

    // Verify actual loss
    const actualLoss = await this.calculateActualLoss(claim)

    // Cap at coverage amount
    const cappedAmount = actualLoss > policy.coverageAmount
      ? policy.coverageAmount
      : actualLoss

    // Apply deductible
    const deductible = (policy.coverageAmount * policy.deductiblePercent) / 10000n
    const afterDeductible = cappedAmount > deductible
      ? cappedAmount - deductible
      : 0n

    return afterDeductible
  }

  async processPayout(claimId: string): Promise<PayoutResult> {
    const claim = this.claims.get(claimId)

    if (!claim || claim.status !== "approved") {
      throw new Error("Claim not approved")
    }

    // Execute payout
    const tx = await this.insurancePool.payout(
      claim.claimant,
      claim.approvedAmount!
    )

    claim.status = "paid"
    claim.paidAt = Date.now()
    claim.payoutTx = tx.hash

    return {
      claimId,
      amount: claim.approvedAmount!,
      recipient: claim.claimant,
      txHash: tx.hash
    }
  }
}
```

### 3. Risk Pool Manager

Manage insurance capital pools:

```typescript
class RiskPoolManager {
  private pools: Map<string, RiskPool> = new Map()
  private stakers: Map<string, StakerPosition[]> = new Map()

  async createPool(params: PoolParams): Promise<RiskPool> {
    const poolId = this.generatePoolId()

    const pool: RiskPool = {
      id: poolId,
      name: params.name,
      coveredProtocols: params.coveredProtocols,
      totalStaked: 0n,
      availableCapacity: 0n,
      utilizationRate: 0,
      activeCoverage: 0n,
      pendingClaims: 0n,
      rewardRate: params.rewardRate,
      lockupPeriod: params.lockupPeriod,
      createdAt: Date.now()
    }

    this.pools.set(poolId, pool)

    return pool
  }

  async stake(
    poolId: string,
    amount: bigint,
    staker: string
  ): Promise<StakeResult> {
    const pool = this.pools.get(poolId)
    if (!pool) throw new Error("Pool not found")

    // Transfer tokens to pool
    const tx = await this.poolContract(poolId).stake(amount)

    pool.totalStaked += amount
    pool.availableCapacity += amount
    this.updateUtilization(pool)

    // Record staker position
    const position: StakerPosition = {
      id: this.generatePositionId(),
      poolId,
      staker,
      amount,
      stakedAt: Date.now(),
      unlockAt: Date.now() + pool.lockupPeriod,
      rewardsEarned: 0n,
      rewardsClaimed: 0n
    }

    if (!this.stakers.has(staker)) {
      this.stakers.set(staker, [])
    }
    this.stakers.get(staker)!.push(position)

    return {
      positionId: position.id,
      poolId,
      amount,
      unlockAt: position.unlockAt,
      txHash: tx.hash
    }
  }

  async unstake(
    positionId: string,
    staker: string
  ): Promise<UnstakeResult> {
    const positions = this.stakers.get(staker) || []
    const position = positions.find(p => p.id === positionId)

    if (!position) {
      throw new Error("Position not found")
    }

    if (Date.now() < position.unlockAt) {
      throw new Error("Position still locked")
    }

    const pool = this.pools.get(position.poolId)!

    // Check if pool has capacity
    const netCapacity = pool.availableCapacity - position.amount
    if (netCapacity < 0n) {
      throw new Error("Insufficient pool capacity for unstake")
    }

    // Claim pending rewards
    const rewards = await this.calculateRewards(position)
    position.rewardsEarned += rewards

    const totalWithdraw = position.amount + position.rewardsEarned - position.rewardsClaimed

    // Execute unstake
    const tx = await this.poolContract(position.poolId).unstake(totalWithdraw)

    pool.totalStaked -= position.amount
    pool.availableCapacity -= position.amount
    this.updateUtilization(pool)

    // Remove position
    const index = positions.indexOf(position)
    positions.splice(index, 1)

    return {
      amount: position.amount,
      rewards: position.rewardsEarned - position.rewardsClaimed,
      total: totalWithdraw,
      txHash: tx.hash
    }
  }

  async reserveCapacity(
    poolId: string,
    amount: bigint,
    policyId: string
  ): Promise<boolean> {
    const pool = this.pools.get(poolId)
    if (!pool) throw new Error("Pool not found")

    if (pool.availableCapacity < amount) {
      return false
    }

    pool.availableCapacity -= amount
    pool.activeCoverage += amount
    this.updateUtilization(pool)

    return true
  }

  async releaseCapacity(
    poolId: string,
    amount: bigint,
    policyId: string
  ): Promise<void> {
    const pool = this.pools.get(poolId)
    if (!pool) return

    pool.availableCapacity += amount
    pool.activeCoverage -= amount
    this.updateUtilization(pool)
  }

  private updateUtilization(pool: RiskPool): void {
    if (pool.totalStaked === 0n) {
      pool.utilizationRate = 0
    } else {
      pool.utilizationRate = Number(pool.activeCoverage * 10000n / pool.totalStaked) / 100
    }
  }

  async calculateRewards(position: StakerPosition): Promise<bigint> {
    const pool = this.pools.get(position.poolId)!
    const timeStaked = Date.now() - position.stakedAt

    // Base rewards from staking
    const baseRewards = (position.amount * BigInt(pool.rewardRate) * BigInt(timeStaked)) /
      (BigInt(365 * 24 * 60 * 60 * 1000) * 10000n)

    // Bonus for higher utilization
    const utilizationBonus = pool.utilizationRate > 50
      ? (baseRewards * BigInt(pool.utilizationRate - 50)) / 100n
      : 0n

    return baseRewards + utilizationBonus - position.rewardsClaimed
  }
}
```

## Best Practices

1. **Use multiple validators** for claim verification
2. **Maintain adequate reserves** for claims
3. **Diversify coverage** across protocols
4. **Update risk models** regularly
5. **Implement proper lockups** to ensure solvency

## Related Skills

- [Risk Assessment Agent](./risk-assessment-agent.md) - Risk analysis
- [Contract Analyzer Agent](./contract-analyzer-agent.md) - Smart contract auditing
- [Oracle Agent](./price-oracle-agent.md) - Price verification
