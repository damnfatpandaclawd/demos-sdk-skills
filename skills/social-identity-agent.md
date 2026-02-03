# Social Identity Verification Agent Skill

Build agents that verify and manage social identities across Web2 platforms using Demos Network's identity proofs.

## Overview

Social Identity Verification enables agents to link Web2 accounts (Twitter, GitHub, Discord) to on-chain identities, creating verifiable cross-platform reputation and enabling social-gated features.

## SDK Reference

```typescript
import { Demos } from "@kynesyslabs/demosdk/websdk"
import type {
  TwitterProof,
  GithubProof,
  DiscordProof,
  Web2Identity,
  IdentityProof
} from "@kynesyslabs/demosdk/types"

// Social Identity Methods
demos.identity.addWeb2Identity(type, proof)     // Add social account
demos.identity.getWeb2Identities()              // Get all linked accounts
demos.identity.verifyWeb2Identity(type, handle) // Verify ownership
demos.identity.removeWeb2Identity(type, handle) // Unlink account

// Proof Generation
demos.identity.generateTwitterProof(tweetId)    // From verification tweet
demos.identity.generateGithubProof(gistId)      // From verification gist
demos.identity.generateDiscordProof(messageId)  // From verification message
```

## Proof Types

| Platform | Proof Method | Verification |
|----------|--------------|--------------|
| Twitter | Tweet with signature | tweetId + content match |
| GitHub | Gist with signature | gistId + content match |
| Discord | Server message | messageId + content match |

## Agent Use Cases

### 1. Identity Verification Bot

Automate social identity verification:

```typescript
class IdentityVerificationAgent {
  private demos: Demos

  async verifyTwitterIdentity(
    tweetId: string,
    expectedHandle: string
  ): Promise<VerificationResult> {
    // Fetch tweet content
    const tweet = await this.fetchTweet(tweetId)

    // Verify tweet author matches expected handle
    if (tweet.author !== expectedHandle) {
      return {
        verified: false,
        error: "Tweet author mismatch"
      }
    }

    // Extract and validate signature from tweet
    const signatureMatch = tweet.text.match(/demos:verify:([a-fA-F0-9]+)/)
    if (!signatureMatch) {
      return {
        verified: false,
        error: "No verification signature found in tweet"
      }
    }

    // Generate proof and add to identity
    const proof: TwitterProof = await this.demos.identity.generateTwitterProof(tweetId)

    // Verify the cryptographic signature
    const isValid = await this.verifySignature(
      proof.signature,
      proof.message,
      proof.publicKey
    )

    if (!isValid) {
      return {
        verified: false,
        error: "Invalid signature"
      }
    }

    // Add verified identity
    await this.demos.identity.addWeb2Identity("twitter", proof)

    return {
      verified: true,
      platform: "twitter",
      handle: expectedHandle,
      proof
    }
  }

  async verifyGithubIdentity(
    gistId: string,
    expectedUsername: string
  ): Promise<VerificationResult> {
    // Fetch gist content
    const gist = await this.fetchGist(gistId)

    // Verify gist owner
    if (gist.owner !== expectedUsername) {
      return {
        verified: false,
        error: "Gist owner mismatch"
      }
    }

    // Extract verification content
    const verificationFile = gist.files["demos-verify.txt"]
    if (!verificationFile) {
      return {
        verified: false,
        error: "Verification file not found"
      }
    }

    // Generate and validate proof
    const proof: GithubProof = await this.demos.identity.generateGithubProof(gistId)
    await this.demos.identity.addWeb2Identity("github", proof)

    return {
      verified: true,
      platform: "github",
      handle: expectedUsername,
      proof
    }
  }

  async verifyDiscordIdentity(
    serverId: string,
    channelId: string,
    messageId: string,
    expectedUserId: string
  ): Promise<VerificationResult> {
    // Fetch message from verification channel
    const message = await this.fetchDiscordMessage(serverId, channelId, messageId)

    // Verify author
    if (message.authorId !== expectedUserId) {
      return {
        verified: false,
        error: "Message author mismatch"
      }
    }

    // Generate and validate proof
    const proof: DiscordProof = await this.demos.identity.generateDiscordProof(messageId)
    await this.demos.identity.addWeb2Identity("discord", proof)

    return {
      verified: true,
      platform: "discord",
      handle: message.authorUsername,
      proof
    }
  }
}
```

### 2. Social Reputation Aggregator

Aggregate reputation across platforms:

```typescript
class SocialReputationAgent {
  private demos: Demos

  async aggregateReputation(
    demosAddress: string
  ): Promise<AggregatedReputation> {
    // Get all linked Web2 identities
    const identities = await this.demos.identity.getWeb2Identities()

    const reputation: AggregatedReputation = {
      totalScore: 0,
      platforms: {},
      metrics: {}
    }

    // Fetch metrics for each platform
    for (const identity of identities) {
      switch (identity.type) {
        case "twitter":
          reputation.platforms.twitter = await this.getTwitterMetrics(identity.handle)
          break
        case "github":
          reputation.platforms.github = await this.getGithubMetrics(identity.handle)
          break
        case "discord":
          reputation.platforms.discord = await this.getDiscordMetrics(identity.handle)
          break
      }
    }

    // Calculate composite score
    reputation.totalScore = this.calculateReputationScore(reputation.platforms)

    // Generate verification attestation
    reputation.attestation = await this.generateAttestation(
      demosAddress,
      reputation
    )

    return reputation
  }

  private async getTwitterMetrics(handle: string): Promise<TwitterMetrics> {
    const profile = await this.fetchTwitterProfile(handle)

    return {
      followers: profile.followers_count,
      following: profile.following_count,
      tweets: profile.tweet_count,
      accountAge: this.calculateAccountAge(profile.created_at),
      verified: profile.verified,
      engagement: await this.calculateEngagement(handle),
      score: this.calculateTwitterScore(profile)
    }
  }

  private async getGithubMetrics(username: string): Promise<GithubMetrics> {
    const profile = await this.fetchGithubProfile(username)
    const repos = await this.fetchGithubRepos(username)

    return {
      followers: profile.followers,
      following: profile.following,
      publicRepos: profile.public_repos,
      stars: repos.reduce((sum, r) => sum + r.stargazers_count, 0),
      contributions: await this.getContributionCount(username),
      accountAge: this.calculateAccountAge(profile.created_at),
      score: this.calculateGithubScore(profile, repos)
    }
  }

  private calculateReputationScore(
    platforms: Record<string, PlatformMetrics>
  ): number {
    const weights = {
      twitter: 0.3,
      github: 0.4,
      discord: 0.3
    }

    let totalScore = 0
    let totalWeight = 0

    for (const [platform, metrics] of Object.entries(platforms)) {
      if (metrics && weights[platform]) {
        totalScore += metrics.score * weights[platform]
        totalWeight += weights[platform]
      }
    }

    return totalWeight > 0 ? Math.round(totalScore / totalWeight) : 0
  }
}
```

### 3. Social Gating Agent

Implement social-gated access control:

```typescript
class SocialGatingAgent {
  private demos: Demos

  async checkAccess(
    demosAddress: string,
    requirements: AccessRequirements
  ): Promise<AccessCheckResult> {
    // Get user's verified identities
    const identities = await this.demos.identity.getWeb2Identities()

    const checks: AccessCheck[] = []

    // Check platform requirements
    if (requirements.platforms) {
      for (const platform of requirements.platforms) {
        const hasIdentity = identities.some(i => i.type === platform)
        checks.push({
          type: "platform",
          requirement: platform,
          passed: hasIdentity
        })
      }
    }

    // Check follower requirements
    if (requirements.minFollowers) {
      for (const [platform, minCount] of Object.entries(requirements.minFollowers)) {
        const identity = identities.find(i => i.type === platform)
        if (identity) {
          const metrics = await this.getMetrics(platform, identity.handle)
          checks.push({
            type: "followers",
            platform,
            requirement: minCount,
            actual: metrics.followers,
            passed: metrics.followers >= minCount
          })
        } else {
          checks.push({
            type: "followers",
            platform,
            requirement: minCount,
            passed: false,
            reason: "Platform not linked"
          })
        }
      }
    }

    // Check account age requirements
    if (requirements.minAccountAge) {
      for (const [platform, minDays] of Object.entries(requirements.minAccountAge)) {
        const identity = identities.find(i => i.type === platform)
        if (identity) {
          const metrics = await this.getMetrics(platform, identity.handle)
          checks.push({
            type: "accountAge",
            platform,
            requirement: minDays,
            actual: metrics.accountAge,
            passed: metrics.accountAge >= minDays
          })
        }
      }
    }

    // Check specific handle requirements
    if (requirements.allowedHandles) {
      for (const [platform, handles] of Object.entries(requirements.allowedHandles)) {
        const identity = identities.find(i => i.type === platform)
        checks.push({
          type: "allowlist",
          platform,
          passed: identity ? handles.includes(identity.handle) : false
        })
      }
    }

    // Determine overall access
    const allPassed = checks.every(c => c.passed)

    return {
      granted: allPassed,
      checks,
      missingRequirements: checks.filter(c => !c.passed)
    }
  }

  async createGatedContent(
    content: any,
    requirements: AccessRequirements
  ): Promise<GatedContent> {
    // Encrypt content
    const encrypted = await this.encryptContent(content)

    // Store access requirements
    const gateId = await this.storeGate({
      encryptedContent: encrypted,
      requirements,
      createdAt: Date.now()
    })

    return {
      gateId,
      requirements,
      accessEndpoint: `/api/gated/${gateId}`
    }
  }
}
```

### 4. Cross-Platform Notification Agent

Send notifications across verified platforms:

```typescript
class CrossPlatformNotificationAgent {
  private demos: Demos

  async sendNotification(
    demosAddress: string,
    notification: Notification
  ): Promise<NotificationResult> {
    // Get user's linked identities
    const identities = await this.demos.identity.getWeb2Identities()

    const results: PlatformNotificationResult[] = []

    // Determine which platforms to use based on notification type
    const targetPlatforms = this.selectPlatforms(
      notification.type,
      notification.priority,
      identities
    )

    for (const platform of targetPlatforms) {
      const identity = identities.find(i => i.type === platform)
      if (!identity) continue

      try {
        switch (platform) {
          case "twitter":
            results.push(await this.sendTwitterDM(identity.handle, notification))
            break
          case "discord":
            results.push(await this.sendDiscordDM(identity.handle, notification))
            break
          case "github":
            results.push(await this.createGithubIssue(identity.handle, notification))
            break
        }
      } catch (error) {
        results.push({
          platform,
          success: false,
          error: error.message
        })
      }
    }

    return {
      notification,
      results,
      successCount: results.filter(r => r.success).length
    }
  }

  private selectPlatforms(
    type: NotificationType,
    priority: Priority,
    identities: Web2Identity[]
  ): string[] {
    const platformPriority = {
      urgent: ["discord", "twitter"],  // Real-time platforms first
      normal: ["discord", "github"],
      low: ["github"]
    }

    const available = identities.map(i => i.type)
    return platformPriority[priority].filter(p => available.includes(p))
  }
}
```

### 5. Social Recovery Agent

Implement social recovery for wallets:

```typescript
class SocialRecoveryAgent {
  private demos: Demos

  async setupRecovery(
    guardians: SocialGuardian[]
  ): Promise<RecoverySetup> {
    // Verify each guardian has valid social identity
    const verifiedGuardians: VerifiedGuardian[] = []

    for (const guardian of guardians) {
      const isVerified = await this.verifyGuardianIdentity(guardian)

      if (isVerified) {
        verifiedGuardians.push({
          ...guardian,
          verifiedAt: Date.now(),
          publicKey: await this.getGuardianPublicKey(guardian)
        })
      }
    }

    if (verifiedGuardians.length < 2) {
      throw new Error("At least 2 verified guardians required")
    }

    // Generate recovery shares using Shamir's Secret Sharing
    const threshold = Math.ceil(verifiedGuardians.length * 0.6) // 60% threshold
    const shares = await this.generateShares(
      verifiedGuardians.length,
      threshold
    )

    // Distribute shares to guardians via their social platforms
    for (let i = 0; i < verifiedGuardians.length; i++) {
      await this.distributeShare(verifiedGuardians[i], shares[i])
    }

    return {
      guardians: verifiedGuardians.map(g => ({
        platform: g.platform,
        handle: g.handle,
        hasShare: true
      })),
      threshold,
      setupAt: Date.now()
    }
  }

  async initiateRecovery(
    lostAddress: string
  ): Promise<RecoverySession> {
    // Get recovery setup
    const setup = await this.getRecoverySetup(lostAddress)

    // Create recovery session
    const session: RecoverySession = {
      id: this.generateSessionId(),
      lostAddress,
      threshold: setup.threshold,
      guardians: setup.guardians,
      collectedShares: [],
      status: "pending",
      createdAt: Date.now(),
      expiresAt: Date.now() + 7 * 24 * 60 * 60 * 1000 // 7 days
    }

    // Notify guardians across their social platforms
    for (const guardian of setup.guardians) {
      await this.notifyGuardian(guardian, session)
    }

    return session
  }

  async submitRecoveryApproval(
    sessionId: string,
    guardian: SocialGuardian,
    share: string
  ): Promise<RecoveryStatus> {
    const session = await this.getSession(sessionId)

    // Verify guardian identity
    const isValid = await this.verifyGuardianIdentity(guardian)
    if (!isValid) {
      throw new Error("Guardian identity verification failed")
    }

    // Add share
    session.collectedShares.push({
      guardian,
      share,
      submittedAt: Date.now()
    })

    // Check if threshold met
    if (session.collectedShares.length >= session.threshold) {
      // Reconstruct secret and execute recovery
      const recovered = await this.reconstructAndRecover(session)
      session.status = "completed"
      session.newAddress = recovered.newAddress
    }

    return {
      sessionId,
      sharesCollected: session.collectedShares.length,
      threshold: session.threshold,
      status: session.status
    }
  }
}
```

### 6. Identity Attestation Agent

Create verifiable identity attestations:

```typescript
class IdentityAttestationAgent {
  private demos: Demos

  async createAttestation(
    demosAddress: string,
    claims: IdentityClaim[]
  ): Promise<Attestation> {
    // Get and verify all linked identities
    const identities = await this.demos.identity.getWeb2Identities()

    const verifiedClaims: VerifiedClaim[] = []

    for (const claim of claims) {
      const identity = identities.find(
        i => i.type === claim.platform && i.handle === claim.handle
      )

      if (!identity) {
        continue
      }

      // Re-verify identity is still valid
      const stillValid = await this.demos.identity.verifyWeb2Identity(
        claim.platform,
        claim.handle
      )

      if (stillValid) {
        verifiedClaims.push({
          ...claim,
          verified: true,
          verifiedAt: Date.now(),
          proof: identity.proof
        })
      }
    }

    // Create attestation document
    const attestation: Attestation = {
      id: this.generateAttestationId(),
      subject: demosAddress,
      claims: verifiedClaims,
      issuedAt: Date.now(),
      expiresAt: Date.now() + 30 * 24 * 60 * 60 * 1000, // 30 days
      issuer: await this.demos.wallet.getAddress()
    }

    // Sign attestation
    attestation.signature = await this.demos.wallet.sign(
      JSON.stringify({
        id: attestation.id,
        subject: attestation.subject,
        claims: attestation.claims,
        issuedAt: attestation.issuedAt,
        expiresAt: attestation.expiresAt
      })
    )

    // Store attestation
    await this.storeAttestation(attestation)

    return attestation
  }

  async verifyAttestation(
    attestationId: string
  ): Promise<AttestationVerification> {
    const attestation = await this.getAttestation(attestationId)

    // Check expiration
    if (Date.now() > attestation.expiresAt) {
      return { valid: false, reason: "Attestation expired" }
    }

    // Verify signature
    const isValidSignature = await this.verifySignature(
      attestation.signature,
      attestation
    )

    if (!isValidSignature) {
      return { valid: false, reason: "Invalid signature" }
    }

    // Re-verify claims are still valid
    const claimVerifications = await Promise.all(
      attestation.claims.map(async (claim) => {
        const stillValid = await this.demos.identity.verifyWeb2Identity(
          claim.platform,
          claim.handle
        )
        return { claim, stillValid }
      })
    )

    const invalidClaims = claimVerifications.filter(v => !v.stillValid)

    return {
      valid: invalidClaims.length === 0,
      attestation,
      invalidClaims: invalidClaims.map(v => v.claim),
      verifiedAt: Date.now()
    }
  }
}
```

## Error Handling

```typescript
try {
  await demos.identity.addWeb2Identity("twitter", proof)
} catch (error) {
  switch (error.code) {
    case 'IDENTITY_ALREADY_LINKED':
      // This social account is already linked to another Demos address
      break
    case 'INVALID_PROOF':
      // Proof signature or content is invalid
      break
    case 'PROOF_EXPIRED':
      // Verification proof has expired
      break
    case 'PLATFORM_UNAVAILABLE':
      // Social platform API is unavailable
      break
  }
}
```

## Best Practices

1. **Re-verify periodically** - Social account ownership can change
2. **Handle deactivated accounts** - Users may delete their social accounts
3. **Cache verification results** - Reduce API calls to social platforms
4. **Use multi-platform verification** - Require multiple platforms for sensitive operations
5. **Implement rate limiting** - Social APIs have strict rate limits

## Integration with DemosWork

```typescript
const identityWorkflow = new DemosWork()

// Step 1: Generate verification content
identityWorkflow.push(new BaseOperation(
  new NativeWorkStep({
    method: "identity.generateVerificationContent",
    params: { platform: "twitter" }
  })
))

// Step 2: Wait for user to post verification
identityWorkflow.push(new BaseOperation(
  new Web2WorkStep({
    url: "https://api.example.com/await-verification",
    method: "POST",
    body: { platform: "twitter", content: "{{step1.result}}" }
  })
))

// Step 3: Verify the posted content
identityWorkflow.push(new BaseOperation(
  new NativeWorkStep({
    method: "identity.verifyWeb2Identity",
    params: {
      platform: "twitter",
      proofId: "{{step2.result.tweetId}}"
    }
  })
))
```

## Related Skills

- [ZK Identity Agent](./zk-identity-agent.md) - Zero-knowledge identity proofs
- [Cross-Context Identity](./cci-identity-agent.md) - Universal identity management
- [Token Gating Agent](./token-gating-agent.md) - Token-based access control
