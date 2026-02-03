# UnifiedCrypto - Multi-Algorithm Cryptography

Unified interface for both classical (RSA, Ed25519) and post-quantum (ML-KEM, ML-DSA, Falcon) cryptographic operations.

## Overview

UnifiedCrypto provides a single API to work with multiple encryption and signing algorithms. It handles key derivation from a master seed, routing operations to the appropriate algorithm implementations, and managing encrypted/signed object formats.

## Import

```typescript
import { UnifiedCrypto, getUnifiedCryptoInstance } from "@kynesyslabs/demosdk/encryption"
// or use the singleton
import { ucrypto } from "@kynesyslabs/demosdk/encryption"
```

## Supported Algorithms

| Type | Algorithms | Use Case |
|------|------------|----------|
| **Encryption** | `ml-kem-aes`, `rsa` | Secure data exchange |
| **Signing** | `falcon`, `ml-dsa`, `ed25519` | Digital signatures |

## Core Pattern

```typescript
import { UnifiedCrypto } from "@kynesyslabs/demosdk/encryption"

// Get or create instance
const crypto = UnifiedCrypto.getInstance("my-instance")

// Generate all key pairs from master seed
await crypto.generateAllIdentities()

// Encrypt data
const encrypted = await crypto.encrypt(
  "ml-kem-aes",
  Buffer.from("Secret message"),
  recipientPublicKey
)

// Sign data
const signed = await crypto.sign(
  "ed25519",
  Buffer.from("Message to sign")
)
```

## Instance Management

### Create/Get Instance

```typescript
// With auto-generated ID
const crypto = UnifiedCrypto.getInstance()

// With specific ID
const crypto = UnifiedCrypto.getInstance("my-app-crypto")

// With master seed for deterministic keys
const seed = new Uint8Array(32)
crypto.getRandomValues(seed)
const crypto = UnifiedCrypto.getInstance("my-instance", seed)
```

### List & Remove Instances

```typescript
// Get all instance IDs
const ids = UnifiedCrypto.getInstanceIds()

// Get specific instance ID
const id = crypto.getId()

// Remove instance
UnifiedCrypto.removeInstance("my-instance")
```

## Key Generation

### Generate All Keys

```typescript
// Generate all algorithm key pairs from master seed
await crypto.generateAllIdentities()

// Or with explicit seed
await crypto.generateAllIdentities(masterSeed)
```

### Generate Specific Algorithm

```typescript
// Generate only what you need
await crypto.generateIdentity("ed25519")
await crypto.generateIdentity("ml-kem-aes")
await crypto.generateIdentity("falcon")
await crypto.generateIdentity("ml-dsa")
await crypto.generateIdentity("rsa")
```

### Get Identity/Keys

```typescript
const identity = await crypto.getIdentity("ed25519")
// { publicKey, privateKey }

const mlKemIdentity = await crypto.getIdentity("ml-kem-aes")
// { publicKey, privateKey }

const falconIdentity = await crypto.getIdentity("falcon")
// { publicKey, privateKey, genKey }
```

## Seed Management

### Master Seed

```typescript
// Ensure seed exists (generates if needed)
await crypto.ensureSeed()

// Set explicit seed
const seed = new Uint8Array(32)
crypto.getRandomValues(seed)
await crypto.ensureSeed(seed)

// Access master seed
const masterSeed = crypto.masterSeed
```

### Derive Algorithm Seeds

```typescript
// Derive seed for specific algorithm using HKDF
const ed25519Seed = await crypto.deriveSeed("ed25519")
const falconSeed = await crypto.deriveSeed("falcon")
const mlKemSeed = await crypto.deriveSeed("ml-kem-aes")
```

## Encryption

### Encrypt Data

```typescript
// Using ML-KEM + AES (post-quantum)
const encrypted = await crypto.encrypt(
  "ml-kem-aes",
  Buffer.from("Secret data"),
  recipientPublicKey
)

// Using RSA (classical)
const encryptedRsa = await crypto.encrypt(
  "rsa",
  Buffer.from("Secret data"),
  rsaPublicKey
)
```

### Decrypt Data

```typescript
// Decrypt based on algorithm in encrypted object
const decrypted = await crypto.decrypt(encrypted)
// Returns Uint8Array
```

## Signing

### Sign Data

```typescript
// Using Ed25519 (classical, fast)
const signed = await crypto.sign(
  "ed25519",
  Buffer.from("Message")
)

// Using ML-DSA (post-quantum)
const signedPqc = await crypto.sign(
  "ml-dsa",
  Buffer.from("Message")
)

// Using Falcon (post-quantum, compact)
const signedFalcon = await crypto.sign(
  "falcon",
  Buffer.from("Message")
)
```

### Verify Signature

```typescript
// Verify any signed object (algorithm auto-detected)
const isValid = await crypto.verify(signedObject)
```

## Object Formats

### Encrypted Object

```typescript
interface encryptedObject {
  algorithm: "ml-kem-aes" | "rsa"
  encryptedData: Uint8Array
  cipherText?: Uint8Array  // For ML-KEM
  publicKey: Uint8Array
}
```

### Signed Object

```typescript
interface signedObject {
  algorithm: "falcon" | "ml-dsa" | "ed25519"
  signature: Uint8Array
  message: Uint8Array
  publicKey: Uint8Array
}
```

## Complete Example

```typescript
import { UnifiedCrypto } from "@kynesyslabs/demosdk/encryption"

class SecureCommunication {
  private crypto: UnifiedCrypto
  
  async initialize(instanceId: string, masterSeed?: Uint8Array) {
    this.crypto = UnifiedCrypto.getInstance(instanceId, masterSeed)
    await this.crypto.generateAllIdentities()
  }
  
  getPublicKeys() {
    return {
      encryption: this.crypto.enigma.ml_kem_encryption_keypair.publicKey,
      signing: this.crypto.ed25519KeyPair.publicKey
    }
  }
  
  async encryptFor(
    data: string,
    recipientPublicKey: Uint8Array,
    algorithm: "ml-kem-aes" | "rsa" = "ml-kem-aes"
  ) {
    return await this.crypto.encrypt(
      algorithm,
      Buffer.from(data),
      recipientPublicKey
    )
  }
  
  async decrypt(encrypted: any): Promise<string> {
    const decrypted = await this.crypto.decrypt(encrypted)
    return Buffer.from(decrypted).toString()
  }
  
  async signMessage(
    message: string,
    algorithm: "ed25519" | "falcon" | "ml-dsa" = "ed25519"
  ) {
    return await this.crypto.sign(
      algorithm,
      Buffer.from(message)
    )
  }
  
  async verifySignature(signed: any): Promise<boolean> {
    return await this.crypto.verify(signed)
  }
}

// Usage
const alice = new SecureCommunication()
const bob = new SecureCommunication()

await alice.initialize("alice")
await bob.initialize("bob")

// Alice encrypts for Bob
const encrypted = await alice.encryptFor(
  "Hello Bob!",
  bob.getPublicKeys().encryption
)

// Bob decrypts
const message = await bob.decrypt(encrypted)
console.log(message) // "Hello Bob!"

// Alice signs
const signed = await alice.signMessage("Important document")

// Anyone can verify
const isValid = await bob.verifySignature(signed)
console.log("Valid:", isValid) // true
```

## Algorithm Comparison

| Algorithm | Type | Speed | Key Size | Quantum Safe |
|-----------|------|-------|----------|--------------|
| **ed25519** | Sign | Fast | Small | No |
| **rsa** | Encrypt | Moderate | Large | No |
| **ml-kem-aes** | Encrypt | Moderate | Large | Yes |
| **ml-dsa** | Sign | Moderate | Large | Yes |
| **falcon** | Sign | Fast | Medium | Yes |

## When to Use What

| Scenario | Recommended |
|----------|-------------|
| Quick signatures | `ed25519` |
| Future-proof encryption | `ml-kem-aes` |
| Compact PQC signatures | `falcon` |
| NIST standard PQC | `ml-dsa` |
| Legacy compatibility | `rsa` |

## Accessing Raw Key Pairs

```typescript
// Ed25519 keys
const ed25519Keys = crypto.ed25519KeyPair
// { publicKey: NativeBuffer, privateKey: NativeBuffer }

// RSA keys
const rsaKeys = crypto.rsaKeyPair
// { publicKey, privateKey } - node-forge format

// PQC via Enigma
const enigma = crypto.enigma
const mlKemKeys = enigma.ml_kem_encryption_keypair
const mlDsaKeys = enigma.ml_dsa_signing_keypair
const falconKeys = enigma.falcon_signing_keypair
```

## Error Handling

```typescript
try {
  const isValid = await crypto.verify(signedObject)
} catch (error) {
  if (error.message.includes("publicKey is not in the expected format")) {
    // Wrong key format for algorithm
  }
  console.error("Verification failed:", error)
}
```

## Best Practices

1. **Use Master Seed** - Derive all keys from one seed for backup simplicity
2. **Choose Algorithm Wisely** - PQC for long-term, classical for performance
3. **Instance Per Context** - Separate instances for separate security domains
4. **Store Seeds Securely** - Master seed loss = all keys lost
5. **Verify Before Trust** - Always verify signatures before processing

## Quick Reference

| Operation | Code |
|-----------|------|
| Get instance | `UnifiedCrypto.getInstance(id?, seed?)` |
| Generate all keys | `await crypto.generateAllIdentities()` |
| Generate one key | `await crypto.generateIdentity(algorithm)` |
| Get identity | `await crypto.getIdentity(algorithm)` |
| Encrypt | `await crypto.encrypt(algorithm, data, pubKey)` |
| Decrypt | `await crypto.decrypt(encryptedObj)` |
| Sign | `await crypto.sign(algorithm, data)` |
| Verify | `await crypto.verify(signedObj)` |
| Derive seed | `await crypto.deriveSeed(algorithm)` |
