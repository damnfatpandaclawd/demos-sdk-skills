# Storage Program Agent Skill

> **⚠️ Prerequisites**: Complete [SDK Setup](./00-sdk-setup.md) first to configure your environment.

Build agents that store and retrieve data on Demos Network with robust access control and pricing.

## Overview

Storage Program provides unified on-chain storage for both structured (JSON) and raw (Binary) data with deterministic addressing, size-based pricing, and flexible access control. Essential for persistent data storage, configuration management, and decentralized file systems.

## SDK Reference

```typescript
import { StorageProgram } from "@kynesyslabs/demosdk/storage"
import type {
  StorageProgramData,
  StorageProgramACL,
  StorageProgramPayload,
  StorageLocation,
  StorageEncoding
} from "@kynesyslabs/demosdk/types"

// Storage Methods
StorageProgram.createPayload(data, acl, encoding)  // Create storage payload
StorageProgram.calculateAddress(owner, key)         // Get deterministic address
StorageProgram.calculateFee(sizeBytes)              // Calculate storage fee
StorageProgram.validatePayload(payload)             // Validate before submit

// ACL Methods
StorageProgram.createACL(options)                   // Create access control
StorageProgram.checkAccess(acl, address)            // Check access rights
```

## Key Features

| Feature | Description |
|---------|-------------|
| Dual Encoding | JSON (structured) or Binary (raw) data |
| Deterministic Addresses | Predictable storage locations |
| Size-Based Pricing | Pay per byte stored |
| Robust ACL | Owner, allowed, groups, blacklist |
| Max Size: 1MB | Per storage entry |

## ACL Priority

```
1. Owner         → FULL ACCESS (always)
2. Blacklisted   → DENIED (even if in allowed/groups)
3. Allowed       → GRANTED (explicit allowlist)
4. Groups        → GRANTED (if in any allowed group)
5. Default Mode  → PUBLIC/PRIVATE fallback
```

## Agent Use Cases

### 1. Configuration Manager Agent

Manage distributed configuration:

```typescript
class ConfigurationManagerAgent {
  private demos: Demos
  private configCache: Map<string, any> = new Map()

  async storeConfig(
    key: string,
    config: any,
    acl?: Partial<StorageProgramACL>
  ): Promise<StorageResult> {
    // Create ACL with sensible defaults
    const storageACL: StorageProgramACL = {
      owner: await this.demos.wallet.getPublicKey(),
      mode: acl?.mode || "private",
      allowed: acl?.allowed || [],
      groups: acl?.groups || [],
      blacklist: acl?.blacklist || []
    }

    // Create storage payload
    const payload = StorageProgram.createPayload(
      config,
      storageACL,
      "json"
    )

    // Calculate fee
    const fee = StorageProgram.calculateFee(
      JSON.stringify(config).length
    )

    // Create storage transaction
    const tx: Transaction = {
      type: "storageProgram",
      content: {
        action: "store",
        key,
        payload,
        fee
      },
      hash: "",
      status: "pending"
    }

    const result = await this.demos.insertTransaction(tx)

    // Update cache
    this.configCache.set(key, config)

    return {
      key,
      address: StorageProgram.calculateAddress(storageACL.owner, key),
      txHash: result.hash,
      fee
    }
  }

  async getConfig<T>(key: string, owner?: string): Promise<T | null> {
    // Check cache first
    if (this.configCache.has(key)) {
      return this.configCache.get(key) as T
    }

    const address = StorageProgram.calculateAddress(
      owner || await this.demos.wallet.getPublicKey(),
      key
    )

    try {
      const data = await this.demos.nodeCall("getStorageProgram", { address })

      if (data && data.content) {
        const config = JSON.parse(data.content)
        this.configCache.set(key, config)
        return config as T
      }

      return null
    } catch {
      return null
    }
  }

  async updateConfig(
    key: string,
    updates: Partial<any>
  ): Promise<StorageResult> {
    const current = await this.getConfig(key)
    if (!current) {
      throw new Error("Config not found")
    }

    const updated = { ...current, ...updates }
    return await this.storeConfig(key, updated)
  }

  async deleteConfig(key: string): Promise<TransactionResult> {
    const address = StorageProgram.calculateAddress(
      await this.demos.wallet.getPublicKey(),
      key
    )

    const tx: Transaction = {
      type: "storageProgram",
      content: {
        action: "delete",
        address
      },
      hash: "",
      status: "pending"
    }

    const result = await this.demos.insertTransaction(tx)
    this.configCache.delete(key)

    return result
  }
}
```

### 2. Document Storage Agent

Store and manage documents:

```typescript
class DocumentStorageAgent {
  private demos: Demos

  async storeDocument(
    document: Document,
    access: AccessConfig
  ): Promise<StoredDocument> {
    const owner = await this.demos.wallet.getPublicKey()

    // Generate document key
    const docKey = `doc_${Date.now()}_${this.generateId()}`

    // Create ACL based on access config
    const acl: StorageProgramACL = {
      owner,
      mode: access.public ? "public" : "private",
      allowed: access.viewers || [],
      groups: access.viewerGroups || [],
      blacklist: access.blocked || []
    }

    // Prepare document payload
    const payload: DocumentPayload = {
      title: document.title,
      content: document.content,
      contentType: document.contentType,
      metadata: {
        author: owner,
        createdAt: Date.now(),
        version: 1,
        tags: document.tags || []
      }
    }

    // Store document
    const storagePayload = StorageProgram.createPayload(payload, acl, "json")

    const tx: Transaction = {
      type: "storageProgram",
      content: {
        action: "store",
        key: docKey,
        payload: storagePayload
      },
      hash: "",
      status: "pending"
    }

    const result = await this.demos.insertTransaction(tx)

    return {
      id: docKey,
      address: StorageProgram.calculateAddress(owner, docKey),
      txHash: result.hash,
      document: payload,
      access: acl
    }
  }

  async getDocument(
    docId: string,
    owner: string
  ): Promise<DocumentPayload | null> {
    const address = StorageProgram.calculateAddress(owner, docId)

    const data = await this.demos.nodeCall("getStorageProgram", { address })

    if (!data) return null

    // Check access
    const requester = await this.demos.wallet.getPublicKey()
    const hasAccess = StorageProgram.checkAccess(data.acl, requester)

    if (!hasAccess) {
      throw new Error("Access denied")
    }

    return JSON.parse(data.content) as DocumentPayload
  }

  async updateDocument(
    docId: string,
    updates: Partial<Document>
  ): Promise<StoredDocument> {
    const owner = await this.demos.wallet.getPublicKey()
    const current = await this.getDocument(docId, owner)

    if (!current) {
      throw new Error("Document not found")
    }

    const updated: DocumentPayload = {
      ...current,
      ...updates,
      metadata: {
        ...current.metadata,
        updatedAt: Date.now(),
        version: current.metadata.version + 1
      }
    }

    // Re-store with same key (overwrites)
    return await this.storeDocument(updated as Document, { public: false })
  }

  async shareDocument(
    docId: string,
    shareWith: string[]
  ): Promise<void> {
    const owner = await this.demos.wallet.getPublicKey()
    const address = StorageProgram.calculateAddress(owner, docId)

    const data = await this.demos.nodeCall("getStorageProgram", { address })

    if (!data) {
      throw new Error("Document not found")
    }

    // Update ACL
    const updatedACL: StorageProgramACL = {
      ...data.acl,
      allowed: [...new Set([...data.acl.allowed, ...shareWith])]
    }

    const tx: Transaction = {
      type: "storageProgram",
      content: {
        action: "updateACL",
        address,
        acl: updatedACL
      },
      hash: "",
      status: "pending"
    }

    await this.demos.insertTransaction(tx)
  }
}
```

### 3. Key-Value Store Agent

Implement a distributed key-value store:

```typescript
class KeyValueStoreAgent {
  private demos: Demos
  private namespace: string

  constructor(namespace: string) {
    this.namespace = namespace
  }

  private getFullKey(key: string): string {
    return `${this.namespace}:${key}`
  }

  async set(key: string, value: any, ttl?: number): Promise<void> {
    const fullKey = this.getFullKey(key)
    const owner = await this.demos.wallet.getPublicKey()

    const payload = {
      value,
      metadata: {
        createdAt: Date.now(),
        expiresAt: ttl ? Date.now() + ttl : null,
        type: typeof value
      }
    }

    const acl: StorageProgramACL = {
      owner,
      mode: "private",
      allowed: [],
      groups: [],
      blacklist: []
    }

    const storagePayload = StorageProgram.createPayload(payload, acl, "json")

    const tx: Transaction = {
      type: "storageProgram",
      content: {
        action: "store",
        key: fullKey,
        payload: storagePayload
      },
      hash: "",
      status: "pending"
    }

    await this.demos.insertTransaction(tx)
  }

  async get<T>(key: string): Promise<T | null> {
    const fullKey = this.getFullKey(key)
    const owner = await this.demos.wallet.getPublicKey()
    const address = StorageProgram.calculateAddress(owner, fullKey)

    try {
      const data = await this.demos.nodeCall("getStorageProgram", { address })

      if (!data) return null

      const payload = JSON.parse(data.content)

      // Check TTL
      if (payload.metadata.expiresAt && Date.now() > payload.metadata.expiresAt) {
        // Expired - delete and return null
        await this.delete(key)
        return null
      }

      return payload.value as T
    } catch {
      return null
    }
  }

  async delete(key: string): Promise<boolean> {
    const fullKey = this.getFullKey(key)
    const owner = await this.demos.wallet.getPublicKey()
    const address = StorageProgram.calculateAddress(owner, fullKey)

    try {
      const tx: Transaction = {
        type: "storageProgram",
        content: {
          action: "delete",
          address
        },
        hash: "",
        status: "pending"
      }

      await this.demos.insertTransaction(tx)
      return true
    } catch {
      return false
    }
  }

  async exists(key: string): Promise<boolean> {
    const value = await this.get(key)
    return value !== null
  }

  async keys(pattern?: string): Promise<string[]> {
    const owner = await this.demos.wallet.getPublicKey()

    const allKeys = await this.demos.nodeCall("listStoragePrograms", {
      owner,
      prefix: this.namespace
    })

    if (pattern) {
      const regex = new RegExp(pattern.replace("*", ".*"))
      return allKeys.filter((k: string) => regex.test(k))
    }

    return allKeys
  }

  async mset(entries: Record<string, any>): Promise<void> {
    await Promise.all(
      Object.entries(entries).map(([key, value]) => this.set(key, value))
    )
  }

  async mget<T>(keys: string[]): Promise<Record<string, T | null>> {
    const results: Record<string, T | null> = {}

    await Promise.all(
      keys.map(async (key) => {
        results[key] = await this.get<T>(key)
      })
    )

    return results
  }
}
```

### 4. Binary Data Storage Agent

Store and retrieve binary data:

```typescript
class BinaryStorageAgent {
  private demos: Demos

  async storeBinary(
    key: string,
    data: Buffer | Uint8Array,
    metadata: BinaryMetadata
  ): Promise<BinaryStorageResult> {
    const owner = await this.demos.wallet.getPublicKey()

    // Validate size
    if (data.length > 1024 * 1024) {
      throw new Error("Data exceeds 1MB limit")
    }

    const acl: StorageProgramACL = {
      owner,
      mode: metadata.public ? "public" : "private",
      allowed: metadata.allowedViewers || [],
      groups: [],
      blacklist: []
    }

    // Create binary payload
    const payload = StorageProgram.createPayload(
      {
        data: Buffer.from(data).toString("base64"),
        metadata: {
          contentType: metadata.contentType,
          size: data.length,
          checksum: await this.calculateChecksum(data),
          createdAt: Date.now()
        }
      },
      acl,
      "binary"
    )

    const fee = StorageProgram.calculateFee(data.length)

    const tx: Transaction = {
      type: "storageProgram",
      content: {
        action: "store",
        key,
        payload,
        fee
      },
      hash: "",
      status: "pending"
    }

    const result = await this.demos.insertTransaction(tx)

    return {
      key,
      address: StorageProgram.calculateAddress(owner, key),
      txHash: result.hash,
      size: data.length,
      fee,
      checksum: payload.metadata.checksum
    }
  }

  async getBinary(
    key: string,
    owner: string
  ): Promise<{ data: Buffer; metadata: BinaryMetadata } | null> {
    const address = StorageProgram.calculateAddress(owner, key)

    const stored = await this.demos.nodeCall("getStorageProgram", { address })

    if (!stored) return null

    const payload = stored.content

    // Verify checksum
    const data = Buffer.from(payload.data, "base64")
    const checksum = await this.calculateChecksum(data)

    if (checksum !== payload.metadata.checksum) {
      throw new Error("Data integrity check failed")
    }

    return {
      data,
      metadata: payload.metadata
    }
  }

  async storeFile(
    file: File | Buffer,
    filename: string,
    contentType: string
  ): Promise<BinaryStorageResult> {
    const data = file instanceof Buffer ? file : Buffer.from(await file.arrayBuffer())

    return await this.storeBinary(
      `file_${filename}`,
      data,
      {
        contentType,
        filename,
        public: false
      }
    )
  }

  private async calculateChecksum(data: Buffer | Uint8Array): Promise<string> {
    const hashBuffer = await crypto.subtle.digest("SHA-256", data)
    return Buffer.from(hashBuffer).toString("hex")
  }
}
```

### 5. Group Access Manager Agent

Manage group-based access control:

```typescript
class GroupAccessAgent {
  private demos: Demos
  private groups: Map<string, GroupInfo> = new Map()

  async createGroup(
    name: string,
    members: string[],
    admins?: string[]
  ): Promise<Group> {
    const owner = await this.demos.wallet.getPublicKey()

    const group: GroupInfo = {
      id: `group_${Date.now()}_${this.generateId()}`,
      name,
      owner,
      admins: admins || [owner],
      members,
      createdAt: Date.now()
    }

    // Store group definition
    const acl: StorageProgramACL = {
      owner,
      mode: "private",
      allowed: [...group.admins],
      groups: [],
      blacklist: []
    }

    const payload = StorageProgram.createPayload(group, acl, "json")

    const tx: Transaction = {
      type: "storageProgram",
      content: {
        action: "store",
        key: group.id,
        payload
      },
      hash: "",
      status: "pending"
    }

    await this.demos.insertTransaction(tx)
    this.groups.set(group.id, group)

    return group
  }

  async addMember(groupId: string, member: string): Promise<void> {
    const group = await this.getGroup(groupId)

    if (!group) {
      throw new Error("Group not found")
    }

    // Check admin rights
    const requester = await this.demos.wallet.getPublicKey()
    if (!group.admins.includes(requester)) {
      throw new Error("Not authorized")
    }

    // Add member
    group.members.push(member)
    await this.updateGroup(group)
  }

  async removeMember(groupId: string, member: string): Promise<void> {
    const group = await this.getGroup(groupId)

    if (!group) {
      throw new Error("Group not found")
    }

    const requester = await this.demos.wallet.getPublicKey()
    if (!group.admins.includes(requester)) {
      throw new Error("Not authorized")
    }

    group.members = group.members.filter(m => m !== member)
    await this.updateGroup(group)
  }

  async grantGroupAccess(
    storageAddress: string,
    groupId: string
  ): Promise<void> {
    // Get current ACL
    const data = await this.demos.nodeCall("getStorageProgram", {
      address: storageAddress
    })

    if (!data) {
      throw new Error("Storage not found")
    }

    // Verify ownership
    const owner = await this.demos.wallet.getPublicKey()
    if (data.acl.owner !== owner) {
      throw new Error("Not owner")
    }

    // Add group to ACL
    const updatedACL: StorageProgramACL = {
      ...data.acl,
      groups: [...new Set([...data.acl.groups, groupId])]
    }

    const tx: Transaction = {
      type: "storageProgram",
      content: {
        action: "updateACL",
        address: storageAddress,
        acl: updatedACL
      },
      hash: "",
      status: "pending"
    }

    await this.demos.insertTransaction(tx)
  }

  async checkMembership(
    groupId: string,
    address: string
  ): Promise<boolean> {
    const group = await this.getGroup(groupId)
    return group ? group.members.includes(address) : false
  }

  private async getGroup(groupId: string): Promise<GroupInfo | null> {
    if (this.groups.has(groupId)) {
      return this.groups.get(groupId)!
    }

    const owner = await this.demos.wallet.getPublicKey()
    const address = StorageProgram.calculateAddress(owner, groupId)

    const data = await this.demos.nodeCall("getStorageProgram", { address })
    if (!data) return null

    const group = JSON.parse(data.content) as GroupInfo
    this.groups.set(groupId, group)

    return group
  }

  private async updateGroup(group: GroupInfo): Promise<void> {
    const acl: StorageProgramACL = {
      owner: group.owner,
      mode: "private",
      allowed: group.admins,
      groups: [],
      blacklist: []
    }

    const payload = StorageProgram.createPayload(group, acl, "json")

    const tx: Transaction = {
      type: "storageProgram",
      content: {
        action: "store",
        key: group.id,
        payload
      },
      hash: "",
      status: "pending"
    }

    await this.demos.insertTransaction(tx)
    this.groups.set(group.id, group)
  }
}
```

## Error Handling

```typescript
try {
  await StorageProgram.createPayload(data, acl, encoding)
} catch (error) {
  switch (error.code) {
    case 'SIZE_EXCEEDED':
      // Data exceeds 1MB limit
      break
    case 'INVALID_ACL':
      // ACL configuration invalid
      break
    case 'INVALID_ENCODING':
      // Encoding must be 'json' or 'binary'
      break
    case 'ACCESS_DENIED':
      // No permission to access/modify
      break
  }
}
```

## Best Practices

1. **Use deterministic keys** for predictable addressing
2. **Set appropriate ACLs** before storing sensitive data
3. **Validate data size** before attempting to store
4. **Cache frequently accessed** data locally
5. **Use groups** for scalable access management

## Integration with DemosWork

```typescript
const storageWorkflow = new DemosWork()

// Step 1: Create storage payload
storageWorkflow.push(new BaseOperation(
  new NativeWorkStep({
    method: "storage.createPayload",
    params: {
      data: configData,
      acl: { mode: "private" },
      encoding: "json"
    }
  })
))

// Step 2: Store on-chain
storageWorkflow.push(new BaseOperation(
  new NativeWorkStep({
    method: "storage.store",
    params: {
      key: "app_config",
      payload: "{{step1.result}}"
    }
  })
))

// Step 3: Verify storage
storageWorkflow.push(new BaseOperation(
  new NativeWorkStep({
    method: "storage.get",
    params: {
      address: "{{step2.result.address}}"
    }
  })
))
```

## Related Skills

- [IPFS Operations Agent](./ipfs-operations-agent.md) - Distributed file storage
- [L2PS Subnet Agent](./l2ps-subnet-agent.md) - Private data processing
- [Workflow Orchestration](./workflow-orchestration-agent.md) - Multi-step workflows
