# Instant Messaging Agent Skill

> **⚠️ Prerequisites**: Complete [SDK Setup](./00-sdk-setup.md) first to configure your environment.

Build peer-to-peer messaging agents using Demos Network's encrypted messaging infrastructure for secure, decentralized communication.

## Overview

MessagingPeer enables direct encrypted communication between Demos identities - essential for agent coordination, private notifications, and decentralized chat applications.

## SDK Reference

```typescript
import { MessagingPeer } from "@kynesyslabs/demosdk/websdk"

const peer = new MessagingPeer()

// Connection & Discovery
await peer.connect()                          // Connect to messaging network
await peer.discoverPeers()                    // Find online peers
await peer.requestPublicKey(peerId)           // Get peer's encryption key

// Messaging
await peer.sendMessage(peerId, message)       // Send encrypted message
await peer.broadcastMessage(message)          // Broadcast to all connected
peer.onMessage(callback)                      // Handle incoming messages

// Encryption
await peer.encryptForPeer(peerId, data)       // Encrypt for specific peer
await peer.decryptFromPeer(peerId, data)      // Decrypt from peer
await peer.signMessage(message)               // Sign message
await peer.verifySignature(message, sig)      // Verify message signature

// Presence
await peer.setPresence(status)                // Set online/away/busy
await peer.getPresence(peerId)                // Check peer status
```

## Agent Use Cases

### 1. Agent-to-Agent Coordination

Enable autonomous agents to coordinate tasks:

```typescript
class AgentCoordinatorPeer {
  private peer: MessagingPeer
  private agentId: string
  private taskQueue: Map<string, Task>

  async initialize() {
    this.peer = new MessagingPeer()
    await this.peer.connect()

    // Listen for coordination messages
    this.peer.onMessage(async (message) => {
      await this.handleCoordinationMessage(message)
    })

    // Announce presence
    await this.peer.setPresence({
      status: "available",
      capabilities: ["price-oracle", "data-fetch", "computation"],
      loadFactor: 0.3
    })
  }

  async requestTaskExecution(
    targetAgent: string,
    task: TaskRequest
  ): Promise<TaskResponse> {
    // Get target's public key for encryption
    const targetKey = await this.peer.requestPublicKey(targetAgent)

    // Create task request
    const request = {
      type: "task_request",
      taskId: crypto.randomUUID(),
      from: this.agentId,
      task,
      timestamp: Date.now(),
      replyTo: this.agentId
    }

    // Sign request
    const signed = await this.peer.signMessage(JSON.stringify(request))

    // Send encrypted task request
    await this.peer.sendMessage(targetAgent, {
      ...request,
      signature: signed
    })

    // Wait for response
    return await this.waitForTaskResponse(request.taskId)
  }

  private async handleCoordinationMessage(message: any) {
    switch (message.type) {
      case "task_request":
        await this.handleTaskRequest(message)
        break

      case "task_response":
        await this.handleTaskResponse(message)
        break

      case "task_status":
        await this.handleTaskStatus(message)
        break

      case "capability_query":
        await this.respondWithCapabilities(message.from)
        break
    }
  }

  private async handleTaskRequest(request: any) {
    // Verify signature
    const isValid = await this.peer.verifySignature(
      JSON.stringify({ ...request, signature: undefined }),
      request.signature,
      request.from
    )

    if (!isValid) {
      return this.sendTaskResponse(request.from, request.taskId, {
        success: false,
        error: "Invalid signature"
      })
    }

    // Execute task
    try {
      const result = await this.executeTask(request.task)
      await this.sendTaskResponse(request.from, request.taskId, {
        success: true,
        result
      })
    } catch (error) {
      await this.sendTaskResponse(request.from, request.taskId, {
        success: false,
        error: error.message
      })
    }
  }
}
```

### 2. Private Notification Agent

Send encrypted notifications to users:

```typescript
class NotificationAgent {
  private peer: MessagingPeer
  private subscriptions: Map<string, NotificationPrefs>

  async sendNotification(
    recipient: string,
    notification: Notification
  ): Promise<DeliveryResult> {
    // Check if recipient is online
    const presence = await this.peer.getPresence(recipient)

    const message = {
      type: "notification",
      id: crypto.randomUUID(),
      notification,
      timestamp: Date.now(),
      priority: notification.priority || "normal"
    }

    if (presence.status === "online") {
      // Send immediately
      await this.peer.sendMessage(recipient, message)
      return { delivered: true, method: "direct" }
    } else {
      // Queue for later delivery
      await this.queueNotification(recipient, message)
      return { delivered: false, queued: true, method: "queued" }
    }
  }

  async broadcastAlert(
    alert: Alert,
    recipients: string[] | "all_subscribers"
  ): Promise<BroadcastResult> {
    const targets = recipients === "all_subscribers"
      ? Array.from(this.subscriptions.keys())
      : recipients

    // Filter by preferences
    const eligibleTargets = targets.filter(r => {
      const prefs = this.subscriptions.get(r)
      return prefs && this.matchesPreferences(alert, prefs)
    })

    const message = {
      type: "alert",
      id: crypto.randomUUID(),
      alert,
      timestamp: Date.now()
    }

    // Batch send
    const results = await Promise.allSettled(
      eligibleTargets.map(target =>
        this.peer.sendMessage(target, message)
      )
    )

    return {
      totalTargets: eligibleTargets.length,
      delivered: results.filter(r => r.status === "fulfilled").length,
      failed: results.filter(r => r.status === "rejected").length
    }
  }

  async setupSubscription(
    userId: string,
    preferences: NotificationPrefs
  ) {
    this.subscriptions.set(userId, preferences)

    // Send confirmation
    await this.peer.sendMessage(userId, {
      type: "subscription_confirmed",
      preferences,
      timestamp: Date.now()
    })
  }
}

// Usage
const notifier = new NotificationAgent()
await notifier.sendNotification("demos123...", {
  title: "Price Alert",
  body: "ETH crossed $4000",
  priority: "high",
  data: { asset: "ETH", price: 4001.52 }
})
```

### 3. Decentralized Chat Agent

Build end-to-end encrypted group chat:

```typescript
class ChatAgent {
  private peer: MessagingPeer
  private rooms: Map<string, ChatRoom>

  async createRoom(
    name: string,
    members: string[]
  ): Promise<ChatRoom> {
    const roomId = crypto.randomUUID()

    // Generate room key for group encryption
    const roomKey = await crypto.subtle.generateKey(
      { name: "AES-GCM", length: 256 },
      true,
      ["encrypt", "decrypt"]
    )

    const room: ChatRoom = {
      id: roomId,
      name,
      members: new Set(members),
      roomKey,
      messages: [],
      createdAt: Date.now()
    }

    this.rooms.set(roomId, room)

    // Distribute room key to members
    for (const member of members) {
      const memberKey = await this.peer.requestPublicKey(member)
      const encryptedRoomKey = await this.encryptRoomKey(roomKey, memberKey)

      await this.peer.sendMessage(member, {
        type: "room_invite",
        roomId,
        name,
        encryptedRoomKey,
        members
      })
    }

    return room
  }

  async sendRoomMessage(
    roomId: string,
    content: string
  ): Promise<MessageResult> {
    const room = this.rooms.get(roomId)
    if (!room) throw new Error("Room not found")

    const message = {
      id: crypto.randomUUID(),
      roomId,
      type: "room_message",
      content: await this.encryptWithRoomKey(content, room.roomKey),
      sender: this.peer.publicKey,
      timestamp: Date.now()
    }

    // Send to all room members
    const results = await Promise.allSettled(
      Array.from(room.members).map(member =>
        this.peer.sendMessage(member, message)
      )
    )

    room.messages.push(message)

    return {
      messageId: message.id,
      deliveredTo: results.filter(r => r.status === "fulfilled").length,
      totalMembers: room.members.size
    }
  }

  async handleIncomingMessage(rawMessage: any) {
    if (rawMessage.type === "room_message") {
      const room = this.rooms.get(rawMessage.roomId)
      if (!room) return

      // Decrypt message
      const decrypted = await this.decryptWithRoomKey(
        rawMessage.content,
        room.roomKey
      )

      // Emit to UI
      this.emit("message", {
        roomId: rawMessage.roomId,
        sender: rawMessage.sender,
        content: decrypted,
        timestamp: rawMessage.timestamp
      })
    }

    if (rawMessage.type === "room_invite") {
      await this.handleRoomInvite(rawMessage)
    }
  }

  async handleRoomInvite(invite: RoomInvite) {
    // Decrypt room key with our private key
    const roomKey = await this.decryptRoomKey(invite.encryptedRoomKey)

    // Join room
    const room: ChatRoom = {
      id: invite.roomId,
      name: invite.name,
      members: new Set(invite.members),
      roomKey,
      messages: [],
      joinedAt: Date.now()
    }

    this.rooms.set(invite.roomId, room)

    this.emit("room_joined", { room })
  }
}
```

### 4. Trading Signal Agent

Broadcast encrypted trading signals to subscribers:

```typescript
class SignalBroadcastAgent {
  private peer: MessagingPeer
  private subscribers: Map<string, SubscriberInfo>
  private channelKey: CryptoKey

  async broadcastSignal(signal: TradingSignal): Promise<BroadcastResult> {
    const message = {
      type: "trading_signal",
      id: crypto.randomUUID(),
      signal: {
        asset: signal.asset,
        action: signal.action, // buy, sell, hold
        confidence: signal.confidence,
        targetPrice: signal.targetPrice,
        stopLoss: signal.stopLoss,
        reasoning: signal.reasoning
      },
      timestamp: Date.now(),
      expiresAt: Date.now() + (signal.validityMinutes * 60 * 1000)
    }

    // Sign the signal
    const signature = await this.peer.signMessage(JSON.stringify(message))
    message.signature = signature

    // Encrypt for channel
    const encrypted = await this.encryptForChannel(message)

    // Broadcast to all subscribers
    const activeSubscribers = Array.from(this.subscribers.entries())
      .filter(([_, info]) => info.active && info.tier >= signal.minTier)

    const results = await Promise.allSettled(
      activeSubscribers.map(([peerId, _]) =>
        this.peer.sendMessage(peerId, { encrypted, channelId: this.channelId })
      )
    )

    return {
      signalId: message.id,
      broadcastedTo: activeSubscribers.length,
      delivered: results.filter(r => r.status === "fulfilled").length,
      signal: message.signal
    }
  }

  async receiveSignal(encrypted: any) {
    // Decrypt with channel key
    const message = await this.decryptFromChannel(encrypted)

    // Verify signature
    const signatureValid = await this.peer.verifySignature(
      JSON.stringify({ ...message, signature: undefined }),
      message.signature,
      this.channelOwner
    )

    if (!signatureValid) {
      console.warn("Invalid signal signature - ignoring")
      return null
    }

    // Check expiry
    if (Date.now() > message.expiresAt) {
      console.warn("Signal expired - ignoring")
      return null
    }

    return message.signal
  }
}
```

### 5. Support Chat Agent

AI-powered customer support with handoff:

```typescript
class SupportChatAgent {
  private peer: MessagingPeer
  private aiEngine: AIEngine
  private activeChats: Map<string, ChatSession>

  async handleIncomingSupportRequest(
    userId: string,
    initialMessage: string
  ): Promise<void> {
    // Create session
    const session: ChatSession = {
      id: crypto.randomUUID(),
      userId,
      mode: "ai", // Start with AI
      messages: [{
        role: "user",
        content: initialMessage,
        timestamp: Date.now()
      }],
      context: await this.loadUserContext(userId)
    }

    this.activeChats.set(session.id, session)

    // AI response
    const aiResponse = await this.aiEngine.respond(
      initialMessage,
      session.context
    )

    await this.sendSupportMessage(userId, session.id, {
      role: "assistant",
      content: aiResponse.message,
      confidence: aiResponse.confidence
    })

    // Check if handoff needed
    if (aiResponse.confidence < 0.6 || aiResponse.suggestsHandoff) {
      await this.initiateHumanHandoff(session)
    }
  }

  private async sendSupportMessage(
    userId: string,
    sessionId: string,
    message: SupportMessage
  ) {
    const session = this.activeChats.get(sessionId)
    if (!session) return

    session.messages.push(message)

    await this.peer.sendMessage(userId, {
      type: "support_message",
      sessionId,
      message,
      timestamp: Date.now()
    })
  }

  private async initiateHumanHandoff(session: ChatSession) {
    // Notify user
    await this.peer.sendMessage(session.userId, {
      type: "handoff_notice",
      sessionId: session.id,
      message: "Connecting you with a human support agent..."
    })

    // Find available human agent
    const availableAgents = await this.findAvailableHumanAgents()

    if (availableAgents.length === 0) {
      await this.peer.sendMessage(session.userId, {
        type: "queue_notice",
        sessionId: session.id,
        message: "All agents are busy. You're #3 in queue.",
        estimatedWait: 5 // minutes
      })
      return
    }

    // Connect to human agent
    const humanAgent = availableAgents[0]
    session.mode = "human"
    session.assignedAgent = humanAgent.id

    // Send context to human agent
    await this.peer.sendMessage(humanAgent.id, {
      type: "session_handoff",
      session: {
        id: session.id,
        userId: session.userId,
        history: session.messages,
        context: session.context,
        aiAnalysis: await this.aiEngine.summarize(session.messages)
      }
    })
  }
}
```

### 6. Peer Discovery Agent

Discover and connect with specialized peers:

```typescript
class PeerDiscoveryAgent {
  private peer: MessagingPeer
  private knownPeers: Map<string, PeerProfile>

  async discoverSpecializedPeers(
    capability: string
  ): Promise<PeerProfile[]> {
    // Broadcast discovery request
    const discoveryId = crypto.randomUUID()

    await this.peer.broadcastMessage({
      type: "capability_discovery",
      discoveryId,
      requestedCapability: capability,
      requester: this.peer.publicKey,
      timestamp: Date.now()
    })

    // Wait for responses
    const responses = await this.collectResponses(discoveryId, 5000)

    // Rank peers by reputation and capability match
    const rankedPeers = responses
      .map(r => ({
        peerId: r.peerId,
        capabilities: r.capabilities,
        reputation: r.reputation,
        matchScore: this.calculateMatchScore(capability, r.capabilities)
      }))
      .sort((a, b) => b.matchScore - a.matchScore)

    return rankedPeers
  }

  async announceCapabilities(capabilities: string[]) {
    // Update presence with capabilities
    await this.peer.setPresence({
      status: "available",
      capabilities,
      lastUpdated: Date.now()
    })

    // Respond to discovery requests
    this.peer.onMessage(async (message) => {
      if (message.type === "capability_discovery") {
        const match = capabilities.some(c =>
          c.toLowerCase().includes(message.requestedCapability.toLowerCase())
        )

        if (match) {
          await this.peer.sendMessage(message.requester, {
            type: "capability_response",
            discoveryId: message.discoveryId,
            peerId: this.peer.publicKey,
            capabilities,
            reputation: await this.getMyReputation()
          })
        }
      }
    })
  }

  async buildPeerNetwork(targetSize: number = 10): Promise<PeerNetwork> {
    // Discover diverse peers
    const categories = [
      "price-oracle",
      "data-provider",
      "computation",
      "storage",
      "verification"
    ]

    const network: PeerNetwork = {
      peers: new Map(),
      connections: []
    }

    for (const category of categories) {
      const peers = await this.discoverSpecializedPeers(category)
      const topPeers = peers.slice(0, Math.ceil(targetSize / categories.length))

      for (const peer of topPeers) {
        // Request public key and establish connection
        const publicKey = await this.peer.requestPublicKey(peer.peerId)

        network.peers.set(peer.peerId, {
          ...peer,
          publicKey,
          connectedAt: Date.now()
        })

        network.connections.push({
          from: this.peer.publicKey,
          to: peer.peerId,
          category
        })
      }
    }

    return network
  }
}
```

## Message Types

| Type | Purpose |
|------|---------|
| Direct | Point-to-point encrypted |
| Broadcast | All connected peers |
| Room | Group encrypted |
| Channel | Subscription-based broadcast |

## Security Features

```typescript
// End-to-end encryption
const encrypted = await peer.encryptForPeer(targetId, sensitiveData)

// Message signing
const signed = await peer.signMessage(message)
const valid = await peer.verifySignature(message, signature, senderId)

// Forward secrecy
await peer.rotateSessionKey(peerId) // Generate new ephemeral keys
```

## Best Practices

1. **Always verify signatures** on critical messages
2. **Check presence** before sending time-sensitive messages
3. **Implement retry logic** for unreliable network conditions
4. **Rotate keys** periodically for forward secrecy
5. **Queue messages** for offline recipients

## Integration with DemosWork

```typescript
const messagingWorkflow = new DemosWork()

// Step 1: Discover peers
messagingWorkflow.push(new BaseOperation(
  new NativeWorkStep({
    method: "messaging.discoverPeers",
    params: { capability: "price-oracle" }
  })
))

// Step 2: Request data from best peer
messagingWorkflow.push(new BaseOperation(
  new NativeWorkStep({
    method: "messaging.sendMessage",
    params: {
      peerId: "{{step1.result[0].peerId}}",
      message: { type: "data_request", asset: "ETH" }
    }
  })
))

// Step 3: Wait for response
messagingWorkflow.push(new BaseOperation(
  new NativeWorkStep({
    method: "messaging.waitForResponse",
    params: { timeout: 30000 }
  })
))
```

## Related Skills

- [Identity Resolution](./identity-resolution-agent.md) - Verify peer identities
- [FHE Privacy Agent](./fhe-privacy-agent.md) - Encrypted computation on messages
- [Web2 Integration](./web2-integration-agent.md) - Bridge to external messaging
