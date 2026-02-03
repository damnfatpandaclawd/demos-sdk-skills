# Wallet Security Agent Skill

Build security-focused wallet agents using Demos Network's UnifiedCrypto with post-quantum cryptography (PQC) support.

## Overview

UnifiedCrypto provides a unified interface for multiple encryption and signing algorithms, including post-quantum secure algorithms - essential for building future-proof secure wallet operations.

## SDK Reference

```typescript
import { UnifiedCrypto, Cryptography, Hashing } from "@kynesyslabs/demosdk/encryption"

// Get or create crypto instance
const crypto = UnifiedCrypto.getInstance(instanceId, masterSeed)

// Key Generation
await crypto.ensureSeed(masterSeed)
await crypto.generateAllIdentities(masterSeed)
await crypto.generateIdentity(algorithm, masterSeed)
await crypto.getIdentity(algorithm)
await crypto.deriveSeed(algorithm, seed)

// Encryption (RSA & ML-KEM-AES for PQC)
await crypto.encrypt(algorithm, data, peerPublicKey)
await crypto.decrypt(encryptedObject)

// Signing (Ed25519, Falcon, ML-DSA for PQC)
await crypto.sign(algorithm, data)
await crypto.verify(signedObject)

// Instance Management
UnifiedCrypto.getInstanceIds()
UnifiedCrypto.removeInstance(instanceId)
```

## Supported Algorithms

### Signing Algorithms

| Algorithm | Type | Security | Use Case |
|-----------|------|----------|----------|
| `ed25519` | Classical | 128-bit | Standard signing |
| `falcon` | PQC | NIST Level 5 | Quantum-resistant signing |
| `ml-dsa` | PQC | NIST Level 3 | Quantum-resistant signing |

### Encryption Algorithms

| Algorithm | Type | Security | Use Case |
|-----------|------|----------|----------|
| `rsa` | Classical | 2048-bit | Standard encryption |
| `ml-kem-aes` | PQC | NIST Level 3 | Quantum-resistant encryption |

## Agent Use Cases

### 1. Quantum-Resistant Wallet Agent

Build a wallet that's secure against future quantum computers:

```typescript
class QuantumResistantWalletAgent {
  private crypto: UnifiedCrypto
  private walletId: string

  async initialize(masterSeed?: Uint8Array) {
    this.walletId = crypto.randomUUID()
    this.crypto = UnifiedCrypto.getInstance(this.walletId, masterSeed)

    // Generate identities for all algorithms
    await this.crypto.ensureSeed(masterSeed)
    await this.crypto.generateAllIdentities()

    console.log("Wallet initialized with quantum-resistant keys")
  }

  async signTransaction(transaction: Transaction): Promise<SignedTransaction> {
    const txData = new TextEncoder().encode(JSON.stringify(transaction))

    // Sign with classical Ed25519 for current compatibility
    const classicalSig = await this.crypto.sign("ed25519", txData)

    // Also sign with PQC Falcon for quantum resistance
    const pqcSig = await this.crypto.sign("falcon", txData)

    return {
      transaction,
      signatures: {
        ed25519: classicalSig,
        falcon: pqcSig
      },
      timestamp: Date.now()
    }
  }

  async encryptForRecipient(
    data: Uint8Array,
    recipientPubKey: Uint8Array,
    usePQC: boolean = true
  ): Promise<EncryptedPackage> {
    const algorithm = usePQC ? "ml-kem-aes" : "rsa"
    const encrypted = await this.crypto.encrypt(algorithm, data, recipientPubKey)

    return {
      algorithm,
      ciphertext: encrypted,
      sender: await this.getPublicKey(algorithm),
      timestamp: Date.now()
    }
  }

  async decryptFromSender(encryptedPackage: EncryptedPackage): Promise<Uint8Array> {
    return await this.crypto.decrypt(encryptedPackage.ciphertext)
  }

  async getPublicKey(algorithm: string): Promise<Uint8Array> {
    const identity = await this.crypto.getIdentity(algorithm as any)
    return identity.publicKey
  }

  destroy() {
    UnifiedCrypto.removeInstance(this.walletId)
  }
}
```

### 2. Multi-Signature Wallet Agent

Implement secure multi-sig with PQC support:

```typescript
class MultiSigWalletAgent {
  private signers: Map<string, UnifiedCrypto>
  private threshold: number
  private pendingTxs: Map<string, PendingMultiSigTx>

  async addSigner(signerId: string, publicKeys: SignerPublicKeys) {
    this.signers.set(signerId, {
      ed25519: publicKeys.ed25519,
      falcon: publicKeys.falcon,
      mlDsa: publicKeys.mlDsa
    })
  }

  async proposeTransaction(
    transaction: Transaction,
    proposerId: string
  ): Promise<string> {
    const txId = crypto.randomUUID()

    // Hash transaction for signing
    const txHash = await this.hashTransaction(transaction)

    this.pendingTxs.set(txId, {
      txId,
      transaction,
      txHash,
      proposer: proposerId,
      signatures: [],
      createdAt: Date.now(),
      status: "pending"
    })

    return txId
  }

  async signTransaction(
    txId: string,
    signerId: string,
    crypto: UnifiedCrypto
  ): Promise<SignResult> {
    const pendingTx = this.pendingTxs.get(txId)
    if (!pendingTx) throw new Error("Transaction not found")

    const signerPubKeys = this.signers.get(signerId)
    if (!signerPubKeys) throw new Error("Signer not authorized")

    // Sign with both classical and PQC algorithms
    const signatures = {
      ed25519: await crypto.sign("ed25519", pendingTx.txHash),
      falcon: await crypto.sign("falcon", pendingTx.txHash)
    }

    // Verify signatures before accepting
    const verified = await Promise.all([
      crypto.verify(signatures.ed25519),
      crypto.verify(signatures.falcon)
    ])

    if (!verified.every(v => v)) {
      throw new Error("Signature verification failed")
    }

    pendingTx.signatures.push({
      signerId,
      signatures,
      timestamp: Date.now()
    })

    // Check if threshold met
    if (pendingTx.signatures.length >= this.threshold) {
      pendingTx.status = "ready"
      return { status: "ready", signaturesCollected: pendingTx.signatures.length }
    }

    return {
      status: "pending",
      signaturesCollected: pendingTx.signatures.length,
      signaturesNeeded: this.threshold - pendingTx.signatures.length
    }
  }

  async executeTransaction(txId: string): Promise<ExecutionResult> {
    const pendingTx = this.pendingTxs.get(txId)
    if (!pendingTx || pendingTx.status !== "ready") {
      throw new Error("Transaction not ready for execution")
    }

    // Verify all signatures again before execution
    for (const sigData of pendingTx.signatures) {
      const signerKeys = this.signers.get(sigData.signerId)

      const verifications = await Promise.all([
        this.verifyWithPublicKey(sigData.signatures.ed25519, signerKeys.ed25519),
        this.verifyWithPublicKey(sigData.signatures.falcon, signerKeys.falcon)
      ])

      if (!verifications.every(v => v)) {
        throw new Error(`Invalid signature from signer ${sigData.signerId}`)
      }
    }

    // Execute the transaction
    const result = await this.broadcastTransaction(pendingTx)

    pendingTx.status = "executed"
    pendingTx.executionResult = result

    return result
  }
}
```

### 3. Key Recovery Agent

Secure key backup and recovery with encryption:

```typescript
class KeyRecoveryAgent {
  private crypto: UnifiedCrypto

  async createBackup(
    masterSeed: Uint8Array,
    guardians: Guardian[]
  ): Promise<BackupShares> {
    // Split master seed using Shamir's Secret Sharing
    const shares = await this.splitSecret(masterSeed, {
      totalShares: guardians.length,
      threshold: Math.ceil(guardians.length * 0.6) // 60% threshold
    })

    // Encrypt each share for its guardian using PQC
    const encryptedShares = await Promise.all(
      guardians.map(async (guardian, i) => {
        const encrypted = await this.crypto.encrypt(
          "ml-kem-aes",
          shares[i],
          guardian.publicKey
        )

        return {
          guardianId: guardian.id,
          encryptedShare: encrypted,
          index: i
        }
      })
    )

    // Create verification hash
    const verificationHash = await Hashing.hash(masterSeed)

    return {
      shares: encryptedShares,
      threshold: Math.ceil(guardians.length * 0.6),
      totalShares: guardians.length,
      verificationHash,
      createdAt: Date.now()
    }
  }

  async initiateRecovery(
    backupInfo: BackupInfo
  ): Promise<RecoverySession> {
    const sessionId = crypto.randomUUID()

    return {
      sessionId,
      threshold: backupInfo.threshold,
      collectedShares: [],
      status: "collecting",
      verificationHash: backupInfo.verificationHash,
      expiresAt: Date.now() + (24 * 60 * 60 * 1000) // 24 hours
    }
  }

  async submitRecoveryShare(
    sessionId: string,
    guardianId: string,
    encryptedShare: EncryptedObject,
    guardianPrivateKey: Uint8Array
  ): Promise<RecoveryProgress> {
    const session = await this.getSession(sessionId)

    // Decrypt share
    const guardianCrypto = UnifiedCrypto.getInstance(guardianId)
    const share = await guardianCrypto.decrypt(encryptedShare)

    session.collectedShares.push({
      guardianId,
      share,
      submittedAt: Date.now()
    })

    // Check if threshold met
    if (session.collectedShares.length >= session.threshold) {
      // Attempt reconstruction
      const reconstructed = await this.reconstructSecret(
        session.collectedShares.map(s => s.share)
      )

      // Verify reconstruction
      const verifyHash = await Hashing.hash(reconstructed)
      if (verifyHash.toString() === session.verificationHash.toString()) {
        session.status = "complete"
        return {
          status: "complete",
          recoveredSeed: reconstructed
        }
      } else {
        session.status = "failed"
        return { status: "failed", error: "Verification failed" }
      }
    }

    return {
      status: "collecting",
      sharesCollected: session.collectedShares.length,
      sharesNeeded: session.threshold - session.collectedShares.length
    }
  }
}
```

### 4. Secure Message Agent

End-to-end encrypted messaging with PQC:

```typescript
class SecureMessageAgent {
  private crypto: UnifiedCrypto
  private contacts: Map<string, ContactPublicKeys>

  async sendSecureMessage(
    recipientId: string,
    message: string
  ): Promise<SecureMessage> {
    const recipient = this.contacts.get(recipientId)
    if (!recipient) throw new Error("Recipient not found")

    const messageBytes = new TextEncoder().encode(message)

    // Generate ephemeral key for forward secrecy
    const ephemeralCrypto = UnifiedCrypto.getInstance(`ephemeral-${Date.now()}`)
    await ephemeralCrypto.generateIdentity("ml-kem-aes")

    // Encrypt message with PQC
    const encrypted = await ephemeralCrypto.encrypt(
      "ml-kem-aes",
      messageBytes,
      recipient.mlKemPublicKey
    )

    // Sign with sender's key for authentication
    const signature = await this.crypto.sign("falcon", encrypted.ciphertext)

    // Clean up ephemeral key
    UnifiedCrypto.removeInstance(`ephemeral-${Date.now()}`)

    return {
      recipientId,
      encrypted,
      signature,
      ephemeralPubKey: await ephemeralCrypto.getIdentity("ml-kem-aes").then(i => i.publicKey),
      timestamp: Date.now()
    }
  }

  async receiveSecureMessage(
    message: SecureMessage,
    senderId: string
  ): Promise<string> {
    const sender = this.contacts.get(senderId)
    if (!sender) throw new Error("Sender not found")

    // Verify signature
    const signatureValid = await this.verifySignatureWithKey(
      message.signature,
      sender.falconPublicKey
    )

    if (!signatureValid) {
      throw new Error("Invalid message signature")
    }

    // Decrypt message
    const decrypted = await this.crypto.decrypt(message.encrypted)

    return new TextDecoder().decode(decrypted)
  }
}
```

### 5. Hardware Wallet Integration Agent

Bridge software and hardware wallets securely:

```typescript
class HardwareWalletAgent {
  private softwareCrypto: UnifiedCrypto
  private hardwareConnected: boolean = false

  async connectHardwareWallet(type: "ledger" | "trezor"): Promise<ConnectionResult> {
    // Hardware provides public keys, software handles PQC
    const hwConnection = await this.establishHardwareConnection(type)

    // Get hardware's Ed25519 public key
    const hwPublicKey = await hwConnection.getPublicKey()

    // Initialize software crypto for PQC operations
    this.softwareCrypto = UnifiedCrypto.getInstance("hw-bridge")
    await this.softwareCrypto.generateAllIdentities()

    this.hardwareConnected = true

    return {
      connected: true,
      hardwarePublicKey: hwPublicKey,
      pqcPublicKeys: {
        falcon: await this.softwareCrypto.getIdentity("falcon").then(i => i.publicKey),
        mlKem: await this.softwareCrypto.getIdentity("ml-kem-aes").then(i => i.publicKey)
      }
    }
  }

  async signWithHybridKeys(data: Uint8Array): Promise<HybridSignature> {
    if (!this.hardwareConnected) throw new Error("Hardware not connected")

    // Sign with hardware (classical)
    const hwSignature = await this.hardwareSign(data)

    // Sign with software PQC
    const pqcSignature = await this.softwareCrypto.sign("falcon", data)

    return {
      ed25519: hwSignature,
      falcon: pqcSignature,
      combined: await this.combineSignatures(hwSignature, pqcSignature),
      algorithm: "hybrid-ed25519-falcon"
    }
  }

  async verifyHybridSignature(
    data: Uint8Array,
    signature: HybridSignature,
    publicKeys: { ed25519: Uint8Array; falcon: Uint8Array }
  ): Promise<boolean> {
    // Both signatures must be valid
    const ed25519Valid = await this.verifyEd25519(data, signature.ed25519, publicKeys.ed25519)
    const falconValid = await this.softwareCrypto.verify({
      algorithm: "falcon",
      data,
      signature: signature.falcon.signature,
      publicKey: publicKeys.falcon
    })

    return ed25519Valid && falconValid
  }
}
```

### 6. Secure Seed Management Agent

Manage seed phrases with encryption:

```typescript
class SeedManagementAgent {
  async encryptSeedPhrase(
    seedPhrase: string,
    password: string
  ): Promise<EncryptedSeed> {
    // Derive encryption key from password
    const passwordKey = await this.deriveKeyFromPassword(password)

    // Convert seed to bytes
    const seedBytes = new TextEncoder().encode(seedPhrase)

    // Encrypt with AES-GCM
    const iv = crypto.getRandomValues(new Uint8Array(12))
    const encrypted = await crypto.subtle.encrypt(
      { name: "AES-GCM", iv },
      passwordKey,
      seedBytes
    )

    // Add integrity check
    const checksum = await Hashing.hash(seedBytes)

    return {
      encryptedSeed: new Uint8Array(encrypted),
      iv,
      checksum,
      algorithm: "AES-GCM",
      createdAt: Date.now()
    }
  }

  async decryptSeedPhrase(
    encryptedSeed: EncryptedSeed,
    password: string
  ): Promise<string> {
    const passwordKey = await this.deriveKeyFromPassword(password)

    const decrypted = await crypto.subtle.decrypt(
      { name: "AES-GCM", iv: encryptedSeed.iv },
      passwordKey,
      encryptedSeed.encryptedSeed
    )

    const seedBytes = new Uint8Array(decrypted)

    // Verify checksum
    const checksum = await Hashing.hash(seedBytes)
    if (checksum.toString() !== encryptedSeed.checksum.toString()) {
      throw new Error("Seed integrity check failed")
    }

    return new TextDecoder().decode(seedBytes)
  }

  private async deriveKeyFromPassword(password: string): Promise<CryptoKey> {
    const passwordBytes = new TextEncoder().encode(password)
    const salt = new TextEncoder().encode("demos-wallet-salt")

    const keyMaterial = await crypto.subtle.importKey(
      "raw",
      passwordBytes,
      "PBKDF2",
      false,
      ["deriveBits", "deriveKey"]
    )

    return await crypto.subtle.deriveKey(
      {
        name: "PBKDF2",
        salt,
        iterations: 100000,
        hash: "SHA-256"
      },
      keyMaterial,
      { name: "AES-GCM", length: 256 },
      false,
      ["encrypt", "decrypt"]
    )
  }
}
```

## Security Best Practices

1. **Use PQC for long-term secrets** - Falcon/ML-KEM for data that needs to stay secure for years
2. **Hybrid signatures** - Combine classical + PQC for compatibility and security
3. **Instance management** - Remove crypto instances when done to prevent key leakage
4. **Seed protection** - Never expose master seed; use derived keys for operations
5. **Forward secrecy** - Use ephemeral keys for session encryption

## Integration with DemosWork

```typescript
const securityWorkflow = new DemosWork()

// Step 1: Initialize secure context
securityWorkflow.push(new BaseOperation(
  new NativeWorkStep({
    method: "crypto.initialize",
    params: { algorithms: ["ed25519", "falcon", "ml-kem-aes"] }
  })
))

// Step 2: Sign transaction with hybrid keys
securityWorkflow.push(new BaseOperation(
  new NativeWorkStep({
    method: "crypto.signHybrid",
    params: { transaction: txData, algorithms: ["ed25519", "falcon"] }
  })
))

// Step 3: Clean up
securityWorkflow.push(new BaseOperation(
  new NativeWorkStep({
    method: "crypto.cleanup",
    params: { instanceId: "{{step1.result.instanceId}}" }
  })
))
```

## Related Skills

- [Identity Resolution](./identity-resolution-agent.md) - Identity-based encryption
- [Messaging Agent](./messaging-agent.md) - Secure peer communication
- [FHE Privacy Agent](./fhe-privacy-agent.md) - Computation on encrypted data
