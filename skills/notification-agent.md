# Notification Agent Skill

Build agents that deliver notifications across multiple channels.

## Overview

Notification Agent enables delivery of alerts and updates via webhooks, email, and on-chain messaging. Essential for monitoring systems, user engagement, and automated alerting.

## SDK Reference

```typescript
import { Demos } from "@kynesyslabs/demosdk/websdk"

// Web2 Proxy for external notifications
const dahr = await demos.web2.createDahr()
await dahr.startProxy({ url, method: "POST", body })
```

## Agent Use Cases

### 1. Multi-Channel Notification Agent

Send notifications across channels:

```typescript
class NotificationAgent {
  private demos: Demos
  private channels: Map<string, NotificationChannel> = new Map()

  async registerWebhook(
    name: string,
    url: string,
    events: string[]
  ): Promise<void> {
    this.channels.set(name, {
      type: "webhook",
      url,
      events
    })
  }

  async notify(
    event: string,
    data: NotificationData
  ): Promise<NotificationResult[]> {
    const results: NotificationResult[] = []

    for (const [name, channel] of this.channels) {
      if (!channel.events.includes(event) && !channel.events.includes("*")) {
        continue
      }

      try {
        switch (channel.type) {
          case "webhook":
            await this.sendWebhook(channel.url, { event, data })
            break
          case "email":
            await this.sendEmail(channel.config, { event, data })
            break
          case "onchain":
            await this.sendOnChain(channel.address, { event, data })
            break
        }

        results.push({ channel: name, success: true })
      } catch (error) {
        results.push({ channel: name, success: false, error: error.message })
      }
    }

    return results
  }

  private async sendWebhook(url: string, payload: any): Promise<void> {
    const dahr = await this.demos.web2.createDahr()
    await dahr.startProxy({
      url,
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    })
  }

  async subscribeToEvents(
    address: string,
    events: string[],
    callback: (notification: any) => void
  ): Promise<void> {
    await this.demos.subscribeToAddress(address, (event) => {
      if (events.includes(event.type) || events.includes("*")) {
        callback({
          address,
          event,
          timestamp: Date.now()
        })
      }
    })
  }
}
```

### 2. Alert Aggregator Agent

Aggregate and deduplicate alerts:

```typescript
class AlertAggregatorAgent {
  private alerts: Map<string, AggregatedAlert> = new Map()
  private aggregationWindow: number = 60000 // 1 minute

  async addAlert(alert: Alert): Promise<void> {
    const key = `${alert.type}:${alert.source}`
    const existing = this.alerts.get(key)

    if (existing && Date.now() - existing.firstSeen < this.aggregationWindow) {
      existing.count++
      existing.lastSeen = Date.now()
    } else {
      this.alerts.set(key, {
        ...alert,
        count: 1,
        firstSeen: Date.now(),
        lastSeen: Date.now()
      })
    }
  }

  async flushAlerts(): Promise<AggregatedAlert[]> {
    const alerts = Array.from(this.alerts.values())
    this.alerts.clear()
    return alerts
  }
}
```

## Best Practices

1. **Implement retries** for failed notifications
2. **Aggregate similar alerts** to reduce noise
3. **Support multiple channels** for redundancy
4. **Include timestamps** in all notifications
5. **Rate limit notifications** to prevent spam

## Related Skills

- [Address Monitoring](./address-monitoring-agent.md) - Event sources
- [DAHR Web2 Proxy](./dahr-web2-proxy-agent.md) - External delivery
