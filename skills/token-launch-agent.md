# Token Launch Agent Skill

Build agents that manage token launches, liquidity bootstrapping, and fair distribution.

## Overview

Token Launch Agent enables automated token deployment, liquidity bootstrapping pool management, and fair launch mechanisms. Essential for decentralized token distribution, price discovery, and community-first launches.

## SDK Reference

```typescript
import { Demos } from "@kynesyslabs/demosdk/websdk"
import { EVM } from "@kynesyslabs/demosdk/xm-websdk"
import { DemosWork, BaseOperation } from "@kynesyslabs/demoswork"

// Token launch operations
const evm = await EVM.create("https://rpc.ankr.com/eth")
```

## Agent Use Cases

### 1. Liquidity Bootstrapping Pool Manager

Manage LBP for fair price discovery:

```typescript
class LBPManager {
  private pool: LBPPool | null = null
  private priceHistory: PricePoint[] = []
  private weightSchedule: WeightPoint[] = []

  async createLBP(config: LBPConfig): Promise<LBPPool> {
    // Validate configuration
    this.validateConfig(config)

    // Calculate weight schedule
    this.weightSchedule = this.calculateWeightSchedule(
      config.startWeight,
      config.endWeight,
      config.duration
    )

    // Deploy LBP contract
    const factory = new ethers.Contract(
      config.factoryAddress,
      LBP_FACTORY_ABI,
      this.signer
    )

    const tx = await factory.create(
      config.projectToken,
      config.baseToken,
      config.projectTokenAmount,
      config.baseTokenAmount,
      config.startWeight, // e.g., 96% project token
      config.endWeight,   // e.g., 50% project token
      config.swapFee,     // e.g., 0.5%
      config.owner,
      config.startTime,
      config.endTime
    )

    const receipt = await tx.wait()
    const poolAddress = this.extractPoolAddress(receipt)

    this.pool = {
      address: poolAddress,
      projectToken: config.projectToken,
      baseToken: config.baseToken,
      startTime: config.startTime,
      endTime: config.endTime,
      startWeight: config.startWeight,
      endWeight: config.endWeight,
      totalRaised: 0n,
      tokensSold: 0n,
      participants: new Set(),
      status: "pending"
    }

    return this.pool
  }

  private calculateWeightSchedule(
    startWeight: number,
    endWeight: number,
    duration: number
  ): WeightPoint[] {
    const schedule: WeightPoint[] = []
    const steps = 100 // Granularity of weight changes

    for (let i = 0; i <= steps; i++) {
      const progress = i / steps
      const timestamp = progress * duration
      const weight = startWeight - (startWeight - endWeight) * progress

      schedule.push({
        timestamp,
        projectWeight: weight,
        baseWeight: 100 - weight
      })
    }

    return schedule
  }

  async getCurrentPrice(): Promise<PriceInfo> {
    if (!this.pool) throw new Error("Pool not initialized")

    const poolContract = new ethers.Contract(
      this.pool.address,
      LBP_POOL_ABI,
      this.provider
    )

    const [projectBalance, baseBalance] = await poolContract.getBalances()
    const weights = await poolContract.getNormalizedWeights()

    // Calculate spot price using weighted formula
    // Price = (baseBalance / baseWeight) / (projectBalance / projectWeight)
    const price = (Number(baseBalance) * weights.projectWeight) /
                  (Number(projectBalance) * weights.baseWeight)

    const pricePoint: PricePoint = {
      timestamp: Date.now(),
      price,
      projectBalance,
      baseBalance,
      weights
    }

    this.priceHistory.push(pricePoint)

    return {
      currentPrice: price,
      projectWeight: weights.projectWeight,
      baseWeight: weights.baseWeight,
      projectBalance,
      baseBalance,
      priceChange24h: this.calculatePriceChange(24),
      volumeWeighted: this.calculateVWAP()
    }
  }

  async monitorAndProtect(config: ProtectionConfig): Promise<void> {
    if (!this.pool) throw new Error("Pool not initialized")

    const checkInterval = setInterval(async () => {
      const priceInfo = await this.getCurrentPrice()

      // Check for manipulation attempts
      const manipulation = await this.detectManipulation(priceInfo)
      if (manipulation.detected) {
        await this.handleManipulation(manipulation)
      }

      // Check for whale purchases
      const recentSwaps = await this.getRecentSwaps()
      for (const swap of recentSwaps) {
        if (swap.amount > config.maxPurchaseAmount) {
          await this.flagLargePurchase(swap)
        }
      }

      // Update price bounds if configured
      if (config.dynamicBounds) {
        await this.updatePriceBounds(priceInfo)
      }

    }, config.checkInterval || 30000)

    // Cleanup on pool end
    setTimeout(() => {
      clearInterval(checkInterval)
      this.finalizePool()
    }, this.pool.endTime - Date.now())
  }

  private async detectManipulation(
    priceInfo: PriceInfo
  ): Promise<ManipulationResult> {
    const recentPrices = this.priceHistory.slice(-20)

    // Calculate expected price based on weight schedule
    const expectedPrice = this.calculateExpectedPrice()

    // Check deviation from expected
    const deviation = Math.abs(priceInfo.currentPrice - expectedPrice) / expectedPrice

    // Check for rapid price changes
    const rapidChange = this.detectRapidPriceChange(recentPrices)

    // Check for unusual volume
    const unusualVolume = await this.detectUnusualVolume()

    return {
      detected: deviation > 0.2 || rapidChange || unusualVolume,
      type: deviation > 0.2 ? "price_deviation" :
            rapidChange ? "rapid_change" : "volume_spike",
      severity: deviation > 0.5 ? "high" : "medium",
      details: { deviation, rapidChange, unusualVolume }
    }
  }

  async finalizePool(): Promise<LBPResult> {
    if (!this.pool) throw new Error("Pool not initialized")

    const finalPrice = await this.getCurrentPrice()

    // Calculate statistics
    const stats = this.calculatePoolStats()

    // Disable swaps
    await this.disableTrading()

    // Calculate distribution
    const distribution = await this.calculateFinalDistribution()

    this.pool.status = "completed"

    return {
      poolAddress: this.pool.address,
      totalRaised: this.pool.totalRaised,
      tokensSold: this.pool.tokensSold,
      participants: this.pool.participants.size,
      finalPrice: finalPrice.currentPrice,
      averagePrice: stats.averagePrice,
      priceRange: stats.priceRange,
      distribution,
      endTime: Date.now()
    }
  }

  private calculatePoolStats(): PoolStats {
    const prices = this.priceHistory.map(p => p.price)

    return {
      averagePrice: prices.reduce((a, b) => a + b, 0) / prices.length,
      minPrice: Math.min(...prices),
      maxPrice: Math.max(...prices),
      priceRange: Math.max(...prices) - Math.min(...prices),
      volatility: this.calculateVolatility(prices),
      vwap: this.calculateVWAP()
    }
  }
}
```

### 2. Fair Launch Coordinator

Coordinate fair token launches with anti-bot protection:

```typescript
class FairLaunchCoordinator {
  private whitelist: Map<string, WhitelistEntry> = new Map()
  private commitments: Map<string, Commitment> = new Map()
  private revealed: Map<string, RevealedCommitment> = new Map()

  async setupFairLaunch(config: FairLaunchConfig): Promise<FairLaunch> {
    const launch: FairLaunch = {
      id: `launch_${Date.now()}`,
      token: config.tokenAddress,
      totalAllocation: config.totalAllocation,
      phases: {
        whitelist: {
          start: config.whitelistStart,
          end: config.whitelistEnd
        },
        commitment: {
          start: config.commitmentStart,
          end: config.commitmentEnd
        },
        reveal: {
          start: config.revealStart,
          end: config.revealEnd
        },
        distribution: {
          start: config.distributionStart
        }
      },
      limits: {
        minContribution: config.minContribution,
        maxContribution: config.maxContribution,
        maxParticipants: config.maxParticipants
      },
      antiBot: config.antiBot || this.getDefaultAntiBotConfig(),
      status: "setup"
    }

    return launch
  }

  async addToWhitelist(
    addresses: string[],
    tier: WhitelistTier
  ): Promise<WhitelistResult> {
    const added: string[] = []
    const rejected: { address: string; reason: string }[] = []

    for (const address of addresses) {
      // Verify address
      if (!ethers.isAddress(address)) {
        rejected.push({ address, reason: "Invalid address" })
        continue
      }

      // Check for duplicates
      if (this.whitelist.has(address)) {
        rejected.push({ address, reason: "Already whitelisted" })
        continue
      }

      // Check address history
      const history = await this.checkAddressHistory(address)
      if (history.suspicious) {
        rejected.push({ address, reason: history.reason })
        continue
      }

      this.whitelist.set(address, {
        address,
        tier,
        allocation: this.getTierAllocation(tier),
        addedAt: Date.now()
      })

      added.push(address)
    }

    return { added, rejected, totalWhitelisted: this.whitelist.size }
  }

  async submitCommitment(
    participant: string,
    commitment: string, // Hash of (amount + salt)
    proof: MerkleProof
  ): Promise<CommitmentResult> {
    // Verify whitelist
    const whitelistEntry = this.whitelist.get(participant)
    if (!whitelistEntry) {
      return { success: false, error: "Not whitelisted" }
    }

    // Verify Merkle proof
    if (!this.verifyMerkleProof(participant, proof)) {
      return { success: false, error: "Invalid proof" }
    }

    // Check timing
    const now = Date.now()
    const launch = await this.getCurrentLaunch()
    if (now < launch.phases.commitment.start ||
        now > launch.phases.commitment.end) {
      return { success: false, error: "Commitment phase not active" }
    }

    // Check for existing commitment
    if (this.commitments.has(participant)) {
      return { success: false, error: "Already committed" }
    }

    // Store commitment
    this.commitments.set(participant, {
      participant,
      commitmentHash: commitment,
      timestamp: now,
      tier: whitelistEntry.tier
    })

    return {
      success: true,
      commitmentId: commitment,
      deadline: launch.phases.reveal.end
    }
  }

  async revealCommitment(
    participant: string,
    amount: bigint,
    salt: string
  ): Promise<RevealResult> {
    const commitment = this.commitments.get(participant)
    if (!commitment) {
      return { success: false, error: "No commitment found" }
    }

    // Verify hash
    const computedHash = ethers.keccak256(
      ethers.AbiCoder.defaultAbiCoder().encode(
        ["address", "uint256", "bytes32"],
        [participant, amount, salt]
      )
    )

    if (computedHash !== commitment.commitmentHash) {
      return { success: false, error: "Hash mismatch" }
    }

    // Verify amount within limits
    const whitelistEntry = this.whitelist.get(participant)!
    if (amount > whitelistEntry.allocation) {
      return { success: false, error: "Amount exceeds allocation" }
    }

    // Store revealed commitment
    this.revealed.set(participant, {
      ...commitment,
      amount,
      salt,
      revealedAt: Date.now()
    })

    return {
      success: true,
      amount,
      allocation: await this.calculateAllocation(participant, amount)
    }
  }

  async calculateFinalAllocations(): Promise<AllocationResult[]> {
    const allocations: AllocationResult[] = []
    const totalCommitted = this.getTotalCommitted()
    const launch = await this.getCurrentLaunch()

    // Check if oversubscribed
    const oversubscribed = totalCommitted > launch.totalAllocation

    for (const [participant, revealed] of this.revealed) {
      let allocation: bigint

      if (oversubscribed) {
        // Pro-rata allocation
        allocation = (revealed.amount * launch.totalAllocation) / totalCommitted
      } else {
        // Full allocation
        allocation = revealed.amount
      }

      // Calculate token amount based on final price
      const tokenAmount = await this.calculateTokenAmount(allocation)

      allocations.push({
        participant,
        contributed: revealed.amount,
        allocated: allocation,
        tokenAmount,
        refund: revealed.amount - allocation
      })
    }

    return allocations
  }

  async distributeTokens(): Promise<DistributionResult> {
    const allocations = await this.calculateFinalAllocations()
    const results: TokenDistribution[] = []

    for (const allocation of allocations) {
      try {
        // Transfer tokens
        const tx = await this.tokenContract.transfer(
          allocation.participant,
          allocation.tokenAmount
        )
        await tx.wait()

        // Process refund if any
        if (allocation.refund > 0n) {
          await this.processRefund(allocation.participant, allocation.refund)
        }

        results.push({
          participant: allocation.participant,
          tokenAmount: allocation.tokenAmount,
          refundAmount: allocation.refund,
          success: true
        })
      } catch (error) {
        results.push({
          participant: allocation.participant,
          tokenAmount: 0n,
          refundAmount: allocation.contributed,
          success: false,
          error: (error as Error).message
        })
      }
    }

    return {
      totalDistributed: results.filter(r => r.success).length,
      totalFailed: results.filter(r => !r.success).length,
      distributions: results
    }
  }

  private getDefaultAntiBotConfig(): AntiBotConfig {
    return {
      maxGasPrice: 100n * 10n ** 9n, // 100 gwei
      minBlockDelay: 2,
      requireProof: true,
      contractBlacklist: true,
      sybilDetection: true
    }
  }
}
```

### 3. Token Vesting Manager

Manage token vesting schedules for launches:

```typescript
class TokenVestingManager {
  private vestingSchedules: Map<string, VestingSchedule> = new Map()
  private claimHistory: Map<string, Claim[]> = new Map()

  async createVestingSchedule(
    beneficiary: string,
    config: VestingConfig
  ): Promise<VestingSchedule> {
    const schedule: VestingSchedule = {
      id: `vesting_${beneficiary}_${Date.now()}`,
      beneficiary,
      totalAmount: config.totalAmount,
      startTime: config.startTime,
      cliffDuration: config.cliffDuration,
      vestingDuration: config.vestingDuration,
      slicePeriod: config.slicePeriod || 2592000, // Monthly default
      revocable: config.revocable || false,
      claimed: 0n,
      revoked: false,
      createdAt: Date.now()
    }

    this.vestingSchedules.set(schedule.id, schedule)

    return schedule
  }

  async createBulkVesting(
    allocations: VestingAllocation[],
    commonConfig: Partial<VestingConfig>
  ): Promise<BulkVestingResult> {
    const schedules: VestingSchedule[] = []
    const errors: { beneficiary: string; error: string }[] = []

    for (const allocation of allocations) {
      try {
        const schedule = await this.createVestingSchedule(
          allocation.beneficiary,
          {
            totalAmount: allocation.amount,
            startTime: commonConfig.startTime || Date.now(),
            cliffDuration: allocation.cliffDuration || commonConfig.cliffDuration || 0,
            vestingDuration: allocation.vestingDuration || commonConfig.vestingDuration || 31536000,
            slicePeriod: commonConfig.slicePeriod,
            revocable: allocation.revocable ?? commonConfig.revocable
          }
        )

        schedules.push(schedule)
      } catch (error) {
        errors.push({
          beneficiary: allocation.beneficiary,
          error: (error as Error).message
        })
      }
    }

    return {
      created: schedules.length,
      failed: errors.length,
      schedules,
      errors,
      totalVested: schedules.reduce((sum, s) => sum + s.totalAmount, 0n)
    }
  }

  calculateVestedAmount(schedule: VestingSchedule): VestedInfo {
    const now = Date.now()

    // Before start
    if (now < schedule.startTime) {
      return {
        vested: 0n,
        unvested: schedule.totalAmount,
        claimable: 0n,
        nextVestingTime: schedule.startTime + schedule.cliffDuration,
        percentVested: 0
      }
    }

    // During cliff
    const cliffEnd = schedule.startTime + schedule.cliffDuration
    if (now < cliffEnd) {
      return {
        vested: 0n,
        unvested: schedule.totalAmount,
        claimable: 0n,
        nextVestingTime: cliffEnd,
        percentVested: 0
      }
    }

    // Calculate vested amount
    const vestingEnd = schedule.startTime + schedule.cliffDuration + schedule.vestingDuration
    const elapsed = Math.min(now - cliffEnd, schedule.vestingDuration)
    const vestingProgress = elapsed / schedule.vestingDuration

    // Calculate by slice periods
    const slicesPassed = Math.floor(elapsed / schedule.slicePeriod)
    const totalSlices = Math.ceil(schedule.vestingDuration / schedule.slicePeriod)
    const vestedSlices = Math.min(slicesPassed, totalSlices)

    const vested = (schedule.totalAmount * BigInt(vestedSlices)) / BigInt(totalSlices)
    const claimable = vested - schedule.claimed

    // Calculate next vesting time
    const nextSliceTime = cliffEnd + (slicesPassed + 1) * schedule.slicePeriod

    return {
      vested,
      unvested: schedule.totalAmount - vested,
      claimable,
      nextVestingTime: now >= vestingEnd ? 0 : nextSliceTime,
      percentVested: vestingProgress * 100
    }
  }

  async claim(scheduleId: string): Promise<ClaimResult> {
    const schedule = this.vestingSchedules.get(scheduleId)
    if (!schedule) {
      return { success: false, error: "Schedule not found" }
    }

    if (schedule.revoked) {
      return { success: false, error: "Schedule has been revoked" }
    }

    const vestedInfo = this.calculateVestedAmount(schedule)

    if (vestedInfo.claimable === 0n) {
      return { success: false, error: "Nothing to claim" }
    }

    // Transfer tokens
    const tx = await this.tokenContract.transfer(
      schedule.beneficiary,
      vestedInfo.claimable
    )
    await tx.wait()

    // Update schedule
    schedule.claimed += vestedInfo.claimable

    // Record claim
    const claim: Claim = {
      scheduleId,
      amount: vestedInfo.claimable,
      timestamp: Date.now(),
      txHash: tx.hash
    }

    if (!this.claimHistory.has(scheduleId)) {
      this.claimHistory.set(scheduleId, [])
    }
    this.claimHistory.get(scheduleId)!.push(claim)

    return {
      success: true,
      claimed: vestedInfo.claimable,
      remaining: schedule.totalAmount - schedule.claimed,
      txHash: tx.hash
    }
  }

  async revokeSchedule(
    scheduleId: string,
    reason: string
  ): Promise<RevokeResult> {
    const schedule = this.vestingSchedules.get(scheduleId)
    if (!schedule) {
      return { success: false, error: "Schedule not found" }
    }

    if (!schedule.revocable) {
      return { success: false, error: "Schedule is not revocable" }
    }

    if (schedule.revoked) {
      return { success: false, error: "Already revoked" }
    }

    // Calculate what's already vested
    const vestedInfo = this.calculateVestedAmount(schedule)

    // Mark as revoked
    schedule.revoked = true

    // Return unvested tokens to treasury
    const unvestedAmount = vestedInfo.unvested

    return {
      success: true,
      vestedAmount: vestedInfo.vested,
      claimedAmount: schedule.claimed,
      returnedAmount: unvestedAmount,
      reason,
      revokedAt: Date.now()
    }
  }

  async generateVestingReport(beneficiary: string): Promise<VestingReport> {
    const schedules = Array.from(this.vestingSchedules.values())
      .filter(s => s.beneficiary === beneficiary)

    const report: VestingReport = {
      beneficiary,
      schedules: [],
      totals: {
        totalAllocated: 0n,
        totalVested: 0n,
        totalClaimed: 0n,
        totalClaimable: 0n
      }
    }

    for (const schedule of schedules) {
      const vestedInfo = this.calculateVestedAmount(schedule)
      const claims = this.claimHistory.get(schedule.id) || []

      report.schedules.push({
        id: schedule.id,
        totalAmount: schedule.totalAmount,
        ...vestedInfo,
        claimed: schedule.claimed,
        claimHistory: claims,
        status: schedule.revoked ? "revoked" :
                vestedInfo.percentVested >= 100 ? "fully_vested" :
                vestedInfo.percentVested > 0 ? "vesting" : "cliff"
      })

      report.totals.totalAllocated += schedule.totalAmount
      report.totals.totalVested += vestedInfo.vested
      report.totals.totalClaimed += schedule.claimed
      report.totals.totalClaimable += vestedInfo.claimable
    }

    return report
  }

  async automateClaimsForBeneficiary(
    beneficiary: string,
    config: AutoClaimConfig
  ): Promise<void> {
    const schedules = Array.from(this.vestingSchedules.values())
      .filter(s => s.beneficiary === beneficiary && !s.revoked)

    for (const schedule of schedules) {
      // Set up periodic claim checks
      setInterval(async () => {
        const vestedInfo = this.calculateVestedAmount(schedule)

        if (vestedInfo.claimable >= config.minClaimAmount) {
          const result = await this.claim(schedule.id)

          if (result.success && config.onClaim) {
            config.onClaim(schedule.id, result.claimed!)
          }
        }
      }, config.checkInterval || 86400000) // Daily default
    }
  }
}
```

## Best Practices

1. **Use commit-reveal** for fair participation
2. **Implement anti-bot measures** to prevent manipulation
3. **Set reasonable contribution limits** per participant
4. **Use LBP for price discovery** instead of fixed prices
5. **Implement vesting** for team and investor allocations

## Related Skills

- [Liquidity Manager Agent](./liquidity-manager-agent.md) - Post-launch liquidity
- [Treasury Agent](./treasury-agent.md) - Token treasury management
- [Governance Agent](./governance-agent.md) - Token governance
