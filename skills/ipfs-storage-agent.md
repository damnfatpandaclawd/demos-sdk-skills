# IPFS Storage Agent

Build agents that manage decentralized file storage on IPFS through the Demos Network.

## SDK Reference

```typescript
import { IPFSOperations, IPFS_CONSTANTS } from "@kynesyslabs/demosdk/ipfs"
```

### Core Class

| Class | Purpose |
|-------|---------|
| `IPFSOperations` | Add, pin, retrieve, and manage IPFS content |

### Key Interfaces

```typescript
interface AddOptions {
  wrapWithDirectory?: boolean
  onlyHash?: boolean
  cidVersion?: 0 | 1
}

interface AddOptionsWithCharges {
  ...AddOptions
  paymentAddress?: string
  maxCharge?: string
}

interface IPFSAddResponse {
  cid: string
  size: number
  path: string
}

interface PinOptions {
  recursive?: boolean
  timeout?: number
}

interface IPFSGetResponse {
  content: Uint8Array
  contentType: string
  size: number
}

interface PinInfo {
  cid: string
  status: "pinned" | "pinning" | "failed"
  size: number
  pinnedAt: number
}
```

## Use Cases

### 1. Agent Knowledge Base Storage

Store and retrieve agent knowledge bases on IPFS.

```typescript
import { Demos } from "@kynesyslabs/demosdk/websdk"
import { IPFSOperations } from "@kynesyslabs/demosdk/ipfs"

interface KnowledgeEntry {
  id: string
  topic: string
  content: string
  embeddings?: number[]
  metadata: Record<string, any>
  createdAt: number
  updatedAt: number
}

class AgentKnowledgeBaseAgent {
  private demos: Demos
  private ipfs: IPFSOperations
  private knowledgeIndex: Map<string, string> = new Map() // topic -> CID

  async addKnowledge(entry: KnowledgeEntry): Promise<string> {
    // Serialize knowledge entry
    const content = JSON.stringify(entry)
    const buffer = new TextEncoder().encode(content)

    // Upload to IPFS
    const result = await this.ipfs.add(buffer, {
      wrapWithDirectory: false,
      cidVersion: 1
    })

    // Pin for persistence
    await this.ipfs.pin(result.cid, { recursive: true })

    // Update index
    this.knowledgeIndex.set(entry.topic, result.cid)
    await this.saveIndex()

    console.log(`Knowledge stored: ${result.cid}`)
    return result.cid
  }

  async getKnowledge(topic: string): Promise<KnowledgeEntry | null> {
    const cid = this.knowledgeIndex.get(topic)
    if (!cid) return null

    const response = await this.ipfs.get(cid)
    const content = new TextDecoder().decode(response.content)
    return JSON.parse(content)
  }

  async updateKnowledge(topic: string, updates: Partial<KnowledgeEntry>): Promise<string> {
    const existing = await this.getKnowledge(topic)
    if (!existing) throw new Error("Knowledge entry not found")

    const updated: KnowledgeEntry = {
      ...existing,
      ...updates,
      updatedAt: Date.now()
    }

    // Unpin old version
    const oldCid = this.knowledgeIndex.get(topic)
    if (oldCid) {
      await this.ipfs.unpin(oldCid)
    }

    return await this.addKnowledge(updated)
  }

  async searchKnowledge(query: string): Promise<KnowledgeEntry[]> {
    const results: KnowledgeEntry[] = []

    for (const [topic, cid] of this.knowledgeIndex) {
      if (topic.toLowerCase().includes(query.toLowerCase())) {
        const entry = await this.getKnowledge(topic)
        if (entry) results.push(entry)
      }
    }

    return results
  }

  private async saveIndex(): Promise<void> {
    const indexData = JSON.stringify(Object.fromEntries(this.knowledgeIndex))
    const buffer = new TextEncoder().encode(indexData)

    const result = await this.ipfs.add(buffer)
    await this.ipfs.pin(result.cid)

    // Store index CID in on-chain storage for persistence
    console.log(`Index saved: ${result.cid}`)
  }
}
```

### 2. NFT Metadata Storage Agent

Manage NFT metadata and assets on IPFS.

```typescript
import { IPFSOperations } from "@kynesyslabs/demosdk/ipfs"

interface NFTMetadata {
  name: string
  description: string
  image: string // IPFS CID
  animation_url?: string
  external_url?: string
  attributes: Array<{
    trait_type: string
    value: string | number
    display_type?: string
  }>
}

class NFTMetadataAgent {
  private ipfs: IPFSOperations

  async uploadAsset(
    file: Uint8Array,
    filename: string
  ): Promise<string> {
    // Upload asset file
    const result = await this.ipfs.add(file, {
      wrapWithDirectory: true
    })

    // Pin for permanence
    await this.ipfs.pin(result.cid, { recursive: true })

    return `ipfs://${result.cid}/${filename}`
  }

  async createMetadata(
    name: string,
    description: string,
    imageFile: Uint8Array,
    attributes: NFTMetadata["attributes"]
  ): Promise<{ metadataCid: string; metadata: NFTMetadata }> {
    // Upload image first
    const imageCid = await this.uploadAsset(imageFile, "image.png")

    // Create metadata
    const metadata: NFTMetadata = {
      name,
      description,
      image: imageCid,
      attributes
    }

    // Upload metadata JSON
    const metadataBuffer = new TextEncoder().encode(JSON.stringify(metadata, null, 2))
    const result = await this.ipfs.add(metadataBuffer, {
      cidVersion: 1
    })

    await this.ipfs.pin(result.cid)

    return {
      metadataCid: result.cid,
      metadata
    }
  }

  async createCollection(
    items: Array<{
      name: string
      description: string
      image: Uint8Array
      attributes: NFTMetadata["attributes"]
    }>
  ): Promise<string[]> {
    const metadataCids: string[] = []

    for (let i = 0; i < items.length; i++) {
      const item = items[i]
      const { metadataCid } = await this.createMetadata(
        item.name,
        item.description,
        item.image,
        item.attributes
      )
      metadataCids.push(metadataCid)
      console.log(`Uploaded ${i + 1}/${items.length}: ${metadataCid}`)
    }

    return metadataCids
  }

  async getMetadata(cid: string): Promise<NFTMetadata> {
    const response = await this.ipfs.get(cid)
    const content = new TextDecoder().decode(response.content)
    return JSON.parse(content)
  }

  async validateMetadata(cid: string): Promise<ValidationResult> {
    try {
      const metadata = await this.getMetadata(cid)
      const errors: string[] = []

      if (!metadata.name) errors.push("Missing name")
      if (!metadata.description) errors.push("Missing description")
      if (!metadata.image) errors.push("Missing image")
      if (!metadata.image.startsWith("ipfs://")) {
        errors.push("Image should be IPFS URI")
      }

      return {
        valid: errors.length === 0,
        errors,
        metadata
      }
    } catch (error) {
      return {
        valid: false,
        errors: [`Failed to fetch metadata: ${error.message}`]
      }
    }
  }
}
```

### 3. Backup & Archival Agent

Automated backup and archival of important data.

```typescript
import { IPFSOperations } from "@kynesyslabs/demosdk/ipfs"

interface BackupManifest {
  version: string
  createdAt: number
  files: Array<{
    path: string
    cid: string
    size: number
    checksum: string
  }>
  previousManifest?: string
}

class BackupArchivalAgent {
  private ipfs: IPFSOperations
  private currentManifest: string | null = null

  async createBackup(
    files: Map<string, Uint8Array>
  ): Promise<string> {
    const manifestFiles: BackupManifest["files"] = []

    // Upload each file
    for (const [path, content] of files) {
      const result = await this.ipfs.add(content, {
        cidVersion: 1
      })

      await this.ipfs.pin(result.cid)

      manifestFiles.push({
        path,
        cid: result.cid,
        size: result.size,
        checksum: await this.calculateChecksum(content)
      })
    }

    // Create manifest
    const manifest: BackupManifest = {
      version: "1.0",
      createdAt: Date.now(),
      files: manifestFiles,
      previousManifest: this.currentManifest || undefined
    }

    const manifestBuffer = new TextEncoder().encode(JSON.stringify(manifest, null, 2))
    const manifestResult = await this.ipfs.add(manifestBuffer)
    await this.ipfs.pin(manifestResult.cid)

    this.currentManifest = manifestResult.cid
    console.log(`Backup created: ${manifestResult.cid}`)

    return manifestResult.cid
  }

  async restoreBackup(manifestCid: string): Promise<Map<string, Uint8Array>> {
    const manifestResponse = await this.ipfs.get(manifestCid)
    const manifest: BackupManifest = JSON.parse(
      new TextDecoder().decode(manifestResponse.content)
    )

    const files = new Map<string, Uint8Array>()

    for (const file of manifest.files) {
      const response = await this.ipfs.get(file.cid)

      // Verify checksum
      const checksum = await this.calculateChecksum(response.content)
      if (checksum !== file.checksum) {
        throw new Error(`Checksum mismatch for ${file.path}`)
      }

      files.set(file.path, response.content)
    }

    return files
  }

  async getBackupHistory(): Promise<BackupManifest[]> {
    const history: BackupManifest[] = []
    let currentCid = this.currentManifest

    while (currentCid) {
      const response = await this.ipfs.get(currentCid)
      const manifest: BackupManifest = JSON.parse(
        new TextDecoder().decode(response.content)
      )
      history.push(manifest)
      currentCid = manifest.previousManifest || null
    }

    return history
  }

  async pruneOldBackups(keepCount: number): Promise<string[]> {
    const history = await this.getBackupHistory()
    const unpinnedCids: string[] = []

    if (history.length <= keepCount) {
      return unpinnedCids
    }

    // Unpin old backups
    for (let i = keepCount; i < history.length; i++) {
      const manifest = history[i]

      // Unpin manifest
      const manifestCid = await this.getManifestCid(manifest)
      await this.ipfs.unpin(manifestCid)
      unpinnedCids.push(manifestCid)

      // Unpin files not in newer backups
      for (const file of manifest.files) {
        const inNewerBackup = history.slice(0, keepCount).some(
          m => m.files.some(f => f.cid === file.cid)
        )
        if (!inNewerBackup) {
          await this.ipfs.unpin(file.cid)
          unpinnedCids.push(file.cid)
        }
      }
    }

    return unpinnedCids
  }

  private async calculateChecksum(data: Uint8Array): Promise<string> {
    const hashBuffer = await crypto.subtle.digest("SHA-256", data)
    return Array.from(new Uint8Array(hashBuffer))
      .map(b => b.toString(16).padStart(2, "0"))
      .join("")
  }
}
```

### 4. Content Distribution Agent

Distribute and sync content across the network.

```typescript
import { IPFSOperations } from "@kynesyslabs/demosdk/ipfs"

interface ContentManifest {
  id: string
  version: number
  rootCid: string
  files: Record<string, string> // path -> CID
  publishedAt: number
  signature: string
}

class ContentDistributionAgent {
  private ipfs: IPFSOperations
  private publishedContent: Map<string, ContentManifest> = new Map()

  async publishContent(
    contentId: string,
    files: Map<string, Uint8Array>
  ): Promise<ContentManifest> {
    const fileCids: Record<string, string> = {}

    // Upload all files
    for (const [path, content] of files) {
      const result = await this.ipfs.add(content, {
        cidVersion: 1
      })
      await this.ipfs.pin(result.cid)
      fileCids[path] = result.cid
    }

    // Create directory structure
    const dirContent = Object.entries(fileCids)
      .map(([path, cid]) => `${path}: ${cid}`)
      .join("\n")

    const dirResult = await this.ipfs.add(
      new TextEncoder().encode(dirContent),
      { wrapWithDirectory: true }
    )

    // Get existing version or start at 1
    const existing = this.publishedContent.get(contentId)
    const version = existing ? existing.version + 1 : 1

    // Create manifest
    const manifest: ContentManifest = {
      id: contentId,
      version,
      rootCid: dirResult.cid,
      files: fileCids,
      publishedAt: Date.now(),
      signature: await this.signManifest(contentId, dirResult.cid)
    }

    // Publish manifest
    const manifestBuffer = new TextEncoder().encode(JSON.stringify(manifest))
    const manifestResult = await this.ipfs.add(manifestBuffer)
    await this.ipfs.pin(manifestResult.cid)

    this.publishedContent.set(contentId, manifest)

    console.log(`Published ${contentId} v${version}: ${manifestResult.cid}`)
    return manifest
  }

  async fetchContent(manifestCid: string): Promise<Map<string, Uint8Array>> {
    // Get manifest
    const manifestResponse = await this.ipfs.get(manifestCid)
    const manifest: ContentManifest = JSON.parse(
      new TextDecoder().decode(manifestResponse.content)
    )

    // Verify signature
    const valid = await this.verifyManifest(manifest)
    if (!valid) {
      throw new Error("Invalid manifest signature")
    }

    // Fetch all files
    const files = new Map<string, Uint8Array>()
    for (const [path, cid] of Object.entries(manifest.files)) {
      const response = await this.ipfs.get(cid)
      files.set(path, response.content)
    }

    return files
  }

  async checkForUpdates(contentId: string, currentVersion: number): Promise<boolean> {
    const manifest = this.publishedContent.get(contentId)
    return manifest ? manifest.version > currentVersion : false
  }

  async getQuote(content: Uint8Array): Promise<IpfsQuoteResponse> {
    return await this.ipfs.getQuote(content.length)
  }

  private async signManifest(contentId: string, rootCid: string): Promise<string> {
    const message = `${contentId}:${rootCid}`
    return await this.demos.wallet.sign(message)
  }

  private async verifyManifest(manifest: ContentManifest): Promise<boolean> {
    const message = `${manifest.id}:${manifest.rootCid}`
    // Verification logic here
    return true
  }
}
```

## Integration Patterns

### IPFS with On-Chain Storage

```typescript
import { IPFSOperations } from "@kynesyslabs/demosdk/ipfs"
import { StorageProgram } from "@kynesyslabs/demosdk/storage"

// Store large data on IPFS, reference CID on-chain
async function storeWithOnChainReference(
  data: Uint8Array,
  key: string
): Promise<{ cid: string; onChainRef: string }> {
  const ipfs = new IPFSOperations(demos)
  const storage = new StorageProgram(demos)

  // Upload to IPFS
  const result = await ipfs.add(data)
  await ipfs.pin(result.cid)

  // Store CID reference on-chain
  await storage.write({
    key,
    value: JSON.stringify({
      cid: result.cid,
      size: result.size,
      storedAt: Date.now()
    }),
    encoding: "json"
  })

  return { cid: result.cid, onChainRef: key }
}
```

## Pricing

| Operation | Cost |
|-----------|------|
| Add | ~0.01 DEM per KB |
| Pin | ~0.001 DEM per KB/month |
| Get | Free (network retrieval) |
| Unpin | Free |

## Best Practices

1. **Always pin important content** - Unpinned content may be garbage collected
2. **Use CID v1** - More modern and flexible addressing
3. **Calculate costs first** - Use `getQuote()` before large uploads
4. **Verify checksums** - Always verify data integrity on retrieval
5. **Maintain manifests** - Track CIDs with metadata for discoverability

## Related Skills

- [On-Chain Storage Agent](./onchain-storage-agent.md) - Hybrid storage patterns
- [NFT Operations Agent](./nft-operations-agent.md) - NFT metadata management
- [Data Indexing Agent](./data-indexing-agent.md) - Index IPFS content
