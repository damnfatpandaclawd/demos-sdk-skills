# Swarm Intelligence Agent Skill

> **⚠️ Prerequisites**: Complete [SDK Setup](./00-sdk-setup.md) first to configure your environment.

Build agents that leverage collective intelligence for emergent problem solving.

## Overview

Swarm Intelligence Agent enables decentralized decision making inspired by natural swarms. Essential for distributed optimization, collective learning, and adaptive systems that emerge from simple agent interactions.

## SDK Reference

```typescript
import { Demos } from "@kynesyslabs/demosdk/websdk"
import { Messaging } from "@kynesyslabs/demosdk/messaging"

// Swarm communication
const messaging = await demos.messaging.create()
```

## Agent Use Cases

### 1. Particle Swarm Optimizer

Collective optimization through particle movement:

```typescript
class ParticleSwarmOptimizer {
  private particles: Particle[] = []
  private globalBest: Position | null = null
  private globalBestValue: number = -Infinity

  private inertiaWeight: number = 0.7
  private cognitiveWeight: number = 1.5
  private socialWeight: number = 1.5

  async initializeSwarm(
    numParticles: number,
    dimensions: number,
    bounds: { min: number[]; max: number[] }
  ): Promise<void> {
    this.particles = []

    for (let i = 0; i < numParticles; i++) {
      const position = this.randomPosition(dimensions, bounds)
      const velocity = this.randomVelocity(dimensions, bounds)

      const particle: Particle = {
        id: `particle_${i}`,
        position,
        velocity,
        personalBest: [...position],
        personalBestValue: -Infinity
      }

      this.particles.push(particle)
    }
  }

  async optimize(
    fitnessFunction: (position: number[]) => Promise<number>,
    iterations: number,
    onProgress?: (iteration: number, best: number) => void
  ): Promise<OptimizationResult> {
    for (let iter = 0; iter < iterations; iter++) {
      // Evaluate all particles in parallel
      const evaluations = await Promise.all(
        this.particles.map(async particle => {
          const fitness = await fitnessFunction(particle.position)
          return { particle, fitness }
        })
      )

      // Update personal and global bests
      for (const { particle, fitness } of evaluations) {
        if (fitness > particle.personalBestValue) {
          particle.personalBestValue = fitness
          particle.personalBest = [...particle.position]
        }

        if (fitness > this.globalBestValue) {
          this.globalBestValue = fitness
          this.globalBest = [...particle.position]
        }
      }

      // Update velocities and positions
      for (const particle of this.particles) {
        this.updateParticle(particle)
      }

      // Adaptive inertia weight
      this.inertiaWeight = 0.9 - (0.5 * iter / iterations)

      if (onProgress) {
        onProgress(iter, this.globalBestValue)
      }
    }

    return {
      bestPosition: this.globalBest!,
      bestValue: this.globalBestValue,
      iterations,
      convergenceHistory: this.getConvergenceHistory()
    }
  }

  private updateParticle(particle: Particle): void {
    for (let d = 0; d < particle.position.length; d++) {
      const r1 = Math.random()
      const r2 = Math.random()

      // Velocity update
      const cognitive = this.cognitiveWeight * r1 *
        (particle.personalBest[d] - particle.position[d])
      const social = this.socialWeight * r2 *
        (this.globalBest![d] - particle.position[d])

      particle.velocity[d] =
        this.inertiaWeight * particle.velocity[d] +
        cognitive +
        social

      // Position update
      particle.position[d] += particle.velocity[d]
    }
  }
}
```

### 2. Ant Colony Optimizer

Path finding through pheromone trails:

```typescript
class AntColonyOptimizer {
  private pheromoneMatrix: Map<string, number> = new Map()
  private evaporationRate: number = 0.1
  private pheromoneDeposit: number = 1.0
  private alpha: number = 1.0 // Pheromone importance
  private beta: number = 2.0  // Heuristic importance

  async findOptimalPath(
    graph: Graph,
    startNode: string,
    endNode: string,
    numAnts: number,
    iterations: number
  ): Promise<PathResult> {
    this.initializePheromones(graph)

    let bestPath: string[] = []
    let bestCost = Infinity

    for (let iter = 0; iter < iterations; iter++) {
      const antPaths = await this.runAnts(
        graph,
        startNode,
        endNode,
        numAnts
      )

      // Update pheromones
      this.evaporatePheromones()

      for (const { path, cost } of antPaths) {
        if (cost < bestCost) {
          bestCost = cost
          bestPath = path
        }

        this.depositPheromones(path, cost)
      }

      // Elite ant strategy: reinforce best path
      if (bestPath.length > 0) {
        this.depositPheromones(bestPath, bestCost, 2.0)
      }
    }

    return {
      path: bestPath,
      cost: bestCost,
      pheromoneMap: this.exportPheromoneMap()
    }
  }

  private async runAnts(
    graph: Graph,
    start: string,
    end: string,
    numAnts: number
  ): Promise<AntPath[]> {
    const paths: AntPath[] = []

    for (let ant = 0; ant < numAnts; ant++) {
      const path = await this.constructPath(graph, start, end)
      if (path) {
        paths.push(path)
      }
    }

    return paths
  }

  private async constructPath(
    graph: Graph,
    start: string,
    end: string
  ): Promise<AntPath | null> {
    const path: string[] = [start]
    const visited = new Set<string>([start])
    let current = start
    let totalCost = 0

    while (current !== end) {
      const neighbors = graph.getNeighbors(current)
        .filter(n => !visited.has(n.id))

      if (neighbors.length === 0) {
        return null // Dead end
      }

      // Calculate probabilities
      const probabilities = neighbors.map(neighbor => {
        const edge = `${current}-${neighbor.id}`
        const pheromone = this.pheromoneMatrix.get(edge) || 0.01
        const heuristic = 1 / neighbor.cost // Inverse of cost

        return {
          neighbor: neighbor.id,
          cost: neighbor.cost,
          probability: Math.pow(pheromone, this.alpha) *
                       Math.pow(heuristic, this.beta)
        }
      })

      // Normalize probabilities
      const total = probabilities.reduce((sum, p) => sum + p.probability, 0)
      probabilities.forEach(p => p.probability /= total)

      // Roulette wheel selection
      const selected = this.rouletteSelect(probabilities)

      path.push(selected.neighbor)
      visited.add(selected.neighbor)
      totalCost += selected.cost
      current = selected.neighbor
    }

    return { path, cost: totalCost }
  }

  private depositPheromones(
    path: string[],
    cost: number,
    multiplier: number = 1.0
  ): void {
    const deposit = (this.pheromoneDeposit / cost) * multiplier

    for (let i = 0; i < path.length - 1; i++) {
      const edge = `${path[i]}-${path[i + 1]}`
      const current = this.pheromoneMatrix.get(edge) || 0
      this.pheromoneMatrix.set(edge, current + deposit)
    }
  }

  private evaporatePheromones(): void {
    for (const [edge, pheromone] of this.pheromoneMatrix) {
      this.pheromoneMatrix.set(
        edge,
        pheromone * (1 - this.evaporationRate)
      )
    }
  }
}
```

### 3. Collective Learning Network

Distributed knowledge aggregation:

```typescript
class CollectiveLearningNetwork {
  private messaging: Messaging
  private localKnowledge: KnowledgeBase
  private neighborWeights: Map<string, number> = new Map()

  async shareKnowledge(topic: string): Promise<void> {
    const knowledge = this.localKnowledge.get(topic)
    if (!knowledge) return

    const message: KnowledgeShare = {
      type: "knowledge_share",
      topic,
      knowledge: this.summarizeKnowledge(knowledge),
      confidence: knowledge.confidence,
      timestamp: Date.now()
    }

    // Broadcast to neighbors
    for (const [neighborId, weight] of this.neighborWeights) {
      if (weight > 0.3) { // Only share with trusted neighbors
        await this.messaging.send(neighborId, message)
      }
    }
  }

  async aggregateKnowledge(
    topic: string,
    timeout: number = 5000
  ): Promise<AggregatedKnowledge> {
    // Request knowledge from neighbors
    const request: KnowledgeRequest = {
      type: "knowledge_request",
      topic,
      requestId: this.generateRequestId()
    }

    const responses: KnowledgeResponse[] = []

    const promises = Array.from(this.neighborWeights.entries())
      .filter(([, weight]) => weight > 0.2)
      .map(async ([neighborId, weight]) => {
        try {
          const response = await this.messaging.sendRequest(
            neighborId,
            request,
            { timeout }
          )
          return { response, weight }
        } catch {
          return null
        }
      })

    const results = await Promise.all(promises)

    // Weighted aggregation
    const aggregated = this.weightedAggregate(
      results.filter((r): r is { response: KnowledgeResponse; weight: number } => r !== null)
    )

    // Update local knowledge
    this.localKnowledge.merge(topic, aggregated)

    return aggregated
  }

  private weightedAggregate(
    responses: { response: KnowledgeResponse; weight: number }[]
  ): AggregatedKnowledge {
    const values: Map<string, number[]> = new Map()
    const weights: Map<string, number[]> = new Map()

    for (const { response, weight } of responses) {
      for (const [key, value] of Object.entries(response.knowledge)) {
        if (!values.has(key)) {
          values.set(key, [])
          weights.set(key, [])
        }

        values.get(key)!.push(value as number)
        weights.get(key)!.push(weight * response.confidence)
      }
    }

    const aggregated: Record<string, number> = {}

    for (const [key, vals] of values) {
      const ws = weights.get(key)!
      const totalWeight = ws.reduce((a, b) => a + b, 0)

      if (totalWeight > 0) {
        aggregated[key] = vals.reduce(
          (sum, v, i) => sum + v * ws[i],
          0
        ) / totalWeight
      }
    }

    return {
      values: aggregated,
      confidence: this.calculateConfidence(responses),
      sources: responses.length,
      timestamp: Date.now()
    }
  }

  async updateNeighborTrust(
    neighborId: string,
    interaction: InteractionResult
  ): Promise<void> {
    const currentWeight = this.neighborWeights.get(neighborId) || 0.5

    // Adjust weight based on interaction quality
    const adjustment = interaction.success
      ? 0.05 * interaction.quality
      : -0.1

    const newWeight = Math.max(0, Math.min(1, currentWeight + adjustment))
    this.neighborWeights.set(neighborId, newWeight)
  }

  async emergentDecision(
    question: string,
    options: string[]
  ): Promise<EmergentDecision> {
    // Collect local preference
    const localPreference = await this.evaluateOptions(question, options)

    // Share with neighbors
    const votes = await this.collectVotes(question, options)

    // Weighted voting
    const scores: Map<string, number> = new Map()

    for (const option of options) {
      scores.set(option, localPreference.get(option) || 0)
    }

    for (const { vote, weight } of votes) {
      const current = scores.get(vote.option) || 0
      scores.set(vote.option, current + vote.confidence * weight)
    }

    // Find winner
    let winner = options[0]
    let maxScore = scores.get(winner) || 0

    for (const [option, score] of scores) {
      if (score > maxScore) {
        maxScore = score
        winner = option
      }
    }

    return {
      decision: winner,
      confidence: maxScore / (votes.length + 1),
      participation: votes.length,
      scoreBreakdown: Object.fromEntries(scores)
    }
  }
}
```

## Best Practices

1. **Balance exploration and exploitation** in optimization
2. **Use adaptive parameters** that change with progress
3. **Implement diversity preservation** to avoid premature convergence
4. **Weight neighbor contributions** by trust and relevance
5. **Allow emergent behavior** rather than forcing consensus

## Related Skills

- [Multi-Agent Coordinator](./multi-agent-coordinator-agent.md) - Coordination
- [Consensus Agent](./consensus-agent.md) - Agreement protocols
- [Agent Discovery Agent](./agent-discovery-agent.md) - Finding neighbors
