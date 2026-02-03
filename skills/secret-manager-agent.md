# Secret Manager Agent Skill

Build agents that securely manage secrets and sensitive credentials.

## Overview

Secret Manager Agent enables secure secret storage, rotation, and distribution. Essential for API keys, database credentials, encryption keys, and any sensitive configuration that requires protection.

## SDK Reference

```typescript
import { Demos } from "@kynesyslabs/demosdk/websdk"
import { Encryption } from "@kynesyslabs/demosdk/encryption"

// Secure encryption
const encryption = new Encryption()
```

## Agent Use Cases

### 1. Encrypted Secret Store

Manage encrypted secrets with access control:

```typescript
class EncryptedSecretStore {
  private secrets: Map<string, EncryptedSecret> = new Map()
  private accessPolicies: Map<string, AccessPolicy> = new Map()
  private masterKey: CryptoKey
  private auditLog: AuditEntry[] = []

  async initialize(masterKeyMaterial: ArrayBuffer): Promise<void> {
    // Derive master key from material
    this.masterKey = await crypto.subtle.importKey(
      "raw",
      masterKeyMaterial,
      { name: "AES-GCM", length: 256 },
      false,
      ["encrypt", "decrypt"]
    )
  }

  async storeSecret(
    name: string,
    value: string,
    metadata: SecretMetadata = {}
  ): Promise<SecretReference> {
    // Generate unique encryption key for this secret
    const secretKey = await crypto.subtle.generateKey(
      { name: "AES-GCM", length: 256 },
      true,
      ["encrypt", "decrypt"]
    )

    // Encrypt the secret value
    const iv = crypto.getRandomValues(new Uint8Array(12))
    const encryptedValue = await crypto.subtle.encrypt(
      { name: "AES-GCM", iv },
      secretKey,
      new TextEncoder().encode(value)
    )

    // Encrypt the secret key with master key
    const keyIv = crypto.getRandomValues(new Uint8Array(12))
    const exportedKey = await crypto.subtle.exportKey("raw", secretKey)
    const encryptedKey = await crypto.subtle.encrypt(
      { name: "AES-GCM", iv: keyIv },
      this.masterKey,
      exportedKey
    )

    const secret: EncryptedSecret = {
      name,
      encryptedValue: new Uint8Array(encryptedValue),
      encryptedKey: new Uint8Array(encryptedKey),
      valueIv: iv,
      keyIv,
      version: 1,
      metadata: {
        ...metadata,
        createdAt: Date.now(),
        updatedAt: Date.now()
      }
    }

    this.secrets.set(name, secret)

    this.logAudit("CREATE", name, "Secret created")

    return {
      name,
      version: secret.version,
      createdAt: secret.metadata.createdAt
    }
  }

  async getSecret(
    name: string,
    requester: string
  ): Promise<string | null> {
    const secret = this.secrets.get(name)
    if (!secret) {
      this.logAudit("ACCESS_DENIED", name, "Secret not found", requester)
      return null
    }

    // Check access policy
    const hasAccess = await this.checkAccess(name, requester)
    if (!hasAccess) {
      this.logAudit("ACCESS_DENIED", name, "Access denied", requester)
      throw new Error("Access denied")
    }

    // Decrypt secret key
    const decryptedKey = await crypto.subtle.decrypt(
      { name: "AES-GCM", iv: secret.keyIv },
      this.masterKey,
      secret.encryptedKey
    )

    // Import decrypted key
    const secretKey = await crypto.subtle.importKey(
      "raw",
      decryptedKey,
      { name: "AES-GCM", length: 256 },
      false,
      ["decrypt"]
    )

    // Decrypt value
    const decryptedValue = await crypto.subtle.decrypt(
      { name: "AES-GCM", iv: secret.valueIv },
      secretKey,
      secret.encryptedValue
    )

    this.logAudit("ACCESS", name, "Secret accessed", requester)

    return new TextDecoder().decode(decryptedValue)
  }

  async rotateSecret(
    name: string,
    newValue: string
  ): Promise<SecretReference> {
    const existing = this.secrets.get(name)
    if (!existing) {
      throw new Error(`Secret ${name} not found`)
    }

    // Store previous version
    const previousVersion = {
      ...existing,
      version: existing.version
    }

    // Create new version
    const result = await this.storeSecret(name, newValue, {
      ...existing.metadata,
      previousVersion: existing.version
    })

    // Update version number
    const updated = this.secrets.get(name)!
    updated.version = existing.version + 1
    updated.metadata.rotatedAt = Date.now()

    this.logAudit("ROTATE", name, `Rotated from v${existing.version} to v${updated.version}`)

    return {
      name,
      version: updated.version,
      previousVersion: existing.version,
      rotatedAt: updated.metadata.rotatedAt
    }
  }

  async setAccessPolicy(
    secretName: string,
    policy: AccessPolicy
  ): Promise<void> {
    this.accessPolicies.set(secretName, policy)
    this.logAudit("POLICY_UPDATE", secretName, "Access policy updated")
  }

  private async checkAccess(
    secretName: string,
    requester: string
  ): Promise<boolean> {
    const policy = this.accessPolicies.get(secretName)

    if (!policy) {
      return true // No policy = allow all
    }

    // Check allowed identities
    if (policy.allowedIdentities?.includes(requester)) {
      return true
    }

    // Check allowed roles
    if (policy.allowedRoles) {
      const requesterRoles = await this.getRequesterRoles(requester)
      if (requesterRoles.some(r => policy.allowedRoles!.includes(r))) {
        return true
      }
    }

    // Check time-based access
    if (policy.timeRestrictions) {
      const now = new Date()
      const hour = now.getHours()

      if (hour < policy.timeRestrictions.startHour ||
          hour > policy.timeRestrictions.endHour) {
        return false
      }
    }

    return false
  }

  private logAudit(
    action: string,
    secretName: string,
    details: string,
    requester?: string
  ): void {
    this.auditLog.push({
      action,
      secretName,
      details,
      requester,
      timestamp: Date.now()
    })
  }

  async getAuditLog(
    filter?: AuditFilter
  ): Promise<AuditEntry[]> {
    let entries = [...this.auditLog]

    if (filter?.secretName) {
      entries = entries.filter(e => e.secretName === filter.secretName)
    }

    if (filter?.action) {
      entries = entries.filter(e => e.action === filter.action)
    }

    if (filter?.since) {
      entries = entries.filter(e => e.timestamp >= filter.since!)
    }

    return entries
  }
}
```

### 2. Secret Rotation Scheduler

Automate secret rotation on schedule:

```typescript
class SecretRotationScheduler {
  private rotationSchedules: Map<string, RotationSchedule> = new Map()
  private secretStore: EncryptedSecretStore
  private generators: Map<string, SecretGenerator> = new Map()

  async scheduleRotation(
    secretName: string,
    config: RotationConfig
  ): Promise<RotationSchedule> {
    const schedule: RotationSchedule = {
      secretName,
      frequency: config.frequency,
      lastRotation: Date.now(),
      nextRotation: this.calculateNextRotation(config.frequency),
      generator: config.generator,
      notifyBefore: config.notifyBefore || 86400000, // 24 hours
      status: "active"
    }

    this.rotationSchedules.set(secretName, schedule)

    return schedule
  }

  registerGenerator(
    name: string,
    generator: SecretGenerator
  ): void {
    this.generators.set(name, generator)
  }

  async checkAndRotate(): Promise<RotationResult[]> {
    const results: RotationResult[] = []
    const now = Date.now()

    for (const [secretName, schedule] of this.rotationSchedules) {
      if (schedule.status !== "active") continue

      // Check if rotation is due
      if (now >= schedule.nextRotation) {
        const result = await this.rotateSecret(secretName, schedule)
        results.push(result)
      }
      // Check if notification is due
      else if (now >= schedule.nextRotation - schedule.notifyBefore) {
        await this.sendRotationNotification(secretName, schedule)
      }
    }

    return results
  }

  private async rotateSecret(
    secretName: string,
    schedule: RotationSchedule
  ): Promise<RotationResult> {
    try {
      // Generate new secret
      const generator = this.generators.get(schedule.generator)
      if (!generator) {
        throw new Error(`Generator ${schedule.generator} not found`)
      }

      const newValue = await generator.generate()

      // Rotate in store
      await this.secretStore.rotateSecret(secretName, newValue)

      // Update schedule
      schedule.lastRotation = Date.now()
      schedule.nextRotation = this.calculateNextRotation(schedule.frequency)

      // Execute post-rotation hooks
      if (schedule.postRotationHook) {
        await schedule.postRotationHook(secretName, newValue)
      }

      return {
        secretName,
        success: true,
        rotatedAt: schedule.lastRotation,
        nextRotation: schedule.nextRotation
      }

    } catch (error) {
      return {
        secretName,
        success: false,
        error: (error as Error).message
      }
    }
  }

  private calculateNextRotation(frequency: RotationFrequency): number {
    const now = Date.now()

    switch (frequency) {
      case "hourly":
        return now + 3600000
      case "daily":
        return now + 86400000
      case "weekly":
        return now + 604800000
      case "monthly":
        return now + 2592000000
      case "quarterly":
        return now + 7776000000
      default:
        return now + 86400000
    }
  }

  // Built-in generators
  static readonly Generators = {
    password: {
      async generate(): Promise<string> {
        const chars = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789!@#$%^&*"
        const array = new Uint8Array(32)
        crypto.getRandomValues(array)
        return Array.from(array, b => chars[b % chars.length]).join("")
      }
    },

    apiKey: {
      async generate(): Promise<string> {
        const array = new Uint8Array(32)
        crypto.getRandomValues(array)
        return Array.from(array, b => b.toString(16).padStart(2, "0")).join("")
      }
    },

    jwtSecret: {
      async generate(): Promise<string> {
        const array = new Uint8Array(64)
        crypto.getRandomValues(array)
        return btoa(String.fromCharCode(...array))
      }
    }
  }
}
```

### 3. Distributed Secret Sync

Synchronize secrets across distributed systems:

```typescript
class DistributedSecretSync {
  private localStore: EncryptedSecretStore
  private peers: Map<string, SecretPeer> = new Map()
  private syncState: Map<string, SyncState> = new Map()

  async registerPeer(peer: SecretPeer): Promise<void> {
    this.peers.set(peer.id, peer)

    this.syncState.set(peer.id, {
      peerId: peer.id,
      lastSync: 0,
      status: "pending"
    })
  }

  async syncWithPeer(peerId: string): Promise<SyncResult> {
    const peer = this.peers.get(peerId)
    if (!peer) {
      throw new Error(`Peer ${peerId} not found`)
    }

    const syncState = this.syncState.get(peerId)!
    syncState.status = "syncing"

    try {
      // Get local secrets metadata
      const localSecrets = await this.getSecretMetadata()

      // Request peer's secrets metadata
      const peerSecrets = await this.requestPeerMetadata(peer)

      // Determine what to sync
      const toSend: string[] = []
      const toReceive: string[] = []

      for (const [name, local] of localSecrets) {
        const peerSecret = peerSecrets.get(name)

        if (!peerSecret) {
          toSend.push(name)
        } else if (local.version > peerSecret.version) {
          toSend.push(name)
        } else if (local.version < peerSecret.version) {
          toReceive.push(name)
        }
      }

      // Secrets that only peer has
      for (const name of peerSecrets.keys()) {
        if (!localSecrets.has(name)) {
          toReceive.push(name)
        }
      }

      // Execute sync
      await this.sendSecrets(peer, toSend)
      await this.receiveSecrets(peer, toReceive)

      syncState.lastSync = Date.now()
      syncState.status = "synced"

      return {
        peerId,
        success: true,
        sent: toSend.length,
        received: toReceive.length,
        syncedAt: syncState.lastSync
      }

    } catch (error) {
      syncState.status = "error"
      syncState.error = (error as Error).message

      return {
        peerId,
        success: false,
        error: syncState.error
      }
    }
  }

  private async sendSecrets(
    peer: SecretPeer,
    secretNames: string[]
  ): Promise<void> {
    for (const name of secretNames) {
      // Get encrypted secret
      const secret = await this.localStore.getEncryptedSecret(name)

      // Re-encrypt for peer using peer's public key
      const reEncrypted = await this.reEncryptForPeer(secret, peer)

      // Send to peer
      await this.messaging.send(peer.publicKey, {
        type: "secret_sync",
        secret: reEncrypted
      })
    }
  }

  private async receiveSecrets(
    peer: SecretPeer,
    secretNames: string[]
  ): Promise<void> {
    for (const name of secretNames) {
      // Request secret from peer
      const response = await this.messaging.sendRequest(
        peer.publicKey,
        {
          type: "secret_request",
          name
        }
      )

      // Decrypt and store locally
      const decrypted = await this.decryptFromPeer(response.secret, peer)
      await this.localStore.importSecret(name, decrypted)
    }
  }

  private async reEncryptForPeer(
    secret: EncryptedSecret,
    peer: SecretPeer
  ): Promise<PeerEncryptedSecret> {
    // Derive shared secret using ECDH
    const sharedSecret = await crypto.subtle.deriveBits(
      { name: "ECDH", public: peer.publicKey },
      this.privateKey,
      256
    )

    // Derive encryption key from shared secret
    const encKey = await crypto.subtle.importKey(
      "raw",
      sharedSecret,
      { name: "AES-GCM", length: 256 },
      false,
      ["encrypt"]
    )

    // Encrypt the encrypted key (double encryption)
    const iv = crypto.getRandomValues(new Uint8Array(12))
    const encryptedForPeer = await crypto.subtle.encrypt(
      { name: "AES-GCM", iv },
      encKey,
      secret.encryptedKey
    )

    return {
      name: secret.name,
      encryptedValue: secret.encryptedValue,
      encryptedKey: new Uint8Array(encryptedForPeer),
      valueIv: secret.valueIv,
      peerKeyIv: iv,
      version: secret.version,
      metadata: secret.metadata
    }
  }

  async startContinuousSync(interval: number = 60000): Promise<void> {
    setInterval(async () => {
      for (const peer of this.peers.values()) {
        if (peer.status === "connected") {
          await this.syncWithPeer(peer.id)
        }
      }
    }, interval)
  }
}
```

## Best Practices

1. **Never store secrets in plaintext** - always encrypt
2. **Implement automatic rotation** for all secrets
3. **Use envelope encryption** (encrypt keys with master key)
4. **Audit all secret access** for compliance
5. **Implement access policies** for least privilege

## Related Skills

- [Config Manager Agent](./config-manager-agent.md) - Configuration management
- [Backup Recovery Agent](./backup-recovery-agent.md) - Secret backups
- [Alert Manager Agent](./alert-manager-agent.md) - Access alerts
