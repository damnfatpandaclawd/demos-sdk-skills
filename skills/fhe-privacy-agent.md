# FHE Privacy Agent Skill

> **⚠️ Prerequisites**: Complete [SDK Setup](./00-sdk-setup.md) first to configure your environment.

Build privacy-preserving computation agents using Fully Homomorphic Encryption (FHE) on Demos Network.

## Overview

FHE enables computation on encrypted data without decryption - perfect for agents that need to process sensitive information while maintaining complete privacy.

## SDK Reference

```typescript
import { FHE } from "@kynesyslabs/demosdk/encryption"

// Initialize FHE with security parameters
const fhe = new FHE.default({
  schemeType: "bfv",           // BFV for integer arithmetic, CKKS for approximate
  securityLevel: 128,          // 128-bit security standard
  polyModulusDegree: 4096,     // Polynomial ring dimension
  bitSizes: [36, 36, 37]       // Coefficient modulus bit sizes
})

// Core operations
await fhe.encrypt(plaintext)           // Encrypt data
await fhe.decrypt(ciphertext)          // Decrypt result
await fhe.add(ct1, ct2)                // Homomorphic addition
await fhe.multiply(ct1, ct2)           // Homomorphic multiplication
await fhe.evaluate(circuit, inputs)    // Evaluate computation circuit
```

## Scheme Types

| Scheme | Use Case | Operations |
|--------|----------|------------|
| `bfv` | Integer arithmetic | Exact add/multiply on integers |
| `ckks` | Approximate numbers | Floating point with bounded error |
| `tfhe` | Boolean circuits | Bit-level operations, comparisons |

## Agent Use Cases

### 1. Private Portfolio Analyzer

Analyze portfolio performance without exposing holdings:

```typescript
class PrivatePortfolioAgent {
  private fhe: FHE.default

  constructor() {
    this.fhe = new FHE.default({
      schemeType: "ckks",      // Approximate for price calculations
      securityLevel: 128,
      polyModulusDegree: 8192,
      bitSizes: [40, 40, 40, 40]
    })
  }

  async analyzePortfolio(encryptedHoldings: EncryptedData[]) {
    // Compute total value on encrypted data
    let encryptedTotal = await this.fhe.encrypt(0)

    for (const holding of encryptedHoldings) {
      // Multiply encrypted quantity by encrypted price
      const value = await this.fhe.multiply(
        holding.encryptedQuantity,
        holding.encryptedPrice
      )
      encryptedTotal = await this.fhe.add(encryptedTotal, value)
    }

    return {
      encryptedTotalValue: encryptedTotal,
      // Can compute metrics without seeing actual values
      diversificationScore: await this.computeDiversification(encryptedHoldings)
    }
  }

  async computeDiversification(holdings: EncryptedData[]) {
    // Herfindahl index on encrypted weights
    const weights = await Promise.all(
      holdings.map(h => this.fhe.divide(h.value, this.encryptedTotal))
    )

    let hhi = await this.fhe.encrypt(0)
    for (const weight of weights) {
      const squared = await this.fhe.multiply(weight, weight)
      hhi = await this.fhe.add(hhi, squared)
    }

    return hhi // Lower = more diversified
  }
}
```

### 2. Private Voting Agent

Conduct votes where individual choices remain private:

```typescript
class PrivateVotingAgent {
  private fhe: FHE.default
  private publicKey: Uint8Array

  async initializeElection(options: string[]) {
    this.fhe = new FHE.default({
      schemeType: "bfv",       // Exact counting
      securityLevel: 128,
      polyModulusDegree: 4096,
      bitSizes: [36, 36, 37]
    })

    // Initialize encrypted tallies at zero
    const encryptedTallies = new Map<string, EncryptedData>()
    for (const option of options) {
      encryptedTallies.set(option, await this.fhe.encrypt(0))
    }

    return {
      electionId: crypto.randomUUID(),
      publicKey: this.publicKey,
      options,
      encryptedTallies
    }
  }

  async castVote(
    electionId: string,
    encryptedBallot: Map<string, EncryptedData>
  ) {
    // Verify ballot structure (each option is 0 or 1)
    // Sum should be exactly 1 (single vote)

    const election = await this.getElection(electionId)

    // Add encrypted vote to encrypted tally
    for (const [option, encryptedVote] of encryptedBallot) {
      const currentTally = election.encryptedTallies.get(option)
      const newTally = await this.fhe.add(currentTally, encryptedVote)
      election.encryptedTallies.set(option, newTally)
    }

    return { success: true, voteRecorded: true }
  }

  async tallyResults(electionId: string, decryptionKey: Uint8Array) {
    const election = await this.getElection(electionId)

    // Only election authority can decrypt final results
    const results = new Map<string, number>()
    for (const [option, encryptedTally] of election.encryptedTallies) {
      const tally = await this.fhe.decrypt(encryptedTally, decryptionKey)
      results.set(option, tally)
    }

    return results
  }
}
```

### 3. Private Credit Scoring Agent

Compute credit scores without exposing financial details:

```typescript
class PrivateCreditAgent {
  private fhe: FHE.default

  async computeCreditScore(encryptedFinancials: {
    encryptedIncome: EncryptedData
    encryptedDebt: EncryptedData
    encryptedAssets: EncryptedData
    encryptedPaymentHistory: EncryptedData // 0-100 scale
  }) {
    // Debt-to-income ratio (encrypted)
    const dti = await this.fhe.divide(
      encryptedFinancials.encryptedDebt,
      encryptedFinancials.encryptedIncome
    )

    // Asset coverage ratio
    const coverage = await this.fhe.divide(
      encryptedFinancials.encryptedAssets,
      encryptedFinancials.encryptedDebt
    )

    // Weighted score calculation (all on encrypted data)
    const weights = {
      dti: await this.fhe.encrypt(0.35),
      coverage: await this.fhe.encrypt(0.25),
      history: await this.fhe.encrypt(0.40)
    }

    // Score = weighted combination
    const dtiScore = await this.fhe.multiply(
      await this.invertDTI(dti),
      weights.dti
    )
    const coverageScore = await this.fhe.multiply(coverage, weights.coverage)
    const historyScore = await this.fhe.multiply(
      encryptedFinancials.encryptedPaymentHistory,
      weights.history
    )

    const totalScore = await this.fhe.add(
      await this.fhe.add(dtiScore, coverageScore),
      historyScore
    )

    return {
      encryptedScore: totalScore,
      // Threshold comparison without revealing score
      meetsMinimum: await this.compareToThreshold(totalScore, 650)
    }
  }

  async compareToThreshold(encryptedScore: EncryptedData, threshold: number) {
    // Returns encrypted boolean (0 or 1)
    const encryptedThreshold = await this.fhe.encrypt(threshold)
    return await this.fhe.greaterThan(encryptedScore, encryptedThreshold)
  }
}
```

### 4. Private Auction Agent

Run sealed-bid auctions with hidden bids:

```typescript
class PrivateAuctionAgent {
  private fhe: FHE.default

  async createAuction(item: string, minimumBid: number) {
    return {
      auctionId: crypto.randomUUID(),
      item,
      encryptedMinimum: await this.fhe.encrypt(minimumBid),
      encryptedBids: new Map<string, EncryptedData>(),
      status: "open"
    }
  }

  async submitBid(
    auctionId: string,
    bidderId: string,
    encryptedBid: EncryptedData
  ) {
    const auction = await this.getAuction(auctionId)

    // Verify bid meets minimum (without revealing bid amount)
    const meetsMinimum = await this.fhe.greaterThanOrEqual(
      encryptedBid,
      auction.encryptedMinimum
    )

    if (!meetsMinimum) {
      return { success: false, reason: "Bid below minimum" }
    }

    auction.encryptedBids.set(bidderId, encryptedBid)
    return { success: true }
  }

  async determineWinner(auctionId: string) {
    const auction = await this.getAuction(auctionId)

    // Find maximum bid homomorphically
    let encryptedMaxBid = await this.fhe.encrypt(0)
    let winnerMask = new Map<string, EncryptedData>()

    for (const [bidderId, encryptedBid] of auction.encryptedBids) {
      // Compare each bid to current max
      const isHigher = await this.fhe.greaterThan(encryptedBid, encryptedMaxBid)

      // Update max if higher
      encryptedMaxBid = await this.fhe.select(
        isHigher,
        encryptedBid,
        encryptedMaxBid
      )

      // Track winner mask (encrypted 0 or 1)
      winnerMask.set(bidderId, isHigher)
    }

    return {
      encryptedWinningBid: encryptedMaxBid,
      winnerMask // Decrypt to reveal winner
    }
  }
}
```

### 5. Private Analytics Agent

Aggregate analytics without individual data exposure:

```typescript
class PrivateAnalyticsAgent {
  private fhe: FHE.default

  async aggregateUserMetrics(encryptedMetrics: {
    userId: string
    encryptedAge: EncryptedData
    encryptedSpending: EncryptedData
    encryptedVisits: EncryptedData
  }[]) {
    // Compute aggregates on encrypted data
    let encryptedTotalSpending = await this.fhe.encrypt(0)
    let encryptedTotalVisits = await this.fhe.encrypt(0)
    let encryptedCount = await this.fhe.encrypt(0)

    for (const user of encryptedMetrics) {
      encryptedTotalSpending = await this.fhe.add(
        encryptedTotalSpending,
        user.encryptedSpending
      )
      encryptedTotalVisits = await this.fhe.add(
        encryptedTotalVisits,
        user.encryptedVisits
      )
      encryptedCount = await this.fhe.add(
        encryptedCount,
        await this.fhe.encrypt(1)
      )
    }

    // Compute averages
    const avgSpending = await this.fhe.divide(
      encryptedTotalSpending,
      encryptedCount
    )
    const avgVisits = await this.fhe.divide(
      encryptedTotalVisits,
      encryptedCount
    )

    return {
      encryptedAverageSpending: avgSpending,
      encryptedAverageVisits: avgVisits,
      encryptedUserCount: encryptedCount
      // Individual user data never exposed
    }
  }

  async segmentUsers(
    encryptedMetrics: EncryptedUserMetric[],
    encryptedThresholds: { high: EncryptedData; low: EncryptedData }
  ) {
    const segments = {
      high: await this.fhe.encrypt(0),
      medium: await this.fhe.encrypt(0),
      low: await this.fhe.encrypt(0)
    }

    for (const user of encryptedMetrics) {
      const isHigh = await this.fhe.greaterThan(
        user.encryptedSpending,
        encryptedThresholds.high
      )
      const isLow = await this.fhe.lessThan(
        user.encryptedSpending,
        encryptedThresholds.low
      )

      // Increment appropriate segment counter
      segments.high = await this.fhe.add(segments.high, isHigh)
      segments.low = await this.fhe.add(segments.low, isLow)
      // Medium = not high and not low
    }

    return segments
  }
}
```

## Security Levels

| Level | Key Size | Use Case |
|-------|----------|----------|
| 128 | Standard | Most applications |
| 192 | High | Financial, healthcare |
| 256 | Maximum | Government, military |

## Performance Considerations

```typescript
// Batch operations for efficiency
const batchEncrypt = async (values: number[]) => {
  // Encode multiple values in single ciphertext
  return await fhe.encryptBatch(values)
}

// SIMD-style parallel operations
const results = await fhe.addBatch(ciphertexts1, ciphertexts2)

// Relinearization after multiplications
await fhe.relinearize(ciphertext) // Reduce noise growth
```

## Best Practices

1. **Choose appropriate scheme**: BFV for exact integers, CKKS for approximations
2. **Manage noise budget**: Relinearize after multiplications
3. **Batch when possible**: Encode multiple values per ciphertext
4. **Security level**: Match to data sensitivity
5. **Key management**: Secure key generation and storage

## Integration with DemosWork

```typescript
const privacyWorkflow = new DemosWork()

// Step 1: Encrypt user data
privacyWorkflow.push(new BaseOperation(
  new NativeWorkStep({
    method: "fhe.encrypt",
    params: { data: userData, publicKey }
  })
))

// Step 2: Compute on encrypted data
privacyWorkflow.push(new BaseOperation(
  new NativeWorkStep({
    method: "fhe.evaluate",
    params: { circuit: "credit_score", inputs: "{{step1.result}}" }
  })
))

// Step 3: Return encrypted result
privacyWorkflow.push(new BaseOperation(
  new NativeWorkStep({
    method: "fhe.serialize",
    params: { ciphertext: "{{step2.result}}" }
  })
))
```

## Related Skills

- [ZK Interactive Proofs](./zk-interactive-agent.md) - Prove statements without revealing data
- [Identity Resolution](./identity-resolution-agent.md) - Privacy-preserving identity verification
- [Web2 Integration](./web2-integration-agent.md) - Secure external data ingestion
