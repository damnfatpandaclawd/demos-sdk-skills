# Failover Agent Skill

Build agents that automatically handle service failures and maintain availability.

## Overview

Failover Agent enables automatic failure detection, service recovery, and high availability management. Essential for zero-downtime operations, disaster recovery, and resilient distributed systems.

## SDK Reference

```typescript
import { Demos } from "@kynesyslabs/demosdk/websdk"
import { Messaging } from "@kynesyslabs/demosdk/messaging"

// Failover messaging
const messaging = await demos.messaging.create()
```

## Agent Use Cases

### 1. Active-Passive Failover Manager

Manage primary-backup failover patterns:

```typescript
class ActivePassiveFailover {
  private primary: ServiceNode | null = null
  private backups: ServiceNode[] = []
  private heartbeatInterval: number = 5000
  private failureThreshold: number = 3
  private currentLeader: ServiceNode | null = null

  async configurePrimaryBackup(
    primary: ServiceNode,
    backups: ServiceNode[]
  ): Promise<void> {
    this.primary = primary
    this.backups = backups
    this.currentLeader = primary

    // Start heartbeat monitoring
    this.startHeartbeatMonitoring()

    // Sync state to backups
    await this.syncStateToBackups()
  }

  private startHeartbeatMonitoring(): void {
    setInterval(async () => {
      if (!this.currentLeader) return

      const healthy = await this.checkHealth(this.currentLeader)

      if (!healthy) {
        this.currentLeader.consecutiveFailures =
          (this.currentLeader.consecutiveFailures || 0) + 1

        if (this.currentLeader.consecutiveFailures >= this.failureThreshold) {
          await this.initiateFailover()
        }
      } else {
        this.currentLeader.consecutiveFailures = 0
      }
    }, this.heartbeatInterval)
  }

  private async checkHealth(node: ServiceNode): Promise<boolean> {
    try {
      const response = await this.messaging.sendRequest(
        node.publicKey,
        { type: "heartbeat", timestamp: Date.now() },
        { timeout: 3000 }
      )

      return response.status === "healthy"
    } catch {
      return false
    }
  }

  async initiateFailover(): Promise<FailoverResult> {
    const failedNode = this.currentLeader
    const startTime = Date.now()

    // Find healthy backup
    const newLeader = await this.selectNewLeader()

    if (!newLeader) {
      return {
        success: false,
        error: "No healthy backup available",
        downtime: Date.now() - startTime
      }
    }

    try {
      // Promote backup to primary
      await this.promoteToLeader(newLeader)

      // Update routing
      await this.updateRouting(newLeader)

      // Notify other backups
      await this.notifyBackups(newLeader)

      // Demote failed node to backup (for later recovery)
      if (failedNode) {
        failedNode.role = "backup"
        this.backups.push(failedNode)
      }

      this.currentLeader = newLeader

      return {
        success: true,
        previousLeader: failedNode?.id,
        newLeader: newLeader.id,
        downtime: Date.now() - startTime,
        timestamp: Date.now()
      }

    } catch (error) {
      return {
        success: false,
        error: (error as Error).message,
        downtime: Date.now() - startTime
      }
    }
  }

  private async selectNewLeader(): Promise<ServiceNode | null> {
    // Sort backups by priority
    const sortedBackups = [...this.backups].sort((a, b) =>
      (a.priority || 99) - (b.priority || 99)
    )

    for (const backup of sortedBackups) {
      if (await this.checkHealth(backup)) {
        return backup
      }
    }

    return null
  }

  private async promoteToLeader(node: ServiceNode): Promise<void> {
    await this.messaging.sendRequest(
      node.publicKey,
      {
        type: "promote_to_leader",
        timestamp: Date.now(),
        state: await this.getLastKnownState()
      },
      { timeout: 10000 }
    )

    node.role = "primary"

    // Remove from backups
    this.backups = this.backups.filter(b => b.id !== node.id)
  }

  private async syncStateToBackups(): Promise<void> {
    const state = await this.getCurrentState()

    const syncPromises = this.backups.map(backup =>
      this.messaging.send(backup.publicKey, {
        type: "state_sync",
        state,
        timestamp: Date.now()
      })
    )

    await Promise.allSettled(syncPromises)
  }

  async getCurrentState(): Promise<ServiceState> {
    if (!this.currentLeader) {
      throw new Error("No current leader")
    }

    const response = await this.messaging.sendRequest(
      this.currentLeader.publicKey,
      { type: "get_state" },
      { timeout: 5000 }
    )

    return response.state
  }
}
```

### 2. Circuit Breaker Manager

Implement circuit breaker pattern for fault isolation:

```typescript
class CircuitBreakerManager {
  private circuits: Map<string, CircuitBreaker> = new Map()

  createCircuit(
    serviceId: string,
    config: CircuitConfig
  ): CircuitBreaker {
    const circuit: CircuitBreaker = {
      serviceId,
      state: "closed",
      failureCount: 0,
      successCount: 0,
      lastFailure: 0,
      lastSuccess: 0,
      config: {
        failureThreshold: config.failureThreshold || 5,
        successThreshold: config.successThreshold || 3,
        timeout: config.timeout || 30000,
        halfOpenRequests: config.halfOpenRequests || 1
      },
      metrics: {
        totalRequests: 0,
        failedRequests: 0,
        successfulRequests: 0,
        rejectedRequests: 0
      }
    }

    this.circuits.set(serviceId, circuit)
    return circuit
  }

  async executeWithCircuit<T>(
    serviceId: string,
    operation: () => Promise<T>
  ): Promise<T> {
    const circuit = this.circuits.get(serviceId)

    if (!circuit) {
      throw new Error(`No circuit breaker for service: ${serviceId}`)
    }

    circuit.metrics.totalRequests++

    // Check circuit state
    if (circuit.state === "open") {
      // Check if timeout has passed
      if (Date.now() - circuit.lastFailure >= circuit.config.timeout) {
        circuit.state = "half-open"
        circuit.successCount = 0
      } else {
        circuit.metrics.rejectedRequests++
        throw new CircuitOpenError(
          `Circuit breaker open for ${serviceId}`,
          circuit.config.timeout - (Date.now() - circuit.lastFailure)
        )
      }
    }

    try {
      const result = await operation()

      this.recordSuccess(circuit)
      return result

    } catch (error) {
      this.recordFailure(circuit)
      throw error
    }
  }

  private recordSuccess(circuit: CircuitBreaker): void {
    circuit.successCount++
    circuit.lastSuccess = Date.now()
    circuit.metrics.successfulRequests++

    if (circuit.state === "half-open") {
      if (circuit.successCount >= circuit.config.successThreshold) {
        // Close circuit
        circuit.state = "closed"
        circuit.failureCount = 0
      }
    } else if (circuit.state === "closed") {
      // Reset failure count on success
      circuit.failureCount = 0
    }
  }

  private recordFailure(circuit: CircuitBreaker): void {
    circuit.failureCount++
    circuit.lastFailure = Date.now()
    circuit.metrics.failedRequests++

    if (circuit.state === "half-open") {
      // Open circuit immediately on failure in half-open state
      circuit.state = "open"
    } else if (circuit.state === "closed") {
      if (circuit.failureCount >= circuit.config.failureThreshold) {
        // Open circuit
        circuit.state = "open"
      }
    }
  }

  getCircuitStats(serviceId: string): CircuitStats | null {
    const circuit = this.circuits.get(serviceId)
    if (!circuit) return null

    return {
      serviceId,
      state: circuit.state,
      failureCount: circuit.failureCount,
      successCount: circuit.successCount,
      lastFailure: circuit.lastFailure,
      lastSuccess: circuit.lastSuccess,
      metrics: circuit.metrics,
      healthPercentage: circuit.metrics.totalRequests > 0
        ? (circuit.metrics.successfulRequests / circuit.metrics.totalRequests) * 100
        : 100
    }
  }

  async monitorAllCircuits(
    onStateChange: (serviceId: string, oldState: CircuitState, newState: CircuitState) => void
  ): Promise<void> {
    const previousStates = new Map<string, CircuitState>()

    setInterval(() => {
      for (const [serviceId, circuit] of this.circuits) {
        const previousState = previousStates.get(serviceId)

        if (previousState && previousState !== circuit.state) {
          onStateChange(serviceId, previousState, circuit.state)
        }

        previousStates.set(serviceId, circuit.state)
      }
    }, 1000)
  }
}

class CircuitOpenError extends Error {
  constructor(message: string, public retryAfter: number) {
    super(message)
    this.name = "CircuitOpenError"
  }
}
```

### 3. Multi-Region Failover

Coordinate failover across geographic regions:

```typescript
class MultiRegionFailover {
  private regions: Map<string, RegionConfig> = new Map()
  private activeRegion: string | null = null
  private regionHealth: Map<string, RegionHealth> = new Map()

  async configureRegions(configs: RegionConfig[]): Promise<void> {
    for (const config of configs) {
      this.regions.set(config.id, config)
      this.regionHealth.set(config.id, {
        regionId: config.id,
        healthy: false,
        latency: Infinity,
        lastCheck: 0,
        services: new Map()
      })
    }

    // Initial health check
    await this.checkAllRegions()

    // Set initial active region
    this.activeRegion = await this.determineActiveRegion()

    // Start continuous monitoring
    this.startRegionMonitoring()
  }

  private async checkAllRegions(): Promise<void> {
    const checks = Array.from(this.regions.keys()).map(async regionId => {
      const health = await this.checkRegionHealth(regionId)
      this.regionHealth.set(regionId, health)
    })

    await Promise.all(checks)
  }

  private async checkRegionHealth(regionId: string): Promise<RegionHealth> {
    const region = this.regions.get(regionId)!
    const startTime = Date.now()

    const health: RegionHealth = {
      regionId,
      healthy: true,
      latency: 0,
      lastCheck: Date.now(),
      services: new Map()
    }

    // Check each service in region
    for (const service of region.services) {
      try {
        const serviceHealth = await this.checkServiceHealth(service)
        health.services.set(service.id, serviceHealth)

        if (!serviceHealth.healthy) {
          health.healthy = false
        }
      } catch {
        health.services.set(service.id, {
          serviceId: service.id,
          healthy: false,
          error: "Health check failed"
        })
        health.healthy = false
      }
    }

    health.latency = Date.now() - startTime

    return health
  }

  private async checkServiceHealth(service: ServiceEndpoint): Promise<ServiceHealth> {
    try {
      const response = await this.messaging.sendRequest(
        service.publicKey,
        { type: "health_check" },
        { timeout: 5000 }
      )

      return {
        serviceId: service.id,
        healthy: response.status === "healthy",
        details: response.details
      }
    } catch (error) {
      return {
        serviceId: service.id,
        healthy: false,
        error: (error as Error).message
      }
    }
  }

  async initiateRegionalFailover(
    fromRegion: string,
    reason: string
  ): Promise<RegionalFailoverResult> {
    const startTime = Date.now()

    // Find best alternative region
    const newRegion = await this.selectBestRegion([fromRegion])

    if (!newRegion) {
      return {
        success: false,
        error: "No healthy region available",
        downtime: Date.now() - startTime
      }
    }

    try {
      // Pre-failover validation
      await this.validateRegionReady(newRegion)

      // Sync data if needed
      await this.syncRegionData(fromRegion, newRegion)

      // Switch traffic
      await this.switchTraffic(fromRegion, newRegion)

      // Update DNS/routing
      await this.updateGlobalRouting(newRegion)

      // Verify new region is serving traffic
      await this.verifyFailoverComplete(newRegion)

      this.activeRegion = newRegion

      return {
        success: true,
        fromRegion,
        toRegion: newRegion,
        reason,
        downtime: Date.now() - startTime,
        timestamp: Date.now()
      }

    } catch (error) {
      // Attempt rollback
      await this.attemptRollback(fromRegion)

      return {
        success: false,
        fromRegion,
        toRegion: newRegion,
        error: (error as Error).message,
        downtime: Date.now() - startTime
      }
    }
  }

  private async selectBestRegion(exclude: string[]): Promise<string | null> {
    const candidates = Array.from(this.regionHealth.entries())
      .filter(([id, health]) =>
        !exclude.includes(id) && health.healthy
      )
      .sort((a, b) => {
        // Sort by priority first, then latency
        const regionA = this.regions.get(a[0])!
        const regionB = this.regions.get(b[0])!

        if (regionA.priority !== regionB.priority) {
          return regionA.priority - regionB.priority
        }

        return a[1].latency - b[1].latency
      })

    return candidates.length > 0 ? candidates[0][0] : null
  }

  private async switchTraffic(
    fromRegion: string,
    toRegion: string
  ): Promise<void> {
    // Implement gradual traffic shift
    const steps = [10, 25, 50, 75, 100]

    for (const percentage of steps) {
      await this.setTrafficSplit(fromRegion, 100 - percentage, toRegion, percentage)

      // Verify health after each step
      const health = await this.checkRegionHealth(toRegion)

      if (!health.healthy) {
        throw new Error(`Region ${toRegion} became unhealthy at ${percentage}% traffic`)
      }

      await new Promise(r => setTimeout(r, 5000))
    }
  }

  private startRegionMonitoring(): void {
    setInterval(async () => {
      await this.checkAllRegions()

      // Check if active region is still healthy
      const activeHealth = this.regionHealth.get(this.activeRegion!)

      if (activeHealth && !activeHealth.healthy) {
        // Initiate automatic failover
        await this.initiateRegionalFailover(
          this.activeRegion!,
          "Automatic failover due to health check failure"
        )
      }
    }, 30000)
  }
}
```

## Best Practices

1. **Implement health checks** at multiple levels
2. **Use circuit breakers** to prevent cascade failures
3. **Test failover regularly** in non-production environments
4. **Maintain state synchronization** between primary and backups
5. **Monitor failover metrics** for continuous improvement

## Related Skills

- [Load Balancer Agent](./load-balancer-agent.md) - Traffic distribution
- [Backup Recovery Agent](./backup-recovery-agent.md) - Data recovery
- [Alert Manager Agent](./alert-manager-agent.md) - Failure alerts
