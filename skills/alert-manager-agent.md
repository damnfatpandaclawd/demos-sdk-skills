# Alert Manager Agent Skill

Build agents that manage alerts, notifications, and incident response.

## Overview

Alert Manager Agent enables intelligent alerting, notification routing, and incident management. Essential for operational awareness, rapid incident response, and maintaining service reliability.

## SDK Reference

```typescript
import { Demos } from "@kynesyslabs/demosdk/websdk"
import { Messaging } from "@kynesyslabs/demosdk/messaging"

// Alert messaging
const messaging = await demos.messaging.create()
```

## Agent Use Cases

### 1. Rule-Based Alert Engine

Evaluate conditions and trigger alerts:

```typescript
class RuleBasedAlertEngine {
  private rules: Map<string, AlertRule> = new Map()
  private activeAlerts: Map<string, ActiveAlert> = new Map()
  private alertHistory: AlertEvent[] = []

  async createRule(config: AlertRuleConfig): Promise<AlertRule> {
    const rule: AlertRule = {
      id: config.id || `rule_${Date.now()}`,
      name: config.name,
      description: config.description,
      condition: config.condition,
      threshold: config.threshold,
      duration: config.duration || 0,
      severity: config.severity || "warning",
      labels: config.labels || {},
      annotations: config.annotations || {},
      notificationChannels: config.notificationChannels || [],
      silenced: false,
      enabled: true,
      createdAt: Date.now()
    }

    this.rules.set(rule.id, rule)
    return rule
  }

  async evaluate(metrics: MetricSnapshot): Promise<EvaluationResult[]> {
    const results: EvaluationResult[] = []

    for (const [ruleId, rule] of this.rules) {
      if (!rule.enabled || rule.silenced) continue

      const evaluation = await this.evaluateRule(rule, metrics)
      results.push(evaluation)

      if (evaluation.firing && !this.activeAlerts.has(ruleId)) {
        // New alert
        await this.fireAlert(rule, evaluation)
      } else if (!evaluation.firing && this.activeAlerts.has(ruleId)) {
        // Alert resolved
        await this.resolveAlert(ruleId)
      }
    }

    return results
  }

  private async evaluateRule(
    rule: AlertRule,
    metrics: MetricSnapshot
  ): Promise<EvaluationResult> {
    const value = this.extractValue(rule.condition, metrics)

    let firing = false

    switch (rule.condition.operator) {
      case ">":
        firing = value > rule.threshold
        break
      case ">=":
        firing = value >= rule.threshold
        break
      case "<":
        firing = value < rule.threshold
        break
      case "<=":
        firing = value <= rule.threshold
        break
      case "==":
        firing = value === rule.threshold
        break
      case "!=":
        firing = value !== rule.threshold
        break
    }

    // Check duration requirement
    if (firing && rule.duration > 0) {
      const pendingKey = `pending_${rule.id}`
      const pending = this.activeAlerts.get(pendingKey)

      if (!pending) {
        // Start pending period
        this.activeAlerts.set(pendingKey, {
          ruleId: rule.id,
          startTime: Date.now(),
          state: "pending"
        })
        firing = false
      } else if (Date.now() - pending.startTime < rule.duration) {
        // Still in pending period
        firing = false
      } else {
        // Duration met
        this.activeAlerts.delete(pendingKey)
      }
    }

    return {
      ruleId: rule.id,
      ruleName: rule.name,
      firing,
      value,
      threshold: rule.threshold,
      evaluatedAt: Date.now()
    }
  }

  private async fireAlert(
    rule: AlertRule,
    evaluation: EvaluationResult
  ): Promise<void> {
    const alert: ActiveAlert = {
      ruleId: rule.id,
      ruleName: rule.name,
      severity: rule.severity,
      state: "firing",
      value: evaluation.value,
      threshold: rule.threshold,
      labels: rule.labels,
      annotations: this.resolveAnnotations(rule.annotations, evaluation),
      startTime: Date.now(),
      notifiedAt: 0
    }

    this.activeAlerts.set(rule.id, alert)

    // Record event
    this.alertHistory.push({
      type: "fired",
      ruleId: rule.id,
      alert,
      timestamp: Date.now()
    })

    // Send notifications
    await this.sendNotifications(rule, alert)
  }

  private async resolveAlert(ruleId: string): Promise<void> {
    const alert = this.activeAlerts.get(ruleId)
    if (!alert) return

    alert.state = "resolved"
    alert.resolvedAt = Date.now()

    // Record event
    this.alertHistory.push({
      type: "resolved",
      ruleId,
      alert,
      timestamp: Date.now()
    })

    const rule = this.rules.get(ruleId)
    if (rule) {
      await this.sendResolutionNotification(rule, alert)
    }

    this.activeAlerts.delete(ruleId)
  }

  private async sendNotifications(
    rule: AlertRule,
    alert: ActiveAlert
  ): Promise<void> {
    for (const channelId of rule.notificationChannels) {
      await this.notificationManager.send(channelId, {
        type: "alert",
        severity: alert.severity,
        title: `[${alert.severity.toUpperCase()}] ${rule.name}`,
        message: alert.annotations.description || rule.description,
        labels: alert.labels,
        value: alert.value,
        threshold: alert.threshold,
        timestamp: alert.startTime
      })
    }

    alert.notifiedAt = Date.now()
  }

  async silenceRule(
    ruleId: string,
    duration: number,
    reason: string
  ): Promise<Silence> {
    const rule = this.rules.get(ruleId)
    if (!rule) {
      throw new Error(`Rule ${ruleId} not found`)
    }

    rule.silenced = true

    const silence: Silence = {
      id: `silence_${Date.now()}`,
      ruleId,
      reason,
      startTime: Date.now(),
      endTime: Date.now() + duration,
      createdBy: "system"
    }

    // Auto-unsilence after duration
    setTimeout(() => {
      rule.silenced = false
    }, duration)

    return silence
  }

  getActiveAlerts(): ActiveAlert[] {
    return Array.from(this.activeAlerts.values())
      .filter(a => a.state === "firing")
  }
}
```

### 2. Notification Router

Route notifications to appropriate channels:

```typescript
class NotificationRouter {
  private channels: Map<string, NotificationChannel> = new Map()
  private routingRules: RoutingRule[] = []
  private rateLimiter: RateLimiter

  async registerChannel(channel: NotificationChannel): Promise<void> {
    this.channels.set(channel.id, channel)
  }

  addRoutingRule(rule: RoutingRule): void {
    this.routingRules.push(rule)
    // Sort by priority
    this.routingRules.sort((a, b) => b.priority - a.priority)
  }

  async route(notification: Notification): Promise<RoutingResult> {
    // Find matching routing rules
    const matchingRules = this.routingRules.filter(rule =>
      this.matchesRule(notification, rule)
    )

    if (matchingRules.length === 0) {
      // Use default channel
      return await this.sendToDefault(notification)
    }

    const results: ChannelResult[] = []

    for (const rule of matchingRules) {
      for (const channelId of rule.channels) {
        // Check rate limit
        if (!this.rateLimiter.allow(channelId, notification.severity)) {
          results.push({
            channelId,
            success: false,
            reason: "rate_limited"
          })
          continue
        }

        const result = await this.sendToChannel(channelId, notification, rule)
        results.push(result)

        // Stop if rule says not to continue
        if (!rule.continueRouting) break
      }
    }

    return {
      notification,
      results,
      routedAt: Date.now()
    }
  }

  private matchesRule(
    notification: Notification,
    rule: RoutingRule
  ): boolean {
    // Check severity
    if (rule.severities && !rule.severities.includes(notification.severity)) {
      return false
    }

    // Check labels
    if (rule.labelMatchers) {
      for (const [key, value] of Object.entries(rule.labelMatchers)) {
        if (notification.labels[key] !== value) {
          return false
        }
      }
    }

    // Check time-based rules
    if (rule.timeRestrictions) {
      const now = new Date()
      const hour = now.getHours()
      const day = now.getDay()

      if (rule.timeRestrictions.hours &&
          (hour < rule.timeRestrictions.hours.start ||
           hour > rule.timeRestrictions.hours.end)) {
        return false
      }

      if (rule.timeRestrictions.days &&
          !rule.timeRestrictions.days.includes(day)) {
        return false
      }
    }

    return true
  }

  private async sendToChannel(
    channelId: string,
    notification: Notification,
    rule: RoutingRule
  ): Promise<ChannelResult> {
    const channel = this.channels.get(channelId)
    if (!channel) {
      return {
        channelId,
        success: false,
        reason: "channel_not_found"
      }
    }

    try {
      // Format notification for channel
      const formatted = this.formatForChannel(notification, channel, rule)

      // Send via channel
      await channel.send(formatted)

      return {
        channelId,
        success: true,
        sentAt: Date.now()
      }

    } catch (error) {
      return {
        channelId,
        success: false,
        reason: (error as Error).message
      }
    }
  }

  private formatForChannel(
    notification: Notification,
    channel: NotificationChannel,
    rule: RoutingRule
  ): FormattedNotification {
    const template = rule.template || channel.defaultTemplate

    return {
      ...notification,
      formatted: this.applyTemplate(notification, template),
      channel: channel.type
    }
  }

  // Channel implementations
  static readonly Channels = {
    slack: {
      id: "slack",
      type: "slack",
      async send(notification: FormattedNotification): Promise<void> {
        const color = {
          critical: "#FF0000",
          error: "#FF4444",
          warning: "#FFAA00",
          info: "#0088FF"
        }[notification.severity] || "#888888"

        await fetch(this.webhookUrl, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            attachments: [{
              color,
              title: notification.title,
              text: notification.message,
              fields: Object.entries(notification.labels).map(([k, v]) => ({
                title: k,
                value: v,
                short: true
              })),
              ts: Math.floor(notification.timestamp / 1000)
            }]
          })
        })
      }
    },

    pagerduty: {
      id: "pagerduty",
      type: "pagerduty",
      async send(notification: FormattedNotification): Promise<void> {
        const severity = {
          critical: "critical",
          error: "error",
          warning: "warning",
          info: "info"
        }[notification.severity] || "info"

        await fetch("https://events.pagerduty.com/v2/enqueue", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            routing_key: this.routingKey,
            event_action: "trigger",
            payload: {
              summary: notification.title,
              severity,
              source: notification.labels.source || "alert-manager",
              custom_details: notification.labels
            }
          })
        })
      }
    },

    email: {
      id: "email",
      type: "email",
      async send(notification: FormattedNotification): Promise<void> {
        // Send via email service
        await this.emailService.send({
          to: this.recipients,
          subject: `[${notification.severity.toUpperCase()}] ${notification.title}`,
          html: this.formatEmailBody(notification)
        })
      }
    }
  }
}
```

### 3. Incident Manager

Manage incident lifecycle and escalation:

```typescript
class IncidentManager {
  private incidents: Map<string, Incident> = new Map()
  private escalationPolicies: Map<string, EscalationPolicy> = new Map()
  private onCallSchedules: Map<string, OnCallSchedule> = new Map()

  async createIncident(
    trigger: IncidentTrigger
  ): Promise<Incident> {
    // Check for existing incident
    const existing = this.findRelatedIncident(trigger)
    if (existing) {
      await this.updateIncident(existing.id, {
        relatedAlerts: [...existing.relatedAlerts, trigger.alertId]
      })
      return existing
    }

    const incident: Incident = {
      id: `inc_${Date.now()}`,
      title: trigger.title,
      description: trigger.description,
      severity: trigger.severity,
      status: "open",
      relatedAlerts: [trigger.alertId],
      timeline: [{
        type: "created",
        timestamp: Date.now(),
        message: "Incident created"
      }],
      assignee: null,
      escalationLevel: 0,
      createdAt: Date.now()
    }

    this.incidents.set(incident.id, incident)

    // Start escalation
    await this.startEscalation(incident)

    return incident
  }

  private async startEscalation(incident: Incident): Promise<void> {
    const policy = this.getEscalationPolicy(incident)
    if (!policy) return

    await this.escalateToLevel(incident, 0, policy)
  }

  private async escalateToLevel(
    incident: Incident,
    level: number,
    policy: EscalationPolicy
  ): Promise<void> {
    if (level >= policy.levels.length) return

    const escalationLevel = policy.levels[level]
    incident.escalationLevel = level

    // Get on-call responder
    const responder = await this.getOnCallResponder(escalationLevel.schedule)

    if (responder) {
      incident.assignee = responder.id

      // Notify responder
      await this.notifyResponder(responder, incident)

      // Add to timeline
      incident.timeline.push({
        type: "escalated",
        timestamp: Date.now(),
        message: `Escalated to level ${level + 1}: ${responder.name}`
      })
    }

    // Set timeout for next escalation
    if (level + 1 < policy.levels.length) {
      setTimeout(async () => {
        // Check if still unacknowledged
        if (incident.status === "open") {
          await this.escalateToLevel(incident, level + 1, policy)
        }
      }, escalationLevel.timeout)
    }
  }

  async acknowledgeIncident(
    incidentId: string,
    responderId: string
  ): Promise<Incident> {
    const incident = this.incidents.get(incidentId)
    if (!incident) {
      throw new Error(`Incident ${incidentId} not found`)
    }

    incident.status = "acknowledged"
    incident.acknowledgedAt = Date.now()
    incident.assignee = responderId

    incident.timeline.push({
      type: "acknowledged",
      timestamp: Date.now(),
      message: `Acknowledged by ${responderId}`
    })

    return incident
  }

  async resolveIncident(
    incidentId: string,
    resolution: IncidentResolution
  ): Promise<Incident> {
    const incident = this.incidents.get(incidentId)
    if (!incident) {
      throw new Error(`Incident ${incidentId} not found`)
    }

    incident.status = "resolved"
    incident.resolvedAt = Date.now()
    incident.resolution = resolution

    incident.timeline.push({
      type: "resolved",
      timestamp: Date.now(),
      message: resolution.summary
    })

    // Calculate metrics
    incident.metrics = {
      timeToAcknowledge: incident.acknowledgedAt
        ? incident.acknowledgedAt - incident.createdAt
        : null,
      timeToResolve: incident.resolvedAt - incident.createdAt,
      escalationCount: incident.escalationLevel
    }

    return incident
  }

  async addTimelineEntry(
    incidentId: string,
    entry: TimelineEntry
  ): Promise<void> {
    const incident = this.incidents.get(incidentId)
    if (!incident) {
      throw new Error(`Incident ${incidentId} not found`)
    }

    incident.timeline.push({
      ...entry,
      timestamp: entry.timestamp || Date.now()
    })
  }

  private async getOnCallResponder(
    scheduleId: string
  ): Promise<Responder | null> {
    const schedule = this.onCallSchedules.get(scheduleId)
    if (!schedule) return null

    const now = Date.now()

    // Find current rotation
    for (const rotation of schedule.rotations) {
      if (this.isInRotation(rotation, now)) {
        return rotation.responder
      }
    }

    return schedule.fallback || null
  }

  async getIncidentStats(timeRange: TimeRange): Promise<IncidentStats> {
    const incidents = Array.from(this.incidents.values())
      .filter(i => i.createdAt >= timeRange.start && i.createdAt <= timeRange.end)

    const resolved = incidents.filter(i => i.status === "resolved")

    return {
      total: incidents.length,
      bySeverity: {
        critical: incidents.filter(i => i.severity === "critical").length,
        high: incidents.filter(i => i.severity === "high").length,
        medium: incidents.filter(i => i.severity === "medium").length,
        low: incidents.filter(i => i.severity === "low").length
      },
      byStatus: {
        open: incidents.filter(i => i.status === "open").length,
        acknowledged: incidents.filter(i => i.status === "acknowledged").length,
        resolved: resolved.length
      },
      avgTimeToAcknowledge: this.calculateAverage(
        resolved.map(i => i.metrics?.timeToAcknowledge).filter(Boolean) as number[]
      ),
      avgTimeToResolve: this.calculateAverage(
        resolved.map(i => i.metrics?.timeToResolve).filter(Boolean) as number[]
      )
    }
  }
}
```

## Best Practices

1. **Set appropriate thresholds** to reduce alert noise
2. **Use severity levels** consistently across all alerts
3. **Implement alert grouping** to prevent notification storms
4. **Define clear escalation policies** with timeouts
5. **Track incident metrics** for continuous improvement

## Related Skills

- [Metrics Collector Agent](./metrics-collector-agent.md) - Metric sources
- [Log Aggregator Agent](./log-aggregator-agent.md) - Log-based alerts
- [Failover Agent](./failover-agent.md) - Automatic response
