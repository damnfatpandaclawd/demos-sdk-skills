# ZK Identity Agent

> **⚠️ Prerequisites**: Complete [SDK Setup](./00-sdk-setup.md) first to configure your environment.

Build agents that leverage zero-knowledge proofs for privacy-preserving identity verification through the Demos Network.

## SDK Reference

```typescript
import {
  zK,
  CommitmentService
} from "@kynesyslabs/demosdk/encryption"
```

### Core Functions

| Function | Purpose |
|----------|---------|
| `CommitmentService.generateCommitment` | Generate identity commitment |
| `CommitmentService.generateNullifier` | Generate single-use nullifier |
| `CommitmentService.generateSecret` | Generate random secret |

### Key Concepts

Zero-knowledge identity allows proving properties about an identity without revealing the identity itself:
- **Commitment**: Hash binding identity to a secret
- **Nullifier**: Single-use proof to prevent double-spending
- **Proof**: Cryptographic evidence of identity property

## Use Cases

### 1. Anonymous Authentication Agent

Authenticate users without revealing their identity.

```typescript
import { zK } from "@kynesyslabs/demosdk/encryption"

const { CommitmentService } = zK.identity

interface IdentityCommitment {
  commitment: string
  nullifierHash: string
  timestamp: number
}

interface AuthProof {
  nullifier: string
  proof: string
  publicSignals: string[]
}

class AnonymousAuthAgent {
  private commitments: Map<string, IdentityCommitment> = new Map()
  private usedNullifiers: Set<string> = new Set()

  async registerIdentity(
    identityId: string,
    userSecret?: string
  ): Promise<{ commitment: string; secret: string }> {
    // Generate secret if not provided
    const secret = userSecret || CommitmentService.generateSecret()

    // Generate identity commitment
    const commitment = await CommitmentService.generateCommitment(
      identityId,
      secret
    )

    // Store commitment
    this.commitments.set(commitment, {
      commitment,
      nullifierHash: "",
      timestamp: Date.now()
    })

    console.log(`Identity registered with commitment: ${commitment.slice(0, 16)}...`)

    return { commitment, secret }
  }

  async authenticate(
    identityId: string,
    secret: string,
    scope: string
  ): Promise<AuthProof> {
    // Regenerate commitment to verify
    const commitment = await CommitmentService.generateCommitment(
      identityId,
      secret
    )

    if (!this.commitments.has(commitment)) {
      throw new Error("Identity not registered")
    }

    // Generate nullifier for this authentication scope
    const nullifier = await CommitmentService.generateNullifier(
      identityId,
      scope
    )

    if (this.usedNullifiers.has(nullifier)) {
      throw new Error("Nullifier already used - double authentication attempt")
    }

    // Generate ZK proof (simplified)
    const proof = await this.generateProof(commitment, nullifier, scope)

    // Mark nullifier as used
    this.usedNullifiers.add(nullifier)

    return {
      nullifier,
      proof,
      publicSignals: [commitment, scope]
    }
  }

  async verifyAuth(
    authProof: AuthProof,
    expectedScope: string
  ): Promise<{ valid: boolean; reason?: string }> {
    // Check nullifier hasn't been used
    if (this.usedNullifiers.has(authProof.nullifier)) {
      return { valid: false, reason: "Nullifier already used" }
    }

    // Verify scope matches
    if (!authProof.publicSignals.includes(expectedScope)) {
      return { valid: false, reason: "Scope mismatch" }
    }

    // Verify commitment exists
    const commitment = authProof.publicSignals[0]
    if (!this.commitments.has(commitment)) {
      return { valid: false, reason: "Unknown commitment" }
    }

    // Verify ZK proof (simplified)
    const proofValid = await this.verifyProof(
      authProof.proof,
      authProof.publicSignals
    )

    if (!proofValid) {
      return { valid: false, reason: "Invalid proof" }
    }

    return { valid: true }
  }

  private async generateProof(
    commitment: string,
    nullifier: string,
    scope: string
  ): Promise<string> {
    // In production, use actual ZK proving system (snarkjs, circom)
    const proofData = {
      commitment,
      nullifier,
      scope,
      timestamp: Date.now()
    }
    return Buffer.from(JSON.stringify(proofData)).toString("base64")
  }

  private async verifyProof(
    proof: string,
    publicSignals: string[]
  ): Promise<boolean> {
    // In production, use actual ZK verification
    try {
      const proofData = JSON.parse(Buffer.from(proof, "base64").toString())
      return publicSignals.includes(proofData.commitment)
    } catch {
      return false
    }
  }
}
```

### 2. Anonymous Voting Agent

Conduct verifiable anonymous voting with ZK proofs.

```typescript
import { zK } from "@kynesyslabs/demosdk/encryption"

const { CommitmentService } = zK.identity

interface VoterRegistration {
  commitment: string
  groupId: string
  registeredAt: number
}

interface VoteProof {
  nullifier: string
  vote: number
  proof: string
  groupId: string
}

class AnonymousVotingAgent {
  private voterGroups: Map<string, Set<string>> = new Map()
  private usedNullifiers: Map<string, Set<string>> = new Map()
  private votes: Map<string, number[]> = new Map()

  async createVotingGroup(
    groupId: string,
    voterCommitments: string[]
  ): Promise<void> {
    const group = new Set(voterCommitments)
    this.voterGroups.set(groupId, group)
    this.usedNullifiers.set(groupId, new Set())
    this.votes.set(groupId, [])

    console.log(`Voting group ${groupId} created with ${group.size} voters`)
  }

  async registerVoter(
    voterId: string,
    groupId: string
  ): Promise<{ commitment: string; secret: string }> {
    const group = this.voterGroups.get(groupId)
    if (!group) {
      throw new Error("Voting group not found")
    }

    const secret = CommitmentService.generateSecret()
    const commitment = await CommitmentService.generateCommitment(
      voterId,
      secret
    )

    group.add(commitment)

    return { commitment, secret }
  }

  async castVote(
    voterId: string,
    secret: string,
    groupId: string,
    voteChoice: number
  ): Promise<VoteProof> {
    const group = this.voterGroups.get(groupId)
    if (!group) {
      throw new Error("Voting group not found")
    }

    // Verify voter is in group
    const commitment = await CommitmentService.generateCommitment(
      voterId,
      secret
    )

    if (!group.has(commitment)) {
      throw new Error("Voter not in group")
    }

    // Generate nullifier for this vote
    const nullifier = await CommitmentService.generateNullifier(
      voterId,
      `vote:${groupId}`
    )

    // Check nullifier hasn't been used
    const usedInGroup = this.usedNullifiers.get(groupId)!
    if (usedInGroup.has(nullifier)) {
      throw new Error("Already voted in this group")
    }

    // Generate ZK proof of group membership
    const proof = await this.generateMembershipProof(
      commitment,
      Array.from(group),
      nullifier,
      voteChoice
    )

    // Record vote and nullifier
    usedInGroup.add(nullifier)
    this.votes.get(groupId)!.push(voteChoice)

    return {
      nullifier,
      vote: voteChoice,
      proof,
      groupId
    }
  }

  async verifyVote(voteProof: VoteProof): Promise<boolean> {
    const { nullifier, groupId, proof } = voteProof

    const group = this.voterGroups.get(groupId)
    if (!group) {
      return false
    }

    // Check nullifier not reused
    const usedInGroup = this.usedNullifiers.get(groupId)!
    if (!usedInGroup.has(nullifier)) {
      // Nullifier should have been recorded when vote was cast
      return false
    }

    // Verify ZK proof
    return await this.verifyMembershipProof(proof, Array.from(group))
  }

  async getResults(groupId: string): Promise<Map<number, number>> {
    const votes = this.votes.get(groupId)
    if (!votes) {
      throw new Error("Voting group not found")
    }

    const results = new Map<number, number>()
    for (const vote of votes) {
      results.set(vote, (results.get(vote) || 0) + 1)
    }

    return results
  }

  private async generateMembershipProof(
    commitment: string,
    groupMembers: string[],
    nullifier: string,
    vote: number
  ): Promise<string> {
    // In production, use Merkle tree membership proof
    const proofData = {
      commitment,
      merkleRoot: this.computeMerkleRoot(groupMembers),
      nullifier,
      vote
    }
    return Buffer.from(JSON.stringify(proofData)).toString("base64")
  }

  private async verifyMembershipProof(
    proof: string,
    groupMembers: string[]
  ): Promise<boolean> {
    try {
      const proofData = JSON.parse(Buffer.from(proof, "base64").toString())
      const expectedRoot = this.computeMerkleRoot(groupMembers)
      return proofData.merkleRoot === expectedRoot
    } catch {
      return false
    }
  }

  private computeMerkleRoot(leaves: string[]): string {
    // Simplified Merkle root computation
    if (leaves.length === 0) return ""
    if (leaves.length === 1) return leaves[0]

    const combined = leaves.sort().join("")
    return Buffer.from(combined).toString("base64").slice(0, 64)
  }
}
```

### 3. Credential Verification Agent

Verify credentials without revealing underlying data.

```typescript
import { zK } from "@kynesyslabs/demosdk/encryption"

const { CommitmentService } = zK.identity

interface Credential {
  type: string
  issuer: string
  commitment: string
  issuedAt: number
  expiresAt?: number
}

interface CredentialProof {
  credentialType: string
  issuer: string
  proof: string
  publicSignals: string[]
}

class CredentialVerificationAgent {
  private credentials: Map<string, Credential[]> = new Map()
  private trustedIssuers: Set<string> = new Set()

  async registerIssuer(issuerId: string): Promise<void> {
    this.trustedIssuers.add(issuerId)
    console.log(`Issuer ${issuerId} registered as trusted`)
  }

  async issueCredential(
    holderId: string,
    credentialType: string,
    credentialData: any,
    issuerId: string,
    validityDays?: number
  ): Promise<{ credential: Credential; secret: string }> {
    if (!this.trustedIssuers.has(issuerId)) {
      throw new Error("Issuer not trusted")
    }

    const secret = CommitmentService.generateSecret()

    // Create commitment to credential data
    const dataString = JSON.stringify({
      type: credentialType,
      data: credentialData,
      holder: holderId
    })
    const commitment = await CommitmentService.generateCommitment(
      dataString,
      secret
    )

    const credential: Credential = {
      type: credentialType,
      issuer: issuerId,
      commitment,
      issuedAt: Date.now(),
      expiresAt: validityDays
        ? Date.now() + validityDays * 24 * 60 * 60 * 1000
        : undefined
    }

    // Store credential for holder
    const holderCreds = this.credentials.get(holderId) || []
    holderCreds.push(credential)
    this.credentials.set(holderId, holderCreds)

    return { credential, secret }
  }

  async proveCredential(
    holderId: string,
    credentialType: string,
    secret: string,
    propertyToProve: string,
    propertyValue: any
  ): Promise<CredentialProof> {
    const holderCreds = this.credentials.get(holderId) || []
    const credential = holderCreds.find(c => c.type === credentialType)

    if (!credential) {
      throw new Error("Credential not found")
    }

    // Check expiration
    if (credential.expiresAt && Date.now() > credential.expiresAt) {
      throw new Error("Credential expired")
    }

    // Generate proof of property without revealing full credential
    const proof = await this.generatePropertyProof(
      credential,
      secret,
      propertyToProve,
      propertyValue
    )

    return {
      credentialType,
      issuer: credential.issuer,
      proof,
      publicSignals: [credential.commitment, propertyToProve]
    }
  }

  async verifyCredentialProof(
    credentialProof: CredentialProof,
    expectedProperty: string,
    expectedValue?: any
  ): Promise<{ valid: boolean; reason?: string }> {
    // Check issuer is trusted
    if (!this.trustedIssuers.has(credentialProof.issuer)) {
      return { valid: false, reason: "Issuer not trusted" }
    }

    // Verify the proof
    const proofValid = await this.verifyPropertyProof(
      credentialProof.proof,
      credentialProof.publicSignals,
      expectedProperty,
      expectedValue
    )

    if (!proofValid) {
      return { valid: false, reason: "Invalid proof" }
    }

    return { valid: true }
  }

  async proveAgeOver(
    holderId: string,
    secret: string,
    minAge: number
  ): Promise<CredentialProof> {
    return await this.proveCredential(
      holderId,
      "identity",
      secret,
      "age_over",
      minAge
    )
  }

  async proveMembership(
    holderId: string,
    secret: string,
    organization: string
  ): Promise<CredentialProof> {
    return await this.proveCredential(
      holderId,
      "membership",
      secret,
      "organization",
      organization
    )
  }

  private async generatePropertyProof(
    credential: Credential,
    secret: string,
    property: string,
    value: any
  ): Promise<string> {
    // In production, use ZK circuits for range proofs, set membership, etc.
    const proofData = {
      commitment: credential.commitment,
      property,
      provenValue: value,
      timestamp: Date.now()
    }
    return Buffer.from(JSON.stringify(proofData)).toString("base64")
  }

  private async verifyPropertyProof(
    proof: string,
    publicSignals: string[],
    expectedProperty: string,
    expectedValue?: any
  ): Promise<boolean> {
    try {
      const proofData = JSON.parse(Buffer.from(proof, "base64").toString())

      if (proofData.property !== expectedProperty) {
        return false
      }

      if (expectedValue !== undefined && proofData.provenValue !== expectedValue) {
        return false
      }

      return publicSignals.includes(proofData.commitment)
    } catch {
      return false
    }
  }
}
```

### 4. Sybil-Resistant Identity Agent

Prevent sybil attacks while maintaining privacy.

```typescript
import { zK } from "@kynesyslabs/demosdk/encryption"

const { CommitmentService } = zK.identity

interface UniqueIdentity {
  commitment: string
  nullifierBase: string
  registeredAt: number
}

interface UniqueProof {
  nullifier: string
  proof: string
  scope: string
}

class SybilResistantIdentityAgent {
  private identities: Map<string, UniqueIdentity> = new Map()
  private usedNullifiers: Map<string, Set<string>> = new Map()

  async registerUniqueIdentity(
    biometricHash: string,
    userSecret?: string
  ): Promise<{ commitment: string; secret: string }> {
    const secret = userSecret || CommitmentService.generateSecret()

    // Commitment binds biometric to secret
    const commitment = await CommitmentService.generateCommitment(
      biometricHash,
      secret
    )

    // Nullifier base derived from biometric
    const nullifierBase = await CommitmentService.generateCommitment(
      biometricHash,
      "nullifier_base"
    )

    // Check for duplicate registration
    for (const identity of this.identities.values()) {
      if (identity.nullifierBase === nullifierBase) {
        throw new Error("Identity already registered")
      }
    }

    this.identities.set(commitment, {
      commitment,
      nullifierBase,
      registeredAt: Date.now()
    })

    console.log("Unique identity registered")
    return { commitment, secret }
  }

  async proveUniqueness(
    biometricHash: string,
    secret: string,
    scope: string
  ): Promise<UniqueProof> {
    // Regenerate commitment
    const commitment = await CommitmentService.generateCommitment(
      biometricHash,
      secret
    )

    const identity = this.identities.get(commitment)
    if (!identity) {
      throw new Error("Identity not registered")
    }

    // Generate scope-specific nullifier from biometric
    const nullifier = await CommitmentService.generateNullifier(
      biometricHash,
      scope
    )

    // Check nullifier hasn't been used in this scope
    const scopeNullifiers = this.usedNullifiers.get(scope) || new Set()
    if (scopeNullifiers.has(nullifier)) {
      throw new Error("Already participated in this scope")
    }

    // Generate proof of unique identity
    const proof = await this.generateUniquenessProof(
      commitment,
      nullifier,
      scope
    )

    // Record nullifier usage
    scopeNullifiers.add(nullifier)
    this.usedNullifiers.set(scope, scopeNullifiers)

    return {
      nullifier,
      proof,
      scope
    }
  }

  async verifyUniqueness(
    uniqueProof: UniqueProof
  ): Promise<{ valid: boolean; isUnique: boolean }> {
    const { nullifier, proof, scope } = uniqueProof

    // Check if nullifier was properly recorded
    const scopeNullifiers = this.usedNullifiers.get(scope)
    if (!scopeNullifiers?.has(nullifier)) {
      return { valid: false, isUnique: false }
    }

    // Verify proof
    const proofValid = await this.verifyUniquenessProof(proof)
    if (!proofValid) {
      return { valid: false, isUnique: false }
    }

    return { valid: true, isUnique: true }
  }

  async getUniqueParticipantCount(scope: string): Promise<number> {
    const scopeNullifiers = this.usedNullifiers.get(scope)
    return scopeNullifiers?.size || 0
  }

  private async generateUniquenessProof(
    commitment: string,
    nullifier: string,
    scope: string
  ): Promise<string> {
    const proofData = {
      commitment,
      nullifier,
      scope,
      timestamp: Date.now()
    }
    return Buffer.from(JSON.stringify(proofData)).toString("base64")
  }

  private async verifyUniquenessProof(proof: string): Promise<boolean> {
    try {
      const proofData = JSON.parse(Buffer.from(proof, "base64").toString())
      return this.identities.has(proofData.commitment)
    } catch {
      return false
    }
  }
}
```

## Integration with Demos CCI

```typescript
import { Demos } from "@kynesyslabs/demosdk/websdk"
import { zK } from "@kynesyslabs/demosdk/encryption"

async function linkZkIdentityToCCI(
  demos: Demos,
  zkCommitment: string,
  proof: string
): Promise<void> {
  // Link ZK identity to Demos CCI without revealing underlying identity
  await demos.identity.addZkIdentity({
    commitment: zkCommitment,
    proof,
    type: "zk_commitment"
  })

  console.log("ZK identity linked to CCI")
}
```

## Best Practices

1. **Keep secrets secure** - Never expose user secrets
2. **Use appropriate nullifiers** - Scope nullifiers to prevent cross-scope tracking
3. **Verify issuer trust** - Only accept credentials from trusted issuers
4. **Handle expiration** - Check credential validity periods
5. **Minimize public signals** - Reveal only what's necessary

## Related Skills

- [Unified Crypto Agent](./unified-crypto-agent.md) - Cryptographic operations
- [FHE Computation Agent](./fhe-computation-agent.md) - Encrypted computation
- [Identity Resolution Agent](./identity-resolution-agent.md) - CCI identity management
