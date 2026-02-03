# Upgrade Manager Agent Skill

> **⚠️ Prerequisites**: Complete [SDK Setup](./00-sdk-setup.md) first to configure your environment.

Build agents that manage software upgrades and version transitions.

## Overview

Upgrade Manager Agent enables automated version upgrades, dependency management, and rollback coordination. Essential for maintaining software currency, security patches, and seamless version transitions.

## SDK Reference

```typescript
import { Demos } from "@kynesyslabs/demosdk/websdk"
import { Messaging } from "@kynesyslabs/demosdk/messaging"

// Upgrade coordination messaging
const messaging = await demos.messaging.create()
```

## Agent Use Cases

### 1. Rolling Upgrade Coordinator

Coordinate rolling upgrades across service instances:

```typescript
class RollingUpgradeCoordinator {
  private instances: ServiceInstance[] = []
  private upgradeState: UpgradeState
  private healthChecker: HealthChecker

  async planUpgrade(
    currentVersion: string,
    targetVersion: string,
    config: UpgradeConfig
  ): Promise<UpgradePlan> {
    // Verify target version exists and is compatible
    const compatibility = await this.checkCompatibility(
      currentVersion,
      targetVersion
    )

    if (!compatibility.compatible) {
      throw new Error(`Incompatible versions: ${compatibility.reason}`)
    }

    // Create upgrade plan
    const plan: UpgradePlan = {
      id: `upgrade_${Date.now()}`,
      currentVersion,
      targetVersion,
      instances: this.instances.map(i => i.id),
      batchSize: config.batchSize || 1,
      healthCheckInterval: config.healthCheckInterval || 30000,
      rollbackOnFailure: config.rollbackOnFailure !== false,
      preUpgradeChecks: config.preUpgradeChecks || [],
      postUpgradeChecks: config.postUpgradeChecks || [],
      createdAt: Date.now()
    }

    // Verify we have enough capacity for rolling upgrade
    const minHealthy = Math.ceil(this.instances.length * 0.5)
    if (this.instances.length - plan.batchSize < minHealthy) {
      plan.batchSize = Math.max(1, this.instances.length - minHealthy)
    }

    return plan
  }

  async executeUpgrade(plan: UpgradePlan): Promise<UpgradeResult> {
    const startTime = Date.now()
    const results: InstanceUpgradeResult[] = []

    this.upgradeState = {
      planId: plan.id,
      status: "in_progress",
      completedInstances: 0,
      totalInstances: plan.instances.length,
      startTime
    }

    // Run pre-upgrade checks
    for (const check of plan.preUpgradeChecks) {
      const result = await this.runCheck(check)
      if (!result.passed) {
        return {
          success: false,
          error: `Pre-upgrade check failed: ${check.name}`,
          results
        }
      }
    }

    // Process instances in batches
    const batches = this.createBatches(this.instances, plan.batchSize)

    for (const batch of batches) {
      // Upgrade batch
      const batchResults = await this.upgradeBatch(batch, plan.targetVersion)
      results.push(...batchResults)

      // Check for failures
      const failures = batchResults.filter(r => !r.success)
      if (failures.length > 0 && plan.rollbackOnFailure) {
        await this.rollbackUpgrade(results.filter(r => r.success))
        return {
          success: false,
          error: "Batch upgrade failed, rolled back",
          results,
          rolledBack: true
        }
      }

      // Wait for health check
      await this.waitForHealthy(batch, plan.healthCheckInterval)

      this.upgradeState.completedInstances += batch.length
    }

    // Run post-upgrade checks
    for (const check of plan.postUpgradeChecks) {
      const result = await this.runCheck(check)
      if (!result.passed) {
        if (plan.rollbackOnFailure) {
          await this.rollbackUpgrade(results.filter(r => r.success))
          return {
            success: false,
            error: `Post-upgrade check failed: ${check.name}`,
            results,
            rolledBack: true
          }
        }
      }
    }

    this.upgradeState.status = "completed"

    return {
      success: true,
      results,
      duration: Date.now() - startTime,
      newVersion: plan.targetVersion
    }
  }

  private async upgradeBatch(
    instances: ServiceInstance[],
    targetVersion: string
  ): Promise<InstanceUpgradeResult[]> {
    const results: InstanceUpgradeResult[] = []

    for (const instance of instances) {
      const result = await this.upgradeInstance(instance, targetVersion)
      results.push(result)
    }

    return results
  }

  private async upgradeInstance(
    instance: ServiceInstance,
    targetVersion: string
  ): Promise<InstanceUpgradeResult> {
    const startTime = Date.now()

    try {
      // Drain connections
      await this.drainConnections(instance)

      // Stop instance
      await this.stopInstance(instance)

      // Backup current state
      const backup = await this.createInstanceBackup(instance)

      // Apply upgrade
      await this.applyUpgrade(instance, targetVersion)

      // Start instance
      await this.startInstance(instance)

      // Verify health
      const healthy = await this.verifyInstanceHealth(instance)

      if (!healthy) {
        // Restore from backup
        await this.restoreFromBackup(instance, backup)
        await this.startInstance(instance)

        return {
          instanceId: instance.id,
          success: false,
          error: "Health check failed after upgrade",
          duration: Date.now() - startTime
        }
      }

      // Re-enable connections
      await this.enableConnections(instance)

      return {
        instanceId: instance.id,
        success: true,
        previousVersion: instance.version,
        newVersion: targetVersion,
        duration: Date.now() - startTime
      }

    } catch (error) {
      return {
        instanceId: instance.id,
        success: false,
        error: (error as Error).message,
        duration: Date.now() - startTime
      }
    }
  }

  private async rollbackUpgrade(
    upgradedInstances: InstanceUpgradeResult[]
  ): Promise<void> {
    for (const result of upgradedInstances) {
      if (result.success && result.previousVersion) {
        const instance = this.instances.find(i => i.id === result.instanceId)
        if (instance) {
          await this.upgradeInstance(instance, result.previousVersion)
        }
      }
    }
  }

  private async waitForHealthy(
    instances: ServiceInstance[],
    timeout: number
  ): Promise<boolean> {
    const startTime = Date.now()

    while (Date.now() - startTime < timeout) {
      const healthChecks = await Promise.all(
        instances.map(i => this.verifyInstanceHealth(i))
      )

      if (healthChecks.every(h => h)) {
        return true
      }

      await new Promise(r => setTimeout(r, 5000))
    }

    return false
  }
}
```

### 2. Dependency Upgrade Manager

Manage dependency upgrades with compatibility checking:

```typescript
class DependencyUpgradeManager {
  private dependencies: Map<string, DependencyInfo> = new Map()
  private lockFile: LockFile

  async analyzeDependencies(): Promise<DependencyAnalysis> {
    const outdated: OutdatedDependency[] = []
    const vulnerable: VulnerableDependency[] = []
    const compatible: CompatibleUpgrade[] = []

    for (const [name, info] of this.dependencies) {
      // Check for newer versions
      const latestVersion = await this.getLatestVersion(name)

      if (this.isNewer(latestVersion, info.version)) {
        const upgrade: OutdatedDependency = {
          name,
          currentVersion: info.version,
          latestVersion,
          updateType: this.getUpdateType(info.version, latestVersion)
        }

        outdated.push(upgrade)

        // Check compatibility
        const compatibility = await this.checkUpgradeCompatibility(
          name,
          info.version,
          latestVersion
        )

        if (compatibility.compatible) {
          compatible.push({
            ...upgrade,
            breakingChanges: compatibility.breakingChanges
          })
        }
      }

      // Check for vulnerabilities
      const vulns = await this.checkVulnerabilities(name, info.version)
      if (vulns.length > 0) {
        vulnerable.push({
          name,
          version: info.version,
          vulnerabilities: vulns,
          patchVersion: vulns[0].patchedIn
        })
      }
    }

    return {
      totalDependencies: this.dependencies.size,
      outdated,
      vulnerable,
      compatible,
      securityScore: this.calculateSecurityScore(vulnerable)
    }
  }

  async createUpgradePlan(
    options: UpgradePlanOptions
  ): Promise<DependencyUpgradePlan> {
    const analysis = await this.analyzeDependencies()

    const upgrades: PlannedUpgrade[] = []

    // Priority 1: Security patches
    if (options.includeSecurityPatches !== false) {
      for (const vuln of analysis.vulnerable) {
        if (vuln.patchVersion) {
          upgrades.push({
            name: vuln.name,
            from: vuln.version,
            to: vuln.patchVersion,
            priority: "critical",
            reason: `Security vulnerability: ${vuln.vulnerabilities[0].id}`
          })
        }
      }
    }

    // Priority 2: Compatible updates
    if (options.includeCompatible) {
      for (const compat of analysis.compatible) {
        if (!upgrades.some(u => u.name === compat.name)) {
          upgrades.push({
            name: compat.name,
            from: compat.currentVersion,
            to: compat.latestVersion,
            priority: compat.updateType === "patch" ? "low" :
                     compat.updateType === "minor" ? "medium" : "high",
            reason: `Update available: ${compat.updateType}`
          })
        }
      }
    }

    // Sort by priority
    upgrades.sort((a, b) => {
      const priorityOrder = { critical: 0, high: 1, medium: 2, low: 3 }
      return priorityOrder[a.priority] - priorityOrder[b.priority]
    })

    return {
      id: `dep_upgrade_${Date.now()}`,
      upgrades,
      estimatedRisk: this.calculateRisk(upgrades),
      testRequirements: this.generateTestRequirements(upgrades)
    }
  }

  async executeUpgradePlan(
    plan: DependencyUpgradePlan
  ): Promise<DependencyUpgradeResult> {
    const results: UpgradeExecutionResult[] = []
    const startTime = Date.now()

    // Create backup of current lock file
    const lockBackup = await this.backupLockFile()

    for (const upgrade of plan.upgrades) {
      try {
        // Update dependency
        await this.updateDependency(upgrade.name, upgrade.to)

        // Run tests
        const testResult = await this.runTests(upgrade.name)

        if (!testResult.passed) {
          // Rollback this upgrade
          await this.updateDependency(upgrade.name, upgrade.from)

          results.push({
            name: upgrade.name,
            success: false,
            error: `Tests failed: ${testResult.failures.join(", ")}`
          })

          continue
        }

        results.push({
          name: upgrade.name,
          success: true,
          from: upgrade.from,
          to: upgrade.to
        })

      } catch (error) {
        results.push({
          name: upgrade.name,
          success: false,
          error: (error as Error).message
        })
      }
    }

    // Update lock file
    await this.updateLockFile()

    return {
      success: results.every(r => r.success),
      results,
      duration: Date.now() - startTime,
      rollbackAvailable: true,
      lockBackup
    }
  }

  private getUpdateType(
    current: string,
    latest: string
  ): "patch" | "minor" | "major" {
    const currentParts = current.split(".").map(Number)
    const latestParts = latest.split(".").map(Number)

    if (latestParts[0] > currentParts[0]) return "major"
    if (latestParts[1] > currentParts[1]) return "minor"
    return "patch"
  }

  private calculateRisk(upgrades: PlannedUpgrade[]): RiskLevel {
    const majorUpgrades = upgrades.filter(u => {
      const fromMajor = parseInt(u.from.split(".")[0])
      const toMajor = parseInt(u.to.split(".")[0])
      return toMajor > fromMajor
    }).length

    if (majorUpgrades >= 3) return "high"
    if (majorUpgrades >= 1) return "medium"
    return "low"
  }
}
```

### 3. Smart Contract Upgrade Manager

Manage upgradeable smart contract patterns:

```typescript
class SmartContractUpgradeManager {
  private proxyAdmin: ethers.Contract
  private implementations: Map<string, string> = new Map()

  async prepareUpgrade(
    proxyAddress: string,
    newImplementation: string
  ): Promise<UpgradePreparation> {
    // Verify new implementation
    const verification = await this.verifyImplementation(newImplementation)

    if (!verification.valid) {
      throw new Error(`Invalid implementation: ${verification.reason}`)
    }

    // Check storage layout compatibility
    const currentImpl = await this.getImplementation(proxyAddress)
    const storageCheck = await this.checkStorageCompatibility(
      currentImpl,
      newImplementation
    )

    if (!storageCheck.compatible) {
      throw new Error(`Storage layout incompatible: ${storageCheck.conflicts.join(", ")}`)
    }

    // Simulate upgrade
    const simulation = await this.simulateUpgrade(proxyAddress, newImplementation)

    return {
      proxyAddress,
      currentImplementation: currentImpl,
      newImplementation,
      storageCompatible: true,
      simulation,
      estimatedGas: simulation.gasUsed,
      ready: true
    }
  }

  async executeUpgrade(
    proxyAddress: string,
    newImplementation: string,
    initData?: string
  ): Promise<ContractUpgradeResult> {
    const startTime = Date.now()

    try {
      // Pause contract if pausable
      const isPausable = await this.checkPausable(proxyAddress)
      if (isPausable) {
        await this.pauseContract(proxyAddress)
      }

      // Execute upgrade
      let tx: ethers.TransactionResponse

      if (initData) {
        tx = await this.proxyAdmin.upgradeAndCall(
          proxyAddress,
          newImplementation,
          initData
        )
      } else {
        tx = await this.proxyAdmin.upgrade(
          proxyAddress,
          newImplementation
        )
      }

      const receipt = await tx.wait()

      // Verify upgrade succeeded
      const currentImpl = await this.getImplementation(proxyAddress)
      if (currentImpl.toLowerCase() !== newImplementation.toLowerCase()) {
        throw new Error("Implementation address mismatch after upgrade")
      }

      // Run post-upgrade verification
      const verification = await this.verifyPostUpgrade(proxyAddress)

      // Unpause if was paused
      if (isPausable) {
        await this.unpauseContract(proxyAddress)
      }

      // Record upgrade
      this.implementations.set(proxyAddress, newImplementation)

      return {
        success: true,
        proxyAddress,
        newImplementation,
        txHash: receipt.hash,
        gasUsed: receipt.gasUsed,
        verification,
        duration: Date.now() - startTime
      }

    } catch (error) {
      return {
        success: false,
        proxyAddress,
        error: (error as Error).message,
        duration: Date.now() - startTime
      }
    }
  }

  async scheduleTimelockUpgrade(
    proxyAddress: string,
    newImplementation: string,
    delay: number,
    initData?: string
  ): Promise<ScheduledUpgrade> {
    const eta = Math.floor(Date.now() / 1000) + delay

    // Queue in timelock
    const txData = this.proxyAdmin.interface.encodeFunctionData(
      initData ? "upgradeAndCall" : "upgrade",
      initData
        ? [proxyAddress, newImplementation, initData]
        : [proxyAddress, newImplementation]
    )

    const queueTx = await this.timelock.queueTransaction(
      this.proxyAdmin.address,
      0,
      "",
      txData,
      eta
    )

    await queueTx.wait()

    return {
      id: `scheduled_${proxyAddress}_${Date.now()}`,
      proxyAddress,
      newImplementation,
      scheduledTime: eta * 1000,
      delay,
      status: "queued",
      txData
    }
  }

  async executeScheduledUpgrade(
    scheduled: ScheduledUpgrade
  ): Promise<ContractUpgradeResult> {
    const now = Math.floor(Date.now() / 1000)

    if (now < scheduled.scheduledTime / 1000) {
      throw new Error("Timelock delay not yet passed")
    }

    // Execute timelock transaction
    const executeTx = await this.timelock.executeTransaction(
      this.proxyAdmin.address,
      0,
      "",
      scheduled.txData,
      scheduled.scheduledTime / 1000
    )

    const receipt = await executeTx.wait()

    return {
      success: true,
      proxyAddress: scheduled.proxyAddress,
      newImplementation: scheduled.newImplementation,
      txHash: receipt.hash,
      gasUsed: receipt.gasUsed,
      timelockExecuted: true
    }
  }

  private async checkStorageCompatibility(
    currentImpl: string,
    newImpl: string
  ): Promise<StorageCompatibility> {
    const currentLayout = await this.getStorageLayout(currentImpl)
    const newLayout = await this.getStorageLayout(newImpl)

    const conflicts: string[] = []

    // Check existing slots haven't changed
    for (const [slot, currentVar] of Object.entries(currentLayout)) {
      const newVar = newLayout[slot]

      if (!newVar) {
        conflicts.push(`Slot ${slot} removed: ${currentVar.name}`)
      } else if (newVar.type !== currentVar.type) {
        conflicts.push(
          `Slot ${slot} type changed: ${currentVar.type} -> ${newVar.type}`
        )
      }
    }

    return {
      compatible: conflicts.length === 0,
      conflicts,
      newSlots: Object.keys(newLayout).filter(s => !currentLayout[s])
    }
  }
}
```

## Best Practices

1. **Use rolling upgrades** to maintain availability
2. **Verify compatibility** before any upgrade
3. **Always have rollback plans** ready
4. **Test upgrades in staging** before production
5. **Use timelocks** for critical contract upgrades

## Related Skills

- [Migration Agent](./migration-agent.md) - Data migrations
- [Config Manager Agent](./config-manager-agent.md) - Configuration updates
- [Failover Agent](./failover-agent.md) - Handling upgrade failures
