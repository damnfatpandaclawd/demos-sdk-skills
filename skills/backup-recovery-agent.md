# Backup Recovery Agent Skill

Build agents that manage data backups and disaster recovery operations.

## Overview

Backup Recovery Agent enables automated backup scheduling, incremental snapshots, and disaster recovery coordination. Essential for data protection, compliance requirements, and business continuity.

## SDK Reference

```typescript
import { Demos } from "@kynesyslabs/demosdk/websdk"
import { StorageProgram } from "@kynesyslabs/demosdk/storage"

// Storage for backups
const storage = new StorageProgram(demos)
```

## Agent Use Cases

### 1. Incremental Backup Manager

Manage incremental backup strategies:

```typescript
class IncrementalBackupManager {
  private backupSchedule: BackupSchedule | null = null
  private backupHistory: BackupRecord[] = []
  private lastFullBackup: BackupRecord | null = null

  async configureBackups(config: BackupConfig): Promise<BackupSchedule> {
    this.backupSchedule = {
      id: `schedule_${Date.now()}`,
      fullBackupInterval: config.fullBackupInterval || 604800000, // Weekly
      incrementalInterval: config.incrementalInterval || 86400000, // Daily
      retentionPolicy: config.retentionPolicy || {
        keepDaily: 7,
        keepWeekly: 4,
        keepMonthly: 12
      },
      compression: config.compression !== false,
      encryption: config.encryption !== false,
      destinations: config.destinations,
      createdAt: Date.now()
    }

    // Start backup scheduler
    this.startScheduler()

    return this.backupSchedule
  }

  async createFullBackup(
    source: DataSource
  ): Promise<BackupRecord> {
    const startTime = Date.now()
    const backupId = `full_${Date.now()}`

    // Get all data from source
    const data = await this.getAllData(source)

    // Calculate checksum
    const checksum = await this.calculateChecksum(data)

    // Compress if configured
    let processedData = data
    if (this.backupSchedule?.compression) {
      processedData = await this.compressData(data)
    }

    // Encrypt if configured
    if (this.backupSchedule?.encryption) {
      processedData = await this.encryptData(processedData)
    }

    // Store to all destinations
    const storageResults = await this.storeToDestinations(
      backupId,
      processedData
    )

    const record: BackupRecord = {
      id: backupId,
      type: "full",
      source: source.id,
      size: processedData.length,
      originalSize: data.length,
      checksum,
      compressed: this.backupSchedule?.compression || false,
      encrypted: this.backupSchedule?.encryption || false,
      destinations: storageResults,
      createdAt: Date.now(),
      duration: Date.now() - startTime
    }

    this.backupHistory.push(record)
    this.lastFullBackup = record

    return record
  }

  async createIncrementalBackup(
    source: DataSource
  ): Promise<BackupRecord> {
    if (!this.lastFullBackup) {
      // No full backup exists, create one
      return await this.createFullBackup(source)
    }

    const startTime = Date.now()
    const backupId = `incr_${Date.now()}`

    // Get changes since last backup
    const lastBackupTime = this.getLastBackupTime()
    const changes = await this.getChangesSince(source, lastBackupTime)

    if (changes.length === 0) {
      return {
        id: backupId,
        type: "incremental",
        source: source.id,
        size: 0,
        originalSize: 0,
        checksum: "",
        parentBackup: this.lastFullBackup.id,
        changeCount: 0,
        skipped: true,
        createdAt: Date.now(),
        duration: 0
      }
    }

    // Build incremental data
    const incrementalData = this.buildIncrementalData(changes)

    // Process and store
    let processedData = incrementalData
    if (this.backupSchedule?.compression) {
      processedData = await this.compressData(incrementalData)
    }
    if (this.backupSchedule?.encryption) {
      processedData = await this.encryptData(processedData)
    }

    const checksum = await this.calculateChecksum(incrementalData)
    const storageResults = await this.storeToDestinations(backupId, processedData)

    const record: BackupRecord = {
      id: backupId,
      type: "incremental",
      source: source.id,
      size: processedData.length,
      originalSize: incrementalData.length,
      checksum,
      parentBackup: this.lastFullBackup.id,
      changeCount: changes.length,
      compressed: this.backupSchedule?.compression || false,
      encrypted: this.backupSchedule?.encryption || false,
      destinations: storageResults,
      createdAt: Date.now(),
      duration: Date.now() - startTime
    }

    this.backupHistory.push(record)
    return record
  }

  private async getChangesSince(
    source: DataSource,
    since: number
  ): Promise<DataChange[]> {
    // Implementation depends on data source type
    const changes: DataChange[] = []

    const currentData = await this.getAllData(source)
    const previousSnapshot = await this.getSnapshotAtTime(source, since)

    // Compare and identify changes
    for (const [key, value] of Object.entries(currentData)) {
      const previousValue = previousSnapshot[key]

      if (!previousValue) {
        changes.push({ type: "create", key, value })
      } else if (JSON.stringify(value) !== JSON.stringify(previousValue)) {
        changes.push({ type: "update", key, value, previousValue })
      }
    }

    // Check for deletions
    for (const key of Object.keys(previousSnapshot)) {
      if (!(key in currentData)) {
        changes.push({ type: "delete", key })
      }
    }

    return changes
  }

  async applyRetentionPolicy(): Promise<RetentionResult> {
    const policy = this.backupSchedule?.retentionPolicy
    if (!policy) return { deleted: 0, kept: this.backupHistory.length }

    const now = Date.now()
    const toDelete: BackupRecord[] = []
    const toKeep: BackupRecord[] = []

    // Sort backups by date
    const sortedBackups = [...this.backupHistory].sort(
      (a, b) => b.createdAt - a.createdAt
    )

    // Apply retention rules
    const dailyKept = new Set<string>()
    const weeklyKept = new Set<string>()
    const monthlyKept = new Set<string>()

    for (const backup of sortedBackups) {
      const age = now - backup.createdAt
      const dayKey = new Date(backup.createdAt).toISOString().split("T")[0]
      const weekKey = this.getWeekKey(backup.createdAt)
      const monthKey = this.getMonthKey(backup.createdAt)

      let keep = false

      // Daily retention
      if (age < policy.keepDaily * 86400000 && !dailyKept.has(dayKey)) {
        dailyKept.add(dayKey)
        keep = true
      }

      // Weekly retention
      if (age < policy.keepWeekly * 604800000 && !weeklyKept.has(weekKey)) {
        weeklyKept.add(weekKey)
        keep = true
      }

      // Monthly retention
      if (age < policy.keepMonthly * 2592000000 && !monthlyKept.has(monthKey)) {
        monthlyKept.add(monthKey)
        keep = true
      }

      // Always keep last full backup
      if (backup.id === this.lastFullBackup?.id) {
        keep = true
      }

      if (keep) {
        toKeep.push(backup)
      } else {
        toDelete.push(backup)
      }
    }

    // Delete old backups
    for (const backup of toDelete) {
      await this.deleteBackup(backup)
    }

    this.backupHistory = toKeep

    return {
      deleted: toDelete.length,
      kept: toKeep.length,
      freedSpace: toDelete.reduce((sum, b) => sum + b.size, 0)
    }
  }

  private startScheduler(): void {
    // Schedule full backups
    setInterval(async () => {
      const timeSinceLastFull = this.lastFullBackup
        ? Date.now() - this.lastFullBackup.createdAt
        : Infinity

      if (timeSinceLastFull >= this.backupSchedule!.fullBackupInterval) {
        await this.createFullBackup(this.getDefaultSource())
      }
    }, 3600000) // Check hourly

    // Schedule incremental backups
    setInterval(async () => {
      await this.createIncrementalBackup(this.getDefaultSource())
    }, this.backupSchedule!.incrementalInterval)

    // Schedule retention cleanup
    setInterval(async () => {
      await this.applyRetentionPolicy()
    }, 86400000) // Daily
  }
}
```

### 2. Point-in-Time Recovery

Enable recovery to any specific point in time:

```typescript
class PointInTimeRecovery {
  private backupChain: BackupRecord[] = []
  private walLogs: WALEntry[] = []

  async enablePITR(source: DataSource): Promise<PITRConfig> {
    // Start capturing write-ahead logs
    await this.startWALCapture(source)

    // Create initial full backup
    const fullBackup = await this.createFullBackup(source)

    return {
      enabled: true,
      startTime: Date.now(),
      baseBackup: fullBackup.id,
      walRetention: 604800000 // 7 days
    }
  }

  private async startWALCapture(source: DataSource): Promise<void> {
    source.on("write", async (operation: WriteOperation) => {
      const walEntry: WALEntry = {
        id: `wal_${Date.now()}_${Math.random().toString(36).slice(2)}`,
        timestamp: Date.now(),
        operation: operation.type,
        key: operation.key,
        value: operation.value,
        previousValue: operation.previousValue,
        checksum: await this.calculateChecksum(operation)
      }

      this.walLogs.push(walEntry)

      // Persist WAL entry
      await this.persistWALEntry(walEntry)
    })
  }

  async recoverToPointInTime(
    targetTime: number
  ): Promise<RecoveryResult> {
    const startTime = Date.now()

    // Find nearest full backup before target time
    const baseBackup = this.findNearestBackup(targetTime)

    if (!baseBackup) {
      return {
        success: false,
        error: "No backup found before target time"
      }
    }

    try {
      // Step 1: Restore full backup
      await this.restoreFullBackup(baseBackup)

      // Step 2: Apply incremental backups
      const incrementals = this.getIncrementalsSince(
        baseBackup.createdAt,
        targetTime
      )

      for (const incremental of incrementals) {
        await this.applyIncrementalBackup(incremental)
      }

      // Step 3: Replay WAL to exact point
      const walEntries = this.getWALEntriesInRange(
        baseBackup.createdAt,
        targetTime
      )

      for (const entry of walEntries) {
        if (entry.timestamp <= targetTime) {
          await this.replayWALEntry(entry)
        }
      }

      return {
        success: true,
        baseBackup: baseBackup.id,
        incrementalsApplied: incrementals.length,
        walEntriesReplayed: walEntries.length,
        recoveredToTime: targetTime,
        duration: Date.now() - startTime
      }

    } catch (error) {
      return {
        success: false,
        error: (error as Error).message,
        duration: Date.now() - startTime
      }
    }
  }

  private async restoreFullBackup(backup: BackupRecord): Promise<void> {
    // Fetch backup data
    let data = await this.fetchBackupData(backup)

    // Decrypt if needed
    if (backup.encrypted) {
      data = await this.decryptData(data)
    }

    // Decompress if needed
    if (backup.compressed) {
      data = await this.decompressData(data)
    }

    // Verify checksum
    const checksum = await this.calculateChecksum(data)
    if (checksum !== backup.checksum) {
      throw new Error("Backup checksum mismatch")
    }

    // Restore data
    await this.writeDataToTarget(data)
  }

  private async applyIncrementalBackup(backup: BackupRecord): Promise<void> {
    let data = await this.fetchBackupData(backup)

    if (backup.encrypted) {
      data = await this.decryptData(data)
    }
    if (backup.compressed) {
      data = await this.decompressData(data)
    }

    const changes = JSON.parse(data.toString()) as DataChange[]

    for (const change of changes) {
      switch (change.type) {
        case "create":
        case "update":
          await this.writeKey(change.key, change.value)
          break
        case "delete":
          await this.deleteKey(change.key)
          break
      }
    }
  }

  private async replayWALEntry(entry: WALEntry): Promise<void> {
    switch (entry.operation) {
      case "insert":
      case "update":
        await this.writeKey(entry.key, entry.value)
        break
      case "delete":
        await this.deleteKey(entry.key)
        break
    }
  }

  async getRecoveryPoints(): Promise<RecoveryPoint[]> {
    const points: RecoveryPoint[] = []

    // Add full backup points
    for (const backup of this.backupChain.filter(b => b.type === "full")) {
      points.push({
        timestamp: backup.createdAt,
        type: "full_backup",
        backupId: backup.id
      })
    }

    // Add incremental backup points
    for (const backup of this.backupChain.filter(b => b.type === "incremental")) {
      points.push({
        timestamp: backup.createdAt,
        type: "incremental_backup",
        backupId: backup.id
      })
    }

    // WAL provides continuous recovery between backups
    const walRange = this.getWALRange()
    if (walRange) {
      points.push({
        timestamp: walRange.start,
        type: "wal_start",
        continuous: true
      })
    }

    return points.sort((a, b) => a.timestamp - b.timestamp)
  }
}
```

### 3. Cross-Region Replication

Replicate backups across geographic regions:

```typescript
class CrossRegionReplication {
  private primaryRegion: string
  private replicaRegions: string[] = []
  private replicationStatus: Map<string, ReplicationStatus> = new Map()

  async configureReplication(
    config: ReplicationConfig
  ): Promise<ReplicationSetup> {
    this.primaryRegion = config.primaryRegion
    this.replicaRegions = config.replicaRegions

    // Initialize replication status
    for (const region of config.replicaRegions) {
      this.replicationStatus.set(region, {
        region,
        status: "initializing",
        lastSync: 0,
        lag: 0,
        bytesTransferred: 0
      })
    }

    // Perform initial sync
    await this.performInitialSync()

    // Start continuous replication
    this.startContinuousReplication()

    return {
      primaryRegion: this.primaryRegion,
      replicaRegions: this.replicaRegions,
      replicationMode: config.mode || "async",
      initialSyncComplete: true
    }
  }

  private async performInitialSync(): Promise<void> {
    const primaryData = await this.getAllBackupsFromRegion(this.primaryRegion)

    for (const region of this.replicaRegions) {
      const status = this.replicationStatus.get(region)!
      status.status = "syncing"

      try {
        for (const backup of primaryData) {
          await this.replicateBackup(backup, region)
          status.bytesTransferred += backup.size
        }

        status.status = "active"
        status.lastSync = Date.now()
        status.lag = 0

      } catch (error) {
        status.status = "error"
        status.error = (error as Error).message
      }
    }
  }

  private async replicateBackup(
    backup: BackupRecord,
    targetRegion: string
  ): Promise<void> {
    // Fetch backup data from primary
    const data = await this.fetchBackupFromRegion(
      backup.id,
      this.primaryRegion
    )

    // Transfer to replica
    await this.storeBackupInRegion(backup.id, data, targetRegion)

    // Verify integrity
    const replicaChecksum = await this.getChecksumFromRegion(
      backup.id,
      targetRegion
    )

    if (replicaChecksum !== backup.checksum) {
      throw new Error(`Checksum mismatch for backup ${backup.id} in ${targetRegion}`)
    }
  }

  private startContinuousReplication(): void {
    // Watch for new backups
    this.watchPrimaryRegion(async (newBackup: BackupRecord) => {
      for (const region of this.replicaRegions) {
        const status = this.replicationStatus.get(region)!

        try {
          await this.replicateBackup(newBackup, region)
          status.lastSync = Date.now()
          status.lag = 0
          status.bytesTransferred += newBackup.size

        } catch (error) {
          status.lag = Date.now() - status.lastSync
          status.status = "lagging"
        }
      }
    })

    // Monitor replication health
    setInterval(() => {
      for (const [region, status] of this.replicationStatus) {
        status.lag = Date.now() - status.lastSync

        if (status.lag > 300000) { // 5 minutes
          status.status = "lagging"
        }
      }
    }, 10000)
  }

  async promoteReplica(region: string): Promise<PromotionResult> {
    const status = this.replicationStatus.get(region)

    if (!status || status.status === "error") {
      return {
        success: false,
        error: "Region not available for promotion"
      }
    }

    // Stop replication to this region
    await this.pauseReplication(region)

    // Verify data consistency
    const consistencyCheck = await this.verifyConsistency(region)

    if (!consistencyCheck.consistent) {
      return {
        success: false,
        error: "Data consistency check failed",
        missingBackups: consistencyCheck.missing
      }
    }

    // Promote region
    const oldPrimary = this.primaryRegion
    this.primaryRegion = region

    // Reconfigure other replicas
    this.replicaRegions = this.replicaRegions.filter(r => r !== region)
    this.replicaRegions.push(oldPrimary)

    // Restart replication with new primary
    this.startContinuousReplication()

    return {
      success: true,
      newPrimary: region,
      demotedRegion: oldPrimary,
      timestamp: Date.now()
    }
  }

  async getReplicationStatus(): Promise<ReplicationOverview> {
    const statuses = Array.from(this.replicationStatus.values())

    return {
      primaryRegion: this.primaryRegion,
      replicas: statuses,
      overallHealth: statuses.every(s => s.status === "active")
        ? "healthy"
        : statuses.some(s => s.status === "error")
          ? "degraded"
          : "warning",
      maxLag: Math.max(...statuses.map(s => s.lag)),
      totalBytesReplicated: statuses.reduce((sum, s) => sum + s.bytesTransferred, 0)
    }
  }
}
```

## Best Practices

1. **Use incremental backups** to reduce storage and time
2. **Enable point-in-time recovery** for critical data
3. **Test restores regularly** to verify backup integrity
4. **Replicate to multiple regions** for disaster recovery
5. **Apply retention policies** to manage storage costs

## Related Skills

- [Failover Agent](./failover-agent.md) - Automatic failover
- [Migration Agent](./migration-agent.md) - Data migration
- [Config Manager Agent](./config-manager-agent.md) - Configuration management
