# Health Monitor Agent Skill

> **⚠️ Prerequisites**: Complete [SDK Setup](./00-sdk-setup.md) first to configure your environment.

Build agents that monitor system health and perform self-diagnostics.

## Overview

Health Monitor enables agents to track system status, detect anomalies, and trigger alerts. Essential for maintaining reliable automated systems and ensuring uptime.

## SDK Reference

```typescript
import { Demos } from "@kynesyslabs/demosdk/websdk"

// Health check methods
demos.getLastBlockNumber()        // Network connectivity
demos.getAddressInfo(address)     // Account status
demos.getPeerlist()               // Network peers
demos.getMempool()                // Transaction backlog
```

## Agent Use Cases

### 1. System Health Agent

Monitor overall system health:

```typescript
class HealthMonitorAgent {
  private demos: Demos
  private healthChecks: Map<string, HealthCheck> = new Map()
  private status: SystemHealth = { healthy: true, checks: {} }

  async registerCheck(
    name: string,
    check: () => Promise<CheckResult>,
    intervalMs: number = 60000
  ): Promise<void> {
    this.healthChecks.set(name, {
      name,
      check,
      intervalMs,
      lastResult: null,
      lastCheck: 0
    })

    // Run initial check
    await this.runCheck(name)

    // Schedule recurring checks
    setInterval(() => this.runCheck(name), intervalMs)
  }

  private async runCheck(name: string): Promise<void> {
    const healthCheck = this.healthChecks.get(name)
    if (!healthCheck) return

    const startTime = Date.now()

    try {
      const result = await healthCheck.check()
      healthCheck.lastResult = {
        ...result,
        duration: Date.now() - startTime,
        timestamp: Date.now()
      }
    } catch (error) {
      healthCheck.lastResult = {
        healthy: false,
        error: error.message,
        duration: Date.now() - startTime,
        timestamp: Date.now()
      }
    }

    healthCheck.lastCheck = Date.now()
    this.updateOverallStatus()
  }

  private updateOverallStatus(): void {
    const checks: Record<string, CheckResult> = {}
    let allHealthy = true

    for (const [name, check] of this.healthChecks) {
      if (check.lastResult) {
        checks[name] = check.lastResult
        if (!check.lastResult.healthy) {
          allHealthy = false
        }
      }
    }

    this.status = { healthy: allHealthy, checks }
  }

  async getStatus(): Promise<SystemHealth> {
    return this.status
  }

  // Built-in health checks
  async checkNetworkConnectivity(): Promise<CheckResult> {
    try {
      const blockNumber = await this.demos.getLastBlockNumber()
      return {
        healthy: true,
        details: { blockNumber }
      }
    } catch (error) {
      return {
        healthy: false,
        error: "Cannot connect to network"
      }
    }
  }

  async checkWalletBalance(minBalance: bigint): Promise<CheckResult> {
    const address = await this.demos.wallet.getAddress()
    const info = await this.demos.getAddressInfo(address)
    const balance = BigInt(info.balance)

    return {
      healthy: balance >= minBalance,
      details: {
        balance: balance.toString(),
        minimum: minBalance.toString()
      }
    }
  }

  async checkMempoolBacklog(maxSize: number): Promise<CheckResult> {
    const mempool = await this.demos.getMempool()
    const size = mempool?.length || 0

    return {
      healthy: size < maxSize,
      details: {
        size,
        maxSize
      }
    }
  }
}
```

### 2. Self-Healing Agent

Automatically recover from issues:

```typescript
class SelfHealingAgent {
  private demos: Demos
  private recoveryActions: Map<string, RecoveryAction> = new Map()

  async registerRecovery(
    checkName: string,
    action: () => Promise<void>
  ): Promise<void> {
    this.recoveryActions.set(checkName, {
      action,
      lastAttempt: 0,
      attempts: 0
    })
  }

  async attemptRecovery(checkName: string): Promise<boolean> {
    const recovery = this.recoveryActions.get(checkName)
    if (!recovery) return false

    // Rate limit recovery attempts
    if (Date.now() - recovery.lastAttempt < 60000) {
      return false
    }

    recovery.attempts++
    recovery.lastAttempt = Date.now()

    try {
      await recovery.action()
      recovery.attempts = 0 // Reset on success
      return true
    } catch {
      return false
    }
  }
}
```

## Best Practices

1. **Check multiple components** for comprehensive monitoring
2. **Set appropriate thresholds** for alerts
3. **Implement circuit breakers** for failing components
4. **Log all health check results**
5. **Rate limit recovery attempts**

## Related Skills

- [Notification Agent](./notification-agent.md) - Alert delivery
- [Address Monitoring](./address-monitoring-agent.md) - Account monitoring
