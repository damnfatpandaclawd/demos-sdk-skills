# Agent Reputation Agent Skill

Build agents that manage reputation scores and trust metrics for other agents.

## Overview

Agent Reputation Agent enables decentralized reputation tracking, feedback collection, and trust scoring for agent ecosystems. Essential for quality assurance, spam prevention, and reliable agent discovery.

## SDK Reference

```typescript
import { Demos } from "@kynesyslabs/demosdk/websdk"
import { StorageProgram } from "@kynesyslabs/demosdk/storage"

// Reputation data storage
const storage = await demos.storage.getProgram()
```

## Agent Use Cases

### 1. Reputation Scoring System

Calculate and maintain reputation scores:

```typescript
class ReputationScoringSystem {
  private demos: Demos
  private storage: StorageProgram

  async submitFeedback(
    feedback: AgentFeedback
  ): Promise<FeedbackResult> {
    // Validate feedback
    this.validateFeedback(feedback)

    // Store feedback
    const feedbackId = this.generateFeedbackId(feedback)
    await this.storage.set(
      `feedback:${feedbackId}`,
      JSON.stringify({
        ...feedback,
        submittedAt: Date.now(),
        submitter: await this.demos.wallet.getAddress()
      })
    )

    // Add to agent's feedback index
    await this.addToFeedbackIndex(feedback.agentId, feedbackId)

    // Recalculate reputation
    const newScore = await this.recalculateReputation(feedback.agentId)

    return {
      success: true,
      feedbackId,
      newReputationScore: newScore
    }
  }

  private async recalculateReputation(agentId: string): Promise<number> {
    const feedbackIds = await this.getFeedbackIds(agentId)
    const feedbacks = await Promise.all(
      feedbackIds.map(id => this.getFeedback(id))
    )

    const validFeedbacks = feedbacks.filter(
      (f): f is AgentFeedback => f !== null
    )

    if (validFeedbacks.length === 0) {
      return 50 // Default score for new agents
    }

    // Weight factors
    const weights = {
      taskSuccess: 0.4,
      responseTime: 0.15,
      reliability: 0.25,
      quality: 0.2
    }

    // Calculate weighted average with time decay
    let weightedSum = 0
    let totalWeight = 0

    for (const feedback of validFeedbacks) {
      const age = Date.now() - feedback.submittedAt
      const decayFactor = Math.exp(-age / (90 * 24 * 60 * 60 * 1000)) // 90-day half-life

      const feedbackScore =
        feedback.taskSuccess * weights.taskSuccess +
        feedback.responseTime * weights.responseTime +
        feedback.reliability * weights.reliability +
        feedback.quality * weights.quality

      weightedSum += feedbackScore * decayFactor
      totalWeight += decayFactor
    }

    const baseScore = totalWeight > 0 ? weightedSum / totalWeight : 50

    // Apply volume bonus (more feedback = more confidence)
    const volumeBonus = Math.min(10, Math.log10(validFeedbacks.length + 1) * 5)

    // Apply consistency bonus
    const consistencyBonus = this.calculateConsistencyBonus(validFeedbacks)

    const finalScore = Math.min(100, Math.max(0,
      baseScore + volumeBonus + consistencyBonus
    ))

    // Store updated reputation
    await this.updateStoredReputation(agentId, {
      score: finalScore,
      feedbackCount: validFeedbacks.length,
      lastUpdated: Date.now()
    })

    return finalScore
  }

  private calculateConsistencyBonus(feedbacks: AgentFeedback[]): number {
    if (feedbacks.length < 5) return 0

    const scores = feedbacks.map(f =>
      (f.taskSuccess + f.responseTime + f.reliability + f.quality) / 4
    )

    const mean = scores.reduce((a, b) => a + b) / scores.length
    const variance = scores.reduce(
      (sum, s) => sum + Math.pow(s - mean, 2), 0
    ) / scores.length
    const stdDev = Math.sqrt(variance)

    // Lower variance = higher consistency bonus
    return Math.max(0, 5 - stdDev * 0.5)
  }

  async getReputation(agentId: string): Promise<ReputationProfile> {
    const data = await this.storage.get(`reputation:${agentId}`)

    if (!data) {
      return {
        agentId,
        score: 50,
        feedbackCount: 0,
        tier: "unrated",
        badges: []
      }
    }

    const reputation = JSON.parse(data)

    return {
      ...reputation,
      tier: this.scoreToTier(reputation.score),
      badges: await this.calculateBadges(agentId, reputation)
    }
  }

  private scoreToTier(score: number): ReputationTier {
    if (score >= 95) return "legendary"
    if (score >= 85) return "trusted"
    if (score >= 70) return "established"
    if (score >= 50) return "newcomer"
    return "unrated"
  }

  private async calculateBadges(
    agentId: string,
    reputation: StoredReputation
  ): Promise<Badge[]> {
    const badges: Badge[] = []

    // Veteran badge: > 100 feedbacks
    if (reputation.feedbackCount >= 100) {
      badges.push({ name: "veteran", description: "100+ completed tasks" })
    }

    // Perfect score badge
    if (reputation.score >= 98) {
      badges.push({ name: "perfect", description: "Near-perfect reputation" })
    }

    // Early adopter badge (check registration time)
    const agent = await this.getAgentProfile(agentId)
    if (agent && agent.registeredAt < Date.now() - 365 * 24 * 60 * 60 * 1000) {
      badges.push({ name: "early_adopter", description: "Active for 1+ year" })
    }

    return badges
  }
}
```

### 2. Trust Network Analyzer

Analyze trust relationships between agents:

```typescript
class TrustNetworkAnalyzer {
  private reputationSystem: ReputationScoringSystem

  async buildTrustGraph(agentIds: string[]): Promise<TrustGraph> {
    const nodes: TrustNode[] = []
    const edges: TrustEdge[] = []

    // Build nodes with reputation
    for (const agentId of agentIds) {
      const reputation = await this.reputationSystem.getReputation(agentId)
      nodes.push({
        id: agentId,
        reputation: reputation.score,
        tier: reputation.tier
      })
    }

    // Build edges from feedback relationships
    for (const agentId of agentIds) {
      const feedbacks = await this.getFeedbacksFor(agentId)

      for (const feedback of feedbacks) {
        if (agentIds.includes(feedback.submitter)) {
          edges.push({
            from: feedback.submitter,
            to: agentId,
            weight: feedback.overall,
            timestamp: feedback.submittedAt
          })
        }
      }
    }

    return { nodes, edges }
  }

  async calculateTrustScore(
    fromAgent: string,
    toAgent: string
  ): Promise<TrustScore> {
    // Direct trust from feedback
    const directFeedback = await this.getDirectFeedback(fromAgent, toAgent)
    const directTrust = directFeedback
      ? directFeedback.overall
      : null

    // Indirect trust through network
    const indirectTrust = await this.calculateIndirectTrust(fromAgent, toAgent)

    // Global reputation
    const globalReputation = await this.reputationSystem.getReputation(toAgent)

    // Weighted combination
    let finalScore: number

    if (directTrust !== null) {
      // Strong weight on direct experience
      finalScore = directTrust * 0.6 +
                   indirectTrust * 0.25 +
                   globalReputation.score * 0.15
    } else {
      // No direct experience, rely on indirect and global
      finalScore = indirectTrust * 0.5 + globalReputation.score * 0.5
    }

    return {
      score: finalScore,
      directTrust,
      indirectTrust,
      globalReputation: globalReputation.score,
      confidence: this.calculateConfidence(directTrust, indirectTrust)
    }
  }

  private async calculateIndirectTrust(
    fromAgent: string,
    toAgent: string,
    maxHops: number = 3
  ): Promise<number> {
    // BFS to find trust paths
    const visited = new Set<string>()
    const queue: { agent: string; trust: number; hops: number }[] = [
      { agent: fromAgent, trust: 100, hops: 0 }
    ]

    let totalTrust = 0
    let pathCount = 0

    while (queue.length > 0) {
      const { agent, trust, hops } = queue.shift()!

      if (agent === toAgent) {
        totalTrust += trust
        pathCount++
        continue
      }

      if (hops >= maxHops || visited.has(agent)) continue
      visited.add(agent)

      // Get this agent's positive feedbacks
      const feedbacks = await this.getPositiveFeedbacksFrom(agent)

      for (const feedback of feedbacks) {
        // Trust degrades with each hop
        const degradedTrust = trust * (feedback.overall / 100) * 0.7

        if (degradedTrust > 20) { // Minimum threshold
          queue.push({
            agent: feedback.agentId,
            trust: degradedTrust,
            hops: hops + 1
          })
        }
      }
    }

    return pathCount > 0 ? totalTrust / pathCount : 50
  }

  async findTrustedAgents(
    fromAgent: string,
    capability: string,
    minTrust: number = 70
  ): Promise<TrustedAgent[]> {
    // Get all agents with capability
    const candidates = await this.findAgentsByCapability(capability)

    // Calculate trust for each
    const trustedAgents: TrustedAgent[] = []

    for (const candidate of candidates) {
      const trustScore = await this.calculateTrustScore(fromAgent, candidate.id)

      if (trustScore.score >= minTrust) {
        trustedAgents.push({
          agent: candidate,
          trustScore,
          recommendation: trustScore.directTrust !== null
            ? "Previously worked together"
            : trustScore.indirectTrust > 70
            ? "Trusted by your network"
            : "Good global reputation"
        })
      }
    }

    return trustedAgents.sort((a, b) => b.trustScore.score - a.trustScore.score)
  }
}
```

### 3. Sybil Detection Agent

Detect and prevent reputation manipulation:

```typescript
class SybilDetectionAgent {
  private reputationSystem: ReputationScoringSystem
  private suspiciousPatterns: Map<string, SuspicionScore> = new Map()

  async analyzeFeedbackPattern(
    agentId: string
  ): Promise<SybilAnalysis> {
    const feedbacks = await this.getAllFeedbacksFor(agentId)
    const submitters = feedbacks.map(f => f.submitter)

    const analysis: SybilAnalysis = {
      agentId,
      feedbackCount: feedbacks.length,
      uniqueSubmitters: new Set(submitters).size,
      suspicionScore: 0,
      flags: []
    }

    // Check for repeat submitters
    const submitterCounts = this.countOccurrences(submitters)
    const repeatSubmitters = Object.entries(submitterCounts)
      .filter(([_, count]) => count > 3)

    if (repeatSubmitters.length > 0) {
      analysis.flags.push({
        type: "repeat_submitters",
        severity: "medium",
        details: `${repeatSubmitters.length} submitters with 3+ feedbacks`
      })
      analysis.suspicionScore += 20
    }

    // Check for burst patterns
    const burstScore = this.detectBurstPattern(feedbacks)
    if (burstScore > 0.5) {
      analysis.flags.push({
        type: "burst_pattern",
        severity: "high",
        details: "Unusual clustering of feedback submissions"
      })
      analysis.suspicionScore += 30
    }

    // Check for circular feedback
    const circularScore = await this.detectCircularFeedback(agentId, submitters)
    if (circularScore > 0) {
      analysis.flags.push({
        type: "circular_feedback",
        severity: "high",
        details: "Mutual feedback patterns detected"
      })
      analysis.suspicionScore += 40 * circularScore
    }

    // Check submitter age
    const newSubmitterRatio = await this.checkSubmitterAge(submitters)
    if (newSubmitterRatio > 0.7) {
      analysis.flags.push({
        type: "new_submitters",
        severity: "medium",
        details: `${(newSubmitterRatio * 100).toFixed(0)}% of feedback from new accounts`
      })
      analysis.suspicionScore += 25
    }

    analysis.suspicionScore = Math.min(100, analysis.suspicionScore)
    analysis.verdict = analysis.suspicionScore > 50 ? "suspicious" :
                       analysis.suspicionScore > 25 ? "review" : "clean"

    return analysis
  }

  private detectBurstPattern(feedbacks: AgentFeedback[]): number {
    if (feedbacks.length < 5) return 0

    const timestamps = feedbacks.map(f => f.submittedAt).sort()
    const intervals: number[] = []

    for (let i = 1; i < timestamps.length; i++) {
      intervals.push(timestamps[i] - timestamps[i - 1])
    }

    // Check for unnaturally regular intervals
    const mean = intervals.reduce((a, b) => a + b) / intervals.length
    const variance = intervals.reduce(
      (sum, i) => sum + Math.pow(i - mean, 2), 0
    ) / intervals.length

    const coefficientOfVariation = Math.sqrt(variance) / mean

    // Very low CV suggests automated/coordinated feedback
    if (coefficientOfVariation < 0.3) return 0.8

    // Check for clusters (many feedbacks in short time)
    const shortIntervals = intervals.filter(i => i < 60000) // < 1 minute
    if (shortIntervals.length > intervals.length * 0.5) return 0.6

    return 0
  }

  private async detectCircularFeedback(
    agentId: string,
    submitters: string[]
  ): Promise<number> {
    let circularCount = 0

    for (const submitter of new Set(submitters)) {
      // Check if agent has given feedback to submitter
      const reverseFeedback = await this.getFeedbackFrom(agentId, submitter)
      if (reverseFeedback) {
        circularCount++
      }
    }

    const uniqueSubmitters = new Set(submitters).size
    return uniqueSubmitters > 0 ? circularCount / uniqueSubmitters : 0
  }

  async flagSuspiciousAgent(
    agentId: string,
    analysis: SybilAnalysis
  ): Promise<void> {
    if (analysis.verdict === "suspicious") {
      // Store flag
      await this.storage.set(
        `sybil_flag:${agentId}`,
        JSON.stringify({
          analysis,
          flaggedAt: Date.now(),
          status: "pending_review"
        })
      )

      // Temporarily reduce reputation weight
      const reputation = await this.reputationSystem.getReputation(agentId)
      await this.reputationSystem.applyPenalty(agentId, {
        type: "sybil_suspicion",
        multiplier: 0.5,
        expiresAt: Date.now() + 7 * 24 * 60 * 60 * 1000
      })
    }
  }
}
```

## Best Practices

1. **Use time decay** for relevance weighting
2. **Detect sybil attacks** and manipulation
3. **Consider network effects** in trust calculations
4. **Implement reputation penalties** for bad behavior
5. **Allow reputation recovery** over time

## Related Skills

- [Agent Registry Agent](./agent-registry-agent.md) - Agent registration
- [Compliance Monitoring](./compliance-monitoring-agent.md) - Compliance
- [Multi-Agent Coordinator](./multi-agent-coordinator-agent.md) - Coordination
