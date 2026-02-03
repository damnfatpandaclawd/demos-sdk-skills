# Task Delegation Agent Skill

Build agents that intelligently delegate tasks to specialized agents.

## Overview

Task Delegation Agent enables intelligent routing of tasks to the most suitable agents based on capabilities, availability, and cost. Essential for efficient multi-agent systems.

## SDK Reference

```typescript
import { Demos } from "@kynesyslabs/demosdk/websdk"
import { Messaging } from "@kynesyslabs/demosdk/messaging"

// Inter-agent task delegation
const messaging = await demos.messaging.create()
```

## Agent Use Cases

### 1. Intelligent Task Router

Route tasks to optimal agents:

```typescript
class IntelligentTaskRouter {
  private registry: AgentRegistry
  private reputationSystem: ReputationSystem
  private loadBalancer: LoadBalancer

  async routeTask(task: Task): Promise<RoutingDecision> {
    // Analyze task requirements
    const requirements = this.analyzeTask(task)

    // Find capable agents
    const candidates = await this.findCandidates(requirements)

    if (candidates.length === 0) {
      return {
        success: false,
        error: "No suitable agents found",
        requirements
      }
    }

    // Score and rank candidates
    const scored = await this.scoreCandidates(candidates, task)

    // Select best agent
    const selected = this.selectAgent(scored, task.selectionStrategy)

    return {
      success: true,
      selectedAgent: selected.agent,
      score: selected.score,
      reasoning: selected.reasoning,
      alternatives: scored.slice(1, 4).map(s => ({
        agent: s.agent,
        score: s.score
      }))
    }
  }

  private analyzeTask(task: Task): TaskRequirements {
    return {
      capabilities: task.requiredCapabilities || this.inferCapabilities(task),
      minReputation: task.minReputation || 50,
      maxCost: task.budget,
      maxLatency: task.deadline ? task.deadline - Date.now() : undefined,
      dataRequirements: this.extractDataRequirements(task),
      securityLevel: task.securityLevel || "standard"
    }
  }

  private inferCapabilities(task: Task): string[] {
    const capabilities: string[] = []
    const description = task.description.toLowerCase()

    // Infer from task description
    if (description.includes("swap") || description.includes("trade")) {
      capabilities.push("swap", "dex_integration")
    }
    if (description.includes("price") || description.includes("quote")) {
      capabilities.push("price_oracle")
    }
    if (description.includes("analyze") || description.includes("data")) {
      capabilities.push("analytics", "data_indexing")
    }
    if (description.includes("transfer") || description.includes("send")) {
      capabilities.push("transaction", "transfer")
    }

    return [...new Set(capabilities)]
  }

  private async scoreCandidates(
    candidates: AgentProfile[],
    task: Task
  ): Promise<ScoredCandidate[]> {
    const scored: ScoredCandidate[] = []

    for (const agent of candidates) {
      const scores = {
        capability: await this.scoreCapability(agent, task),
        reputation: await this.scoreReputation(agent),
        availability: await this.scoreAvailability(agent),
        cost: await this.scoreCost(agent, task),
        latency: await this.scoreLatency(agent, task)
      }

      const weights = task.weights || {
        capability: 0.25,
        reputation: 0.25,
        availability: 0.15,
        cost: 0.20,
        latency: 0.15
      }

      const totalScore =
        scores.capability * weights.capability +
        scores.reputation * weights.reputation +
        scores.availability * weights.availability +
        scores.cost * weights.cost +
        scores.latency * weights.latency

      scored.push({
        agent,
        score: totalScore,
        scores,
        reasoning: this.generateReasoning(scores, weights)
      })
    }

    return scored.sort((a, b) => b.score - a.score)
  }

  private async scoreCapability(
    agent: AgentProfile,
    task: Task
  ): Promise<number> {
    const required = task.requiredCapabilities || []
    const agentCaps = agent.capabilities || []

    if (required.length === 0) return 80 // Default if no specific requirements

    const matched = required.filter(cap => agentCaps.includes(cap))
    const matchRatio = matched.length / required.length

    // Bonus for extra relevant capabilities
    const relevantExtras = agentCaps.filter(cap =>
      !required.includes(cap) && this.isRelevantCapability(cap, task)
    )
    const extraBonus = Math.min(10, relevantExtras.length * 2)

    return Math.min(100, matchRatio * 90 + extraBonus)
  }

  private async scoreReputation(agent: AgentProfile): Promise<number> {
    const reputation = await this.reputationSystem.getReputation(agent.id)
    return reputation.score
  }

  private async scoreAvailability(agent: AgentProfile): Promise<number> {
    const load = await this.loadBalancer.getAgentLoad(agent.id)

    // Full availability = 100, completely busy = 0
    return Math.max(0, 100 - load.utilization)
  }

  private selectAgent(
    scored: ScoredCandidate[],
    strategy?: SelectionStrategy
  ): ScoredCandidate {
    switch (strategy) {
      case "best":
        return scored[0]

      case "weighted_random":
        // Random selection weighted by score
        const totalScore = scored.reduce((sum, s) => sum + s.score, 0)
        let random = Math.random() * totalScore
        for (const candidate of scored) {
          random -= candidate.score
          if (random <= 0) return candidate
        }
        return scored[0]

      case "round_robin":
        // Track last selected and rotate
        return this.roundRobinSelect(scored)

      default:
        return scored[0]
    }
  }
}
```

### 2. Load Balancer

Balance tasks across agents:

```typescript
class LoadBalancer {
  private agentLoads: Map<string, AgentLoad> = new Map()
  private taskQueues: Map<string, QueuedTask[]> = new Map()

  async assignTask(
    task: Task,
    candidates: AgentProfile[]
  ): Promise<AssignmentResult> {
    // Get current loads
    const loads = await Promise.all(
      candidates.map(async agent => ({
        agent,
        load: await this.getAgentLoad(agent.id)
      }))
    )

    // Filter by capacity
    const available = loads.filter(l =>
      l.load.currentTasks < l.load.maxConcurrent
    )

    if (available.length === 0) {
      // All agents busy, queue task
      return this.queueTask(task, candidates)
    }

    // Select least loaded agent
    const selected = available.sort(
      (a, b) => a.load.utilization - b.load.utilization
    )[0]

    // Update load
    await this.incrementLoad(selected.agent.id, task)

    return {
      success: true,
      agent: selected.agent,
      queued: false,
      estimatedStart: Date.now()
    }
  }

  async getAgentLoad(agentId: string): Promise<AgentLoad> {
    let load = this.agentLoads.get(agentId)

    if (!load) {
      // Initialize with defaults
      load = {
        agentId,
        currentTasks: 0,
        maxConcurrent: 10,
        avgTaskDuration: 30000,
        utilization: 0,
        lastUpdated: Date.now()
      }
      this.agentLoads.set(agentId, load)
    }

    return load
  }

  private async incrementLoad(
    agentId: string,
    task: Task
  ): Promise<void> {
    const load = await this.getAgentLoad(agentId)
    load.currentTasks++
    load.utilization = load.currentTasks / load.maxConcurrent * 100
    load.lastUpdated = Date.now()
  }

  async decrementLoad(agentId: string): Promise<void> {
    const load = await this.getAgentLoad(agentId)
    load.currentTasks = Math.max(0, load.currentTasks - 1)
    load.utilization = load.currentTasks / load.maxConcurrent * 100
    load.lastUpdated = Date.now()

    // Check queue for pending tasks
    await this.processQueue(agentId)
  }

  private async queueTask(
    task: Task,
    candidates: AgentProfile[]
  ): Promise<AssignmentResult> {
    // Find best queue based on expected wait time
    let bestQueue: { agentId: string; waitTime: number } | null = null

    for (const agent of candidates) {
      const queue = this.taskQueues.get(agent.id) || []
      const load = await this.getAgentLoad(agent.id)

      const estimatedWait = queue.length * load.avgTaskDuration

      if (!bestQueue || estimatedWait < bestQueue.waitTime) {
        bestQueue = { agentId: agent.id, waitTime: estimatedWait }
      }
    }

    if (!bestQueue) {
      return { success: false, error: "No queue available" }
    }

    // Add to queue
    if (!this.taskQueues.has(bestQueue.agentId)) {
      this.taskQueues.set(bestQueue.agentId, [])
    }

    this.taskQueues.get(bestQueue.agentId)!.push({
      task,
      queuedAt: Date.now()
    })

    return {
      success: true,
      agent: candidates.find(a => a.id === bestQueue!.agentId)!,
      queued: true,
      queuePosition: this.taskQueues.get(bestQueue.agentId)!.length,
      estimatedStart: Date.now() + bestQueue.waitTime
    }
  }

  private async processQueue(agentId: string): Promise<void> {
    const queue = this.taskQueues.get(agentId)
    if (!queue || queue.length === 0) return

    const load = await this.getAgentLoad(agentId)
    if (load.currentTasks >= load.maxConcurrent) return

    // Dequeue and assign
    const next = queue.shift()!
    await this.incrementLoad(agentId, next.task)

    // Notify task is starting
    this.emitTaskStarting(agentId, next.task)
  }
}
```

### 3. Capability Matcher

Match task requirements to agent capabilities:

```typescript
class CapabilityMatcher {
  private capabilityOntology: CapabilityOntology

  async findMatches(
    requirements: CapabilityRequirement[],
    agents: AgentProfile[]
  ): Promise<MatchResult[]> {
    const results: MatchResult[] = []

    for (const agent of agents) {
      const match = this.matchAgent(requirements, agent)
      if (match.matchScore > 0) {
        results.push(match)
      }
    }

    return results.sort((a, b) => b.matchScore - a.matchScore)
  }

  private matchAgent(
    requirements: CapabilityRequirement[],
    agent: AgentProfile
  ): MatchResult {
    const matched: MatchedCapability[] = []
    const missing: CapabilityRequirement[] = []
    let totalScore = 0
    let totalWeight = 0

    for (const req of requirements) {
      const matchResult = this.matchCapability(req, agent.capabilities)

      totalWeight += req.weight || 1

      if (matchResult.matched) {
        matched.push({
          requirement: req,
          matchedWith: matchResult.capability!,
          score: matchResult.score
        })
        totalScore += matchResult.score * (req.weight || 1)
      } else if (req.required) {
        missing.push(req)
      }
    }

    // If any required capabilities are missing, score is 0
    if (missing.some(m => m.required)) {
      return {
        agent,
        matchScore: 0,
        matched,
        missing,
        recommendation: "Missing required capabilities"
      }
    }

    const matchScore = totalWeight > 0 ? totalScore / totalWeight : 0

    return {
      agent,
      matchScore,
      matched,
      missing,
      recommendation: this.generateRecommendation(matchScore, matched, missing)
    }
  }

  private matchCapability(
    req: CapabilityRequirement,
    agentCapabilities: string[]
  ): CapabilityMatchResult {
    // Exact match
    if (agentCapabilities.includes(req.capability)) {
      return { matched: true, capability: req.capability, score: 100 }
    }

    // Check for equivalent capabilities
    const equivalents = this.capabilityOntology.getEquivalents(req.capability)
    for (const equiv of equivalents) {
      if (agentCapabilities.includes(equiv)) {
        return { matched: true, capability: equiv, score: 90 }
      }
    }

    // Check for parent capabilities (more general)
    const parents = this.capabilityOntology.getParents(req.capability)
    for (const parent of parents) {
      if (agentCapabilities.includes(parent)) {
        return { matched: true, capability: parent, score: 70 }
      }
    }

    // Check for child capabilities (more specific)
    const children = this.capabilityOntology.getChildren(req.capability)
    for (const child of children) {
      if (agentCapabilities.includes(child)) {
        return { matched: true, capability: child, score: 80 }
      }
    }

    return { matched: false, score: 0 }
  }

  async suggestAlternatives(
    requirements: CapabilityRequirement[],
    availableAgents: AgentProfile[]
  ): Promise<AlternativeSuggestion[]> {
    const suggestions: AlternativeSuggestion[] = []

    // Find requirements that no agent can fulfill
    const unfulfillable = requirements.filter(req =>
      !availableAgents.some(agent =>
        this.matchCapability(req, agent.capabilities).matched
      )
    )

    for (const req of unfulfillable) {
      // Find similar capabilities
      const similar = this.capabilityOntology.findSimilar(req.capability)

      // Check which similar capabilities are available
      const availableSimilar = similar.filter(cap =>
        availableAgents.some(agent => agent.capabilities.includes(cap))
      )

      if (availableSimilar.length > 0) {
        suggestions.push({
          originalRequirement: req,
          alternatives: availableSimilar.map(cap => ({
            capability: cap,
            similarity: this.calculateSimilarity(req.capability, cap),
            agents: availableAgents.filter(a => a.capabilities.includes(cap))
          }))
        })
      }
    }

    return suggestions
  }
}
```

## Best Practices

1. **Consider multiple factors** when routing tasks
2. **Implement load balancing** for fair distribution
3. **Support task queuing** when all agents are busy
4. **Use capability ontologies** for flexible matching
5. **Track routing decisions** for optimization

## Related Skills

- [Multi-Agent Coordinator](./multi-agent-coordinator-agent.md) - Coordination
- [Agent Registry Agent](./agent-registry-agent.md) - Agent discovery
- [Agent Reputation Agent](./agent-reputation-agent.md) - Quality scoring
