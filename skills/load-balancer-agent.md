# Load Balancer Agent Skill

Build agents that distribute workloads across multiple service instances.

## Overview

Load Balancer Agent enables intelligent request distribution, health-aware routing, and adaptive load balancing across agent networks. Essential for high availability, horizontal scaling, and optimal resource utilization.

## SDK Reference

```typescript
import { Demos } from "@kynesyslabs/demosdk/websdk"
import { Messaging } from "@kynesyslabs/demosdk/messaging"

// Load balancing messaging
const messaging = await demos.messaging.create()
```

## Agent Use Cases

### 1. Weighted Round Robin Balancer

Distribute requests based on instance capacity:

```typescript
class WeightedRoundRobinBalancer {
  private instances: Map<string, ServiceInstance> = new Map()
  private weights: Map<string, number> = new Map()
  private currentIndex: number = 0
  private currentWeight: number = 0

  async registerInstance(instance: ServiceInstance): Promise<void> {
    this.instances.set(instance.id, instance)
    this.weights.set(instance.id, instance.weight || 1)

    // Start health monitoring
    this.startHealthCheck(instance)
  }

  async deregisterInstance(instanceId: string): Promise<void> {
    this.instances.delete(instanceId)
    this.weights.delete(instanceId)
  }

  async getNextInstance(): Promise<ServiceInstance | null> {
    const healthyInstances = this.getHealthyInstances()

    if (healthyInstances.length === 0) {
      return null
    }

    // Weighted round robin selection
    const maxWeight = Math.max(...Array.from(this.weights.values()))
    const gcd = this.calculateGCD(Array.from(this.weights.values()))

    while (true) {
      this.currentIndex = (this.currentIndex + 1) % healthyInstances.length

      if (this.currentIndex === 0) {
        this.currentWeight = this.currentWeight - gcd
        if (this.currentWeight <= 0) {
          this.currentWeight = maxWeight
        }
      }

      const instance = healthyInstances[this.currentIndex]
      const weight = this.weights.get(instance.id) || 1

      if (weight >= this.currentWeight) {
        return instance
      }
    }
  }

  async routeRequest(request: ServiceRequest): Promise<ServiceResponse> {
    const instance = await this.getNextInstance()

    if (!instance) {
      throw new Error("No healthy instances available")
    }

    const startTime = Date.now()

    try {
      const response = await this.messaging.sendRequest(
        instance.publicKey,
        {
          type: "service_request",
          ...request
        },
        { timeout: request.timeout || 30000 }
      )

      // Update metrics
      this.updateMetrics(instance.id, {
        responseTime: Date.now() - startTime,
        success: true
      })

      return response

    } catch (error) {
      // Update metrics and potentially mark unhealthy
      this.updateMetrics(instance.id, {
        responseTime: Date.now() - startTime,
        success: false,
        error: (error as Error).message
      })

      // Retry with different instance
      return await this.routeWithRetry(request, instance.id)
    }
  }

  private async routeWithRetry(
    request: ServiceRequest,
    excludeId: string,
    retries: number = 2
  ): Promise<ServiceResponse> {
    const healthyInstances = this.getHealthyInstances()
      .filter(i => i.id !== excludeId)

    for (let i = 0; i < Math.min(retries, healthyInstances.length); i++) {
      const instance = healthyInstances[i]

      try {
        return await this.messaging.sendRequest(
          instance.publicKey,
          { type: "service_request", ...request },
          { timeout: request.timeout || 30000 }
        )
      } catch {
        continue
      }
    }

    throw new Error("All retry attempts failed")
  }

  private getHealthyInstances(): ServiceInstance[] {
    return Array.from(this.instances.values())
      .filter(instance => instance.status === "healthy")
  }

  private calculateGCD(numbers: number[]): number {
    const gcd = (a: number, b: number): number => b === 0 ? a : gcd(b, a % b)
    return numbers.reduce((a, b) => gcd(a, b))
  }

  private startHealthCheck(instance: ServiceInstance): void {
    setInterval(async () => {
      try {
        await this.messaging.sendRequest(
          instance.publicKey,
          { type: "health_check" },
          { timeout: 5000 }
        )

        instance.status = "healthy"
        instance.lastHealthCheck = Date.now()

      } catch {
        instance.consecutiveFailures = (instance.consecutiveFailures || 0) + 1

        if (instance.consecutiveFailures >= 3) {
          instance.status = "unhealthy"
        }
      }
    }, 10000)
  }
}
```

### 2. Least Connections Balancer

Route to instances with fewest active connections:

```typescript
class LeastConnectionsBalancer {
  private instances: Map<string, ServiceInstance> = new Map()
  private activeConnections: Map<string, number> = new Map()
  private connectionLocks: Map<string, Promise<void>> = new Map()

  async registerInstance(instance: ServiceInstance): Promise<void> {
    this.instances.set(instance.id, instance)
    this.activeConnections.set(instance.id, 0)
  }

  async getNextInstance(): Promise<ServiceInstance | null> {
    const healthyInstances = Array.from(this.instances.values())
      .filter(i => i.status === "healthy")

    if (healthyInstances.length === 0) {
      return null
    }

    // Find instance with least connections
    let minConnections = Infinity
    let selectedInstance: ServiceInstance | null = null

    for (const instance of healthyInstances) {
      const connections = this.activeConnections.get(instance.id) || 0
      const weightedConnections = connections / (instance.weight || 1)

      if (weightedConnections < minConnections) {
        minConnections = weightedConnections
        selectedInstance = instance
      }
    }

    return selectedInstance
  }

  async routeRequest(request: ServiceRequest): Promise<ServiceResponse> {
    const instance = await this.getNextInstance()

    if (!instance) {
      throw new Error("No healthy instances available")
    }

    // Increment connection count
    const currentConnections = this.activeConnections.get(instance.id) || 0
    this.activeConnections.set(instance.id, currentConnections + 1)

    try {
      const response = await this.messaging.sendRequest(
        instance.publicKey,
        { type: "service_request", ...request },
        { timeout: request.timeout || 30000 }
      )

      return response

    } finally {
      // Decrement connection count
      const connections = this.activeConnections.get(instance.id) || 1
      this.activeConnections.set(instance.id, Math.max(0, connections - 1))
    }
  }

  async getInstanceStats(): Promise<InstanceStats[]> {
    return Array.from(this.instances.values()).map(instance => ({
      id: instance.id,
      status: instance.status,
      activeConnections: this.activeConnections.get(instance.id) || 0,
      weight: instance.weight || 1,
      lastHealthCheck: instance.lastHealthCheck
    }))
  }
}
```

### 3. Adaptive Load Balancer

Dynamically adjust routing based on performance:

```typescript
class AdaptiveLoadBalancer {
  private instances: Map<string, ServiceInstance> = new Map()
  private metrics: Map<string, InstanceMetrics> = new Map()
  private algorithm: BalancingAlgorithm = "weighted_response_time"

  async registerInstance(instance: ServiceInstance): Promise<void> {
    this.instances.set(instance.id, instance)
    this.metrics.set(instance.id, {
      responseTimeAvg: 0,
      responseTimeP95: 0,
      errorRate: 0,
      throughput: 0,
      samples: [],
      score: 100
    })
  }

  async getNextInstance(): Promise<ServiceInstance | null> {
    const healthyInstances = Array.from(this.instances.values())
      .filter(i => i.status === "healthy")

    if (healthyInstances.length === 0) {
      return null
    }

    switch (this.algorithm) {
      case "weighted_response_time":
        return this.selectByResponseTime(healthyInstances)

      case "error_rate_aware":
        return this.selectByErrorRate(healthyInstances)

      case "adaptive_score":
        return this.selectByAdaptiveScore(healthyInstances)

      default:
        return healthyInstances[0]
    }
  }

  private selectByResponseTime(
    instances: ServiceInstance[]
  ): ServiceInstance {
    // Weight inversely by response time
    const weights = instances.map(instance => {
      const metrics = this.metrics.get(instance.id)!
      const avgResponseTime = metrics.responseTimeAvg || 100

      return {
        instance,
        weight: 1000 / Math.max(avgResponseTime, 1)
      }
    })

    // Weighted random selection
    const totalWeight = weights.reduce((sum, w) => sum + w.weight, 0)
    let random = Math.random() * totalWeight

    for (const { instance, weight } of weights) {
      random -= weight
      if (random <= 0) {
        return instance
      }
    }

    return instances[0]
  }

  private selectByErrorRate(
    instances: ServiceInstance[]
  ): ServiceInstance {
    // Prefer instances with lower error rates
    const weights = instances.map(instance => {
      const metrics = this.metrics.get(instance.id)!
      const errorRate = metrics.errorRate || 0

      return {
        instance,
        weight: Math.pow(1 - errorRate, 2) // Quadratic penalty for errors
      }
    })

    const totalWeight = weights.reduce((sum, w) => sum + w.weight, 0)
    let random = Math.random() * totalWeight

    for (const { instance, weight } of weights) {
      random -= weight
      if (random <= 0) {
        return instance
      }
    }

    return instances[0]
  }

  private selectByAdaptiveScore(
    instances: ServiceInstance[]
  ): ServiceInstance {
    // Calculate composite score
    for (const instance of instances) {
      const metrics = this.metrics.get(instance.id)!

      // Normalize metrics to 0-100 scale
      const responseTimeScore = Math.max(0, 100 - metrics.responseTimeAvg / 10)
      const errorRateScore = (1 - metrics.errorRate) * 100
      const throughputScore = Math.min(100, metrics.throughput / 10)

      // Weighted composite score
      metrics.score =
        responseTimeScore * 0.4 +
        errorRateScore * 0.4 +
        throughputScore * 0.2
    }

    // Select instance with highest score
    return instances.reduce((best, current) => {
      const bestScore = this.metrics.get(best.id)!.score
      const currentScore = this.metrics.get(current.id)!.score
      return currentScore > bestScore ? current : best
    })
  }

  async routeRequest(request: ServiceRequest): Promise<ServiceResponse> {
    const instance = await this.getNextInstance()

    if (!instance) {
      throw new Error("No healthy instances available")
    }

    const startTime = Date.now()

    try {
      const response = await this.messaging.sendRequest(
        instance.publicKey,
        { type: "service_request", ...request },
        { timeout: request.timeout || 30000 }
      )

      this.recordMetric(instance.id, {
        responseTime: Date.now() - startTime,
        success: true
      })

      return response

    } catch (error) {
      this.recordMetric(instance.id, {
        responseTime: Date.now() - startTime,
        success: false
      })

      throw error
    }
  }

  private recordMetric(
    instanceId: string,
    sample: MetricSample
  ): void {
    const metrics = this.metrics.get(instanceId)!

    // Add sample
    metrics.samples.push(sample)

    // Keep only last 100 samples
    if (metrics.samples.length > 100) {
      metrics.samples.shift()
    }

    // Recalculate averages
    const successfulSamples = metrics.samples.filter(s => s.success)
    const responseTimes = successfulSamples.map(s => s.responseTime)

    metrics.responseTimeAvg = responseTimes.length > 0
      ? responseTimes.reduce((a, b) => a + b, 0) / responseTimes.length
      : 0

    metrics.responseTimeP95 = this.calculatePercentile(responseTimes, 95)

    metrics.errorRate = metrics.samples.length > 0
      ? metrics.samples.filter(s => !s.success).length / metrics.samples.length
      : 0

    // Calculate throughput (requests per second over last minute)
    const oneMinuteAgo = Date.now() - 60000
    const recentSamples = metrics.samples.filter(s =>
      s.timestamp && s.timestamp > oneMinuteAgo
    )
    metrics.throughput = recentSamples.length
  }

  private calculatePercentile(values: number[], percentile: number): number {
    if (values.length === 0) return 0

    const sorted = [...values].sort((a, b) => a - b)
    const index = Math.ceil((percentile / 100) * sorted.length) - 1
    return sorted[index]
  }

  async autoTuneAlgorithm(): Promise<void> {
    // Periodically evaluate which algorithm performs best
    setInterval(() => {
      const allMetrics = Array.from(this.metrics.values())

      const avgErrorRate = allMetrics.reduce((sum, m) => sum + m.errorRate, 0) /
        allMetrics.length

      const avgResponseTime = allMetrics.reduce((sum, m) =>
        sum + m.responseTimeAvg, 0) / allMetrics.length

      // Switch algorithm based on conditions
      if (avgErrorRate > 0.1) {
        this.algorithm = "error_rate_aware"
      } else if (avgResponseTime > 500) {
        this.algorithm = "weighted_response_time"
      } else {
        this.algorithm = "adaptive_score"
      }
    }, 60000)
  }
}
```

## Best Practices

1. **Implement health checks** for all backend instances
2. **Use circuit breakers** to prevent cascade failures
3. **Monitor connection counts** to prevent overload
4. **Adapt routing based on performance** metrics
5. **Implement graceful degradation** when instances fail

## Related Skills

- [Failover Agent](./failover-agent.md) - Automatic failover
- [Metrics Collector Agent](./metrics-collector-agent.md) - Performance monitoring
- [Alert Manager Agent](./alert-manager-agent.md) - Load alerts
