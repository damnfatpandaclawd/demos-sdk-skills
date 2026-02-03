# Agent Communication Agent Skill

> **⚠️ Prerequisites**: Complete [SDK Setup](./00-sdk-setup.md) first to configure your environment.

Build agents that manage secure, reliable inter-agent messaging.

## Overview

Agent Communication Agent enables encrypted messaging, protocol negotiation, and reliable message delivery between agents. Essential for multi-agent coordination, task delegation, and distributed workflows.

## SDK Reference

```typescript
import { Demos } from "@kynesyslabs/demosdk/websdk"
import { Messaging } from "@kynesyslabs/demosdk/messaging"

// Secure messaging channel
const messaging = await demos.messaging.create()
```

## Agent Use Cases

### 1. Secure Message Router

Route messages with encryption and verification:

```typescript
class SecureMessageRouter {
  private messaging: Messaging
  private keyPairs: Map<string, CryptoKeyPair> = new Map()
  private sessionKeys: Map<string, CryptoKey> = new Map()
  private messageQueue: Map<string, QueuedMessage[]> = new Map()

  async establishSecureChannel(
    targetAgent: string
  ): Promise<SecureChannel> {
    // Generate ephemeral key pair for this session
    const keyPair = await crypto.subtle.generateKey(
      { name: "ECDH", namedCurve: "P-256" },
      true,
      ["deriveKey"]
    )

    this.keyPairs.set(targetAgent, keyPair)

    // Export public key
    const publicKey = await crypto.subtle.exportKey(
      "spki",
      keyPair.publicKey
    )

    // Send handshake
    const response = await this.messaging.sendRequest(
      targetAgent,
      {
        type: "channel_handshake",
        publicKey: this.arrayBufferToBase64(publicKey),
        timestamp: Date.now(),
        nonce: this.generateNonce()
      }
    )

    // Import target's public key
    const targetPublicKey = await crypto.subtle.importKey(
      "spki",
      this.base64ToArrayBuffer(response.publicKey),
      { name: "ECDH", namedCurve: "P-256" },
      false,
      []
    )

    // Derive shared secret
    const sharedSecret = await crypto.subtle.deriveKey(
      { name: "ECDH", public: targetPublicKey },
      keyPair.privateKey,
      { name: "AES-GCM", length: 256 },
      false,
      ["encrypt", "decrypt"]
    )

    this.sessionKeys.set(targetAgent, sharedSecret)

    return {
      targetAgent,
      established: Date.now(),
      sessionId: response.sessionId
    }
  }

  async sendSecureMessage(
    targetAgent: string,
    message: any
  ): Promise<MessageResult> {
    const sessionKey = this.sessionKeys.get(targetAgent)

    if (!sessionKey) {
      // Establish channel first
      await this.establishSecureChannel(targetAgent)
    }

    const key = this.sessionKeys.get(targetAgent)!

    // Encrypt message
    const iv = crypto.getRandomValues(new Uint8Array(12))
    const plaintext = new TextEncoder().encode(JSON.stringify(message))

    const ciphertext = await crypto.subtle.encrypt(
      { name: "AES-GCM", iv },
      key,
      plaintext
    )

    // Create message envelope
    const envelope: SecureEnvelope = {
      type: "secure_message",
      iv: this.arrayBufferToBase64(iv),
      ciphertext: this.arrayBufferToBase64(ciphertext),
      timestamp: Date.now(),
      messageId: this.generateMessageId()
    }

    // Send with retry logic
    return await this.sendWithRetry(targetAgent, envelope)
  }

  private async sendWithRetry(
    target: string,
    envelope: SecureEnvelope,
    maxRetries: number = 3
  ): Promise<MessageResult> {
    let lastError: Error | null = null

    for (let attempt = 0; attempt < maxRetries; attempt++) {
      try {
        const response = await this.messaging.sendRequest(
          target,
          envelope,
          { timeout: 10000 }
        )

        if (response.acknowledged) {
          return {
            success: true,
            messageId: envelope.messageId,
            deliveredAt: Date.now()
          }
        }
      } catch (error) {
        lastError = error as Error

        // Exponential backoff
        await new Promise(r =>
          setTimeout(r, Math.pow(2, attempt) * 1000)
        )
      }
    }

    // Queue for later delivery
    this.queueMessage(target, envelope)

    return {
      success: false,
      messageId: envelope.messageId,
      queued: true,
      error: lastError?.message
    }
  }

  async decryptMessage(
    sender: string,
    envelope: SecureEnvelope
  ): Promise<any> {
    const sessionKey = this.sessionKeys.get(sender)

    if (!sessionKey) {
      throw new Error("No session key for sender")
    }

    const iv = this.base64ToArrayBuffer(envelope.iv)
    const ciphertext = this.base64ToArrayBuffer(envelope.ciphertext)

    const plaintext = await crypto.subtle.decrypt(
      { name: "AES-GCM", iv },
      sessionKey,
      ciphertext
    )

    return JSON.parse(new TextDecoder().decode(plaintext))
  }
}
```

### 2. Protocol Negotiator

Negotiate communication protocols between agents:

```typescript
class ProtocolNegotiator {
  private supportedProtocols: ProtocolSpec[] = []
  private activeProtocols: Map<string, NegotiatedProtocol> = new Map()

  registerProtocol(spec: ProtocolSpec): void {
    this.supportedProtocols.push(spec)
    this.supportedProtocols.sort((a, b) => b.priority - a.priority)
  }

  async negotiateProtocol(
    targetAgent: string
  ): Promise<NegotiatedProtocol> {
    // Send capabilities
    const offer: ProtocolOffer = {
      type: "protocol_negotiation",
      protocols: this.supportedProtocols.map(p => ({
        name: p.name,
        version: p.version,
        features: p.features
      })),
      timestamp: Date.now()
    }

    const response = await this.messaging.sendRequest(
      targetAgent,
      offer
    )

    // Find best matching protocol
    const match = this.findBestMatch(
      this.supportedProtocols,
      response.protocols
    )

    if (!match) {
      throw new Error("No compatible protocol found")
    }

    // Confirm selection
    await this.messaging.send(targetAgent, {
      type: "protocol_confirmation",
      selected: match.name,
      version: match.version
    })

    const negotiated: NegotiatedProtocol = {
      protocol: match,
      targetAgent,
      establishedAt: Date.now(),
      features: this.intersectFeatures(match, response.protocols)
    }

    this.activeProtocols.set(targetAgent, negotiated)

    return negotiated
  }

  private findBestMatch(
    local: ProtocolSpec[],
    remote: ProtocolInfo[]
  ): ProtocolSpec | null {
    for (const spec of local) {
      const remoteMatch = remote.find(r =>
        r.name === spec.name &&
        this.isVersionCompatible(spec.version, r.version)
      )

      if (remoteMatch) {
        return spec
      }
    }

    return null
  }

  private isVersionCompatible(
    local: string,
    remote: string
  ): boolean {
    const [localMajor] = local.split(".").map(Number)
    const [remoteMajor] = remote.split(".").map(Number)

    return localMajor === remoteMajor
  }

  async handleMessage(
    sender: string,
    message: any
  ): Promise<any> {
    const protocol = this.activeProtocols.get(sender)

    if (!protocol) {
      // Auto-negotiate
      await this.negotiateProtocol(sender)
    }

    const activeProtocol = this.activeProtocols.get(sender)!

    // Validate message against protocol schema
    if (!this.validateMessage(message, activeProtocol.protocol)) {
      throw new Error("Message does not match protocol schema")
    }

    // Process according to protocol
    return await activeProtocol.protocol.handler(message)
  }
}
```

### 3. Message Broker

Pub/sub and topic-based messaging:

```typescript
class AgentMessageBroker {
  private subscriptions: Map<string, Set<string>> = new Map()
  private topicHistory: Map<string, Message[]> = new Map()
  private messageFilters: Map<string, MessageFilter[]> = new Map()

  async subscribe(
    agentId: string,
    topic: string,
    options?: SubscribeOptions
  ): Promise<Subscription> {
    if (!this.subscriptions.has(topic)) {
      this.subscriptions.set(topic, new Set())
    }

    this.subscriptions.get(topic)!.add(agentId)

    // Apply filters if provided
    if (options?.filter) {
      if (!this.messageFilters.has(`${agentId}:${topic}`)) {
        this.messageFilters.set(`${agentId}:${topic}`, [])
      }
      this.messageFilters.get(`${agentId}:${topic}`)!.push(options.filter)
    }

    // Send history if requested
    if (options?.fromBeginning) {
      const history = this.topicHistory.get(topic) || []
      for (const message of history) {
        await this.deliverToSubscriber(agentId, topic, message)
      }
    }

    return {
      topic,
      agentId,
      subscribedAt: Date.now(),
      id: `sub_${Date.now()}_${Math.random().toString(36)}`
    }
  }

  async unsubscribe(agentId: string, topic: string): Promise<boolean> {
    const subscribers = this.subscriptions.get(topic)
    if (subscribers) {
      subscribers.delete(agentId)
      this.messageFilters.delete(`${agentId}:${topic}`)
      return true
    }
    return false
  }

  async publish(
    topic: string,
    message: any,
    options?: PublishOptions
  ): Promise<PublishResult> {
    const envelope: Message = {
      id: this.generateMessageId(),
      topic,
      payload: message,
      timestamp: Date.now(),
      publisher: options?.publisherId || "system",
      ttl: options?.ttl || 3600000 // 1 hour default
    }

    // Store in history
    if (options?.persist !== false) {
      if (!this.topicHistory.has(topic)) {
        this.topicHistory.set(topic, [])
      }
      this.topicHistory.get(topic)!.push(envelope)

      // Cleanup old messages
      this.cleanupHistory(topic)
    }

    // Deliver to subscribers
    const subscribers = this.subscriptions.get(topic) || new Set()
    const deliveryResults: DeliveryResult[] = []

    for (const agentId of subscribers) {
      const result = await this.deliverToSubscriber(
        agentId,
        topic,
        envelope
      )
      deliveryResults.push(result)
    }

    return {
      messageId: envelope.id,
      topic,
      subscriberCount: subscribers.size,
      deliveredCount: deliveryResults.filter(r => r.success).length,
      deliveryResults
    }
  }

  private async deliverToSubscriber(
    agentId: string,
    topic: string,
    message: Message
  ): Promise<DeliveryResult> {
    // Apply filters
    const filters = this.messageFilters.get(`${agentId}:${topic}`) || []
    for (const filter of filters) {
      if (!filter(message)) {
        return {
          agentId,
          success: false,
          reason: "filtered"
        }
      }
    }

    try {
      await this.messaging.send(agentId, {
        type: "topic_message",
        topic,
        message
      })

      return {
        agentId,
        success: true,
        deliveredAt: Date.now()
      }
    } catch (error) {
      return {
        agentId,
        success: false,
        reason: (error as Error).message
      }
    }
  }

  async request(
    topic: string,
    request: any,
    timeout: number = 30000
  ): Promise<any[]> {
    const requestId = this.generateRequestId()
    const responses: any[] = []

    // Publish request
    await this.publish(topic, {
      type: "request",
      requestId,
      payload: request
    })

    // Collect responses with timeout
    return new Promise((resolve) => {
      const responseTopic = `${topic}/response/${requestId}`

      const subscription = this.subscribe(
        "broker",
        responseTopic,
        {
          filter: (msg) => msg.payload.requestId === requestId
        }
      )

      const timer = setTimeout(() => {
        this.unsubscribe("broker", responseTopic)
        resolve(responses)
      }, timeout)

      // This would be replaced with actual message handling
      // For illustration, we show the pattern
    })
  }

  private cleanupHistory(topic: string): void {
    const history = this.topicHistory.get(topic)
    if (!history) return

    const now = Date.now()
    const filtered = history.filter(msg =>
      now - msg.timestamp < msg.ttl
    )

    // Keep max 1000 messages per topic
    if (filtered.length > 1000) {
      filtered.splice(0, filtered.length - 1000)
    }

    this.topicHistory.set(topic, filtered)
  }
}
```

## Best Practices

1. **Always encrypt** sensitive inter-agent communication
2. **Implement retry logic** with exponential backoff
3. **Negotiate protocols** before complex interactions
4. **Use pub/sub** for one-to-many communication
5. **Set message TTLs** to prevent stale data

## Related Skills

- [Agent Discovery Agent](./agent-discovery-agent.md) - Finding agents
- [Consensus Agent](./consensus-agent.md) - Agreement protocols
- [Task Delegation Agent](./task-delegation-agent.md) - Task routing
