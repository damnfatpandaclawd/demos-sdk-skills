# Metrics Collector Agent Skill

Build agents that collect, aggregate, and analyze performance metrics.

## Overview

Metrics Collector Agent enables comprehensive metrics gathering, time-series storage, and performance analysis. Essential for observability, capacity planning, and proactive issue detection.

## SDK Reference

```typescript
import { Demos } from "@kynesyslabs/demosdk/websdk"
import { Messaging } from "@kynesyslabs/demosdk/messaging"

// Metrics collection messaging
const messaging = await demos.messaging.create()
```

## Agent Use Cases

### 1. Time Series Metrics Store

Store and query time-series metrics:

```typescript
class TimeSeriesMetricsStore {
  private series: Map<string, MetricSeries> = new Map()
  private aggregations: Map<string, AggregatedSeries> = new Map()

  async record(
    metricName: string,
    value: number,
    labels: Record<string, string> = {},
    timestamp: number = Date.now()
  ): Promise<void> {
    const seriesKey = this.buildSeriesKey(metricName, labels)

    if (!this.series.has(seriesKey)) {
      this.series.set(seriesKey, {
        name: metricName,
        labels,
        dataPoints: [],
        metadata: {
          firstSeen: timestamp,
          lastSeen: timestamp,
          count: 0
        }
      })
    }

    const series = this.series.get(seriesKey)!

    series.dataPoints.push({
      timestamp,
      value
    })

    series.metadata.lastSeen = timestamp
    series.metadata.count++

    // Compact old data points
    if (series.dataPoints.length > 10000) {
      await this.compactSeries(seriesKey)
    }
  }

  async query(params: MetricQueryParams): Promise<MetricQueryResult> {
    const matchingSeries = this.findMatchingSeries(params.name, params.labels)

    const results: SeriesResult[] = []

    for (const series of matchingSeries) {
      const dataPoints = this.filterByTimeRange(
        series.dataPoints,
        params.start,
        params.end
      )

      let aggregatedPoints = dataPoints

      // Apply aggregation if requested
      if (params.aggregation) {
        aggregatedPoints = this.aggregate(
          dataPoints,
          params.aggregation.function,
          params.aggregation.interval
        )
      }

      results.push({
        name: series.name,
        labels: series.labels,
        dataPoints: aggregatedPoints
      })
    }

    return {
      series: results,
      queryTime: Date.now()
    }
  }

  private aggregate(
    dataPoints: DataPoint[],
    func: AggregationFunction,
    interval: number
  ): DataPoint[] {
    if (dataPoints.length === 0) return []

    const buckets = new Map<number, number[]>()

    // Group into time buckets
    for (const point of dataPoints) {
      const bucket = Math.floor(point.timestamp / interval) * interval
      if (!buckets.has(bucket)) {
        buckets.set(bucket, [])
      }
      buckets.get(bucket)!.push(point.value)
    }

    // Apply aggregation function
    const aggregated: DataPoint[] = []

    for (const [timestamp, values] of buckets) {
      let value: number

      switch (func) {
        case "sum":
          value = values.reduce((a, b) => a + b, 0)
          break
        case "avg":
          value = values.reduce((a, b) => a + b, 0) / values.length
          break
        case "min":
          value = Math.min(...values)
          break
        case "max":
          value = Math.max(...values)
          break
        case "count":
          value = values.length
          break
        case "p50":
          value = this.percentile(values, 50)
          break
        case "p95":
          value = this.percentile(values, 95)
          break
        case "p99":
          value = this.percentile(values, 99)
          break
        default:
          value = values[values.length - 1]
      }

      aggregated.push({ timestamp, value })
    }

    return aggregated.sort((a, b) => a.timestamp - b.timestamp)
  }

  private percentile(values: number[], p: number): number {
    const sorted = [...values].sort((a, b) => a - b)
    const index = Math.ceil((p / 100) * sorted.length) - 1
    return sorted[Math.max(0, index)]
  }

  private async compactSeries(seriesKey: string): Promise<void> {
    const series = this.series.get(seriesKey)
    if (!series) return

    // Keep last hour at full resolution
    const oneHourAgo = Date.now() - 3600000
    const recent = series.dataPoints.filter(p => p.timestamp > oneHourAgo)
    const older = series.dataPoints.filter(p => p.timestamp <= oneHourAgo)

    // Aggregate older data to 1-minute buckets
    const compacted = this.aggregate(older, "avg", 60000)

    series.dataPoints = [...compacted, ...recent]
  }

  async calculateStatistics(
    metricName: string,
    labels: Record<string, string>,
    timeRange: TimeRange
  ): Promise<MetricStatistics> {
    const result = await this.query({
      name: metricName,
      labels,
      start: timeRange.start,
      end: timeRange.end
    })

    if (result.series.length === 0) {
      return { count: 0 }
    }

    const values = result.series[0].dataPoints.map(p => p.value)

    return {
      count: values.length,
      sum: values.reduce((a, b) => a + b, 0),
      min: Math.min(...values),
      max: Math.max(...values),
      avg: values.reduce((a, b) => a + b, 0) / values.length,
      stdDev: this.calculateStdDev(values),
      p50: this.percentile(values, 50),
      p95: this.percentile(values, 95),
      p99: this.percentile(values, 99)
    }
  }

  private calculateStdDev(values: number[]): number {
    const mean = values.reduce((a, b) => a + b, 0) / values.length
    const squareDiffs = values.map(v => Math.pow(v - mean, 2))
    return Math.sqrt(squareDiffs.reduce((a, b) => a + b, 0) / values.length)
  }
}
```

### 2. Distributed Metrics Collector

Collect metrics from distributed services:

```typescript
class DistributedMetricsCollector {
  private store: TimeSeriesMetricsStore
  private sources: Map<string, MetricSource> = new Map()
  private collectors: Map<string, NodeJS.Timeout> = new Map()

  async registerSource(source: MetricSource): Promise<void> {
    this.sources.set(source.id, source)

    // Start collection based on source type
    if (source.type === "pull") {
      this.startPullCollection(source)
    } else if (source.type === "push") {
      await this.setupPushEndpoint(source)
    }
  }

  private startPullCollection(source: MetricSource): void {
    const interval = setInterval(async () => {
      try {
        const metrics = await this.pullMetrics(source)

        for (const metric of metrics) {
          await this.store.record(
            metric.name,
            metric.value,
            { ...metric.labels, source: source.id },
            metric.timestamp
          )
        }

        source.status = "healthy"
        source.lastCollected = Date.now()

      } catch (error) {
        source.status = "error"
        source.lastError = (error as Error).message
      }
    }, source.interval || 15000)

    this.collectors.set(source.id, interval)
  }

  private async pullMetrics(source: MetricSource): Promise<CollectedMetric[]> {
    const response = await this.messaging.sendRequest(
      source.endpoint,
      { type: "get_metrics" },
      { timeout: 10000 }
    )

    return this.parseMetrics(response.metrics, source.format)
  }

  private parseMetrics(
    raw: any,
    format: MetricFormat
  ): CollectedMetric[] {
    switch (format) {
      case "prometheus":
        return this.parsePrometheus(raw)
      case "json":
        return this.parseJson(raw)
      case "statsd":
        return this.parseStatsd(raw)
      default:
        return raw
    }
  }

  private parsePrometheus(text: string): CollectedMetric[] {
    const metrics: CollectedMetric[] = []
    const lines = text.split("\n")

    for (const line of lines) {
      if (line.startsWith("#") || line.trim() === "") continue

      // Parse metric line: metric_name{label1="value1"} value timestamp
      const match = line.match(/^(\w+)(\{([^}]+)\})?\s+(\d+(?:\.\d+)?)\s*(\d+)?$/)

      if (match) {
        const [, name, , labelsStr, value, timestamp] = match
        const labels: Record<string, string> = {}

        if (labelsStr) {
          const labelPairs = labelsStr.match(/(\w+)="([^"]+)"/g) || []
          for (const pair of labelPairs) {
            const [key, val] = pair.split("=")
            labels[key] = val.replace(/"/g, "")
          }
        }

        metrics.push({
          name,
          value: parseFloat(value),
          labels,
          timestamp: timestamp ? parseInt(timestamp) : Date.now()
        })
      }
    }

    return metrics
  }

  async getSourceHealth(): Promise<SourceHealthReport> {
    const healthy: string[] = []
    const unhealthy: string[] = []
    const details: SourceHealth[] = []

    for (const [id, source] of this.sources) {
      const health: SourceHealth = {
        id,
        status: source.status,
        lastCollected: source.lastCollected,
        error: source.lastError
      }

      details.push(health)

      if (source.status === "healthy") {
        healthy.push(id)
      } else {
        unhealthy.push(id)
      }
    }

    return {
      totalSources: this.sources.size,
      healthy: healthy.length,
      unhealthy: unhealthy.length,
      details
    }
  }
}
```

### 3. Metrics Dashboard Builder

Build real-time metrics dashboards:

```typescript
class MetricsDashboardBuilder {
  private store: TimeSeriesMetricsStore
  private dashboards: Map<string, Dashboard> = new Map()
  private subscribers: Map<string, DashboardSubscriber[]> = new Map()

  async createDashboard(config: DashboardConfig): Promise<Dashboard> {
    const dashboard: Dashboard = {
      id: `dashboard_${Date.now()}`,
      name: config.name,
      panels: config.panels.map(p => this.createPanel(p)),
      refreshInterval: config.refreshInterval || 30000,
      timeRange: config.timeRange || { relative: "1h" },
      createdAt: Date.now()
    }

    this.dashboards.set(dashboard.id, dashboard)

    // Start refresh loop
    this.startRefresh(dashboard)

    return dashboard
  }

  private createPanel(config: PanelConfig): DashboardPanel {
    return {
      id: `panel_${Date.now()}_${Math.random().toString(36).slice(2)}`,
      title: config.title,
      type: config.type,
      queries: config.queries,
      options: config.options || {},
      position: config.position
    }
  }

  async refreshDashboard(dashboardId: string): Promise<DashboardData> {
    const dashboard = this.dashboards.get(dashboardId)
    if (!dashboard) {
      throw new Error(`Dashboard ${dashboardId} not found`)
    }

    const timeRange = this.resolveTimeRange(dashboard.timeRange)
    const panelData: PanelData[] = []

    for (const panel of dashboard.panels) {
      const data = await this.refreshPanel(panel, timeRange)
      panelData.push(data)
    }

    const dashboardData: DashboardData = {
      dashboardId,
      timestamp: Date.now(),
      timeRange,
      panels: panelData
    }

    // Notify subscribers
    await this.notifySubscribers(dashboardId, dashboardData)

    return dashboardData
  }

  private async refreshPanel(
    panel: DashboardPanel,
    timeRange: TimeRange
  ): Promise<PanelData> {
    const queryResults: QueryResult[] = []

    for (const query of panel.queries) {
      const result = await this.store.query({
        name: query.metric,
        labels: query.labels,
        start: timeRange.start,
        end: timeRange.end,
        aggregation: query.aggregation
      })

      queryResults.push({
        query,
        series: result.series
      })
    }

    // Format data based on panel type
    return {
      panelId: panel.id,
      type: panel.type,
      data: this.formatPanelData(panel.type, queryResults, panel.options)
    }
  }

  private formatPanelData(
    type: PanelType,
    results: QueryResult[],
    options: PanelOptions
  ): any {
    switch (type) {
      case "timeseries":
        return this.formatTimeseries(results)

      case "gauge":
        return this.formatGauge(results)

      case "stat":
        return this.formatStat(results, options)

      case "table":
        return this.formatTable(results)

      case "heatmap":
        return this.formatHeatmap(results)

      default:
        return results
    }
  }

  private formatTimeseries(results: QueryResult[]): TimeseriesData {
    return {
      series: results.flatMap(r =>
        r.series.map(s => ({
          name: this.buildSeriesName(r.query, s.labels),
          data: s.dataPoints.map(p => ({
            x: p.timestamp,
            y: p.value
          }))
        }))
      )
    }
  }

  private formatGauge(results: QueryResult[]): GaugeData {
    // Use latest value
    const latestValues = results.flatMap(r =>
      r.series.map(s => {
        const latest = s.dataPoints[s.dataPoints.length - 1]
        return latest?.value || 0
      })
    )

    return {
      value: latestValues[0] || 0,
      min: 0,
      max: 100
    }
  }

  private formatStat(results: QueryResult[], options: PanelOptions): StatData {
    const values = results.flatMap(r =>
      r.series.flatMap(s => s.dataPoints.map(p => p.value))
    )

    let value: number

    switch (options.statFunction || "last") {
      case "sum":
        value = values.reduce((a, b) => a + b, 0)
        break
      case "avg":
        value = values.reduce((a, b) => a + b, 0) / values.length
        break
      case "min":
        value = Math.min(...values)
        break
      case "max":
        value = Math.max(...values)
        break
      case "last":
      default:
        value = values[values.length - 1] || 0
    }

    return {
      value,
      format: options.format || "number",
      unit: options.unit
    }
  }

  async subscribe(
    dashboardId: string,
    callback: DashboardCallback
  ): Promise<Subscription> {
    if (!this.subscribers.has(dashboardId)) {
      this.subscribers.set(dashboardId, [])
    }

    const subscriber: DashboardSubscriber = {
      id: `sub_${Date.now()}`,
      callback
    }

    this.subscribers.get(dashboardId)!.push(subscriber)

    // Send initial data
    const data = await this.refreshDashboard(dashboardId)
    callback(data)

    return {
      id: subscriber.id,
      unsubscribe: () => this.unsubscribe(dashboardId, subscriber.id)
    }
  }

  private startRefresh(dashboard: Dashboard): void {
    setInterval(async () => {
      await this.refreshDashboard(dashboard.id)
    }, dashboard.refreshInterval)
  }
}
```

## Best Practices

1. **Use meaningful metric names** with consistent naming conventions
2. **Add relevant labels** for filtering and grouping
3. **Set appropriate collection intervals** to balance detail and overhead
4. **Aggregate historical data** to manage storage
5. **Define SLIs/SLOs** based on collected metrics

## Related Skills

- [Log Aggregator Agent](./log-aggregator-agent.md) - Log correlation
- [Alert Manager Agent](./alert-manager-agent.md) - Metric-based alerts
- [Load Balancer Agent](./load-balancer-agent.md) - Performance metrics
