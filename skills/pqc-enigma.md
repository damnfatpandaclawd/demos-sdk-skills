# PQC Enigma - Post-Quantum Cryptography

Quantum-resistant cryptographic operations using ML-KEM, ML-DSA, and Falcon algorithms.

## Overview

The Enigma class provides post-quantum cryptographic primitives that are resistant to attacks from quantum computers. It implements NIST-standardized algorithms including ML-KEM (key encapsulation), ML-DSA (digital signatures), and Falcon (fast signatures).

## Import

```typescript
import { Enigma } from "@kynesyslabs/demosdk/encryption"
// or
import { PQC } from "@kynesyslabs/demosdk/encryption"
const { Enigma } = PQC
```

## Core Pattern

```typescript
import { Enigma } from "@kynesyslabs/demosdk/encryption"

// Create Enigma instance
const enigma = new Enigma()

// Generate key pairs
await enigma.generate_ml_kem_encryption_keypair()
await enigma.generate_ml_dsa_signing_keypair()

// Encrypt data for a recipient
const { encryptedMessage, cipherText } = await enigma.encrypt_ml_kem_aes(
  Buffer.from("Secret message"),
  recipientPublicKey
)

// Sign data
const signature = await enigma.sign_ml_dsa(
  Buffer.from("Message to sign")
)
```

## Algorithms Supported

| Algorithm | Purpose | NIST Standard |
|-----------|---------|---------------|
| **ML-KEM** | Key Encapsulation | FIPS 203 |
| **ML-DSA** | Digital Signatures | FIPS 204 |
| **Falcon** | Fast Signatures | Round 3 Finalist |

## Key Generation

### ML-KEM Encryption Keys

```typescript
const enigma = new Enigma()

// Generate with random seed
await enigma.generate_ml_kem_encryption_keypair()

// Or with deterministic seed
const seed = new Uint8Array(32)
crypto.getRandomValues(seed)
await enigma.generate_ml_kem_encryption_keypair(seed)

// Access keys
const publicKey = enigma.ml_kem_encryption_keypair.publicKey
const privateKey = enigma.ml_kem_encryption_keypair.privateKey
```

### ML-DSA Signing Keys

```typescript
// Generate signing keypair
await enigma.generate_ml_dsa_signing_keypair()

// Or with seed for determinism
await enigma.generate_ml_dsa_signing_keypair(seed)

// Access keys
const signingPublic = enigma.ml_dsa_signing_keypair.publicKey
const signingPrivate = enigma.ml_dsa_signing_keypair.privateKey
```

### Falcon Signing Keys

```typescript
// Generate Falcon keypair
await enigma.generate_falcon_signing_keypair()

// Falcon includes genKey for key generation
const { publicKey, privateKey, genKey } = enigma.falcon_signing_keypair
```

## Encryption (ML-KEM + AES)

### Encrypt Data

```typescript
const enigma = new Enigma()
const recipientEnigma = new Enigma()
await recipientEnigma.generate_ml_kem_encryption_keypair()

// Encrypt message for recipient
const message = Buffer.from("Confidential data")
const { encryptedMessage, cipherText } = await enigma.encrypt_ml_kem_aes(
  message,
  recipientEnigma.ml_kem_encryption_keypair.publicKey
)

// Send encryptedMessage and cipherText to recipient
```

### Decrypt Data

```typescript
// Recipient decrypts using their private key
const decrypted = await recipientEnigma.decrypt_ml_kem_aes(
  encryptedMessage,
  cipherText
)

console.log("Decrypted:", Buffer.from(decrypted).toString())
```

## Key Encapsulation (ML-KEM Direct)

For establishing shared secrets:

```typescript
const alice = new Enigma()
const bob = new Enigma()

// Both generate keypairs
await alice.generate_ml_kem_encryption_keypair()
await bob.generate_ml_kem_encryption_keypair()

// Alice encapsulates a shared secret for Bob
const { sharedSecret, cipherText } = await alice.encapsulate_ml_kem(
  bob.ml_kem_encryption_keypair.publicKey
)

// Bob decapsulates to get the same shared secret
const bobSharedSecret = await bob.decapsulate_ml_kem(cipherText)

// Both now have the same sharedSecret for symmetric encryption
```

## Digital Signatures

### ML-DSA Signatures

```typescript
const enigma = new Enigma()
await enigma.generate_ml_dsa_signing_keypair()

// Sign a message
const message = Buffer.from("Message to sign")
const signature = await enigma.sign_ml_dsa(message)

// Verify signature (static method)
const isValid = await Enigma.verify_ml_dsa(
  signature,
  message,
  enigma.ml_dsa_signing_keypair.publicKey
)
console.log("Valid:", isValid) // true
```

### Falcon Signatures

```typescript
const enigma = new Enigma()
await enigma.generate_falcon_signing_keypair()

// Sign a message (string input)
const message = "Message to sign"
const signature = await enigma.sign_falcon(message)

// Verify (static method)
const isValid = await Enigma.verify_falcon(
  signature,
  message,
  enigma.falcon_signing_keypair.publicKey
)
```

## Hashing

```typescript
// SHA-3-256 by default
const hash = await Enigma.hash("Data to hash")

// Specify algorithm
const sha512Hash = await Enigma.hash("Data", "sha3-512")
```

## Complete Example: Secure Messaging

```typescript
import { Enigma } from "@kynesyslabs/demosdk/encryption"

interface SecureMessage {
  encryptedContent: Uint8Array
  cipherText: Uint8Array
  signature: Uint8Array
  senderPublicKey: Uint8Array
}

class SecureMessenger {
  private enigma: Enigma
  
  constructor() {
    this.enigma = new Enigma()
  }
  
  async initialize() {
    await this.enigma.generate_ml_kem_encryption_keypair()
    await this.enigma.generate_ml_dsa_signing_keypair()
  }
  
  getPublicKeys() {
    return {
      encryption: this.enigma.ml_kem_encryption_keypair.publicKey,
      signing: this.enigma.ml_dsa_signing_keypair.publicKey
    }
  }
  
  async sendMessage(
    content: string,
    recipientEncryptionKey: Uint8Array
  ): Promise<SecureMessage> {
    const message = Buffer.from(content)
    
    // Encrypt for recipient
    const { encryptedMessage, cipherText } = await this.enigma.encrypt_ml_kem_aes(
      message,
      recipientEncryptionKey
    )
    
    // Sign the encrypted message
    const signature = await this.enigma.sign_ml_dsa(encryptedMessage)
    
    return {
      encryptedContent: encryptedMessage,
      cipherText,
      signature,
      senderPublicKey: this.enigma.ml_dsa_signing_keypair.publicKey
    }
  }
  
  async receiveMessage(msg: SecureMessage): Promise<string> {
    // Verify signature first
    const isValid = await Enigma.verify_ml_dsa(
      msg.signature,
      msg.encryptedContent,
      msg.senderPublicKey
    )
    
    if (!isValid) {
      throw new Error("Invalid signature - message may be tampered")
    }
    
    // Decrypt content
    const decrypted = await this.enigma.decrypt_ml_kem_aes(
      msg.encryptedContent,
      msg.cipherText
    )
    
    return Buffer.from(decrypted).toString()
  }
}

// Usage
const alice = new SecureMessenger()
const bob = new SecureMessenger()

await alice.initialize()
await bob.initialize()

// Alice sends to Bob
const encrypted = await alice.sendMessage(
  "Hello Bob!",
  bob.getPublicKeys().encryption
)

// Bob receives and decrypts
const decrypted = await bob.receiveMessage(encrypted)
console.log(decrypted) // "Hello Bob!"
```

## Comparing Signature Algorithms

| Feature | ML-DSA | Falcon |
|---------|--------|--------|
| **Speed** | Moderate | Fast |
| **Key Size** | Larger | Smaller |
| **Signature Size** | Larger | Smaller |
| **Security** | NIST Standard | NIST Finalist |
| **Best For** | High security | Performance |

## Key Properties

```typescript
const enigma = new Enigma()

// After key generation, access keypairs:
enigma.ml_kem_encryption_keypair // { publicKey, privateKey }
enigma.ml_dsa_signing_keypair    // { publicKey, privateKey }
enigma.falcon_signing_keypair    // { publicKey, privateKey, genKey }
enigma.ml_kem_aes_parameters     // AES parameters for ML-KEM+AES
```

## Error Handling

```typescript
try {
  const isValid = await Enigma.verify_ml_dsa(signature, message, publicKey)
  if (!isValid) {
    console.error("Signature verification failed")
  }
} catch (error) {
  console.error("Cryptographic operation failed:", error)
}
```

## Common Use Cases

### Quantum-Safe Key Exchange
```typescript
const { sharedSecret, cipherText } = await enigma.encapsulate_ml_kem(peerPublicKey)
// Use sharedSecret for AES encryption
```

### Document Signing
```typescript
const docHash = await Enigma.hash(documentContent)
const signature = await enigma.sign_ml_dsa(docHash)
```

### Identity Verification
```typescript
const challenge = crypto.randomUUID()
const proof = await enigma.sign_falcon(challenge)
// Send proof + public key for verification
```

## Best Practices

1. **Deterministic Keys** - Use seeds for reproducible key generation in testing
2. **Separate Keys** - Use different keypairs for encryption vs signing
3. **Key Rotation** - Rotate keys periodically for long-term security
4. **Hybrid Approach** - Consider combining PQC with classical crypto during transition
5. **Secure Storage** - Store private keys securely (HSM, secure enclave)

## Quick Reference

| Operation | Method |
|-----------|--------|
| Generate ML-KEM keys | `generate_ml_kem_encryption_keypair(seed?)` |
| Generate ML-DSA keys | `generate_ml_dsa_signing_keypair(seed?)` |
| Generate Falcon keys | `generate_falcon_signing_keypair(seed?)` |
| Encrypt | `encrypt_ml_kem_aes(message, publicKey)` |
| Decrypt | `decrypt_ml_kem_aes(encrypted, cipherText)` |
| Sign (ML-DSA) | `sign_ml_dsa(message)` |
| Sign (Falcon) | `sign_falcon(message)` |
| Verify ML-DSA | `Enigma.verify_ml_dsa(sig, msg, pubKey)` |
| Verify Falcon | `Enigma.verify_falcon(sig, msg, pubKey)` |
| Hash | `Enigma.hash(data, algorithm?)` |
