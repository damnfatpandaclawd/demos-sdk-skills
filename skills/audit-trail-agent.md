# Audit Trail Agent Skill

> **⚠️ Prerequisites**: Complete [SDK Setup](./00-sdk-setup.md) first to configure your environment.

Build agents that maintain immutable audit logs for compliance and forensics.

## Overview

Audit Trail enables agents to record, store, and query immutable logs of all operations. Essential for regulatory compliance, security monitoring, and operational transparency.

## SDK Reference

```typescript
import { StorageProgram } from "@kynesyslabs/demosdk/storage"

// Audit Methods
StorageProgram.appendItem(address, "auditLog", entry)
StorageProgram.getItem(address, "auditLog", index)
StorageProgram.getValue(address, "auditLog")
```

## Agent Use Cases

### 1. Operation Logger Agent

Log all agent operations:

```typescript
class OperationLoggerAgent {
  private demos: Demos
  private auditAddress: string

  async logOperation(
    operation: string,
    details: any,
    result: "success" | "failure"
  ): Promise<void> {
    const entry: AuditEntry = {
      id: this.generateEntryId(),
      timestamp: Date.now(),
      operation,
      actor: await this.demos.wallet.getAddress(),
      details,
      result,
      signature: await this.signEntry({ operation, details, result })
    }

    await StorageProgram.appendItem(
      this.demos,
      this.auditAddress,
      "auditLog",
      entry
    )
  }

  async queryAuditLog(
    filters: AuditFilters
  ): Promise<AuditEntry[]> {
    const log = await StorageProgram.getValue(
      this.demos.rpcUrl,
      this.auditAddress,
      "auditLog"
    )

    return log.value.filter((entry: AuditEntry) => {
      if (filters.operation && entry.operation !== filters.operation) return false
      if (filters.actor && entry.actor !== filters.actor) return false
      if (filters.since && entry.timestamp < filters.since) return false
      if (filters.until && entry.timestamp > filters.until) return false
      if (filters.result && entry.result !== filters.result) return false
      return true
    })
  }

  async generateAuditReport(
    period: { start: Date; end: Date }
  ): Promise<AuditReport> {
    const entries = await this.queryAuditLog({
      since: period.start.getTime(),
      until: period.end.getTime()
    })

    return {
      period,
      totalOperations: entries.length,
      successRate: entries.filter(e => e.result === "success").length / entries.length,
      operationsByType: this.groupByOperation(entries),
      operationsByActor: this.groupByActor(entries),
      failures: entries.filter(e => e.result === "failure")
    }
  }
}
```

### 2. Tamper Detection Agent

Verify audit log integrity:

```typescript
class TamperDetectionAgent {
  async verifyLogIntegrity(auditAddress: string): Promise<IntegrityResult> {
    const log = await this.getFullLog(auditAddress)
    const issues: IntegrityIssue[] = []

    for (let i = 1; i < log.length; i++) {
      // Check sequential IDs
      if (log[i].id <= log[i-1].id) {
        issues.push({ type: "ID_SEQUENCE", index: i })
      }

      // Check timestamps are sequential
      if (log[i].timestamp < log[i-1].timestamp) {
        issues.push({ type: "TIMESTAMP_ORDER", index: i })
      }

      // Verify signatures
      const isValidSig = await this.verifySignature(log[i])
      if (!isValidSig) {
        issues.push({ type: "INVALID_SIGNATURE", index: i })
      }
    }

    return {
      valid: issues.length === 0,
      entriesChecked: log.length,
      issues
    }
  }
}
```

## Best Practices

1. **Sign all entries** for non-repudiation
2. **Use append-only storage** for immutability
3. **Include timestamps** in all entries
4. **Verify integrity** periodically
5. **Archive old logs** to manage storage costs

## Related Skills

- [Storage Program](./storage-program-agent.md) - On-chain storage
- [Compliance Monitoring](./compliance-monitoring-agent.md) - Regulatory compliance
