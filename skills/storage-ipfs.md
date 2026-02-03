# Storage & IPFS

On-chain storage programs and decentralized file storage via IPFS integration.

## Overview

Demos provides two storage solutions:
- **StorageProgram**: On-chain JSON/binary storage with ACL controls
- **IPFSOperations**: Decentralized file storage with pinning

## Imports

```typescript
import { StorageProgram } from "@kynesyslabs/demosdk/storage"
import { IPFSOperations } from "@kynesyslabs/demosdk/ipfs"
```

---

# StorageProgram

On-chain storage with deterministic addressing and access control.

## Core Pattern

```typescript
import { StorageProgram } from "@kynesyslabs/demosdk/storage"

// Create a new storage program
const payload = StorageProgram.createStorageProgram(
  deployerAddress,           // Owner address
  "myAppConfig",             // Program name
  { version: "1.0", theme: "dark" }, // Initial data
  "json",                    // Encoding: "json" or "binary"
  { mode: "public" },        // ACL configuration
  { nonce: 42 }              // Options with nonce
)

// Submit via transaction
await demos.submitTransaction(payload)
```

## Key Methods

| Method | Purpose |
|--------|---------|
| `createStorageProgram()` | Create new storage |
| `writeStorage()` | Update storage data |
| `setField()` | Set single field |
| `appendItem()` | Add to array |
| `deleteField()` | Remove field |
| `deleteStorageProgram()` | Delete entire storage |
| `updateAccessControl()` | Change ACL |
| `getByAddress()` | Fetch by address |
| `getByOwner()` | List owner's programs |
| `getValue()` | Get specific field |

## Address Derivation

Storage addresses are deterministic:

```typescript
const address = StorageProgram.deriveStorageAddress(
  "demos1abc...",  // deployer
  "myConfig",      // name
  42,              // nonce
  "salt123"        // optional salt
)
// Returns: "stor-7a8b9c..." (40 chars after prefix)
```

## Access Control

### ACL Modes

```typescript
// Owner only (private)
const privateAcl = StorageProgram.privateACL()

// Anyone can read
const publicAcl = StorageProgram.publicACL()

// Specific addresses only
const restrictedAcl = StorageProgram.restrictedACL([
  "demos1a...",
  "demos1b..."
])

// Group-based permissions
const groupAcl = StorageProgram.groupACL({
  admins: {
    members: ["demos1admin..."],
    permissions: ["read", "write", "delete"]
  },
  editors: {
    members: ["demos1ed1...", "demos1ed2..."],
    permissions: ["read", "write"]
  },
  viewers: {
    members: ["demos1view..."],
    permissions: ["read"]
  }
})

// With blacklist
const blacklistAcl = StorageProgram.blacklistACL(
  "public",
  ["demos1spam..."]
)
```

### Check Permissions

```typescript
const canRead = StorageProgram.checkPermission(
  acl,
  ownerAddress,
  requestingAddress,
  "read"  // or "write", "delete"
)
```

## Creating Storage

### JSON Storage

```typescript
const payload = StorageProgram.createStorageProgram(
  demos.wallet.getAddress(),
  "appConfig",
  {
    version: "1.0",
    features: ["auth", "storage"],
    settings: { theme: "dark" }
  },
  "json",
  { mode: "public" },
  { nonce: await demos.getNonce() }
)
```

### Binary Storage

```typescript
const imageBase64 = Buffer.from(imageData).toString("base64")

const payload = StorageProgram.createStorageProgram(
  demos.wallet.getAddress(),
  "teamDocument",
  imageBase64,
  "binary",
  { mode: "restricted", allowed: ["demos1user..."] },
  {
    nonce: 43,
    metadata: { filename: "avatar.png", mimeType: "image/png" }
  }
)
```

## Reading Storage

```typescript
const RPC_URL = "https://demosnode.discus.sh/"

// Get all data
const program = await StorageProgram.getAll(
  RPC_URL,
  "stor-7a8b9c..."
)

// Get specific field
const value = await StorageProgram.getValue(
  RPC_URL,
  "stor-7a8b9c...",
  "settings"
)

// Check field exists
const exists = await StorageProgram.hasField(
  RPC_URL,
  "stor-7a8b9c...",
  "apiKey"
)

// List fields
const fields = await StorageProgram.getFields(
  RPC_URL,
  "stor-7a8b9c..."
)
```

## Updating Storage

```typescript
// Write entire data
const payload = StorageProgram.writeStorage(
  "stor-7a8b9c...",
  { newKey: "value", existingKey: "updated" },
  "json"
)

// Set single field
const setPayload = StorageProgram.setField(
  "stor-7a8b9c...",
  "theme",
  "light"
)

// Append to array
const appendPayload = StorageProgram.appendItem(
  "stor-7a8b9c...",
  "users",
  { name: "New User", role: "viewer" }
)

// Delete field
const deletePayload = StorageProgram.deleteField(
  "stor-7a8b9c...",
  "legacyConfig"
)
```

## Array Operations

```typescript
// Get item by index (supports negative indexing)
const first = await StorageProgram.getItem(RPC_URL, address, "users", 0)
const last = await StorageProgram.getItem(RPC_URL, address, "users", -1)

// Set item at index
const setItem = StorageProgram.setItem(address, "users", 0, { updated: true })

// Delete item
const deleteItem = StorageProgram.deleteItem(address, "users", -1)
```

## Pricing & Validation

```typescript
// Calculate fee (1 DEM per 10KB)
const fee = StorageProgram.calculateStorageFee(data, "json")

// Validate size (max 1MB)
const isValid = StorageProgram.validateSize(data, "json")

// Validate nesting (max 64 levels)
const validNesting = StorageProgram.validateNestingDepth(data)

// Get data size
const size = StorageProgram.getDataSize(data, "json")
```

---

# IPFSOperations

Decentralized file storage with pinning support.

## Core Pattern

```typescript
import { IPFSOperations } from "@kynesyslabs/demosdk/ipfs"

// Create upload payload
const payload = IPFSOperations.createAddPayload(
  Buffer.from("Hello IPFS!"),
  { filename: "hello.txt" }
)

// Submit via transaction (data type: "ipfs")
```

## Key Methods

| Method | Purpose |
|--------|---------|
| `createAddPayload()` | Upload content |
| `createPinPayload()` | Pin existing CID |
| `createUnpinPayload()` | Unpin content |
| `isValidCID()` | Validate CID format |
| `isValidContentSize()` | Check size limit |
| `encodeContent()` | Encode to base64 |
| `decodeContent()` | Decode from base64 |

## Uploading Content

### Simple Upload

```typescript
const payload = IPFSOperations.createAddPayload(
  "Hello, IPFS!",
  { filename: "hello.txt" }
)
```

### Binary Content

```typescript
const imageBuffer = fs.readFileSync("image.png")
const payload = IPFSOperations.createAddPayload(
  imageBuffer,
  {
    filename: "image.png",
    metadata: { type: "image/png" }
  }
)
```

### With Cost Control

```typescript
// Get quote first
const quote = await demos.ipfs.quote(content.length, "IPFS_ADD")

// Use custom charges
const payload = IPFSOperations.createAddPayload(
  content,
  {
    filename: "data.json",
    customCharges: { maxCostDem: quote.cost_dem }
  }
)
```

## Pinning Content

### Pin Indefinitely

```typescript
const payload = IPFSOperations.createPinPayload("QmExample...")
```

### Timed Pin

```typescript
const payload = IPFSOperations.createPinPayload("QmExample...", {
  duration: 1000000,  // ~30 days at 2.5s blocks
  metadata: { source: "user-upload" }
})
```

### With Cost Control

```typescript
const quote = await demos.ipfs.quote(fileSize, "IPFS_PIN")
const payload = IPFSOperations.createPinPayload("QmExample...", {
  fileSize: 1024,
  customCharges: { maxCostDem: quote.cost_dem }
})
```

## Unpinning

```typescript
const payload = IPFSOperations.createUnpinPayload("QmExample...")
```

## Validation

```typescript
// Validate CID format (CIDv0 or CIDv1)
IPFSOperations.isValidCID("QmExample...")  // true
IPFSOperations.isValidCID("bafyExample...")  // true
IPFSOperations.isValidCID("invalid")  // false

// Validate content size
IPFSOperations.isValidContentSize(largeBuffer)

// Get content size
const size = IPFSOperations.getContentSize(content)
```

## Encoding/Decoding

```typescript
// Encode to base64
const encoded = IPFSOperations.encodeContent("Hello")

// Decode from base64
const decoded = IPFSOperations.decodeContent(encoded)
const asString = IPFSOperations.decodeContentAsString(encoded, "utf-8")
```

## Custom Charges

```typescript
// Get quote
const quote = await demos.ipfs.quote(fileSize, "IPFS_ADD")

// Convert to custom charges
const customCharges = IPFSOperations.quoteToCustomCharges(quote)

// Or create manually
const charges = IPFSOperations.createCustomCharges(
  quote,
  "IPFS_PIN",
  1000000  // duration for PIN
)
```

---

## Complete Example

```typescript
import { StorageProgram } from "@kynesyslabs/demosdk/storage"
import { IPFSOperations } from "@kynesyslabs/demosdk/ipfs"
import { Demos } from "@kynesyslabs/demosdk/websdk"

class DataStore {
  private demos: Demos
  private rpcUrl: string
  
  constructor(demos: Demos, rpcUrl: string) {
    this.demos = demos
    this.rpcUrl = rpcUrl
  }
  
  // On-chain config storage
  async createConfig(name: string, config: object) {
    const nonce = await this.demos.getNonce()
    const payload = StorageProgram.createStorageProgram(
      this.demos.wallet.getAddress(),
      name,
      config,
      "json",
      StorageProgram.publicACL(),
      { nonce }
    )
    return await this.demos.submitTransaction(payload)
  }
  
  async getConfig(address: string) {
    return await StorageProgram.getAll(this.rpcUrl, address)
  }
  
  async updateConfig(address: string, updates: object) {
    const payload = StorageProgram.writeStorage(address, updates, "json")
    return await this.demos.submitTransaction(payload)
  }
  
  // IPFS file storage
  async uploadFile(content: Buffer, filename: string) {
    const payload = IPFSOperations.createAddPayload(content, { filename })
    return await this.demos.submitTransaction(payload)
  }
  
  async pinFile(cid: string, durationBlocks?: number) {
    const payload = IPFSOperations.createPinPayload(cid, {
      duration: durationBlocks
    })
    return await this.demos.submitTransaction(payload)
  }
}
```

## Quick Reference

### StorageProgram

| Task | Code |
|------|------|
| Create storage | `createStorageProgram(deployer, name, data, encoding, acl, opts)` |
| Write data | `writeStorage(address, data, encoding)` |
| Set field | `setField(address, field, value)` |
| Get all | `getAll(rpc, address)` |
| Get field | `getValue(rpc, address, field)` |
| Delete | `deleteStorageProgram(address)` |
| Derive address | `deriveStorageAddress(deployer, name, nonce, salt?)` |

### IPFSOperations

| Task | Code |
|------|------|
| Upload | `createAddPayload(content, { filename })` |
| Pin | `createPinPayload(cid, { duration? })` |
| Unpin | `createUnpinPayload(cid)` |
| Validate CID | `isValidCID(cid)` |
| Encode | `encodeContent(data)` |
| Decode | `decodeContent(base64)` |
