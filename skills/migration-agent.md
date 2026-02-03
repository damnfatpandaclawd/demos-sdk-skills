# Migration Agent Skill

> **⚠️ Prerequisites**: Complete [SDK Setup](./00-sdk-setup.md) first to configure your environment.

Build agents that manage data and service migrations with zero downtime.

## Overview

Migration Agent enables seamless data migrations, schema upgrades, and service transitions. Essential for database migrations, platform upgrades, and gradual rollouts without service interruption.

## SDK Reference

```typescript
import { Demos } from "@kynesyslabs/demosdk/websdk"
import { StorageProgram } from "@kynesyslabs/demosdk/storage"

// Storage for migrations
const storage = new StorageProgram(demos)
```

## Agent Use Cases

### 1. Schema Migration Manager

Manage database schema migrations:

```typescript
class SchemaMigrationManager {
  private migrations: Migration[] = []
  private appliedMigrations: Set<string> = new Set()
  private lockManager: MigrationLockManager

  async registerMigration(migration: Migration): Promise<void> {
    // Validate migration
    this.validateMigration(migration)

    // Check for conflicts
    if (this.migrations.some(m => m.version === migration.version)) {
      throw new Error(`Migration version ${migration.version} already exists`)
    }

    this.migrations.push(migration)
    this.migrations.sort((a, b) => a.version - b.version)
  }

  async runMigrations(
    options: MigrationOptions = {}
  ): Promise<MigrationResult[]> {
    // Acquire migration lock
    const lock = await this.lockManager.acquireLock()

    if (!lock) {
      throw new Error("Could not acquire migration lock")
    }

    try {
      // Get current version
      const currentVersion = await this.getCurrentVersion()

      // Find pending migrations
      const pending = this.migrations.filter(
        m => m.version > currentVersion
      )

      if (options.targetVersion) {
        pending.filter(m => m.version <= options.targetVersion!)
      }

      const results: MigrationResult[] = []

      for (const migration of pending) {
        const result = await this.runMigration(migration, options)
        results.push(result)

        if (!result.success && !options.continueOnError) {
          break
        }
      }

      return results

    } finally {
      await this.lockManager.releaseLock(lock)
    }
  }

  private async runMigration(
    migration: Migration,
    options: MigrationOptions
  ): Promise<MigrationResult> {
    const startTime = Date.now()

    try {
      // Create backup if configured
      if (options.createBackup !== false) {
        await this.createPreMigrationBackup(migration.version)
      }

      // Begin transaction
      await this.beginTransaction()

      // Run pre-checks
      if (migration.preCheck) {
        const preCheckResult = await migration.preCheck()
        if (!preCheckResult.passed) {
          throw new Error(`Pre-check failed: ${preCheckResult.reason}`)
        }
      }

      // Execute migration
      await migration.up()

      // Run post-checks
      if (migration.postCheck) {
        const postCheckResult = await migration.postCheck()
        if (!postCheckResult.passed) {
          throw new Error(`Post-check failed: ${postCheckResult.reason}`)
        }
      }

      // Commit transaction
      await this.commitTransaction()

      // Record migration
      await this.recordMigration(migration.version)

      return {
        version: migration.version,
        success: true,
        duration: Date.now() - startTime
      }

    } catch (error) {
      // Rollback transaction
      await this.rollbackTransaction()

      // Attempt rollback migration if available
      if (migration.down && options.autoRollback !== false) {
        try {
          await migration.down()
        } catch (rollbackError) {
          // Log rollback failure
        }
      }

      return {
        version: migration.version,
        success: false,
        error: (error as Error).message,
        duration: Date.now() - startTime
      }
    }
  }

  async rollbackMigration(targetVersion: number): Promise<RollbackResult> {
    const currentVersion = await this.getCurrentVersion()

    if (targetVersion >= currentVersion) {
      return {
        success: false,
        error: "Target version must be less than current version"
      }
    }

    const toRollback = this.migrations
      .filter(m => m.version > targetVersion && m.version <= currentVersion)
      .reverse()

    const results: MigrationResult[] = []

    for (const migration of toRollback) {
      if (!migration.down) {
        return {
          success: false,
          error: `Migration ${migration.version} has no rollback defined`,
          rolledBack: results
        }
      }

      try {
        await this.beginTransaction()
        await migration.down()
        await this.removeAppliedMigration(migration.version)
        await this.commitTransaction()

        results.push({
          version: migration.version,
          success: true,
          rolled_back: true
        })

      } catch (error) {
        await this.rollbackTransaction()

        return {
          success: false,
          error: (error as Error).message,
          rolledBack: results,
          failedAt: migration.version
        }
      }
    }

    return {
      success: true,
      rolledBack: results,
      newVersion: targetVersion
    }
  }

  async generateMigration(
    name: string,
    changes: SchemaChange[]
  ): Promise<Migration> {
    const version = Date.now()

    const upStatements: string[] = []
    const downStatements: string[] = []

    for (const change of changes) {
      switch (change.type) {
        case "add_column":
          upStatements.push(
            `ALTER TABLE ${change.table} ADD COLUMN ${change.column} ${change.dataType}`
          )
          downStatements.push(
            `ALTER TABLE ${change.table} DROP COLUMN ${change.column}`
          )
          break

        case "drop_column":
          upStatements.push(
            `ALTER TABLE ${change.table} DROP COLUMN ${change.column}`
          )
          // Store column definition for rollback
          downStatements.push(
            `ALTER TABLE ${change.table} ADD COLUMN ${change.column} ${change.originalType}`
          )
          break

        case "create_table":
          upStatements.push(this.generateCreateTable(change))
          downStatements.push(`DROP TABLE ${change.table}`)
          break

        case "create_index":
          upStatements.push(
            `CREATE INDEX ${change.indexName} ON ${change.table} (${change.columns.join(", ")})`
          )
          downStatements.push(`DROP INDEX ${change.indexName}`)
          break
      }
    }

    return {
      version,
      name,
      up: async () => {
        for (const statement of upStatements) {
          await this.executeSQL(statement)
        }
      },
      down: async () => {
        for (const statement of downStatements.reverse()) {
          await this.executeSQL(statement)
        }
      }
    }
  }
}
```

### 2. Zero-Downtime Data Migrator

Migrate data without service interruption:

```typescript
class ZeroDowntimeMigrator {
  private sourceDb: DatabaseConnection
  private targetDb: DatabaseConnection
  private syncStatus: SyncStatus

  async setupDualWrite(
    config: DualWriteConfig
  ): Promise<DualWriteSetup> {
    // Configure source to write to both databases
    const interceptor = new WriteInterceptor()

    interceptor.on("write", async (operation: WriteOperation) => {
      // Write to source (primary)
      await this.sourceDb.execute(operation)

      // Write to target (shadow)
      try {
        await this.targetDb.execute(this.transformOperation(operation))
      } catch (error) {
        // Log shadow write failure but don't fail operation
        await this.logShadowWriteFailure(operation, error)
      }
    })

    return {
      enabled: true,
      startTime: Date.now(),
      interceptor
    }
  }

  async performInitialSync(): Promise<SyncResult> {
    const startTime = Date.now()
    let processedRecords = 0
    let errors: SyncError[] = []

    // Get total count for progress tracking
    const totalRecords = await this.sourceDb.count()

    this.syncStatus = {
      phase: "initial_sync",
      progress: 0,
      processedRecords: 0,
      totalRecords,
      errors: []
    }

    // Stream data in batches
    const batchSize = 1000
    let offset = 0

    while (offset < totalRecords) {
      const batch = await this.sourceDb.getBatch(offset, batchSize)

      // Transform and insert batch
      const transformed = batch.map(record =>
        this.transformRecord(record)
      )

      try {
        await this.targetDb.insertBatch(transformed)
        processedRecords += batch.length

      } catch (error) {
        errors.push({
          offset,
          batchSize,
          error: (error as Error).message
        })
      }

      // Update progress
      offset += batchSize
      this.syncStatus.progress = (offset / totalRecords) * 100
      this.syncStatus.processedRecords = processedRecords
    }

    return {
      success: errors.length === 0,
      processedRecords,
      errors,
      duration: Date.now() - startTime
    }
  }

  async verifyDataConsistency(): Promise<ConsistencyReport> {
    const report: ConsistencyReport = {
      consistent: true,
      totalChecked: 0,
      mismatches: [],
      missing: [],
      extra: []
    }

    // Sample-based verification
    const sampleSize = 10000
    const sourceCount = await this.sourceDb.count()
    const sampleIndices = this.generateRandomSample(sourceCount, sampleSize)

    for (const index of sampleIndices) {
      const sourceRecord = await this.sourceDb.getByIndex(index)
      const targetRecord = await this.targetDb.getById(sourceRecord.id)

      report.totalChecked++

      if (!targetRecord) {
        report.missing.push(sourceRecord.id)
        report.consistent = false
      } else if (!this.recordsMatch(sourceRecord, targetRecord)) {
        report.mismatches.push({
          id: sourceRecord.id,
          source: sourceRecord,
          target: targetRecord
        })
        report.consistent = false
      }
    }

    // Check for extra records in target
    const targetCount = await this.targetDb.count()
    if (targetCount > sourceCount) {
      report.extra.push(`Target has ${targetCount - sourceCount} extra records`)
      report.consistent = false
    }

    return report
  }

  async cutover(options: CutoverOptions = {}): Promise<CutoverResult> {
    const startTime = Date.now()

    // Phase 1: Pause writes (brief pause)
    await this.pauseWrites()

    // Phase 2: Final sync of any pending changes
    const pendingChanges = await this.getPendingChanges()
    for (const change of pendingChanges) {
      await this.targetDb.execute(this.transformOperation(change))
    }

    // Phase 3: Verify consistency
    const consistency = await this.verifyDataConsistency()
    if (!consistency.consistent && !options.forceOnInconsistency) {
      await this.resumeWrites()
      return {
        success: false,
        error: "Data consistency check failed",
        consistency
      }
    }

    // Phase 4: Switch traffic
    await this.switchPrimaryDatabase(this.targetDb)

    // Phase 5: Resume writes
    await this.resumeWrites()

    // Phase 6: Disable dual-write
    await this.disableDualWrite()

    return {
      success: true,
      cutoverTime: Date.now() - startTime,
      downtime: 0, // Zero downtime achieved
      newPrimary: this.targetDb.name,
      consistency
    }
  }

  async rollbackCutover(): Promise<RollbackResult> {
    // Switch back to source
    await this.pauseWrites()
    await this.switchPrimaryDatabase(this.sourceDb)
    await this.resumeWrites()

    // Re-enable dual-write for any changes during cutover
    await this.setupDualWrite({
      source: this.targetDb,
      target: this.sourceDb
    })

    return {
      success: true,
      rolledBackTo: this.sourceDb.name,
      timestamp: Date.now()
    }
  }
}
```

### 3. Service Migration Coordinator

Coordinate migrations between service versions:

```typescript
class ServiceMigrationCoordinator {
  private oldService: ServiceEndpoint
  private newService: ServiceEndpoint
  private trafficSplit: number = 0 // Percentage to new service

  async setupCanaryDeployment(
    config: CanaryConfig
  ): Promise<CanaryDeployment> {
    this.oldService = config.oldService
    this.newService = config.newService

    // Verify new service is healthy
    const healthCheck = await this.checkServiceHealth(this.newService)
    if (!healthCheck.healthy) {
      throw new Error("New service is not healthy")
    }

    // Start with 0% traffic to new service
    this.trafficSplit = 0

    return {
      id: `canary_${Date.now()}`,
      oldService: this.oldService,
      newService: this.newService,
      initialSplit: 0,
      status: "active"
    }
  }

  async incrementTraffic(percentage: number): Promise<TrafficSplitResult> {
    const newSplit = Math.min(100, this.trafficSplit + percentage)

    // Verify new service can handle increased load
    const capacity = await this.checkServiceCapacity(this.newService)
    const projectedLoad = this.calculateProjectedLoad(newSplit)

    if (projectedLoad > capacity.maxCapacity * 0.8) {
      return {
        success: false,
        error: "New service capacity insufficient",
        currentSplit: this.trafficSplit
      }
    }

    // Update traffic split
    this.trafficSplit = newSplit
    await this.updateLoadBalancer(this.trafficSplit)

    // Monitor for issues
    await this.monitorPostIncrement(30000) // 30 second monitoring window

    const metrics = await this.getServiceMetrics()

    return {
      success: true,
      previousSplit: this.trafficSplit - percentage,
      newSplit: this.trafficSplit,
      metrics
    }
  }

  async automaticRollout(config: AutoRolloutConfig): Promise<RolloutResult> {
    const stages = config.stages || [1, 5, 10, 25, 50, 75, 100]
    const results: StageResult[] = []

    for (const targetPercentage of stages) {
      const increment = targetPercentage - this.trafficSplit
      const result = await this.incrementTraffic(increment)

      if (!result.success) {
        // Automatic rollback
        await this.rollback()
        return {
          success: false,
          completedStages: results,
          failedAt: targetPercentage,
          rolledBack: true
        }
      }

      // Monitor stability at this stage
      const stable = await this.waitForStability(
        config.stabilityWindow || 300000
      )

      if (!stable) {
        await this.rollback()
        return {
          success: false,
          completedStages: results,
          failedAt: targetPercentage,
          reason: "Stability check failed",
          rolledBack: true
        }
      }

      results.push({
        percentage: targetPercentage,
        timestamp: Date.now(),
        metrics: await this.getServiceMetrics()
      })
    }

    return {
      success: true,
      completedStages: results,
      finalPercentage: 100
    }
  }

  private async waitForStability(
    windowMs: number
  ): Promise<boolean> {
    const samples: MetricSample[] = []
    const startTime = Date.now()

    while (Date.now() - startTime < windowMs) {
      const metrics = await this.getServiceMetrics()

      samples.push({
        timestamp: Date.now(),
        errorRate: metrics.newService.errorRate,
        latencyP99: metrics.newService.latencyP99,
        throughput: metrics.newService.throughput
      })

      // Check for anomalies
      if (metrics.newService.errorRate > 0.01) { // 1% error rate threshold
        return false
      }

      if (metrics.newService.latencyP99 > metrics.oldService.latencyP99 * 1.5) {
        return false
      }

      await new Promise(r => setTimeout(r, 5000))
    }

    return true
  }

  async rollback(): Promise<RollbackResult> {
    // Immediately route all traffic to old service
    this.trafficSplit = 0
    await this.updateLoadBalancer(0)

    return {
      success: true,
      rolledBackTo: this.oldService.name,
      previousSplit: this.trafficSplit,
      timestamp: Date.now()
    }
  }

  async completeRollout(): Promise<CompletionResult> {
    // Ensure 100% traffic to new service
    if (this.trafficSplit !== 100) {
      await this.incrementTraffic(100 - this.trafficSplit)
    }

    // Decommission old service
    await this.decommissionService(this.oldService)

    return {
      success: true,
      newService: this.newService,
      decommissioned: this.oldService.name,
      completedAt: Date.now()
    }
  }
}
```

## Best Practices

1. **Always have rollback plans** for every migration
2. **Use dual-write patterns** for zero-downtime data migrations
3. **Implement gradual rollouts** with monitoring
4. **Verify data consistency** before and after migration
5. **Keep migrations small** and incremental

## Related Skills

- [Backup Recovery Agent](./backup-recovery-agent.md) - Pre-migration backups
- [Upgrade Manager Agent](./upgrade-manager-agent.md) - Version upgrades
- [Load Balancer Agent](./load-balancer-agent.md) - Traffic management
