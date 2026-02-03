# On-Chain Storage Agent

> **⚠️ Prerequisites**: Complete [SDK Setup](./00-sdk-setup.md) first to configure your environment.

Build agents that store and manage persistent data on the Demos Network using StorageProgram with robust access control.

## SDK Reference

```typescript
import { StorageProgram } from "@kynesyslabs/demosdk/storage"
import { Demos } from "@kynesyslabs/demosdk/websdk"
```

## Core Concepts

### StorageProgram Features
- **Dual Encoding**: JSON (structured) or Binary (raw) data
- **Size Limit**: 1MB maximum per storage program
- **Pricing**: 1 DEM per 10KB stored
- **ACL System**: Owner, allowed, blacklisted, public, groups
- **Deterministic Addresses**: `stor-{sha256}` format
- **IPFS-Ready**: Future hybrid storage support

### ACL Modes

| Mode | Read | Write | Delete |
|------|------|-------|--------|
| `owner` | Owner only | Owner only | Owner only |
| `public` | Anyone | Owner only | Owner only |
| `restricted` | Allowed list | Allowed list | Owner only |
| Groups | Per-group permissions | Per-group permissions | Per-group permissions |

### Key Methods

| Method | Description |
|--------|-------------|
| `createStorageProgram()` | Create new storage with data and ACL |
| `writeStorage()` | Update stored data |
| `readStorage()` | Read storage contents |
| `setField()` / `getValue()` | Field-level JSON operations |
| `updateAccessControl()` | Modify ACL settings |
| `deleteStorageProgram()` | Remove storage (irreversible) |

---

## Use Case 1: Agent Configuration Store

Store and manage agent configuration with version control.

```typescript
import { StorageProgram } from "@kynesyslabs/demosdk/storage"
import { Demos } from "@kynesyslabs/demosdk/websdk"

interface AgentConfig {
  version: string
  name: string
  capabilities: string[]
  settings: Record<string, any>
  updatedAt: number
}

class AgentConfigStore {
  private demos: Demos
  private rpcUrl: string
  private ownerAddress: string
  private storageAddress: string | null = null

  constructor(demos: Demos, rpcUrl: string, ownerAddress: string) {
    this.demos = demos
    this.rpcUrl = rpcUrl
    this.ownerAddress = ownerAddress
  }

  /**
   * Initialize config storage for agent
   */
  async initializeConfig(
    agentName: string,
    initialConfig: AgentConfig
  ): Promise<string> {
    // Get nonce for unique address
    const addressInfo = await this.demos.getAddressInfo(this.ownerAddress)
    const nonce = addressInfo.nonce || 0

    // Create storage program with config
    const payload = StorageProgram.createStorageProgram(
      this.ownerAddress,
      `${agentName}-config`,
      {
        ...initialConfig,
        createdAt: Date.now(),
        history: []
      },
      "json",
      { mode: "owner" },  // Private by default
      { nonce }
    )

    // Derive address for reference
    this.storageAddress = StorageProgram.deriveStorageAddress(
      this.ownerAddress,
      `${agentName}-config`,
      nonce
    )

    // Submit transaction
    const tx = await this.demos.createTransaction(payload)
    await this.demos.broadcast(tx)

    console.log(`✅ Config storage created: ${this.storageAddress}`)

    return this.storageAddress
  }

  /**
   * Update configuration with history tracking
   */
  async updateConfig(
    updates: Partial<AgentConfig>
  ): Promise<void> {
    if (!this.storageAddress) throw new Error("Storage not initialized")

    // Get current config
    const current = await StorageProgram.getAll(
      this.rpcUrl,
      this.storageAddress
    )

    if (!current) throw new Error("Config not found")

    // Track change history
    const history = current.data.history || []
    history.push({
      timestamp: Date.now(),
      changes: Object.keys(updates),
      previousVersion: current.data.version
    })

    // Update with new values
    const newConfig = {
      ...current.data,
      ...updates,
      updatedAt: Date.now(),
      history
    }

    // Write updated config
    const payload = StorageProgram.writeStorage(
      this.storageAddress,
      newConfig,
      "json"
    )

    const tx = await this.demos.createTransaction(payload)
    await this.demos.broadcast(tx)

    console.log(`✅ Config updated to version ${updates.version || current.data.version}`)
  }

  /**
   * Get specific setting
   */
  async getSetting<T>(key: string): Promise<T | null> {
    if (!this.storageAddress) throw new Error("Storage not initialized")

    const result = await StorageProgram.getValue<{ [key: string]: T }>(
      this.rpcUrl,
      this.storageAddress,
      "settings"
    )

    return result?.value?.[key] || null
  }

  /**
   * Set specific setting
   */
  async setSetting(key: string, value: any): Promise<void> {
    if (!this.storageAddress) throw new Error("Storage not initialized")

    // Get current settings
    const current = await StorageProgram.getValue(
      this.rpcUrl,
      this.storageAddress,
      "settings"
    )

    const settings = current?.value || {}
    settings[key] = value

    // Update settings field
    const payload = StorageProgram.setField(
      this.storageAddress,
      "settings",
      settings
    )

    const tx = await this.demos.createTransaction(payload)
    await this.demos.broadcast(tx)
  }

  /**
   * Get full config
   */
  async getConfig(): Promise<AgentConfig | null> {
    if (!this.storageAddress) throw new Error("Storage not initialized")

    const data = await StorageProgram.getAll(
      this.rpcUrl,
      this.storageAddress
    )

    return data?.data as AgentConfig || null
  }
}

// Usage
const configStore = new AgentConfigStore(demos, rpcUrl, ownerAddress)

// Initialize
await configStore.initializeConfig("trading-bot", {
  version: "1.0.0",
  name: "Trading Bot",
  capabilities: ["spot", "futures", "arbitrage"],
  settings: {
    maxTradeSize: 1000,
    riskLevel: "medium",
    chains: ["eth", "polygon", "arbitrum"]
  },
  updatedAt: Date.now()
})

// Update settings
await configStore.setSetting("maxTradeSize", 2000)

// Get specific setting
const riskLevel = await configStore.getSetting<string>("riskLevel")
```

---

## Use Case 2: Shared Knowledge Base

Create a collaborative knowledge store with group access control.

```typescript
import { StorageProgram } from "@kynesyslabs/demosdk/storage"
import { Demos } from "@kynesyslabs/demosdk/websdk"

interface KnowledgeEntry {
  id: string
  title: string
  content: string
  author: string
  tags: string[]
  createdAt: number
  updatedAt: number
}

class SharedKnowledgeBase {
  private demos: Demos
  private rpcUrl: string
  private ownerAddress: string
  private storageAddress: string

  constructor(
    demos: Demos,
    rpcUrl: string,
    ownerAddress: string,
    storageAddress: string
  ) {
    this.demos = demos
    this.rpcUrl = rpcUrl
    this.ownerAddress = ownerAddress
    this.storageAddress = storageAddress
  }

  /**
   * Create new knowledge base with group ACL
   */
  static async create(
    demos: Demos,
    rpcUrl: string,
    ownerAddress: string,
    name: string,
    groups: {
      admins: string[]
      editors: string[]
      viewers: string[]
    }
  ): Promise<SharedKnowledgeBase> {
    const addressInfo = await demos.getAddressInfo(ownerAddress)
    const nonce = addressInfo.nonce || 0

    // Create ACL with groups
    const acl = StorageProgram.groupACL({
      admins: {
        members: groups.admins,
        permissions: ["read", "write", "delete"]
      },
      editors: {
        members: groups.editors,
        permissions: ["read", "write"]
      },
      viewers: {
        members: groups.viewers,
        permissions: ["read"]
      }
    })

    // Create storage
    const payload = StorageProgram.createStorageProgram(
      ownerAddress,
      `kb-${name}`,
      {
        name,
        entries: [],
        tags: [],
        createdAt: Date.now()
      },
      "json",
      acl,
      { nonce }
    )

    const storageAddress = StorageProgram.deriveStorageAddress(
      ownerAddress,
      `kb-${name}`,
      nonce
    )

    const tx = await demos.createTransaction(payload)
    await demos.broadcast(tx)

    console.log(`✅ Knowledge base "${name}" created: ${storageAddress}`)

    return new SharedKnowledgeBase(demos, rpcUrl, ownerAddress, storageAddress)
  }

  /**
   * Add knowledge entry
   */
  async addEntry(entry: Omit<KnowledgeEntry, "id" | "createdAt" | "updatedAt">): Promise<string> {
    const entryId = crypto.randomUUID()

    const fullEntry: KnowledgeEntry = {
      ...entry,
      id: entryId,
      createdAt: Date.now(),
      updatedAt: Date.now()
    }

    // Append to entries array
    const payload = StorageProgram.appendItem(
      this.storageAddress,
      "entries",
      fullEntry
    )

    const tx = await this.demos.createTransaction(payload)
    await this.demos.broadcast(tx)

    // Update tags index
    await this.updateTagsIndex(entry.tags)

    console.log(`📝 Entry added: ${entry.title}`)

    return entryId
  }

  /**
   * Search entries by tag
   */
  async searchByTag(tag: string): Promise<KnowledgeEntry[]> {
    const data = await StorageProgram.getAll(
      this.rpcUrl,
      this.storageAddress
    )

    if (!data?.data?.entries) return []

    return data.data.entries.filter(
      (entry: KnowledgeEntry) => entry.tags.includes(tag)
    )
  }

  /**
   * Search entries by text
   */
  async search(query: string): Promise<KnowledgeEntry[]> {
    const data = await StorageProgram.getAll(
      this.rpcUrl,
      this.storageAddress
    )

    if (!data?.data?.entries) return []

    const lowerQuery = query.toLowerCase()

    return data.data.entries.filter(
      (entry: KnowledgeEntry) =>
        entry.title.toLowerCase().includes(lowerQuery) ||
        entry.content.toLowerCase().includes(lowerQuery)
    )
  }

  /**
   * Update entry
   */
  async updateEntry(
    entryId: string,
    updates: Partial<KnowledgeEntry>
  ): Promise<void> {
    // Get current entries
    const data = await StorageProgram.getAll(
      this.rpcUrl,
      this.storageAddress
    )

    if (!data?.data?.entries) throw new Error("No entries found")

    // Find and update entry
    const index = data.data.entries.findIndex(
      (e: KnowledgeEntry) => e.id === entryId
    )

    if (index === -1) throw new Error("Entry not found")

    const updatedEntry = {
      ...data.data.entries[index],
      ...updates,
      updatedAt: Date.now()
    }

    // Update at index
    const payload = StorageProgram.setItem(
      this.storageAddress,
      "entries",
      index,
      updatedEntry
    )

    const tx = await this.demos.createTransaction(payload)
    await this.demos.broadcast(tx)

    console.log(`✏️ Entry updated: ${updatedEntry.title}`)
  }

  /**
   * Delete entry
   */
  async deleteEntry(entryId: string): Promise<void> {
    const data = await StorageProgram.getAll(
      this.rpcUrl,
      this.storageAddress
    )

    if (!data?.data?.entries) throw new Error("No entries found")

    const index = data.data.entries.findIndex(
      (e: KnowledgeEntry) => e.id === entryId
    )

    if (index === -1) throw new Error("Entry not found")

    const payload = StorageProgram.deleteItem(
      this.storageAddress,
      "entries",
      index
    )

    const tx = await this.demos.createTransaction(payload)
    await this.demos.broadcast(tx)

    console.log(`🗑️ Entry deleted`)
  }

  /**
   * Get all tags
   */
  async getTags(): Promise<string[]> {
    const result = await StorageProgram.getValue<string[]>(
      this.rpcUrl,
      this.storageAddress,
      "tags"
    )

    return result?.value || []
  }

  private async updateTagsIndex(newTags: string[]): Promise<void> {
    const currentTags = await this.getTags()
    const uniqueTags = [...new Set([...currentTags, ...newTags])]

    const payload = StorageProgram.setField(
      this.storageAddress,
      "tags",
      uniqueTags
    )

    const tx = await this.demos.createTransaction(payload)
    await this.demos.broadcast(tx)
  }
}

// Usage
const kb = await SharedKnowledgeBase.create(
  demos,
  rpcUrl,
  ownerAddress,
  "defi-strategies",
  {
    admins: ["demos1admin..."],
    editors: ["demos1analyst1...", "demos1analyst2..."],
    viewers: ["demos1trader1...", "demos1trader2..."]
  }
)

// Add entry
await kb.addEntry({
  title: "Arbitrage Strategy: Cross-DEX",
  content: "Detailed strategy for...",
  author: "demos1analyst1...",
  tags: ["arbitrage", "dex", "advanced"]
})

// Search
const results = await kb.searchByTag("arbitrage")
```

---

## Use Case 3: Binary Data Store

Store binary files (images, documents) on-chain.

```typescript
import { StorageProgram } from "@kynesyslabs/demosdk/storage"
import { Demos } from "@kynesyslabs/demosdk/websdk"

interface FileMetadata {
  filename: string
  mimeType: string
  size: number
  uploadedAt: number
  checksum: string
}

class BinaryDataStore {
  private demos: Demos
  private rpcUrl: string
  private ownerAddress: string

  constructor(demos: Demos, rpcUrl: string, ownerAddress: string) {
    this.demos = demos
    this.rpcUrl = rpcUrl
    this.ownerAddress = ownerAddress
  }

  /**
   * Store binary file on-chain
   */
  async storeFile(
    filename: string,
    data: Buffer | Uint8Array,
    mimeType: string,
    acl?: any
  ): Promise<{ address: string; fee: bigint }> {
    // Convert to base64
    const base64Data = Buffer.from(data).toString("base64")

    // Validate size (1MB max)
    if (!StorageProgram.validateSize(base64Data, "binary")) {
      throw new Error("File exceeds 1MB size limit")
    }

    // Calculate checksum
    const checksum = await this.calculateChecksum(data)

    // Get nonce
    const addressInfo = await this.demos.getAddressInfo(this.ownerAddress)
    const nonce = addressInfo.nonce || 0

    // Calculate fee
    const fee = StorageProgram.calculateStorageFee(base64Data, "binary")

    // Create storage
    const payload = StorageProgram.createStorageProgram(
      this.ownerAddress,
      filename,
      base64Data,
      "binary",
      acl || { mode: "owner" },
      {
        nonce,
        metadata: {
          filename,
          mimeType,
          size: data.length,
          uploadedAt: Date.now(),
          checksum
        }
      }
    )

    const storageAddress = StorageProgram.deriveStorageAddress(
      this.ownerAddress,
      filename,
      nonce
    )

    const tx = await this.demos.createTransaction(payload)
    await this.demos.broadcast(tx)

    console.log(`📁 File stored: ${filename}`)
    console.log(`   Address: ${storageAddress}`)
    console.log(`   Size: ${data.length} bytes`)
    console.log(`   Fee: ${fee} DEM`)

    return { address: storageAddress, fee }
  }

  /**
   * Retrieve binary file
   */
  async retrieveFile(
    storageAddress: string,
    identity?: string
  ): Promise<{ data: Buffer; metadata: FileMetadata }> {
    const stored = await StorageProgram.getByAddress(
      this.rpcUrl,
      storageAddress,
      identity
    )

    if (!stored) throw new Error("File not found")

    // Decode base64
    const data = Buffer.from(stored.data as string, "base64")

    // Verify checksum
    const checksum = await this.calculateChecksum(data)
    if (stored.metadata?.checksum && checksum !== stored.metadata.checksum) {
      throw new Error("Checksum mismatch - file may be corrupted")
    }

    return {
      data,
      metadata: stored.metadata as FileMetadata
    }
  }

  /**
   * Store image with auto-optimization
   */
  async storeImage(
    filename: string,
    imageData: Buffer,
    options: {
      maxWidth?: number
      quality?: number
      public?: boolean
    } = {}
  ): Promise<string> {
    // In real implementation, would resize/compress
    // For now, store as-is

    const mimeType = this.detectImageType(imageData)

    const { address } = await this.storeFile(
      filename,
      imageData,
      mimeType,
      options.public ? StorageProgram.publicACL() : undefined
    )

    return address
  }

  /**
   * Get storage cost estimate
   */
  estimateCost(sizeBytes: number): bigint {
    // 1 DEM per 10KB, minimum 1 DEM
    const sizeKB = Math.ceil(sizeBytes / 1024)
    const cost = Math.ceil(sizeKB / 10)
    return BigInt(Math.max(cost, 1))
  }

  private async calculateChecksum(data: Buffer | Uint8Array): Promise<string> {
    const hashBuffer = await crypto.subtle.digest("SHA-256", data)
    return Array.from(new Uint8Array(hashBuffer))
      .map(b => b.toString(16).padStart(2, "0"))
      .join("")
  }

  private detectImageType(data: Buffer): string {
    // Check magic bytes
    if (data[0] === 0x89 && data[1] === 0x50) return "image/png"
    if (data[0] === 0xFF && data[1] === 0xD8) return "image/jpeg"
    if (data[0] === 0x47 && data[1] === 0x49) return "image/gif"
    if (data[0] === 0x52 && data[1] === 0x49) return "image/webp"
    return "application/octet-stream"
  }
}

// Usage
const binaryStore = new BinaryDataStore(demos, rpcUrl, ownerAddress)

// Store file
const imageBuffer = await fs.readFile("./avatar.png")
const { address, fee } = await binaryStore.storeFile(
  "agent-avatar.png",
  imageBuffer,
  "image/png",
  StorageProgram.publicACL()  // Public access
)

console.log(`Stored at: ${address}`)
console.log(`Cost: ${fee} DEM`)

// Retrieve file
const { data, metadata } = await binaryStore.retrieveFile(address)
console.log(`Retrieved: ${metadata.filename} (${metadata.size} bytes)`)
```

---

## Use Case 4: Access-Controlled Document Store

Manage documents with fine-grained permissions.

```typescript
import { StorageProgram } from "@kynesyslabs/demosdk/storage"
import { Demos } from "@kynesyslabs/demosdk/websdk"

interface Document {
  id: string
  title: string
  content: string
  classification: "public" | "internal" | "confidential" | "restricted"
  owner: string
  createdAt: number
  modifiedAt: number
}

class SecureDocumentStore {
  private demos: Demos
  private rpcUrl: string
  private ownerAddress: string
  private indexAddress: string | null = null

  constructor(demos: Demos, rpcUrl: string, ownerAddress: string) {
    this.demos = demos
    this.rpcUrl = rpcUrl
    this.ownerAddress = ownerAddress
  }

  /**
   * Initialize document store with index
   */
  async initialize(): Promise<void> {
    const addressInfo = await this.demos.getAddressInfo(this.ownerAddress)
    const nonce = addressInfo.nonce || 0

    // Create index storage
    const indexPayload = StorageProgram.createStorageProgram(
      this.ownerAddress,
      "doc-index",
      {
        documents: [],
        totalCount: 0,
        createdAt: Date.now()
      },
      "json",
      { mode: "owner" },
      { nonce }
    )

    this.indexAddress = StorageProgram.deriveStorageAddress(
      this.ownerAddress,
      "doc-index",
      nonce
    )

    const tx = await this.demos.createTransaction(indexPayload)
    await this.demos.broadcast(tx)

    console.log(`📚 Document store initialized: ${this.indexAddress}`)
  }

  /**
   * Store document with classification-based ACL
   */
  async storeDocument(
    doc: Omit<Document, "id" | "createdAt" | "modifiedAt">,
    allowedReaders?: string[]
  ): Promise<string> {
    const docId = crypto.randomUUID()
    const addressInfo = await this.demos.getAddressInfo(this.ownerAddress)
    const nonce = addressInfo.nonce || 0

    // Determine ACL based on classification
    let acl: any

    switch (doc.classification) {
      case "public":
        acl = StorageProgram.publicACL()
        break

      case "internal":
        acl = StorageProgram.restrictedACL(allowedReaders || [])
        break

      case "confidential":
        acl = {
          mode: "restricted",
          allowed: allowedReaders || [],
          // Add audit logging for confidential docs
        }
        break

      case "restricted":
        acl = StorageProgram.privateACL()
        break
    }

    const fullDoc: Document = {
      ...doc,
      id: docId,
      createdAt: Date.now(),
      modifiedAt: Date.now()
    }

    // Store document
    const payload = StorageProgram.createStorageProgram(
      this.ownerAddress,
      `doc-${docId}`,
      fullDoc,
      "json",
      acl,
      { nonce }
    )

    const docAddress = StorageProgram.deriveStorageAddress(
      this.ownerAddress,
      `doc-${docId}`,
      nonce
    )

    const tx = await this.demos.createTransaction(payload)
    await this.demos.broadcast(tx)

    // Update index
    await this.updateIndex(docId, doc.title, doc.classification, docAddress)

    console.log(`📄 Document stored: ${doc.title}`)
    console.log(`   Classification: ${doc.classification}`)

    return docAddress
  }

  /**
   * Grant access to document
   */
  async grantAccess(
    docAddress: string,
    addresses: string[]
  ): Promise<void> {
    // Get current ACL
    const doc = await StorageProgram.getByAddress(
      this.rpcUrl,
      docAddress
    )

    if (!doc) throw new Error("Document not found")

    // Update ACL to add addresses
    const currentAllowed = doc.acl?.allowed || []
    const newAllowed = [...new Set([...currentAllowed, ...addresses])]

    const payload = StorageProgram.updateAccessControl(
      docAddress,
      {
        mode: "restricted",
        allowed: newAllowed
      }
    )

    const tx = await this.demos.createTransaction(payload)
    await this.demos.broadcast(tx)

    console.log(`✅ Access granted to ${addresses.length} address(es)`)
  }

  /**
   * Revoke access from document
   */
  async revokeAccess(
    docAddress: string,
    addresses: string[]
  ): Promise<void> {
    const doc = await StorageProgram.getByAddress(
      this.rpcUrl,
      docAddress
    )

    if (!doc) throw new Error("Document not found")

    // Add to blacklist
    const currentBlacklist = doc.acl?.blacklisted || []
    const newBlacklist = [...new Set([...currentBlacklist, ...addresses])]

    const payload = StorageProgram.updateAccessControl(
      docAddress,
      {
        ...doc.acl,
        blacklisted: newBlacklist
      }
    )

    const tx = await this.demos.createTransaction(payload)
    await this.demos.broadcast(tx)

    console.log(`🚫 Access revoked from ${addresses.length} address(es)`)
  }

  /**
   * Check if user has permission
   */
  async checkPermission(
    docAddress: string,
    userAddress: string,
    permission: "read" | "write" | "delete"
  ): Promise<boolean> {
    const doc = await StorageProgram.getByAddress(
      this.rpcUrl,
      docAddress
    )

    if (!doc) return false

    return StorageProgram.checkPermission(
      doc.acl,
      doc.owner,
      userAddress,
      permission
    )
  }

  /**
   * List accessible documents for user
   */
  async listAccessible(
    userAddress: string
  ): Promise<{ id: string; title: string; classification: string }[]> {
    if (!this.indexAddress) throw new Error("Store not initialized")

    const index = await StorageProgram.getAll(
      this.rpcUrl,
      this.indexAddress
    )

    if (!index?.data?.documents) return []

    const accessible: any[] = []

    for (const doc of index.data.documents) {
      const canRead = await this.checkPermission(
        doc.address,
        userAddress,
        "read"
      )

      if (canRead) {
        accessible.push({
          id: doc.id,
          title: doc.title,
          classification: doc.classification
        })
      }
    }

    return accessible
  }

  private async updateIndex(
    docId: string,
    title: string,
    classification: string,
    address: string
  ): Promise<void> {
    if (!this.indexAddress) return

    const payload = StorageProgram.appendItem(
      this.indexAddress,
      "documents",
      { id: docId, title, classification, address }
    )

    const tx = await this.demos.createTransaction(payload)
    await this.demos.broadcast(tx)
  }
}

// Usage
const docStore = new SecureDocumentStore(demos, rpcUrl, ownerAddress)
await docStore.initialize()

// Store confidential document
const docAddress = await docStore.storeDocument(
  {
    title: "Q4 Financial Report",
    content: "Confidential financial data...",
    classification: "confidential",
    owner: ownerAddress
  },
  ["demos1cfo...", "demos1ceo..."]  // Initial readers
)

// Grant additional access
await docStore.grantAccess(docAddress, ["demos1auditor..."])

// Check permission
const canRead = await docStore.checkPermission(
  docAddress,
  "demos1auditor...",
  "read"
)
console.log(`Auditor can read: ${canRead}`)
```

---

## Best Practices

### Size and Cost Management
```typescript
// Always check size before storing
const data = { large: "data..." }

if (!StorageProgram.validateSize(data, "json")) {
  throw new Error("Data exceeds 1MB limit")
}

// Estimate cost
const fee = StorageProgram.calculateStorageFee(data, "json")
console.log(`Storage will cost ${fee} DEM`)

// For large data, consider chunking or IPFS
```

### Nesting Depth
```typescript
// JSON has max 64 levels of nesting
const deepData = { level1: { level2: { /* ... */ } } }

if (!StorageProgram.validateNestingDepth(deepData)) {
  throw new Error("Data nesting too deep")
}
```

### ACL Best Practices
```typescript
// Use helper methods for common patterns
const publicACL = StorageProgram.publicACL()
const privateACL = StorageProgram.privateACL()
const restrictedACL = StorageProgram.restrictedACL(["demos1...", "demos2..."])

// Blacklist takes precedence
const aclWithBlacklist = StorageProgram.blacklistACL(
  "public",
  ["demos1spam..."]  // Blocked even though public
)
```

---

## Related Skills

- [Data Indexing Agent](./data-indexing-agent.md) - Query and aggregate data
- [L2PS Private Subnet Agent](./l2ps-private-subnet-agent.md) - Encrypted transactions
- [Identity Resolution Agent](./identity-resolution-agent.md) - CCI for access control
- [TLSNotary Attestation Agent](./tlsnotary-attestation-agent.md) - Proof storage
