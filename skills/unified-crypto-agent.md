# Unified Crypto Agent

> **⚠️ Prerequisites**: Complete [SDK Setup](./00-sdk-setup.md) first to configure your environment.

Build agents with comprehensive cryptographic capabilities including PQC, RSA, Ed25519, and FHE through a unified interface.

## SDK Reference

```typescript
import {
  UnifiedCrypto,
  getUnifiedCryptoInstance,
  hexToUint8Array,
  uint8ArrayToHex
} from "@kynesyslabs/demosdk/encryption"
```

### Core Class

| Class | Purpose |
|-------|---------|
| `UnifiedCrypto` | Unified interface for all encryption algorithms |

### Supported Algorithms

| Type | Algorithms |
|------|------------|
| **Signing** | `ed25519`, `falcon`, `ml-dsa` |
| **Encryption** | `rsa`, `ml-kem-aes` |
| **PQC** | Falcon, ML-DSA (post-quantum safe) |

### Key Methods

```typescript
class UnifiedCrypto {
  // Identity Management
  generateIdentity(algorithm: Algorithm): Promise<void>
  generateAllIdentities(masterSeed?: Uint8Array): Promise<void>
  getIdentity(algorithm: Algorithm): Promise<KeyPair>

  // Encryption/Decryption
  encrypt(algorithm: EncAlgorithm, data: Uint8Array, peerPublicKey: Uint8Array): Promise<encryptedObject>
  decrypt(encryptedObject: encryptedObject): Promise<Uint8Array>

  // Signing/Verification
  sign(algorithm: SignAlgorithm, data: Uint8Array): Promise<signedObject>
  verify(signedObject: signedObject): Promise<boolean>

  // Seed Management
  ensureSeed(masterSeed?: Uint8Array): Promise<void>
  deriveSeed(algorithm: Algorithm, seed?: Uint8Array): Promise<Uint8Array>

  // Instance Management
  static getInstance(instanceId?: string, masterSeed?: Uint8Array): UnifiedCrypto
  static getInstanceIds(): string[]
  static removeInstance(instanceId: string): boolean
}
```

## Use Cases

### 1. Multi-Algorithm Signing Agent

Sign messages with multiple algorithms for enhanced security.

```typescript
import { UnifiedCrypto, getUnifiedCryptoInstance } from "@kynesyslabs/demosdk/encryption"

interface MultiSignature {
  message: string
  signatures: {
    ed25519?: signedObject
    falcon?: signedObject
    mlDsa?: signedObject
  }
  timestamp: number
}

class MultiAlgorithmSigningAgent {
  private crypto: UnifiedCrypto

  async initialize(masterSeed?: Uint8Array): Promise<void> {
    this.crypto = getUnifiedCryptoInstance("signing-agent", masterSeed)

    // Generate all signing identities
    await this.crypto.generateIdentity("ed25519")
    await this.crypto.generateIdentity("falcon")
    await this.crypto.generateIdentity("ml-dsa")

    console.log("All signing identities generated")
  }

  async signWithAll(message: string): Promise<MultiSignature> {
    const data = new TextEncoder().encode(message)

    const [ed25519Sig, falconSig, mlDsaSig] = await Promise.all([
      this.crypto.sign("ed25519", data),
      this.crypto.sign("falcon", data),
      this.crypto.sign("ml-dsa", data)
    ])

    return {
      message,
      signatures: {
        ed25519: ed25519Sig,
        falcon: falconSig,
        mlDsa: mlDsaSig
      },
      timestamp: Date.now()
    }
  }

  async signWithPQC(message: string): Promise<MultiSignature> {
    // Post-quantum safe signatures only
    const data = new TextEncoder().encode(message)

    const [falconSig, mlDsaSig] = await Promise.all([
      this.crypto.sign("falcon", data),
      this.crypto.sign("ml-dsa", data)
    ])

    return {
      message,
      signatures: {
        falcon: falconSig,
        mlDsa: mlDsaSig
      },
      timestamp: Date.now()
    }
  }

  async verifyMultiSignature(multiSig: MultiSignature): Promise<VerificationResult> {
    const results: Record<string, boolean> = {}

    for (const [algo, signedObj] of Object.entries(multiSig.signatures)) {
      if (signedObj) {
        results[algo] = await this.crypto.verify(signedObj)
      }
    }

    const allValid = Object.values(results).every(v => v === true)
    const validCount = Object.values(results).filter(v => v === true).length

    return {
      allValid,
      validCount,
      totalCount: Object.keys(results).length,
      details: results
    }
  }

  async getPublicKeys(): Promise<Record<string, string>> {
    const keys: Record<string, string> = {}

    for (const algo of ["ed25519", "falcon", "ml-dsa"] as const) {
      const identity = await this.crypto.getIdentity(algo)
      keys[algo] = uint8ArrayToHex(identity.publicKey as Uint8Array)
    }

    return keys
  }
}
```

### 2. Hybrid Encryption Agent

Combine classical and post-quantum encryption for quantum-resistant security.

```typescript
import { UnifiedCrypto } from "@kynesyslabs/demosdk/encryption"

interface HybridEncryptedMessage {
  rsaEncrypted: encryptedObject
  mlKemEncrypted: encryptedObject
  combinedHash: string
}

class HybridEncryptionAgent {
  private crypto: UnifiedCrypto

  async initialize(masterSeed?: Uint8Array): Promise<void> {
    this.crypto = UnifiedCrypto.getInstance("hybrid-agent", masterSeed)

    await this.crypto.generateIdentity("rsa")
    await this.crypto.generateIdentity("ml-kem-aes")
  }

  async hybridEncrypt(
    data: Uint8Array,
    peerRsaPublicKey: Uint8Array,
    peerMlKemPublicKey: Uint8Array
  ): Promise<HybridEncryptedMessage> {
    // Generate random symmetric key
    const symmetricKey = crypto.getRandomValues(new Uint8Array(32))

    // Encrypt data with symmetric key
    const iv = crypto.getRandomValues(new Uint8Array(12))
    const encryptedData = await this.aesGcmEncrypt(data, symmetricKey, iv)

    // Encrypt symmetric key with both RSA and ML-KEM
    const [rsaEncrypted, mlKemEncrypted] = await Promise.all([
      this.crypto.encrypt("rsa", symmetricKey, peerRsaPublicKey),
      this.crypto.encrypt("ml-kem-aes", symmetricKey, peerMlKemPublicKey)
    ])

    // Create combined hash for integrity
    const combinedHash = await this.hashCombined(rsaEncrypted, mlKemEncrypted)

    return {
      rsaEncrypted: { ...rsaEncrypted, encryptedData, iv: uint8ArrayToHex(iv) },
      mlKemEncrypted: { ...mlKemEncrypted, encryptedData, iv: uint8ArrayToHex(iv) },
      combinedHash
    }
  }

  async hybridDecrypt(
    message: HybridEncryptedMessage,
    preferPQC: boolean = true
  ): Promise<Uint8Array> {
    let symmetricKey: Uint8Array

    try {
      if (preferPQC) {
        // Try ML-KEM first (post-quantum safe)
        symmetricKey = await this.crypto.decrypt(message.mlKemEncrypted)
      } else {
        // Try RSA first
        symmetricKey = await this.crypto.decrypt(message.rsaEncrypted)
      }
    } catch (error) {
      // Fallback to other algorithm
      symmetricKey = preferPQC
        ? await this.crypto.decrypt(message.rsaEncrypted)
        : await this.crypto.decrypt(message.mlKemEncrypted)
    }

    // Decrypt data with symmetric key
    const iv = hexToUint8Array(message.rsaEncrypted.iv)
    return await this.aesGcmDecrypt(
      message.rsaEncrypted.encryptedData,
      symmetricKey,
      iv
    )
  }

  private async aesGcmEncrypt(
    data: Uint8Array,
    key: Uint8Array,
    iv: Uint8Array
  ): Promise<Uint8Array> {
    const cryptoKey = await crypto.subtle.importKey(
      "raw", key, "AES-GCM", false, ["encrypt"]
    )
    const encrypted = await crypto.subtle.encrypt(
      { name: "AES-GCM", iv }, cryptoKey, data
    )
    return new Uint8Array(encrypted)
  }

  private async aesGcmDecrypt(
    data: Uint8Array,
    key: Uint8Array,
    iv: Uint8Array
  ): Promise<Uint8Array> {
    const cryptoKey = await crypto.subtle.importKey(
      "raw", key, "AES-GCM", false, ["decrypt"]
    )
    const decrypted = await crypto.subtle.decrypt(
      { name: "AES-GCM", iv }, cryptoKey, data
    )
    return new Uint8Array(decrypted)
  }

  private async hashCombined(...objects: any[]): Promise<string> {
    const combined = JSON.stringify(objects)
    const buffer = new TextEncoder().encode(combined)
    const hash = await crypto.subtle.digest("SHA-256", buffer)
    return uint8ArrayToHex(new Uint8Array(hash))
  }
}
```

### 3. Secure Key Derivation Agent

Derive multiple keys from a master seed for hierarchical key management.

```typescript
import { UnifiedCrypto, hexToUint8Array, uint8ArrayToHex } from "@kynesyslabs/demosdk/encryption"

interface DerivedKeySet {
  instanceId: string
  purpose: string
  algorithms: string[]
  publicKeys: Record<string, string>
  derivedAt: number
}

class KeyDerivationAgent {
  private masterCrypto: UnifiedCrypto
  private derivedKeys: Map<string, DerivedKeySet> = new Map()

  async initialize(masterSeed: Uint8Array): Promise<void> {
    this.masterCrypto = UnifiedCrypto.getInstance("master", masterSeed)
    await this.masterCrypto.ensureSeed(masterSeed)
  }

  async deriveKeySet(
    purpose: string,
    algorithms: Array<"ed25519" | "falcon" | "ml-dsa" | "rsa" | "ml-kem-aes">
  ): Promise<DerivedKeySet> {
    const instanceId = `${purpose}-${Date.now()}`

    // Derive seed for this purpose
    const purposeSeed = await this.masterCrypto.deriveSeed("ed25519")

    // Create new crypto instance with derived seed
    const derivedCrypto = UnifiedCrypto.getInstance(instanceId, purposeSeed)

    // Generate identities for requested algorithms
    const publicKeys: Record<string, string> = {}

    for (const algo of algorithms) {
      await derivedCrypto.generateIdentity(algo)
      const identity = await derivedCrypto.getIdentity(algo)
      publicKeys[algo] = uint8ArrayToHex(identity.publicKey as Uint8Array)
    }

    const keySet: DerivedKeySet = {
      instanceId,
      purpose,
      algorithms,
      publicKeys,
      derivedAt: Date.now()
    }

    this.derivedKeys.set(instanceId, keySet)
    return keySet
  }

  async signWithDerivedKey(
    instanceId: string,
    algorithm: "ed25519" | "falcon" | "ml-dsa",
    message: string
  ): Promise<signedObject> {
    const crypto = UnifiedCrypto.getInstance(instanceId)
    const data = new TextEncoder().encode(message)
    return await crypto.sign(algorithm, data)
  }

  async encryptWithDerivedKey(
    instanceId: string,
    algorithm: "rsa" | "ml-kem-aes",
    data: Uint8Array,
    peerPublicKey: Uint8Array
  ): Promise<encryptedObject> {
    const crypto = UnifiedCrypto.getInstance(instanceId)
    return await crypto.encrypt(algorithm, data, peerPublicKey)
  }

  async rotateKeySet(purpose: string): Promise<DerivedKeySet> {
    // Find existing key set
    const existing = Array.from(this.derivedKeys.values())
      .find(ks => ks.purpose === purpose)

    if (existing) {
      // Remove old instance
      UnifiedCrypto.removeInstance(existing.instanceId)
      this.derivedKeys.delete(existing.instanceId)
    }

    // Create new key set with same purpose
    return await this.deriveKeySet(
      purpose,
      existing?.algorithms || ["ed25519", "ml-kem-aes"]
    )
  }

  getActiveKeySets(): DerivedKeySet[] {
    return Array.from(this.derivedKeys.values())
  }

  async exportPublicKeys(): Promise<Record<string, Record<string, string>>> {
    const exported: Record<string, Record<string, string>> = {}

    for (const [instanceId, keySet] of this.derivedKeys) {
      exported[instanceId] = keySet.publicKeys
    }

    return exported
  }
}
```

### 4. Secure Messaging Agent

End-to-end encrypted messaging with forward secrecy.

```typescript
import { UnifiedCrypto, uint8ArrayToHex, hexToUint8Array } from "@kynesyslabs/demosdk/encryption"

interface SecureMessage {
  id: string
  encryptedContent: encryptedObject
  signature: signedObject
  ephemeralPublicKey: string
  timestamp: number
}

interface Contact {
  address: string
  rsaPublicKey: Uint8Array
  mlKemPublicKey: Uint8Array
  signingPublicKey: Uint8Array
}

class SecureMessagingAgent {
  private crypto: UnifiedCrypto
  private contacts: Map<string, Contact> = new Map()

  async initialize(masterSeed?: Uint8Array): Promise<void> {
    this.crypto = UnifiedCrypto.getInstance("messaging", masterSeed)
    await this.crypto.generateAllIdentities(masterSeed)
  }

  async getMyPublicKeys(): Promise<{
    rsa: string
    mlKem: string
    signing: string
  }> {
    const [rsa, mlKem, signing] = await Promise.all([
      this.crypto.getIdentity("rsa"),
      this.crypto.getIdentity("ml-kem-aes"),
      this.crypto.getIdentity("ed25519")
    ])

    return {
      rsa: uint8ArrayToHex(rsa.publicKey as Uint8Array),
      mlKem: uint8ArrayToHex(mlKem.publicKey as Uint8Array),
      signing: uint8ArrayToHex(signing.publicKey as Uint8Array)
    }
  }

  addContact(contact: Contact): void {
    this.contacts.set(contact.address, contact)
  }

  async sendSecureMessage(
    recipientAddress: string,
    content: string
  ): Promise<SecureMessage> {
    const contact = this.contacts.get(recipientAddress)
    if (!contact) throw new Error("Contact not found")

    // Generate ephemeral key for forward secrecy
    const ephemeralCrypto = UnifiedCrypto.getInstance(`ephemeral-${Date.now()}`)
    await ephemeralCrypto.generateIdentity("ml-kem-aes")
    const ephemeralIdentity = await ephemeralCrypto.getIdentity("ml-kem-aes")

    // Encrypt message content
    const contentBuffer = new TextEncoder().encode(content)
    const encrypted = await this.crypto.encrypt(
      "ml-kem-aes",
      contentBuffer,
      contact.mlKemPublicKey
    )

    // Sign the encrypted content
    const signature = await this.crypto.sign("ed25519", encrypted.ciphertext)

    const message: SecureMessage = {
      id: crypto.randomUUID(),
      encryptedContent: encrypted,
      signature,
      ephemeralPublicKey: uint8ArrayToHex(ephemeralIdentity.publicKey as Uint8Array),
      timestamp: Date.now()
    }

    // Cleanup ephemeral key
    UnifiedCrypto.removeInstance(`ephemeral-${Date.now()}`)

    return message
  }

  async receiveSecureMessage(
    message: SecureMessage,
    senderAddress: string
  ): Promise<string> {
    const contact = this.contacts.get(senderAddress)
    if (!contact) throw new Error("Unknown sender")

    // Verify signature
    const signedObj = {
      ...message.signature,
      publicKey: contact.signingPublicKey
    }
    const valid = await this.crypto.verify(signedObj)
    if (!valid) throw new Error("Invalid signature")

    // Decrypt content
    const decrypted = await this.crypto.decrypt(message.encryptedContent)
    return new TextDecoder().decode(decrypted)
  }

  async establishSecureChannel(
    peerAddress: string,
    peerPublicKeys: { rsa: string; mlKem: string; signing: string }
  ): Promise<void> {
    this.addContact({
      address: peerAddress,
      rsaPublicKey: hexToUint8Array(peerPublicKeys.rsa),
      mlKemPublicKey: hexToUint8Array(peerPublicKeys.mlKem),
      signingPublicKey: hexToUint8Array(peerPublicKeys.signing)
    })

    console.log(`Secure channel established with ${peerAddress}`)
  }
}
```

## Algorithm Selection Guide

| Use Case | Recommended Algorithm | Reason |
|----------|----------------------|--------|
| General signing | `ed25519` | Fast, widely supported |
| Quantum-resistant signing | `falcon` or `ml-dsa` | Post-quantum safe |
| Key exchange | `ml-kem-aes` | Quantum-resistant |
| Legacy compatibility | `rsa` | Wide support |
| Maximum security | Hybrid (RSA + ML-KEM) | Defense in depth |

## Best Practices

1. **Use deterministic seeds** - Enable key recovery with master seed
2. **Prefer PQC algorithms** - Future-proof against quantum attacks
3. **Implement hybrid encryption** - Combine classical and PQC for transition
4. **Rotate keys regularly** - Limit exposure from compromised keys
5. **Clean up ephemeral instances** - Call `removeInstance()` after use

## Related Skills

- [Wallet Security Agent](./wallet-security-agent.md) - Post-quantum wallet protection
- [Messaging Agent](./messaging-agent.md) - Encrypted P2P messaging
- [L2PS Private Subnet Agent](./l2ps-private-subnet-agent.md) - Private network encryption
