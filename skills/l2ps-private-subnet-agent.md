# L2PS Private Subnet Agent

> **⚠️ Prerequisites**: Complete [SDK Setup](./00-sdk-setup.md) first to configure your environment.

Build agents that process transactions in encrypted private subnets using Demos Network's Layer 2 Private Subnets (L2PS).

## SDK Reference

```typescript
import { L2PS, L2PSConfig, L2PSEncryptedPayload } from "@kynesyslabs/demosdk/l2ps"
import { Demos } from "@kynesyslabs/demosdk/websdk"
```

## Core Concepts

### What is L2PS?
L2PS (Layer 2 Private Subnets) provides AES-GCM encrypted transaction processing while maintaining compatibility with standard Demos transactions. Each subnet is an isolated encryption domain with its own key material.

### Key Features
- **AES-GCM Encryption**: Authenticated encryption for confidentiality and integrity
- **Multi-Singleton Pattern**: Manage multiple L2PS networks simultaneously
- **Standard Compatibility**: Encrypted transactions work with standard tx pipeline
- **SHA-256 Identification**: Unique instance IDs based on key fingerprints

### Key Methods

| Method | Description |
|--------|-------------|
| `L2PS.create()` | Create new L2PS instance with optional key |
| `encryptTx()` | Encrypt a transaction for the subnet |
| `decryptTx()` | Decrypt an L2PS transaction |
| `L2PS.getInstance()` | Get existing L2PS by ID |
| `setConfig()` | Configure subnet metadata |

---

## Use Case 1: Private Transaction Agent

Create an agent that processes transactions in an encrypted subnet.

```typescript
import { L2PS } from "@kynesyslabs/demosdk/l2ps"
import { Demos } from "@kynesyslabs/demosdk/websdk"
import { Transaction } from "@kynesyslabs/demosdk/types"

class PrivateTransactionAgent {
  private l2ps: L2PS | null = null
  private demos: Demos
  private subnetId: string = ""

  constructor(demos: Demos) {
    this.demos = demos
  }

  /**
   * Initialize or join a private subnet
   */
  async initializeSubnet(
    privateKey?: string,
    iv?: string
  ): Promise<string> {
    // Create L2PS instance
    if (privateKey && iv) {
      // Join existing subnet with known keys
      this.l2ps = await L2PS.create(privateKey, iv)
      console.log("🔗 Joined existing subnet")
    } else {
      // Create new subnet with random keys
      this.l2ps = await L2PS.create()
      console.log("🆕 Created new subnet")
    }

    this.subnetId = this.l2ps.getId()
    console.log(`📍 Subnet ID: ${this.subnetId}`)

    // Get key fingerprint for sharing
    const fingerprint = await this.l2ps.getKeyFingerprint()
    console.log(`🔑 Key fingerprint: ${fingerprint}`)

    return this.subnetId
  }

  /**
   * Send encrypted transaction in the subnet
   */
  async sendPrivateTransaction(
    recipient: string,
    amount: bigint,
    senderIdentity: string
  ): Promise<{ txHash: string; encrypted: boolean }> {
    if (!this.l2ps) {
      throw new Error("Subnet not initialized")
    }

    // Create regular transaction
    const originalTx: Transaction = {
      type: "native",
      from: senderIdentity,
      to: recipient,
      amount: amount.toString(),
      timestamp: Date.now(),
      nonce: await this.demos.getNonce(senderIdentity)
    }

    // Encrypt the transaction
    const encryptedTx = await this.l2ps.encryptTx(originalTx, senderIdentity)

    console.log(`🔒 Transaction encrypted for subnet ${this.subnetId.slice(0, 16)}...`)

    // Broadcast encrypted transaction
    const response = await this.demos.broadcast(encryptedTx)

    return {
      txHash: response.hash,
      encrypted: true
    }
  }

  /**
   * Receive and decrypt transaction
   */
  async receivePrivateTransaction(
    encryptedTx: Transaction
  ): Promise<Transaction> {
    if (!this.l2ps) {
      throw new Error("Subnet not initialized")
    }

    // Verify transaction is for this subnet
    if (encryptedTx.type !== "l2psEncryptedTx") {
      throw new Error("Not an L2PS encrypted transaction")
    }

    // Decrypt the transaction
    const decryptedTx = await this.l2ps.decryptTx(encryptedTx)

    console.log(`🔓 Transaction decrypted successfully`)
    console.log(`   From: ${decryptedTx.from}`)
    console.log(`   To: ${decryptedTx.to}`)
    console.log(`   Amount: ${decryptedTx.amount}`)

    return decryptedTx
  }

  /**
   * Get subnet configuration
   */
  getSubnetInfo(): {
    id: string
    config: any
    isActive: boolean
  } {
    return {
      id: this.subnetId,
      config: this.l2ps?.getConfig(),
      isActive: !!this.l2ps
    }
  }
}

// Usage
const demos = new Demos()
await demos.connect("https://demosnode.discus.sh/")

const agent = new PrivateTransactionAgent(demos)

// Create new private subnet
const subnetId = await agent.initializeSubnet()

// Send encrypted transaction
const result = await agent.sendPrivateTransaction(
  "demos1recipient...",
  BigInt("1000000000"),  // 1 DEM
  "demos1sender..."
)

console.log(`Private tx sent: ${result.txHash}`)
```

---

## Use Case 2: Multi-Subnet Coordinator

Manage multiple private subnets for different purposes.

```typescript
import { L2PS, L2PSConfig } from "@kynesyslabs/demosdk/l2ps"
import { Demos } from "@kynesyslabs/demosdk/websdk"

interface SubnetInfo {
  id: string
  name: string
  purpose: string
  members: string[]
  createdAt: number
}

class MultiSubnetCoordinator {
  private demos: Demos
  private subnets: Map<string, SubnetInfo> = new Map()

  constructor(demos: Demos) {
    this.demos = demos
  }

  /**
   * Create a named subnet for a specific purpose
   */
  async createSubnet(
    name: string,
    purpose: string,
    members: string[]
  ): Promise<SubnetInfo> {
    // Create new L2PS instance
    const l2ps = await L2PS.create()
    const subnetId = l2ps.getId()

    // Configure the subnet
    const config: L2PSConfig = {
      uid: subnetId,
      name: name,
      description: purpose,
      createdAt: Date.now(),
      members: members
    }

    l2ps.setConfig(config)

    // Track subnet
    const info: SubnetInfo = {
      id: subnetId,
      name,
      purpose,
      members,
      createdAt: Date.now()
    }

    this.subnets.set(subnetId, info)

    console.log(`✅ Subnet "${name}" created: ${subnetId.slice(0, 16)}...`)

    return info
  }

  /**
   * Route transaction to appropriate subnet
   */
  async routeTransaction(
    tx: any,
    purpose: string
  ): Promise<{ subnetId: string; encryptedTx: any }> {
    // Find subnet matching purpose
    let targetSubnet: string | null = null

    for (const [id, info] of this.subnets) {
      if (info.purpose === purpose) {
        targetSubnet = id
        break
      }
    }

    if (!targetSubnet) {
      throw new Error(`No subnet found for purpose: ${purpose}`)
    }

    // Get L2PS instance
    const l2ps = L2PS.getInstance(targetSubnet)
    if (!l2ps) {
      throw new Error(`Subnet ${targetSubnet} not found`)
    }

    // Encrypt transaction
    const encryptedTx = await l2ps.encryptTx(tx)

    return {
      subnetId: targetSubnet,
      encryptedTx
    }
  }

  /**
   * Broadcast to all subnets (for coordination messages)
   */
  async broadcastToAll(
    message: any,
    senderIdentity: string
  ): Promise<Map<string, string>> {
    const results = new Map<string, string>()
    const instances = L2PS.getInstances()

    for (const l2ps of instances) {
      try {
        const tx = {
          type: "coordination",
          message,
          timestamp: Date.now(),
          from: senderIdentity
        }

        const encryptedTx = await l2ps.encryptTx(tx, senderIdentity)
        const response = await this.demos.broadcast(encryptedTx)

        results.set(l2ps.getId(), response.hash)

      } catch (error) {
        console.error(`Failed to broadcast to ${l2ps.getId()}:`, error)
      }
    }

    return results
  }

  /**
   * List all active subnets
   */
  listSubnets(): SubnetInfo[] {
    return Array.from(this.subnets.values())
  }

  /**
   * Check if subnet exists
   */
  hasSubnet(id: string): boolean {
    return L2PS.hasInstance(id)
  }

  /**
   * Remove a subnet
   */
  removeSubnet(id: string): boolean {
    const removed = L2PS.removeInstance(id)
    if (removed) {
      this.subnets.delete(id)
      console.log(`🗑️ Subnet ${id.slice(0, 16)}... removed`)
    }
    return removed
  }
}

// Usage
const coordinator = new MultiSubnetCoordinator(demos)

// Create specialized subnets
const tradingSubnet = await coordinator.createSubnet(
  "Trading",
  "private-trading",
  ["demos1trader1...", "demos1trader2..."]
)

const payrollSubnet = await coordinator.createSubnet(
  "Payroll",
  "payroll-processing",
  ["demos1hr...", "demos1finance..."]
)

const r_dSubnet = await coordinator.createSubnet(
  "R&D",
  "research-data",
  ["demos1researcher1...", "demos1researcher2..."]
)

// Route transactions to appropriate subnets
const tradeTx = { type: "trade", ... }
const { subnetId, encryptedTx } = await coordinator.routeTransaction(
  tradeTx,
  "private-trading"
)

console.log(`Trade routed to subnet: ${subnetId}`)
```

---

## Use Case 3: Confidential Compute Agent

Process sensitive computations in private subnets.

```typescript
import { L2PS } from "@kynesyslabs/demosdk/l2ps"
import { Demos } from "@kynesyslabs/demosdk/websdk"

interface ComputeJob {
  id: string
  type: string
  input: any
  result?: any
  status: "pending" | "processing" | "completed" | "failed"
}

class ConfidentialComputeAgent {
  private l2ps: L2PS | null = null
  private demos: Demos
  private jobs: Map<string, ComputeJob> = new Map()

  constructor(demos: Demos) {
    this.demos = demos
  }

  /**
   * Initialize confidential compute subnet
   */
  async initialize(sharedKey?: string): Promise<void> {
    this.l2ps = await L2PS.create(sharedKey)
    console.log(`🔐 Confidential compute subnet ready: ${this.l2ps.getId().slice(0, 16)}...`)
  }

  /**
   * Submit confidential compute job
   */
  async submitJob(
    type: string,
    input: any,
    senderIdentity: string
  ): Promise<string> {
    if (!this.l2ps) throw new Error("Not initialized")

    const jobId = crypto.randomUUID()

    const job: ComputeJob = {
      id: jobId,
      type,
      input,
      status: "pending"
    }

    // Create job transaction
    const jobTx = {
      type: "l2ps_compute",
      jobId,
      computeType: type,
      encryptedInput: JSON.stringify(input),
      timestamp: Date.now(),
      from: senderIdentity
    }

    // Encrypt and submit
    const encryptedTx = await this.l2ps.encryptTx(jobTx as any, senderIdentity)
    const response = await this.demos.broadcast(encryptedTx)

    this.jobs.set(jobId, job)

    console.log(`📤 Job submitted: ${jobId}`)
    console.log(`   Tx: ${response.hash}`)

    return jobId
  }

  /**
   * Process incoming compute job (as a node)
   */
  async processJob(
    encryptedTx: any
  ): Promise<void> {
    if (!this.l2ps) throw new Error("Not initialized")

    // Decrypt job
    const decryptedTx = await this.l2ps.decryptTx(encryptedTx)
    const jobData = decryptedTx as any

    console.log(`📥 Processing job: ${jobData.jobId}`)

    // Process based on job type
    let result: any

    switch (jobData.computeType) {
      case "sum":
        result = this.computeSum(JSON.parse(jobData.encryptedInput))
        break

      case "average":
        result = this.computeAverage(JSON.parse(jobData.encryptedInput))
        break

      case "statistics":
        result = this.computeStatistics(JSON.parse(jobData.encryptedInput))
        break

      case "hash":
        result = await this.computeHash(JSON.parse(jobData.encryptedInput))
        break

      default:
        throw new Error(`Unknown compute type: ${jobData.computeType}`)
    }

    // Send encrypted result back
    const resultTx = {
      type: "l2ps_compute_result",
      jobId: jobData.jobId,
      result: JSON.stringify(result),
      timestamp: Date.now()
    }

    const encryptedResult = await this.l2ps.encryptTx(resultTx as any)
    await this.demos.broadcast(encryptedResult)

    console.log(`✅ Job ${jobData.jobId} completed`)
  }

  // Compute functions
  private computeSum(data: number[]): number {
    return data.reduce((a, b) => a + b, 0)
  }

  private computeAverage(data: number[]): number {
    return this.computeSum(data) / data.length
  }

  private computeStatistics(data: number[]): {
    min: number
    max: number
    mean: number
    count: number
  } {
    return {
      min: Math.min(...data),
      max: Math.max(...data),
      mean: this.computeAverage(data),
      count: data.length
    }
  }

  private async computeHash(data: string): Promise<string> {
    const encoder = new TextEncoder()
    const dataBuffer = encoder.encode(data)
    const hashBuffer = await crypto.subtle.digest("SHA-256", dataBuffer)
    return Array.from(new Uint8Array(hashBuffer))
      .map(b => b.toString(16).padStart(2, "0"))
      .join("")
  }

  /**
   * Get job status
   */
  getJobStatus(jobId: string): ComputeJob | undefined {
    return this.jobs.get(jobId)
  }
}

// Usage
const computeAgent = new ConfidentialComputeAgent(demos)
await computeAgent.initialize()

// Submit confidential computation job
const jobId = await computeAgent.submitJob(
  "statistics",
  [100, 250, 300, 175, 420, 195, 280],  // Sensitive salary data
  "demos1sender..."
)

// Check job status
const status = computeAgent.getJobStatus(jobId)
console.log(`Job status: ${status?.status}`)
```

---

## Use Case 4: Private Messaging Relay

Use L2PS for encrypted agent-to-agent messaging.

```typescript
import { L2PS } from "@kynesyslabs/demosdk/l2ps"
import { Demos } from "@kynesyslabs/demosdk/websdk"

interface EncryptedMessage {
  id: string
  from: string
  to: string
  encryptedContent: string
  timestamp: number
  subnetId: string
}

class PrivateMessageRelay {
  private subnets: Map<string, L2PS> = new Map()  // recipientId -> L2PS
  private demos: Demos
  private myIdentity: string

  constructor(demos: Demos, myIdentity: string) {
    this.demos = demos
    this.myIdentity = myIdentity
  }

  /**
   * Establish private channel with another agent
   */
  async establishChannel(
    partnerId: string,
    sharedSecret?: string
  ): Promise<string> {
    // Create or join channel
    const l2ps = await L2PS.create(sharedSecret)
    const channelId = l2ps.getId()

    this.subnets.set(partnerId, l2ps)

    console.log(`🔗 Channel established with ${partnerId.slice(0, 16)}...`)
    console.log(`   Channel ID: ${channelId.slice(0, 16)}...`)

    return channelId
  }

  /**
   * Send encrypted message
   */
  async sendMessage(
    recipientId: string,
    content: any
  ): Promise<string> {
    const l2ps = this.subnets.get(recipientId)
    if (!l2ps) {
      throw new Error(`No channel with ${recipientId}`)
    }

    const messageId = crypto.randomUUID()

    const messageTx = {
      type: "l2ps_message",
      messageId,
      from: this.myIdentity,
      to: recipientId,
      content: JSON.stringify(content),
      timestamp: Date.now()
    }

    const encryptedTx = await l2ps.encryptTx(messageTx as any, this.myIdentity)
    const response = await this.demos.broadcast(encryptedTx)

    console.log(`📨 Message sent to ${recipientId.slice(0, 16)}...`)

    return messageId
  }

  /**
   * Receive and decrypt message
   */
  async receiveMessage(
    encryptedTx: any,
    senderId: string
  ): Promise<any> {
    const l2ps = this.subnets.get(senderId)
    if (!l2ps) {
      throw new Error(`No channel with ${senderId}`)
    }

    const decrypted = await l2ps.decryptTx(encryptedTx)
    const message = decrypted as any

    console.log(`📬 Message received from ${senderId.slice(0, 16)}...`)

    return {
      id: message.messageId,
      from: message.from,
      content: JSON.parse(message.content),
      timestamp: message.timestamp
    }
  }

  /**
   * Create group channel
   */
  async createGroupChannel(
    members: string[],
    channelName: string
  ): Promise<string> {
    const l2ps = await L2PS.create()
    const channelId = l2ps.getId()

    // Share channel with all members
    for (const member of members) {
      this.subnets.set(`group:${channelName}:${member}`, l2ps)
    }

    const config = {
      uid: channelId,
      name: channelName,
      type: "group",
      members,
      createdAt: Date.now()
    }

    l2ps.setConfig(config)

    console.log(`👥 Group channel "${channelName}" created`)
    console.log(`   Members: ${members.length}`)

    return channelId
  }

  /**
   * List active channels
   */
  listChannels(): { partnerId: string; channelId: string }[] {
    const channels: { partnerId: string; channelId: string }[] = []

    for (const [partnerId, l2ps] of this.subnets) {
      channels.push({
        partnerId,
        channelId: l2ps.getId()
      })
    }

    return channels
  }
}

// Usage
const relay = new PrivateMessageRelay(demos, "demos1myagent...")

// Establish private channel
const channelId = await relay.establishChannel(
  "demos1partner...",
  "shared-secret-key"  // Pre-shared key
)

// Send encrypted message
await relay.sendMessage("demos1partner...", {
  type: "trade_signal",
  action: "buy",
  token: "ETH",
  amount: "10"
})

// Create group for multi-agent coordination
await relay.createGroupChannel(
  ["demos1agent1...", "demos1agent2...", "demos1agent3..."],
  "trading-consortium"
)
```

---

## Best Practices

### Key Management
```typescript
// Securely generate and store keys
const l2ps = await L2PS.create()
const fingerprint = await l2ps.getKeyFingerprint()

// Store fingerprint for identification
console.log(`Key fingerprint (share this): ${fingerprint}`)

// Never expose full private key in logs
```

### Subnet Lifecycle
```typescript
// Check if subnet exists before operations
if (!L2PS.hasInstance(subnetId)) {
  // Recreate or handle missing subnet
  const l2ps = await L2PS.create(savedPrivateKey, savedIV)
}

// Clean up when done
L2PS.removeInstance(subnetId)
```

### Transaction Validation
```typescript
// Always validate transaction type before decryption
function isL2PSTransaction(tx: any): boolean {
  return tx.type === "l2psEncryptedTx" && tx.data?.uid
}

if (isL2PSTransaction(incomingTx)) {
  const decrypted = await l2ps.decryptTx(incomingTx)
}
```

---

## DemosWork Integration

Combine L2PS with multi-step workflows:

```typescript
import { DemosWork, BaseOperation, WorkStep } from "@kynesyslabs/demosdk/demoswork"

// Create workflow with encrypted steps
const work = new DemosWork()

// Step 1: Initialize subnet
const initStep = new WorkStep({
  context: "l2ps",
  content: { action: "create", config: { name: "workflow-subnet" } },
  critical: true
})

// Step 2: Encrypted computation
const computeStep = new WorkStep({
  context: "l2ps",
  content: {
    action: "compute",
    subnetId: "{{initStep.subnetId}}",
    type: "statistics",
    data: sensitiveData
  },
  critical: true
})

// Step 3: Store result (encrypted)
const storeStep = new WorkStep({
  context: "l2ps",
  content: {
    action: "store",
    subnetId: "{{initStep.subnetId}}",
    result: "{{computeStep.result}}"
  }
})

work.push(new BaseOperation(initStep))
work.push(new BaseOperation(computeStep))
work.push(new BaseOperation(storeStep))
```

---

## Related Skills

- [FHE Privacy Agent](./fhe-privacy-agent.md) - Homomorphic encryption for computation
- [Messaging Agent](./messaging-agent.md) - P2P encrypted messaging
- [Wallet Security Agent](./wallet-security-agent.md) - Key management
- [Transaction Builder Agent](./transaction-builder-agent.md) - Complex tx construction
