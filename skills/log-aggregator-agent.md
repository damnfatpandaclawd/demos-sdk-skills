# Log Aggregator Agent Skill

Build agents that collect, process, and analyze logs from distributed systems.

## Overview

Log Aggregator Agent enables centralized log collection, structured parsing, and intelligent log analysis. Essential for debugging, monitoring, compliance, and gaining operational insights across distributed services.

## SDK Reference

```typescript
import { Demos } from "@kynesyslabs/demosdk/websdk"
import { Messaging } from "@kynesyslabs/demosdk/messaging"

// Log collection messaging
const messaging = await demos.messaging.create()
```

## Agent Use Cases

### 1. Centralized Log Collector

Collect logs from multiple sources:

```typescript
class CentralizedLogCollector {
  private sources: Map<string, LogSource> = new Map()
  private logBuffer: LogEntry[] = []
  private processors: LogProcessor[] = []
  private storage: LogStorage

  async registerSource(source: LogSource): Promise<void> {
    this.sources.set(source.id, source)

    // Start collection based on source type
    switch (source.type) {
      case "push":
        await this.setupPushListener(source)
        break
      case "pull":
        this.startPullCollection(source)
        break
      case "stream":
        await this.connectLogStream(source)
        break
    }
  }

  private async setupPushListener(source: LogSource): Promise<void> {
    this.messaging.on("log_push", async (message: LogPushMessage) => {
      if (message.sourceId === source.id) {
        await this.processLog({
          ...message.entry,
          sourceId: source.id,
          receivedAt: Date.now()
        })
      }
    })
  }

  private startPullCollection(source: LogSource): void {
    const interval = source.pullInterval || 10000

    setInterval(async () => {
      try {
        const response = await this.messaging.sendRequest(
          source.endpoint,
          {
            type: "get_logs",
            since: source.lastPullTimestamp
          },
          { timeout: 30000 }
        )

        for (const entry of response.entries) {
          await this.processLog({
            ...entry,
            sourceId: source.id,
            receivedAt: Date.now()
          })
        }

        source.lastPullTimestamp = Date.now()

      } catch (error) {
        console.error(`Pull failed for ${source.id}:`, error)
      }
    }, interval)
  }

  private async processLog(entry: LogEntry): Promise<void> {
    // Add to buffer
    this.logBuffer.push(entry)

    // Run through processors
    let processed = entry
    for (const processor of this.processors) {
      processed = await processor.process(processed)
    }

    // Check buffer size and flush if needed
    if (this.logBuffer.length >= 1000) {
      await this.flushBuffer()
    }
  }

  async flushBuffer(): Promise<FlushResult> {
    const toFlush = [...this.logBuffer]
    this.logBuffer = []

    // Store logs
    await this.storage.bulkInsert(toFlush)

    return {
      flushed: toFlush.length,
      timestamp: Date.now()
    }
  }

  registerProcessor(processor: LogProcessor): void {
    this.processors.push(processor)
  }

  async query(params: LogQueryParams): Promise<LogQueryResult> {
    return await this.storage.query(params)
  }
}
```

### 2. Structured Log Parser

Parse and enrich unstructured logs:

```typescript
class StructuredLogParser {
  private patterns: Map<string, LogPattern> = new Map()
  private enrichers: LogEnricher[] = []

  registerPattern(pattern: LogPattern): void {
    this.patterns.set(pattern.name, pattern)
  }

  registerEnricher(enricher: LogEnricher): void {
    this.enrichers.push(enricher)
  }

  async parse(rawLog: string, sourceHint?: string): Promise<ParsedLog> {
    // Try to match a pattern
    let parsed: ParsedLog | null = null

    for (const [name, pattern] of this.patterns) {
      const match = rawLog.match(pattern.regex)

      if (match) {
        parsed = {
          raw: rawLog,
          pattern: name,
          fields: this.extractFields(match, pattern.fields),
          timestamp: this.extractTimestamp(match, pattern),
          level: this.extractLevel(match, pattern),
          message: this.extractMessage(match, pattern)
        }
        break
      }
    }

    if (!parsed) {
      // Fallback to generic parsing
      parsed = this.genericParse(rawLog)
    }

    // Run enrichers
    for (const enricher of this.enrichers) {
      parsed = await enricher.enrich(parsed)
    }

    return parsed
  }

  private extractFields(
    match: RegExpMatchArray,
    fieldDefs: FieldDefinition[]
  ): Record<string, any> {
    const fields: Record<string, any> = {}

    for (const def of fieldDefs) {
      const value = match[def.groupIndex]

      if (value !== undefined) {
        fields[def.name] = this.convertType(value, def.type)
      }
    }

    return fields
  }

  private convertType(value: string, type: string): any {
    switch (type) {
      case "number":
        return parseFloat(value)
      case "integer":
        return parseInt(value, 10)
      case "boolean":
        return value.toLowerCase() === "true"
      case "json":
        try {
          return JSON.parse(value)
        } catch {
          return value
        }
      case "date":
        return new Date(value).getTime()
      default:
        return value
    }
  }

  private genericParse(rawLog: string): ParsedLog {
    // Try JSON parsing
    try {
      const json = JSON.parse(rawLog)
      return {
        raw: rawLog,
        pattern: "json",
        fields: json,
        timestamp: json.timestamp || json.time || Date.now(),
        level: json.level || json.severity || "info",
        message: json.message || json.msg || rawLog
      }
    } catch {}

    // Try common log formats
    const commonPatterns = [
      // Apache/Nginx common log format
      /^(\S+) (\S+) (\S+) \[([^\]]+)\] "([^"]*)" (\d+) (\d+)/,
      // Syslog format
      /^(\w+ \d+ \d+:\d+:\d+) (\S+) (\S+)\[(\d+)\]: (.*)$/,
      // ISO timestamp prefix
      /^(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}[^\s]*)\s+(\w+)\s+(.*)$/
    ]

    for (const pattern of commonPatterns) {
      const match = rawLog.match(pattern)
      if (match) {
        return {
          raw: rawLog,
          pattern: "auto-detected",
          fields: { groups: match.slice(1) },
          timestamp: this.parseTimestamp(match[1]) || Date.now(),
          level: "info",
          message: rawLog
        }
      }
    }

    return {
      raw: rawLog,
      pattern: "unknown",
      fields: {},
      timestamp: Date.now(),
      level: "info",
      message: rawLog
    }
  }

  // Predefined patterns for common formats
  static readonly CommonPatterns: LogPattern[] = [
    {
      name: "nginx_access",
      regex: /^(\S+) - (\S+) \[([^\]]+)\] "(\w+) ([^"]+)" (\d+) (\d+) "([^"]*)" "([^"]*)"/,
      fields: [
        { name: "client_ip", groupIndex: 1, type: "string" },
        { name: "user", groupIndex: 2, type: "string" },
        { name: "timestamp", groupIndex: 3, type: "date" },
        { name: "method", groupIndex: 4, type: "string" },
        { name: "path", groupIndex: 5, type: "string" },
        { name: "status", groupIndex: 6, type: "integer" },
        { name: "bytes", groupIndex: 7, type: "integer" },
        { name: "referrer", groupIndex: 8, type: "string" },
        { name: "user_agent", groupIndex: 9, type: "string" }
      ]
    },
    {
      name: "application_json",
      regex: /^\{.*\}$/,
      isJson: true,
      fields: []
    }
  ]
}
```

### 3. Log Analytics Engine

Analyze logs for patterns and anomalies:

```typescript
class LogAnalyticsEngine {
  private storage: LogStorage
  private anomalyDetectors: AnomalyDetector[] = []
  private alertRules: AlertRule[] = []

  async analyzeTimeRange(
    start: number,
    end: number
  ): Promise<AnalyticsReport> {
    const logs = await this.storage.query({
      timeRange: { start, end }
    })

    return {
      summary: this.calculateSummary(logs.entries),
      levelDistribution: this.calculateLevelDistribution(logs.entries),
      topErrors: this.findTopErrors(logs.entries),
      patterns: await this.detectPatterns(logs.entries),
      anomalies: await this.detectAnomalies(logs.entries),
      timeline: this.buildTimeline(logs.entries, start, end)
    }
  }

  private calculateSummary(logs: LogEntry[]): LogSummary {
    const levels = { debug: 0, info: 0, warn: 0, error: 0, fatal: 0 }

    for (const log of logs) {
      const level = log.level?.toLowerCase() || "info"
      if (level in levels) {
        levels[level as keyof typeof levels]++
      }
    }

    return {
      totalLogs: logs.length,
      levels,
      errorRate: (levels.error + levels.fatal) / logs.length,
      uniqueSources: new Set(logs.map(l => l.sourceId)).size
    }
  }

  private findTopErrors(logs: LogEntry[]): ErrorGroup[] {
    const errors = logs.filter(l =>
      l.level === "error" || l.level === "fatal"
    )

    const grouped = new Map<string, LogEntry[]>()

    for (const error of errors) {
      // Extract error signature (normalize stack traces, etc.)
      const signature = this.extractErrorSignature(error)

      if (!grouped.has(signature)) {
        grouped.set(signature, [])
      }
      grouped.get(signature)!.push(error)
    }

    return Array.from(grouped.entries())
      .map(([signature, entries]) => ({
        signature,
        count: entries.length,
        firstSeen: Math.min(...entries.map(e => e.timestamp)),
        lastSeen: Math.max(...entries.map(e => e.timestamp)),
        sample: entries[0]
      }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 10)
  }

  private extractErrorSignature(error: LogEntry): string {
    // Normalize the error message for grouping
    let message = error.message || ""

    // Remove dynamic parts
    message = message
      .replace(/\b\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}[^\s]*/g, "<TIMESTAMP>")
      .replace(/\b[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}\b/g, "<UUID>")
      .replace(/\b\d+\.\d+\.\d+\.\d+\b/g, "<IP>")
      .replace(/\b\d+\b/g, "<N>")

    return message.substring(0, 200)
  }

  async detectPatterns(logs: LogEntry[]): Promise<LogPattern[]> {
    const patterns: Map<string, PatternCandidate> = new Map()

    for (const log of logs) {
      // Extract pattern template
      const template = this.extractTemplate(log.message)

      if (!patterns.has(template)) {
        patterns.set(template, {
          template,
          count: 0,
          examples: []
        })
      }

      const pattern = patterns.get(template)!
      pattern.count++

      if (pattern.examples.length < 3) {
        pattern.examples.push(log.message)
      }
    }

    return Array.from(patterns.values())
      .filter(p => p.count >= 10) // Minimum occurrence threshold
      .sort((a, b) => b.count - a.count)
      .slice(0, 50)
      .map(p => ({
        template: p.template,
        frequency: p.count / logs.length,
        examples: p.examples
      }))
  }

  async detectAnomalies(logs: LogEntry[]): Promise<Anomaly[]> {
    const anomalies: Anomaly[] = []

    for (const detector of this.anomalyDetectors) {
      const detected = await detector.detect(logs)
      anomalies.push(...detected)
    }

    return anomalies.sort((a, b) => b.severity - a.severity)
  }

  registerAnomalyDetector(detector: AnomalyDetector): void {
    this.anomalyDetectors.push(detector)
  }

  // Built-in anomaly detectors
  static readonly Detectors = {
    errorSpike: {
      async detect(logs: LogEntry[]): Promise<Anomaly[]> {
        const anomalies: Anomaly[] = []
        const buckets = new Map<number, number>()

        // Group by minute
        for (const log of logs) {
          if (log.level === "error" || log.level === "fatal") {
            const minute = Math.floor(log.timestamp / 60000)
            buckets.set(minute, (buckets.get(minute) || 0) + 1)
          }
        }

        const values = Array.from(buckets.values())
        const mean = values.reduce((a, b) => a + b, 0) / values.length
        const stdDev = Math.sqrt(
          values.reduce((sum, v) => sum + Math.pow(v - mean, 2), 0) / values.length
        )

        for (const [minute, count] of buckets) {
          if (count > mean + 3 * stdDev) {
            anomalies.push({
              type: "error_spike",
              timestamp: minute * 60000,
              severity: Math.min(10, Math.floor((count - mean) / stdDev)),
              description: `Error spike: ${count} errors (${((count - mean) / stdDev).toFixed(1)} std devs above mean)`,
              value: count
            })
          }
        }

        return anomalies
      }
    },

    newErrorType: {
      async detect(logs: LogEntry[]): Promise<Anomaly[]> {
        const anomalies: Anomaly[] = []
        const errorTypes = new Set<string>()
        const halfwayPoint = logs.length / 2

        // Learn error types from first half
        for (let i = 0; i < halfwayPoint; i++) {
          if (logs[i].level === "error") {
            errorTypes.add(this.getErrorType(logs[i]))
          }
        }

        // Find new types in second half
        for (let i = Math.floor(halfwayPoint); i < logs.length; i++) {
          if (logs[i].level === "error") {
            const errorType = this.getErrorType(logs[i])
            if (!errorTypes.has(errorType)) {
              anomalies.push({
                type: "new_error_type",
                timestamp: logs[i].timestamp,
                severity: 5,
                description: `New error type detected: ${errorType}`,
                sample: logs[i]
              })
              errorTypes.add(errorType) // Don't report same type twice
            }
          }
        }

        return anomalies
      },

      getErrorType(log: LogEntry): string {
        const message = log.message || ""
        const match = message.match(/^(\w+Error|\w+Exception)/)
        return match ? match[1] : message.substring(0, 50)
      }
    }
  }
}
```

## Best Practices

1. **Structure logs consistently** across all services
2. **Include correlation IDs** for request tracing
3. **Use appropriate log levels** (debug, info, warn, error)
4. **Set up retention policies** to manage storage
5. **Monitor log volume** for anomalies

## Related Skills

- [Metrics Collector Agent](./metrics-collector-agent.md) - Metrics collection
- [Alert Manager Agent](./alert-manager-agent.md) - Log-based alerts
- [Failover Agent](./failover-agent.md) - Failure detection
