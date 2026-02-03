# Identity Resolution Agent Skill

Build cross-context identity agents using Demos CCI (Cross-Context Identity) for unified identity resolution across Web2, Web3, and social platforms.

## Overview

Identity Resolution enables agents to link, verify, and resolve identities across multiple platforms - essential for reputation aggregation, social proof, and trust scoring.

## SDK Reference

```typescript
import { Demos } from "@kynesyslabs/demosdk/websdk"

const demos = new Demos()
await demos.connect("https://demosnode.discus.sh/")

// Identity Management
const identities = demos.identity

// Social Identity Linking
await identities.addTwitterIdentity(handle, proof)
await identities.addGithubIdentity(username, proof)
await identities.addDiscordIdentity(userId, proof)
await identities.addTelegramIdentity(userId, proof)

// Domain Resolution
await identities.resolveUDDomain(domain)          // Unstoppable Domains
await identities.resolveENS(domain)               // Ethereum Name Service

// Reputation Scores
await identities.getNomisScore(address)           // Wallet reputation
await identities.getIdentityScore(publicKey)      // Overall identity score

// Cross-Chain Identity
await identities.addXmIdentity(chain, address)    // Link wallet address
await identities.getXmIdentities(publicKey)       // Get all linked wallets
await identities.getWeb2Identities(publicKey)     // Get all social links
```

## Agent Use Cases

### 1. Reputation Aggregator Agent

Build unified reputation scores from multiple sources:

```typescript
class ReputationAggregatorAgent {
  private demos: Demos

  async aggregateReputation(identifier: string): Promise<UnifiedReputation> {
    // Resolve identity to Demos public key
    const publicKey = await this.resolveToPublicKey(identifier)

    // Gather reputation from all sources in parallel
    const [
      xmIdentities,
      web2Identities,
      nomisScores,
      onChainActivity
    ] = await Promise.all([
      this.demos.identity.getXmIdentities(publicKey),
      this.demos.identity.getWeb2Identities(publicKey),
      this.gatherNomisScores(publicKey),
      this.analyzeOnChainActivity(publicKey)
    ])

    // Calculate unified score
    const unifiedScore = this.calculateUnifiedScore({
      xmIdentities,
      web2Identities,
      nomisScores,
      onChainActivity
    })

    return {
      publicKey,
      linkedIdentities: {
        wallets: xmIdentities,
        social: web2Identities
      },
      scores: {
        nomis: nomisScores,
        onChain: onChainActivity,
        unified: unifiedScore
      },
      trustLevel: this.determineTrustLevel(unifiedScore),
      verificationDepth: this.countVerifications(xmIdentities, web2Identities)
    }
  }

  private async gatherNomisScores(publicKey: string): Promise<NomisScoreSet> {
    const xmIdentities = await this.demos.identity.getXmIdentities(publicKey)

    const scores: Record<string, number> = {}
    for (const identity of xmIdentities) {
      try {
        const score = await this.demos.identity.getNomisScore(identity.address)
        scores[identity.chain] = score
      } catch {
        // Skip chains without Nomis support
      }
    }

    return {
      scores,
      average: Object.values(scores).reduce((a, b) => a + b, 0) / Object.keys(scores).length,
      coverage: Object.keys(scores).length / xmIdentities.length
    }
  }

  private calculateUnifiedScore(data: ReputationData): number {
    // Weighted scoring algorithm
    const weights = {
      nomis: 0.30,
      onChainAge: 0.15,
      onChainVolume: 0.15,
      socialFollowers: 0.20,
      socialActivity: 0.10,
      identityCount: 0.10
    }

    return (
      data.nomisScores.average * weights.nomis +
      this.normalizeAge(data.onChainActivity.age) * weights.onChainAge +
      this.normalizeVolume(data.onChainActivity.volume) * weights.onChainVolume +
      this.normalizeFollowers(data.web2Identities) * weights.socialFollowers +
      this.normalizeActivity(data.web2Identities) * weights.socialActivity +
      this.normalizeIdentityCount(data) * weights.identityCount
    )
  }
}
```

### 2. Social Proof Verification Agent

Verify social identity claims with cryptographic proofs:

```typescript
class SocialProofAgent {
  private demos: Demos

  async verifyTwitterIdentity(
    claimedHandle: string,
    publicKey: string
  ): Promise<TwitterVerification> {
    // Generate verification challenge
    const challenge = await this.generateChallenge(publicKey, "twitter")

    // Instructions for user
    const instructions = {
      step1: `Tweet the following message from @${claimedHandle}:`,
      message: `Verifying my Demos identity: ${challenge.code}`,
      step2: "Share the tweet URL for verification"
    }

    return {
      challenge,
      instructions,
      verifyCallback: async (tweetUrl: string) => {
        // Fetch and verify tweet
        const isValid = await this.verifyTweet(tweetUrl, challenge.code, claimedHandle)

        if (isValid) {
          // Link identity
          await this.demos.identity.addTwitterIdentity(claimedHandle, {
            proof: tweetUrl,
            challenge: challenge.code,
            verifiedAt: Date.now()
          })
        }

        return { verified: isValid, handle: claimedHandle }
      }
    }
  }

  async verifyGithubIdentity(
    claimedUsername: string,
    publicKey: string
  ): Promise<GithubVerification> {
    const challenge = await this.generateChallenge(publicKey, "github")

    return {
      challenge,
      instructions: {
        step1: `Create a public gist with filename: demos-verification.txt`,
        content: `Demos Identity Verification\nPublic Key: ${publicKey}\nChallenge: ${challenge.code}`,
        step2: "Share the gist URL for verification"
      },
      verifyCallback: async (gistUrl: string) => {
        const isValid = await this.verifyGist(gistUrl, challenge.code, publicKey)

        if (isValid) {
          await this.demos.identity.addGithubIdentity(claimedUsername, {
            proof: gistUrl,
            challenge: challenge.code
          })
        }

        return { verified: isValid, username: claimedUsername }
      }
    }
  }

  async batchVerify(
    claims: IdentityClaim[]
  ): Promise<BatchVerificationResult> {
    const results = await Promise.allSettled(
      claims.map(claim => this.verifySingleClaim(claim))
    )

    const verified = results.filter(r => r.status === "fulfilled" && r.value.verified)
    const failed = results.filter(r => r.status === "rejected" || !r.value.verified)

    return {
      totalClaims: claims.length,
      verified: verified.length,
      failed: failed.length,
      details: results.map((r, i) => ({
        claim: claims[i],
        result: r.status === "fulfilled" ? r.value : { error: r.reason }
      }))
    }
  }
}
```

### 3. Cross-Chain Identity Linker Agent

Link and sync identities across multiple blockchains:

```typescript
class CrossChainIdentityAgent {
  private demos: Demos

  async linkWallet(
    chain: string,
    address: string,
    signature: Uint8Array
  ): Promise<LinkResult> {
    // Verify ownership through signature
    const message = `Link ${address} on ${chain} to Demos identity`
    const isOwner = await this.verifySignature(chain, address, message, signature)

    if (!isOwner) {
      throw new Error("Signature verification failed")
    }

    // Add to identity
    await this.demos.identity.addXmIdentity(chain, address, {
      signature,
      linkedAt: Date.now()
    })

    return {
      success: true,
      chain,
      address,
      identityCount: await this.countLinkedIdentities()
    }
  }

  async resolveUniversalIdentity(
    identifier: string
  ): Promise<UniversalIdentity> {
    // Detect identifier type
    const type = this.detectIdentifierType(identifier)

    let publicKey: string

    switch (type) {
      case "demos":
        publicKey = identifier
        break

      case "ens":
        // Resolve ENS to address, then find Demos identity
        const ensAddress = await this.demos.identity.resolveENS(identifier)
        publicKey = await this.findDemosIdentity("ethereum", ensAddress)
        break

      case "ud":
        // Resolve Unstoppable Domain
        const udAddresses = await this.demos.identity.resolveUDDomain(identifier)
        publicKey = await this.findDemosIdentityFromAddresses(udAddresses)
        break

      case "evm":
        publicKey = await this.findDemosIdentity("ethereum", identifier)
        break

      case "solana":
        publicKey = await this.findDemosIdentity("solana", identifier)
        break

      case "twitter":
        publicKey = await this.findByTwitter(identifier)
        break

      default:
        throw new Error(`Unknown identifier type: ${identifier}`)
    }

    // Gather complete identity
    return await this.buildUniversalIdentity(publicKey)
  }

  async buildUniversalIdentity(publicKey: string): Promise<UniversalIdentity> {
    const [xmIdentities, web2Identities] = await Promise.all([
      this.demos.identity.getXmIdentities(publicKey),
      this.demos.identity.getWeb2Identities(publicKey)
    ])

    // Build address book across all chains
    const addressBook: Record<string, string[]> = {}
    for (const identity of xmIdentities) {
      if (!addressBook[identity.chain]) {
        addressBook[identity.chain] = []
      }
      addressBook[identity.chain].push(identity.address)
    }

    // Build social graph
    const socialGraph: Record<string, string> = {}
    for (const identity of web2Identities) {
      socialGraph[identity.platform] = identity.handle
    }

    return {
      publicKey,
      addressBook,
      socialGraph,
      domains: await this.resolveAllDomains(xmIdentities),
      primaryAddress: xmIdentities[0]?.address,
      createdAt: await this.getIdentityCreationDate(publicKey)
    }
  }
}
```

### 4. Trust Score Agent

Calculate trust scores for counterparty verification:

```typescript
class TrustScoreAgent {
  private demos: Demos

  async calculateTrustScore(
    counterparty: string,
    context: TrustContext
  ): Promise<TrustScore> {
    const identity = await this.resolveIdentity(counterparty)

    // Gather trust signals
    const signals = await Promise.all([
      this.checkIdentityAge(identity),
      this.checkIdentityBreadth(identity),
      this.checkNomisScores(identity),
      this.checkSocialProof(identity),
      this.checkTransactionHistory(identity, context),
      this.checkBlacklistStatus(identity)
    ])

    // Weight signals by context
    const weights = this.getContextWeights(context)

    const score = signals.reduce((total, signal, i) => {
      return total + (signal.score * weights[i])
    }, 0)

    return {
      counterparty,
      score: Math.round(score * 100) / 100,
      grade: this.scoreToGrade(score),
      signals: signals.map((s, i) => ({
        name: s.name,
        score: s.score,
        weight: weights[i],
        contribution: s.score * weights[i],
        details: s.details
      })),
      recommendation: this.generateRecommendation(score, context),
      warnings: signals.filter(s => s.warning).map(s => s.warning)
    }
  }

  private async checkIdentityBreadth(identity: UniversalIdentity): Promise<Signal> {
    const xmCount = Object.keys(identity.addressBook).length
    const socialCount = Object.keys(identity.socialGraph).length
    const domainCount = identity.domains?.length || 0

    // More linked identities = more trustworthy
    const breadthScore = Math.min(1, (xmCount + socialCount + domainCount) / 10)

    return {
      name: "identity_breadth",
      score: breadthScore,
      details: {
        walletChains: xmCount,
        socialPlatforms: socialCount,
        domains: domainCount
      }
    }
  }

  private getContextWeights(context: TrustContext): number[] {
    // Different contexts weight signals differently
    const presets = {
      "high_value_trade": [0.15, 0.20, 0.25, 0.15, 0.20, 0.05], // Heavy on Nomis, history
      "social_interaction": [0.10, 0.15, 0.10, 0.40, 0.15, 0.10], // Heavy on social
      "governance_vote": [0.20, 0.25, 0.15, 0.10, 0.20, 0.10], // Heavy on identity breadth
      "default": [0.15, 0.20, 0.20, 0.15, 0.20, 0.10]
    }

    return presets[context.type] || presets.default
  }
}

// Usage
const trustAgent = new TrustScoreAgent()
const trustScore = await trustAgent.calculateTrustScore("0x123...", {
  type: "high_value_trade",
  amount: 10000,
  chain: "ethereum"
})

console.log(trustScore)
// {
//   score: 0.78,
//   grade: "B+",
//   recommendation: "Proceed with standard verification",
//   signals: [...]
// }
```

### 5. KYC Bridge Agent

Bridge Web2 KYC to on-chain identity:

```typescript
class KYCBridgeAgent {
  private demos: Demos

  async bridgeKYCStatus(
    kycProvider: string,
    kycProof: KYCProof,
    targetChain: string
  ): Promise<KYCAttestation> {
    // Verify KYC proof from provider
    const isValid = await this.verifyKYCProof(kycProvider, kycProof)

    if (!isValid) {
      throw new Error("Invalid KYC proof")
    }

    // Create on-chain attestation (no PII stored on-chain)
    const attestation = {
      provider: kycProvider,
      level: kycProof.level,
      timestamp: Date.now(),
      expiry: Date.now() + (365 * 24 * 60 * 60 * 1000), // 1 year
      hash: await this.hashKYCData(kycProof) // Hash for verification
    }

    // Link to Demos identity
    await this.demos.identity.addKYCAttestation(attestation)

    return {
      attestation,
      onChainTx: await this.publishAttestation(targetChain, attestation),
      verificationUrl: `https://verify.demos.sh/kyc/${attestation.hash}`
    }
  }

  async checkKYCStatus(publicKey: string): Promise<KYCStatus> {
    const identities = await this.demos.identity.getWeb2Identities(publicKey)
    const attestations = await this.demos.identity.getKYCAttestations(publicKey)

    return {
      hasKYC: attestations.length > 0,
      attestations: attestations.map(a => ({
        provider: a.provider,
        level: a.level,
        valid: a.expiry > Date.now(),
        expiry: new Date(a.expiry)
      })),
      highestLevel: Math.max(...attestations.map(a => a.level), 0),
      linkedSocialProofs: identities.length
    }
  }
}
```

### 6. Identity Recovery Agent

Help users recover access through linked identities:

```typescript
class IdentityRecoveryAgent {
  private demos: Demos

  async initiateRecovery(
    claimedPublicKey: string
  ): Promise<RecoverySession> {
    // Get linked identities
    const [xmIdentities, web2Identities] = await Promise.all([
      this.demos.identity.getXmIdentities(claimedPublicKey),
      this.demos.identity.getWeb2Identities(claimedPublicKey)
    ])

    // Generate recovery challenges
    const challenges: RecoveryChallenge[] = []

    // Challenge via each linked wallet
    for (const wallet of xmIdentities.slice(0, 3)) {
      challenges.push({
        type: "wallet_signature",
        chain: wallet.chain,
        address: wallet.address,
        message: `Recovery request for Demos identity ${claimedPublicKey.slice(0, 16)}... at ${Date.now()}`
      })
    }

    // Challenge via social proof
    for (const social of web2Identities.slice(0, 2)) {
      challenges.push({
        type: "social_proof",
        platform: social.platform,
        handle: social.handle,
        message: `DemosRecovery:${crypto.randomUUID().slice(0, 8)}`
      })
    }

    return {
      sessionId: crypto.randomUUID(),
      claimedPublicKey,
      challenges,
      requiredProofs: Math.ceil(challenges.length / 2), // Majority required
      expiresAt: Date.now() + (24 * 60 * 60 * 1000) // 24 hours
    }
  }

  async submitRecoveryProof(
    sessionId: string,
    proof: RecoveryProof
  ): Promise<RecoveryProgress> {
    const session = await this.getSession(sessionId)

    // Verify the proof
    let isValid: boolean

    if (proof.type === "wallet_signature") {
      isValid = await this.verifyWalletSignature(
        proof.chain,
        proof.address,
        proof.message,
        proof.signature
      )
    } else {
      isValid = await this.verifySocialProof(
        proof.platform,
        proof.handle,
        proof.message
      )
    }

    if (isValid) {
      session.completedProofs.push(proof)
    }

    // Check if recovery threshold met
    if (session.completedProofs.length >= session.requiredProofs) {
      return {
        status: "ready",
        message: "Recovery threshold met. Ready to reset credentials.",
        completedProofs: session.completedProofs.length,
        requiredProofs: session.requiredProofs
      }
    }

    return {
      status: "in_progress",
      completedProofs: session.completedProofs.length,
      requiredProofs: session.requiredProofs,
      remainingChallenges: session.challenges.filter(
        c => !session.completedProofs.find(p => this.matchesChallenge(p, c))
      )
    }
  }
}
```

## Domain Resolution

```typescript
// Unstoppable Domains
const udResult = await demos.identity.resolveUDDomain("myname.crypto")
// Returns: { ETH: "0x...", BTC: "bc1...", SOL: "..." }

// ENS Resolution
const ensAddress = await demos.identity.resolveENS("vitalik.eth")
// Returns: "0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045"

// Reverse Resolution
const ensName = await demos.identity.reverseResolveENS("0xd8dA6BF...")
// Returns: "vitalik.eth"
```

## Best Practices

1. **Verify before trusting** - Always verify identity proofs cryptographically
2. **Multiple signals** - Use identity breadth as a trust signal
3. **Context matters** - Weight signals differently for different use cases
4. **Privacy first** - Never store PII on-chain, only attestations
5. **Expiry handling** - Check attestation validity before relying on them

## Integration with DemosWork

```typescript
const identityWorkflow = new DemosWork()

// Step 1: Resolve counterparty identity
identityWorkflow.push(new BaseOperation(
  new NativeWorkStep({
    method: "identity.resolve",
    params: { identifier: counterpartyAddress }
  })
))

// Step 2: Check trust score
identityWorkflow.push(new BaseOperation(
  new NativeWorkStep({
    method: "trust.calculate",
    params: { publicKey: "{{step1.result.publicKey}}", context: "trade" }
  })
))

// Step 3: Conditional proceed
const conditional = new ConditionalOperation()
conditional.if("{{step2.result.score}}", ">", 0.6)
  .then(new BaseOperation(proceedStep))
  .else(new BaseOperation(requireManualReviewStep))

identityWorkflow.push(conditional)
```

## Related Skills

- [ZK Interactive Proofs](./zk-interactive-agent.md) - Private identity verification
- [FHE Privacy Agent](./fhe-privacy-agent.md) - Encrypted identity attributes
- [Web2 Integration](./web2-integration-agent.md) - Social platform verification
