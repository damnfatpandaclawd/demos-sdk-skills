# L2PS - Layer 2 Private Subnets

Private encrypted transaction processing using AES-GCM encryption within the Demos Network.

## Overview

L2PS (Layer 2 Private Subnets) enables confidential transaction processing by encrypting transaction data before it reaches the main network. Each L2PS instance provides AES-GCM authenticated encryption while maintaining compatibility with standard Demos transaction formats.

## Import

```typescript
import { L2PS } from "@kynesyslabs/demosdk/l2ps"
```

## Core Pattern

```typescript
import { L2PS } from "@kynesyslabs/demosdk/l2ps"
import { Demos } from "@kynesyslabs/demosdk/websdk"

// Create new L2PS instance (generates random keys)
const l2ps = await L2PS.create()

// Get instance identifier
const instanceId = l2ps.getId()
console.log("L2PS Instance:", instanceId)

// Encrypt a transaction
const originalTx = await demos.prepareTransaction(payload)
const encryptedTx = await l2ps.encryptTx(originalTx)

// Submit encrypted transaction
await demos.submitTransaction(encryptedTx)

// Later: decrypt to view original
const decryptedTx = await l2ps.decryptTx(encryptedTx)
```

## Key Methods

| Method | Purpose |
|--------|---------|
| `L2PS.create(privateKey?, iv?)` | Create new instance with optional keys |
| `L2PS.getInstance(id)` | Retrieve existing instance by ID |
| `L2PS.getInstances()` | List all active instances |
| `L2PS.hasInstance(id)` | Check if instance exists |
| `L2PS.removeInstance(id)` | Remove instance from registry |
| `encryptTx(tx, senderIdentity?)` | Encrypt a transaction |
| `decryptTx(encryptedTx)` | Decrypt an encrypted transaction |
| `getId()` | Get instance unique identifier |
| `getKeyFingerprint()` | Get 16-char key fingerprint |
| `setConfig(config)` | Set instance configuration |
| `getConfig()` | Get instance configuration |

## Creating L2PS Instances

### With Auto-Generated Keys

```typescript
// Generates cryptographically secure random keys
const l2ps = await L2PS.create()
```

### With Specific Keys

```typescript
// Provide your own AES key and IV
const privateKey = "your-32-byte-aes-key-here"
const iv = "your-12-byte-iv"
const l2ps = await L2PS.create(privateKey, iv)
```

## Multi-Instance Management

L2PS uses a multi-singleton pattern for managing multiple private subnets:

```typescript
// Create multiple L2PS networks
const l2ps1 = await L2PS.create()
const l2ps2 = await L2PS.create()

// Get all active instances
const allInstances = L2PS.getInstances()
console.log("Active L2PS networks:", allInstances.length)

// Retrieve specific instance
const id = l2ps1.getId()
const retrieved = L2PS.getInstance(id)

// Check existence
if (L2PS.hasInstance(id)) {
  console.log("Instance exists")
}

// Clean up
L2PS.removeInstance(id)
```

## Transaction Encryption Flow

```typescript
import { L2PS } from "@kynesyslabs/demosdk/l2ps"
import { Demos } from "@kynesyslabs/demosdk/websdk"

async function sendPrivateTransaction(demos: Demos, recipient: string, amount: bigint) {
  // 1. Create L2PS instance
  const l2ps = await L2PS.create()
  
  // 2. Prepare standard transaction
  const tx = await demos.prepareTransfer(recipient, amount)
  
  // 3. Encrypt the transaction
  const encryptedTx = await l2ps.encryptTx(tx, demos.wallet.getPublicKey())
  
  // Transaction is now type "l2psEncryptedTx"
  // Original data is AES-GCM encrypted
  
  // 4. Submit to network
  const result = await demos.submitTransaction(encryptedTx)
  
  // 5. Store L2PS instance ID for later decryption
  return {
    txHash: result.hash,
    l2psId: l2ps.getId()
  }
}
```

## Decryption & Verification

```typescript
async function decryptTransaction(l2psId: string, encryptedTx: Transaction) {
  // Retrieve the L2PS instance
  const l2ps = L2PS.getInstance(l2psId)
  if (!l2ps) {
    throw new Error("L2PS instance not found - cannot decrypt")
  }
  
  // Decrypt and verify
  try {
    const originalTx = await l2ps.decryptTx(encryptedTx)
    
    // Decryption validates:
    // - Transaction type is "l2psEncryptedTx"
    // - L2PS UID matches
    // - AES-GCM authentication passes
    // - Original transaction hash matches
    
    return originalTx
  } catch (error) {
    // Decryption failed - wrong key, tampered data, or wrong instance
    console.error("Decryption failed:", error)
    throw error
  }
}
```

## Configuration

```typescript
import { L2PSConfig } from "@kynesyslabs/demosdk/l2ps"

const config: L2PSConfig = {
  uid: "my-private-subnet",
  name: "Team Finance Subnet",
  description: "Private subnet for financial transactions"
}

const l2ps = await L2PS.create()
l2ps.setConfig(config)

// Retrieve config
const currentConfig = l2ps.getConfig()
```

## Key Identification

```typescript
const l2ps = await L2PS.create()

// Full ID (SHA-256 hash of private key)
const fullId = l2ps.getId()
console.log("Full ID:", fullId)

// Short fingerprint (first 16 chars)
const fingerprint = await l2ps.getKeyFingerprint()
console.log("Fingerprint:", fingerprint)
```

## Common Use Cases

### Private Payments
```typescript
async function privatePayment(demos: Demos, recipient: string, amount: bigint) {
  const l2ps = await L2PS.create()
  const tx = await demos.prepareTransfer(recipient, amount)
  const encrypted = await l2ps.encryptTx(tx)
  return await demos.submitTransaction(encrypted)
}
```

### Team Subnet
```typescript
// Shared L2PS for team transactions
const TEAM_KEY = process.env.TEAM_L2PS_KEY
const TEAM_IV = process.env.TEAM_L2PS_IV

async function createTeamSubnet() {
  const l2ps = await L2PS.create(TEAM_KEY, TEAM_IV)
  l2ps.setConfig({
    uid: "team-subnet",
    name: "Team Private Network"
  })
  return l2ps
}
```

### Audit Trail
```typescript
// Store encrypted transactions with decryption capability
interface PrivateTxRecord {
  encryptedTx: Transaction
  l2psId: string
  timestamp: number
}

const records: PrivateTxRecord[] = []

async function sendAndRecord(demos: Demos, tx: Transaction) {
  const l2ps = await L2PS.create()
  const encrypted = await l2ps.encryptTx(tx)
  
  records.push({
    encryptedTx: encrypted,
    l2psId: l2ps.getId(),
    timestamp: Date.now()
  })
  
  return await demos.submitTransaction(encrypted)
}
```

## Security Features

| Feature | Description |
|---------|-------------|
| **AES-GCM** | Authenticated encryption with integrity verification |
| **Random Keys** | Cryptographically secure key generation |
| **SHA-256 ID** | Instance identification via key hash |
| **Hash Verification** | Original transaction hash validated on decrypt |
| **Type Validation** | Ensures correct transaction type before processing |

## Error Handling

```typescript
try {
  const decrypted = await l2ps.decryptTx(encryptedTx)
} catch (error) {
  if (error.message.includes("not l2psEncryptedTx")) {
    // Wrong transaction type
  } else if (error.message.includes("wrong L2PS UID")) {
    // Transaction encrypted with different L2PS instance
  } else if (error.message.includes("authentication")) {
    // AES-GCM auth failed - tampered or wrong key
  } else if (error.message.includes("hash mismatch")) {
    // Original transaction was modified
  }
}
```

## Best Practices

1. **Secure Key Storage** - Store L2PS keys securely, loss means permanent data loss
2. **Instance Management** - Remove unused instances to prevent memory leaks
3. **Key Backup** - Back up private keys for critical subnets
4. **Separate Subnets** - Use different L2PS instances for different purposes
5. **Audit Logging** - Track L2PS instance IDs with transactions for later decryption

## Quick Reference

| Task | Code |
|------|------|
| Create instance | `await L2PS.create()` |
| Encrypt tx | `await l2ps.encryptTx(tx)` |
| Decrypt tx | `await l2ps.decryptTx(encryptedTx)` |
| Get ID | `l2ps.getId()` |
| Retrieve instance | `L2PS.getInstance(id)` |
| List all | `L2PS.getInstances()` |
| Remove | `L2PS.removeInstance(id)` |
