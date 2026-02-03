# Agent Discovery Agent Skill

> **⚠️ Prerequisites**: Complete [SDK Setup](./00-sdk-setup.md) first to configure your environment.

Build agents that discover and connect with other agents in the network.

## Overview

Agent Discovery Agent enables dynamic agent discovery, service matching, and network topology management. Essential for decentralized agent networks, automatic scaling, and adaptive multi-agent systems.

## SDK Reference

```typescript
import { Demos } from "@kynesyslabs/demosdk/websdk"
import { Messaging } from "@kynesyslabs/demosdk/messaging"

// Discovery and networking
const messaging = await demos.messaging.create()
```

## Agent Use Cases

### 1. DHT-Based Discovery Service

Implement distributed hash table for agent discovery:

```typescript
class DHTDiscoveryService {
  private localId: string
  private routingTable: KBucket[] = []
  private knownAgents: Map<string, AgentInfo> = new Map()
  private k: number = 20 // Bucket size

  async bootstrap(seeds: string[]): Promise<void> {
    this.localId = await this.generateNodeId()

    // Initialize k-buckets
    for (let i = 0; i < 256; i++) {
      this.routingTable.push({
        index: i,
        agents: [],
        lastUpdated: Date.now()
      })
    }

    // Connect to seed nodes
    for (const seed of seeds) {
      await this.ping(seed)
    }

    // Populate routing table
    await this.findNode(this.localId)
  }

  async findAgent(targetId: string): Promise<AgentInfo | null> {
    // Check local cache first
    if (this.knownAgents.has(targetId)) {
      return this.knownAgents.get(targetId)!
    }

    // Iterative lookup
    const closest = this.getClosestAgents(targetId, this.k)
    const queried = new Set<string>()
    let result: AgentInfo | null = null

    while (closest.length > 0 && !result) {
      const agent = closest.shift()!

      if (queried.has(agent.id)) continue
      queried.add(agent.id)

      try {
        const response = await this.messaging.sendRequest(
          agent.publicKey,
          {
            type: "dht_find_node",
            targetId
          },
          { timeout: 5000 }
        )

        if (response.found) {
          result = response.agent
          this.knownAgents.set(targetId, result)
        } else {
          // Add returned nodes to search
          for (const node of response.closestNodes) {
            if (!queried.has(node.id)) {
              this.insertSorted(closest, node, targetId)
            }
          }
        }
      } catch {
        // Node unresponsive, remove from routing table
        this.removeFromRoutingTable(agent.id)
      }
    }

    return result
  }

  async findAgentsByCapability(
    capability: string,
    limit: number = 10
  ): Promise<AgentInfo[]> {
    const results: AgentInfo[] = []

    // Query multiple random nodes
    const queryNodes = this.getRandomAgents(Math.min(20, this.k))

    const promises = queryNodes.map(async node => {
      try {
        const response = await this.messaging.sendRequest(
          node.publicKey,
          {
            type: "dht_find_capability",
            capability,
            limit
          },
          { timeout: 5000 }
        )

        return response.agents || []
      } catch {
        return []
      }
    })

    const responses = await Promise.all(promises)

    // Deduplicate results
    const seen = new Set<string>()
    for (const agents of responses) {
      for (const agent of agents) {
        if (!seen.has(agent.id)) {
          seen.add(agent.id)
          results.push(agent)

          if (results.length >= limit) {
            return results
          }
        }
      }
    }

    return results
  }

  async announceCapabilities(capabilities: string[]): Promise<void> {
    const announcement: AgentAnnouncement = {
      id: this.localId,
      publicKey: await this.getPublicKey(),
      capabilities,
      endpoint: await this.getEndpoint(),
      timestamp: Date.now()
    }

    // Store locally
    for (const capability of capabilities) {
      await this.storeCapability(capability, announcement)
    }

    // Announce to closest nodes for each capability
    for (const capability of capabilities) {
      const capabilityId = this.hashCapability(capability)
      const closest = this.getClosestAgents(capabilityId, this.k)

      for (const agent of closest) {
        await this.messaging.send(agent.publicKey, {
          type: "dht_store_capability",
          capability,
          announcement
        })
      }
    }
  }

  private getClosestAgents(targetId: string, count: number): AgentInfo[] {
    const allAgents: { agent: AgentInfo; distance: bigint }[] = []

    for (const bucket of this.routingTable) {
      for (const agent of bucket.agents) {
        allAgents.push({
          agent,
          distance: this.xorDistance(agent.id, targetId)
        })
      }
    }

    return allAgents
      .sort((a, b) => Number(a.distance - b.distance))
      .slice(0, count)
      .map(a => a.agent)
  }

  private xorDistance(id1: string, id2: string): bigint {
    const bytes1 = this.hexToBytes(id1)
    const bytes2 = this.hexToBytes(id2)

    let result = 0n
    for (let i = 0; i < bytes1.length; i++) {
      result = (result << 8n) | BigInt(bytes1[i] ^ bytes2[i])
    }

    return result
  }
}
```

### 2. Service Registry

Maintain a registry of agent services:

```typescript
class ServiceRegistry {
  private services: Map<string, ServiceEntry[]> = new Map()
  private agentServices: Map<string, string[]> = new Map()
  private healthChecks: Map<string, HealthStatus> = new Map()

  async registerService(
    registration: ServiceRegistration
  ): Promise<RegistrationResult> {
    const serviceId = this.generateServiceId(registration)

    const entry: ServiceEntry = {
      id: serviceId,
      agentId: registration.agentId,
      name: registration.name,
      type: registration.type,
      capabilities: registration.capabilities,
      endpoint: registration.endpoint,
      pricing: registration.pricing,
      sla: registration.sla,
      registeredAt: Date.now(),
      lastHealthCheck: Date.now(),
      healthy: true
    }

    // Add to service type index
    if (!this.services.has(registration.type)) {
      this.services.set(registration.type, [])
    }
    this.services.get(registration.type)!.push(entry)

    // Add to agent index
    if (!this.agentServices.has(registration.agentId)) {
      this.agentServices.set(registration.agentId, [])
    }
    this.agentServices.get(registration.agentId)!.push(serviceId)

    // Start health monitoring
    this.startHealthCheck(serviceId, entry)

    return {
      success: true,
      serviceId,
      entry
    }
  }

  async discoverServices(query: ServiceQuery): Promise<ServiceEntry[]> {
    let candidates: ServiceEntry[] = []

    // Filter by type
    if (query.type) {
      candidates = this.services.get(query.type) || []
    } else {
      for (const services of this.services.values()) {
        candidates.push(...services)
      }
    }

    // Filter healthy only
    candidates = candidates.filter(s => s.healthy)

    // Filter by capabilities
    if (query.requiredCapabilities) {
      candidates = candidates.filter(s =>
        query.requiredCapabilities!.every(cap =>
          s.capabilities.includes(cap)
        )
      )
    }

    // Filter by price
    if (query.maxPrice) {
      candidates = candidates.filter(s =>
        s.pricing && s.pricing.basePrice <= query.maxPrice!
      )
    }

    // Filter by SLA
    if (query.minUptime) {
      candidates = candidates.filter(s =>
        s.sla && s.sla.uptime >= query.minUptime!
      )
    }

    // Sort by query preferences
    candidates = this.sortServices(candidates, query.sortBy || "relevance")

    // Apply pagination
    const offset = query.offset || 0
    const limit = query.limit || 20

    return candidates.slice(offset, offset + limit)
  }

  private sortServices(
    services: ServiceEntry[],
    sortBy: string
  ): ServiceEntry[] {
    switch (sortBy) {
      case "price_asc":
        return services.sort((a, b) =>
          (a.pricing?.basePrice || 0) - (b.pricing?.basePrice || 0)
        )
      case "price_desc":
        return services.sort((a, b) =>
          (b.pricing?.basePrice || 0) - (a.pricing?.basePrice || 0)
        )
      case "uptime":
        return services.sort((a, b) =>
          (b.sla?.uptime || 0) - (a.sla?.uptime || 0)
        )
      case "recent":
        return services.sort((a, b) => b.registeredAt - a.registeredAt)
      case "relevance":
      default:
        return this.sortByRelevance(services)
    }
  }

  private sortByRelevance(services: ServiceEntry[]): ServiceEntry[] {
    return services.sort((a, b) => {
      // Score based on multiple factors
      const scoreA = this.calculateRelevanceScore(a)
      const scoreB = this.calculateRelevanceScore(b)
      return scoreB - scoreA
    })
  }

  private calculateRelevanceScore(service: ServiceEntry): number {
    let score = 50 // Base score

    // Health bonus
    if (service.healthy) score += 20

    // Uptime bonus
    if (service.sla?.uptime) score += service.sla.uptime * 0.1

    // Recent activity bonus
    const age = Date.now() - service.lastHealthCheck
    if (age < 60000) score += 10 // Active in last minute

    // Capabilities bonus
    score += service.capabilities.length * 2

    return score
  }

  private startHealthCheck(serviceId: string, entry: ServiceEntry): void {
    const checkInterval = setInterval(async () => {
      const healthy = await this.checkServiceHealth(entry)

      this.healthChecks.set(serviceId, {
        healthy,
        checkedAt: Date.now(),
        responseTime: healthy ? Date.now() - entry.lastHealthCheck : -1
      })

      entry.healthy = healthy
      entry.lastHealthCheck = Date.now()

      // Remove if unhealthy for too long
      if (!healthy) {
        const consecutiveFailures = this.getConsecutiveFailures(serviceId)
        if (consecutiveFailures >= 5) {
          this.deregisterService(serviceId)
          clearInterval(checkInterval)
        }
      }
    }, 30000) // Check every 30 seconds
  }

  private async checkServiceHealth(entry: ServiceEntry): Promise<boolean> {
    try {
      const response = await this.messaging.sendRequest(
        entry.agentId,
        { type: "health_check", serviceId: entry.id },
        { timeout: 5000 }
      )
      return response.healthy === true
    } catch {
      return false
    }
  }
}
```

### 3. Network Topology Manager

Manage and optimize agent network topology:

```typescript
class NetworkTopologyManager {
  private nodes: Map<string, TopologyNode> = new Map()
  private connections: Map<string, Connection[]> = new Map()
  private metrics: Map<string, ConnectionMetrics> = new Map()

  async mapTopology(startNode: string): Promise<NetworkTopology> {
    const visited = new Set<string>()
    const topology: TopologyNode[] = []
    const edges: TopologyEdge[] = []

    const queue: string[] = [startNode]

    while (queue.length > 0) {
      const nodeId = queue.shift()!

      if (visited.has(nodeId)) continue
      visited.add(nodeId)

      // Get node info
      const nodeInfo = await this.getNodeInfo(nodeId)
      if (nodeInfo) {
        topology.push(nodeInfo)
        this.nodes.set(nodeId, nodeInfo)

        // Get connections
        const connections = await this.getNodeConnections(nodeId)

        for (const conn of connections) {
          edges.push({
            from: nodeId,
            to: conn.targetId,
            latency: conn.latency,
            bandwidth: conn.bandwidth
          })

          if (!visited.has(conn.targetId)) {
            queue.push(conn.targetId)
          }
        }
      }
    }

    return {
      nodes: topology,
      edges,
      mappedAt: Date.now(),
      totalNodes: topology.length
    }
  }

  async findOptimalPath(
    source: string,
    destination: string,
    metric: "latency" | "bandwidth" | "reliability" = "latency"
  ): Promise<RoutePath> {
    // Dijkstra's algorithm with custom metric
    const distances = new Map<string, number>()
    const previous = new Map<string, string>()
    const unvisited = new Set<string>(this.nodes.keys())

    distances.set(source, 0)

    while (unvisited.size > 0) {
      // Find minimum distance node
      let current: string | null = null
      let minDistance = Infinity

      for (const nodeId of unvisited) {
        const dist = distances.get(nodeId) ?? Infinity
        if (dist < minDistance) {
          minDistance = dist
          current = nodeId
        }
      }

      if (!current || current === destination) break

      unvisited.delete(current)

      // Update neighbors
      const connections = this.connections.get(current) || []

      for (const conn of connections) {
        if (!unvisited.has(conn.targetId)) continue

        const edgeCost = this.getEdgeCost(conn, metric)
        const totalCost = (distances.get(current) ?? Infinity) + edgeCost

        if (totalCost < (distances.get(conn.targetId) ?? Infinity)) {
          distances.set(conn.targetId, totalCost)
          previous.set(conn.targetId, current)
        }
      }
    }

    // Reconstruct path
    const path: string[] = []
    let current: string | undefined = destination

    while (current) {
      path.unshift(current)
      current = previous.get(current)
    }

    return {
      path,
      totalCost: distances.get(destination) ?? Infinity,
      metric,
      hops: path.length - 1
    }
  }

  async optimizeConnections(
    nodeId: string,
    targetConnections: number = 8
  ): Promise<OptimizationResult> {
    const currentConnections = this.connections.get(nodeId) || []
    const changes: ConnectionChange[] = []

    // Score existing connections
    const scored = currentConnections.map(conn => ({
      connection: conn,
      score: this.scoreConnection(conn)
    }))

    // Find candidates for new connections
    const candidates = await this.findConnectionCandidates(
      nodeId,
      targetConnections * 2
    )

    // Score candidates
    const scoredCandidates = candidates.map(candidate => ({
      candidate,
      score: this.scorePotentialConnection(nodeId, candidate)
    }))

    // Drop worst connections if over target
    if (currentConnections.length > targetConnections) {
      const toDrop = scored
        .sort((a, b) => a.score - b.score)
        .slice(0, currentConnections.length - targetConnections)

      for (const { connection } of toDrop) {
        await this.disconnectFrom(nodeId, connection.targetId)
        changes.push({
          type: "disconnect",
          targetId: connection.targetId,
          reason: "optimization"
        })
      }
    }

    // Add best candidates if under target
    const currentCount = this.connections.get(nodeId)?.length || 0

    if (currentCount < targetConnections) {
      const toAdd = scoredCandidates
        .filter(sc => !this.isConnected(nodeId, sc.candidate.id))
        .sort((a, b) => b.score - a.score)
        .slice(0, targetConnections - currentCount)

      for (const { candidate } of toAdd) {
        await this.connectTo(nodeId, candidate.id)
        changes.push({
          type: "connect",
          targetId: candidate.id,
          reason: "optimization"
        })
      }
    }

    return {
      nodeId,
      changes,
      finalConnectionCount: this.connections.get(nodeId)?.length || 0,
      optimizedAt: Date.now()
    }
  }

  private scoreConnection(conn: Connection): number {
    let score = 50

    // Latency score (lower is better)
    if (conn.latency < 50) score += 30
    else if (conn.latency < 100) score += 20
    else if (conn.latency < 200) score += 10

    // Reliability score
    score += conn.reliability * 20

    // Bandwidth score
    if (conn.bandwidth > 1000000) score += 10

    return score
  }

  private scorePotentialConnection(
    nodeId: string,
    candidate: TopologyNode
  ): number {
    let score = 0

    // Geographic diversity
    const existingRegions = this.getConnectedRegions(nodeId)
    if (!existingRegions.has(candidate.region)) {
      score += 20
    }

    // Capability diversity
    const missingCapabilities = candidate.capabilities.filter(cap =>
      !this.hasCapabilityInConnections(nodeId, cap)
    )
    score += missingCapabilities.length * 5

    // Reputation
    score += (candidate.reputation || 50)

    return score
  }
}
```

## Best Practices

1. **Use DHT** for scalable agent discovery
2. **Implement health checks** for service reliability
3. **Optimize network topology** for performance
4. **Cache discovery results** with appropriate TTL
5. **Announce capabilities** proactively

## Related Skills

- [Agent Registry Agent](./agent-registry-agent.md) - Agent registration
- [Agent Communication Agent](./agent-communication-agent.md) - Messaging
- [Task Delegation Agent](./task-delegation-agent.md) - Finding capable agents
