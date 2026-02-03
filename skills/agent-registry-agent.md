# Agent Registry Agent Skill

Build agents that manage agent registration and discovery on-chain.

## Overview

Agent Registry Agent enables decentralized agent registration, capability discovery, and reputation tracking. Essential for agent marketplaces, coordination, and service discovery.

## SDK Reference

```typescript
import { Demos } from "@kynesyslabs/demosdk/websdk"
import { StorageProgram } from "@kynesyslabs/demosdk/storage"

// On-chain agent registry storage
const storage = await demos.storage.getProgram()
```

## Agent Use Cases

### 1. On-Chain Agent Registry

Register and discover agents:

```typescript
class OnChainAgentRegistry {
  private demos: Demos
  private storage: StorageProgram

  async registerAgent(
    registration: AgentRegistration
  ): Promise<RegistrationResult> {
    // Validate registration
    this.validateRegistration(registration)

    // Create agent profile
    const profile: AgentProfile = {
      id: this.generateAgentId(registration),
      owner: await this.demos.wallet.getAddress(),
      name: registration.name,
      description: registration.description,
      capabilities: registration.capabilities,
      endpoint: registration.endpoint,
      publicKey: registration.publicKey,
      version: registration.version,
      metadata: registration.metadata,
      registeredAt: Date.now(),
      lastActive: Date.now(),
      status: "active"
    }

    // Store on-chain
    await this.storage.set(
      `agent:${profile.id}`,
      JSON.stringify(profile)
    )

    // Index by capability
    for (const capability of registration.capabilities) {
      await this.addToCapabilityIndex(capability, profile.id)
    }

    // Index by owner
    await this.addToOwnerIndex(profile.owner, profile.id)

    return {
      success: true,
      agentId: profile.id,
      profile
    }
  }

  async updateAgent(
    agentId: string,
    updates: Partial<AgentRegistration>
  ): Promise<boolean> {
    const existing = await this.getAgent(agentId)
    if (!existing) throw new Error("Agent not found")

    // Verify ownership
    const caller = await this.demos.wallet.getAddress()
    if (existing.owner !== caller) {
      throw new Error("Not authorized to update agent")
    }

    // Apply updates
    const updated: AgentProfile = {
      ...existing,
      ...updates,
      lastActive: Date.now()
    }

    // Update capability indexes if changed
    if (updates.capabilities) {
      // Remove from old indexes
      for (const cap of existing.capabilities) {
        await this.removeFromCapabilityIndex(cap, agentId)
      }
      // Add to new indexes
      for (const cap of updates.capabilities) {
        await this.addToCapabilityIndex(cap, agentId)
      }
    }

    await this.storage.set(`agent:${agentId}`, JSON.stringify(updated))

    return true
  }

  async getAgent(agentId: string): Promise<AgentProfile | null> {
    const data = await this.storage.get(`agent:${agentId}`)
    return data ? JSON.parse(data) : null
  }

  async findAgentsByCapability(
    capability: string
  ): Promise<AgentProfile[]> {
    const indexData = await this.storage.get(`capability:${capability}`)
    if (!indexData) return []

    const agentIds: string[] = JSON.parse(indexData)
    const agents = await Promise.all(
      agentIds.map(id => this.getAgent(id))
    )

    return agents.filter((a): a is AgentProfile => a !== null && a.status === "active")
  }

  async searchAgents(query: SearchQuery): Promise<SearchResult> {
    let agents: AgentProfile[] = []

    if (query.capability) {
      agents = await this.findAgentsByCapability(query.capability)
    } else if (query.owner) {
      agents = await this.findAgentsByOwner(query.owner)
    } else {
      agents = await this.getAllActiveAgents()
    }

    // Apply filters
    if (query.minReputation) {
      agents = agents.filter(a =>
        (a.reputation?.score || 0) >= query.minReputation!
      )
    }

    if (query.name) {
      const searchTerm = query.name.toLowerCase()
      agents = agents.filter(a =>
        a.name.toLowerCase().includes(searchTerm)
      )
    }

    // Sort
    if (query.sortBy === "reputation") {
      agents.sort((a, b) =>
        (b.reputation?.score || 0) - (a.reputation?.score || 0)
      )
    } else if (query.sortBy === "recent") {
      agents.sort((a, b) => b.registeredAt - a.registeredAt)
    }

    // Paginate
    const start = query.offset || 0
    const limit = query.limit || 20
    const paginated = agents.slice(start, start + limit)

    return {
      agents: paginated,
      total: agents.length,
      offset: start,
      limit
    }
  }

  private generateAgentId(registration: AgentRegistration): string {
    const data = `${registration.name}:${registration.publicKey}:${Date.now()}`
    return this.demos.utils.hash(data).slice(0, 16)
  }
}
```

### 2. Capability Discovery Service

Discover agents by capabilities:

```typescript
class CapabilityDiscoveryService {
  private registry: OnChainAgentRegistry

  // Predefined capability categories
  static CAPABILITIES = {
    TRADING: ["swap", "arbitrage", "market_making", "limit_orders"],
    DATA: ["price_oracle", "analytics", "indexing", "monitoring"],
    IDENTITY: ["verification", "attestation", "reputation"],
    STORAGE: ["ipfs", "on_chain", "backup"],
    MESSAGING: ["notification", "alert", "broadcast"],
    COMPUTATION: ["fhe", "zk_proof", "ml_inference"]
  }

  async discoverForTask(
    taskRequirements: TaskRequirements
  ): Promise<AgentRecommendation[]> {
    // Analyze task to determine required capabilities
    const requiredCapabilities = this.analyzeTaskCapabilities(taskRequirements)

    // Find agents for each capability
    const candidatesByCapability = await Promise.all(
      requiredCapabilities.map(async cap => ({
        capability: cap.name,
        required: cap.required,
        agents: await this.registry.findAgentsByCapability(cap.name)
      }))
    )

    // Score and rank agents
    const scoredAgents = this.scoreAgents(
      candidatesByCapability,
      taskRequirements
    )

    return scoredAgents
      .sort((a, b) => b.score - a.score)
      .slice(0, 10)
  }

  private analyzeTaskCapabilities(
    task: TaskRequirements
  ): RequiredCapability[] {
    const capabilities: RequiredCapability[] = []

    // Check task type
    if (task.type === "swap" || task.type === "trade") {
      capabilities.push(
        { name: "swap", required: true },
        { name: "price_oracle", required: true }
      )
    }

    if (task.requiresPrivacy) {
      capabilities.push({ name: "fhe", required: false })
    }

    if (task.crossChain) {
      capabilities.push({ name: "bridge", required: true })
    }

    if (task.needsVerification) {
      capabilities.push({ name: "attestation", required: true })
    }

    // Add from explicit requirements
    for (const cap of task.capabilities || []) {
      if (!capabilities.find(c => c.name === cap)) {
        capabilities.push({ name: cap, required: true })
      }
    }

    return capabilities
  }

  private scoreAgents(
    candidatesByCapability: CapabilityCandidates[],
    task: TaskRequirements
  ): AgentRecommendation[] {
    const agentScores = new Map<string, AgentScore>()

    for (const { capability, required, agents } of candidatesByCapability) {
      for (const agent of agents) {
        if (!agentScores.has(agent.id)) {
          agentScores.set(agent.id, {
            agent,
            capabilityScore: 0,
            reputationScore: agent.reputation?.score || 50,
            matchedCapabilities: [],
            missingRequired: []
          })
        }

        const score = agentScores.get(agent.id)!
        score.matchedCapabilities.push(capability)
        score.capabilityScore += required ? 20 : 10
      }
    }

    // Check for missing required capabilities
    const requiredCaps = candidatesByCapability
      .filter(c => c.required)
      .map(c => c.capability)

    for (const [, score] of agentScores) {
      for (const req of requiredCaps) {
        if (!score.matchedCapabilities.includes(req)) {
          score.missingRequired.push(req)
          score.capabilityScore -= 50 // Heavy penalty
        }
      }
    }

    return Array.from(agentScores.values()).map(score => ({
      agent: score.agent,
      score: score.capabilityScore + score.reputationScore / 2,
      matchedCapabilities: score.matchedCapabilities,
      missingCapabilities: score.missingRequired,
      recommendation: score.missingRequired.length === 0
        ? "Recommended"
        : "Missing capabilities"
    }))
  }
}
```

### 3. Agent Health Monitor

Monitor registered agent health:

```typescript
class AgentHealthMonitor {
  private registry: OnChainAgentRegistry
  private healthStatus: Map<string, AgentHealth> = new Map()

  async startMonitoring(checkIntervalMs: number = 60000): Promise<void> {
    setInterval(async () => {
      const agents = await this.registry.getAllActiveAgents()

      await Promise.all(
        agents.map(agent => this.checkAgentHealth(agent))
      )
    }, checkIntervalMs)
  }

  private async checkAgentHealth(agent: AgentProfile): Promise<void> {
    const health: AgentHealth = {
      agentId: agent.id,
      timestamp: Date.now(),
      checks: []
    }

    // Endpoint health check
    if (agent.endpoint) {
      const endpointCheck = await this.checkEndpoint(agent.endpoint)
      health.checks.push(endpointCheck)
    }

    // Heartbeat check (if agent supports)
    const heartbeatCheck = await this.checkHeartbeat(agent)
    health.checks.push(heartbeatCheck)

    // Response time check
    const responseCheck = await this.checkResponseTime(agent)
    health.checks.push(responseCheck)

    // Calculate overall health score
    health.overallScore = this.calculateHealthScore(health.checks)
    health.status = health.overallScore > 80 ? "healthy" :
                    health.overallScore > 50 ? "degraded" : "unhealthy"

    this.healthStatus.set(agent.id, health)

    // Update agent status if unhealthy
    if (health.status === "unhealthy") {
      await this.handleUnhealthyAgent(agent, health)
    }
  }

  private async checkEndpoint(endpoint: string): Promise<HealthCheck> {
    const start = Date.now()

    try {
      const response = await fetch(`${endpoint}/health`, {
        method: "GET",
        signal: AbortSignal.timeout(10000)
      })

      return {
        name: "endpoint",
        passed: response.ok,
        latency: Date.now() - start,
        details: response.ok ? "Endpoint responding" : `Status: ${response.status}`
      }
    } catch (error) {
      return {
        name: "endpoint",
        passed: false,
        latency: Date.now() - start,
        details: `Error: ${error.message}`
      }
    }
  }

  private async checkHeartbeat(agent: AgentProfile): Promise<HealthCheck> {
    // Check if agent has sent heartbeat recently
    const lastHeartbeat = await this.getLastHeartbeat(agent.id)
    const age = Date.now() - (lastHeartbeat || 0)
    const maxAge = 5 * 60 * 1000 // 5 minutes

    return {
      name: "heartbeat",
      passed: age < maxAge,
      details: lastHeartbeat
        ? `Last heartbeat ${Math.floor(age / 1000)}s ago`
        : "No heartbeat received"
    }
  }

  private async handleUnhealthyAgent(
    agent: AgentProfile,
    health: AgentHealth
  ): Promise<void> {
    // Count consecutive failures
    const failures = this.getConsecutiveFailures(agent.id)

    if (failures >= 3) {
      // Mark agent as inactive
      await this.registry.updateAgent(agent.id, {
        status: "inactive"
      })

      // Emit alert
      this.emitAlert({
        type: "agent_offline",
        agentId: agent.id,
        agentName: agent.name,
        consecutiveFailures: failures,
        health
      })
    }
  }

  getAgentHealth(agentId: string): AgentHealth | null {
    return this.healthStatus.get(agentId) || null
  }

  getHealthyAgents(): AgentHealth[] {
    return Array.from(this.healthStatus.values())
      .filter(h => h.status === "healthy")
  }
}
```

## Best Practices

1. **Use unique agent IDs** tied to public keys
2. **Index by capability** for fast discovery
3. **Monitor agent health** regularly
4. **Store minimal data on-chain** for cost efficiency
5. **Implement reputation decay** for inactive agents

## Related Skills

- [Agent Reputation Agent](./agent-reputation-agent.md) - Reputation scoring
- [Agent Marketplace Agent](./agent-marketplace-agent.md) - Service marketplace
- [Multi-Agent Coordinator](./multi-agent-coordinator-agent.md) - Coordination
