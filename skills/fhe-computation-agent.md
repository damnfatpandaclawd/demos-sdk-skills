# FHE Computation Agent

> **⚠️ Prerequisites**: Complete [SDK Setup](./00-sdk-setup.md) first to configure your environment.

Build agents that perform computations on encrypted data using Fully Homomorphic Encryption (FHE) through the Demos Network.

## SDK Reference

```typescript
import { FHE } from "@kynesyslabs/demosdk/encryption"
```

### Core Class

| Class | Purpose |
|-------|---------|
| `FHE.default` | Fully Homomorphic Encryption operations |

### Key Concepts

Fully Homomorphic Encryption (FHE) allows computations on encrypted data without decryption:
- **Encrypt** data locally
- **Compute** on encrypted data in the cloud/network
- **Decrypt** only the final result locally

## Use Cases

### 1. Private Data Analysis Agent

Analyze sensitive data without exposing the underlying values.

```typescript
import { FHE } from "@kynesyslabs/demosdk/encryption"

interface EncryptedValue {
  ciphertext: Uint8Array
  publicKey: Uint8Array
}

interface AnalysisResult {
  encryptedResult: EncryptedValue
  operation: string
  timestamp: number
}

class PrivateDataAnalysisAgent {
  private fhe: FHE.default
  private publicKey: Uint8Array
  private privateKey: Uint8Array

  async initialize(): Promise<void> {
    this.fhe = new FHE.default()

    // Generate FHE keypair
    const keypair = await this.fhe.generateKeypair()
    this.publicKey = keypair.publicKey
    this.privateKey = keypair.privateKey

    console.log("FHE keypair generated")
  }

  async encryptValue(value: number): Promise<EncryptedValue> {
    const ciphertext = await this.fhe.encrypt(value, this.publicKey)

    return {
      ciphertext,
      publicKey: this.publicKey
    }
  }

  async encryptArray(values: number[]): Promise<EncryptedValue[]> {
    return await Promise.all(
      values.map(v => this.encryptValue(v))
    )
  }

  async addEncrypted(
    a: EncryptedValue,
    b: EncryptedValue
  ): Promise<EncryptedValue> {
    // Homomorphic addition - no decryption needed
    const result = await this.fhe.add(a.ciphertext, b.ciphertext)

    return {
      ciphertext: result,
      publicKey: this.publicKey
    }
  }

  async multiplyEncrypted(
    a: EncryptedValue,
    b: EncryptedValue
  ): Promise<EncryptedValue> {
    // Homomorphic multiplication
    const result = await this.fhe.multiply(a.ciphertext, b.ciphertext)

    return {
      ciphertext: result,
      publicKey: this.publicKey
    }
  }

  async sumEncryptedArray(values: EncryptedValue[]): Promise<EncryptedValue> {
    if (values.length === 0) {
      throw new Error("Cannot sum empty array")
    }

    let result = values[0]
    for (let i = 1; i < values.length; i++) {
      result = await this.addEncrypted(result, values[i])
    }

    return result
  }

  async computeAverage(values: EncryptedValue[]): Promise<AnalysisResult> {
    // Sum all values (homomorphic)
    const sum = await this.sumEncryptedArray(values)

    // Division by constant is supported
    const count = values.length
    const avgCiphertext = await this.fhe.divideByConstant(
      sum.ciphertext,
      count
    )

    return {
      encryptedResult: {
        ciphertext: avgCiphertext,
        publicKey: this.publicKey
      },
      operation: "average",
      timestamp: Date.now()
    }
  }

  async decrypt(encrypted: EncryptedValue): Promise<number> {
    return await this.fhe.decrypt(encrypted.ciphertext, this.privateKey)
  }

  async analyzeWithPrivacy(
    data: number[],
    operation: "sum" | "average" | "max" | "min"
  ): Promise<number> {
    // Encrypt all data
    const encrypted = await this.encryptArray(data)

    let result: EncryptedValue

    switch (operation) {
      case "sum":
        result = await this.sumEncryptedArray(encrypted)
        break
      case "average":
        const avgResult = await this.computeAverage(encrypted)
        result = avgResult.encryptedResult
        break
      case "max":
        result = await this.findMaxEncrypted(encrypted)
        break
      case "min":
        result = await this.findMinEncrypted(encrypted)
        break
      default:
        throw new Error(`Unknown operation: ${operation}`)
    }

    // Decrypt only the final result
    return await this.decrypt(result)
  }

  private async findMaxEncrypted(values: EncryptedValue[]): Promise<EncryptedValue> {
    let max = values[0]
    for (let i = 1; i < values.length; i++) {
      max = await this.fhe.max(max.ciphertext, values[i].ciphertext)
        .then(ciphertext => ({ ciphertext, publicKey: this.publicKey }))
    }
    return max
  }

  private async findMinEncrypted(values: EncryptedValue[]): Promise<EncryptedValue> {
    let min = values[0]
    for (let i = 1; i < values.length; i++) {
      min = await this.fhe.min(min.ciphertext, values[i].ciphertext)
        .then(ciphertext => ({ ciphertext, publicKey: this.publicKey }))
    }
    return min
  }
}
```

### 2. Private Voting Agent

Conduct confidential voting with encrypted ballots.

```typescript
import { FHE } from "@kynesyslabs/demosdk/encryption"

interface Ballot {
  voterId: string
  encryptedVote: Uint8Array
  timestamp: number
}

interface VotingResult {
  totalVotes: number
  encryptedTally: Uint8Array
  decryptedTally?: number[]
}

class PrivateVotingAgent {
  private fhe: FHE.default
  private electionPublicKey: Uint8Array
  private electionPrivateKey: Uint8Array
  private ballots: Map<string, Ballot> = new Map()
  private candidates: number

  async initializeElection(candidateCount: number): Promise<{
    publicKey: string
  }> {
    this.fhe = new FHE.default()
    this.candidates = candidateCount

    // Generate election keypair
    const keypair = await this.fhe.generateKeypair()
    this.electionPublicKey = keypair.publicKey
    this.electionPrivateKey = keypair.privateKey

    console.log(`Election initialized with ${candidateCount} candidates`)

    return {
      publicKey: Buffer.from(this.electionPublicKey).toString("base64")
    }
  }

  async encryptVote(candidateIndex: number): Promise<Uint8Array> {
    if (candidateIndex < 0 || candidateIndex >= this.candidates) {
      throw new Error("Invalid candidate index")
    }

    // Create one-hot encoded vote
    const voteVector = new Array(this.candidates).fill(0)
    voteVector[candidateIndex] = 1

    // Encrypt the vote vector
    return await this.fhe.encryptVector(voteVector, this.electionPublicKey)
  }

  async submitBallot(
    voterId: string,
    encryptedVote: Uint8Array
  ): Promise<string> {
    if (this.ballots.has(voterId)) {
      throw new Error("Voter has already submitted a ballot")
    }

    const ballot: Ballot = {
      voterId,
      encryptedVote,
      timestamp: Date.now()
    }

    this.ballots.set(voterId, ballot)
    console.log(`Ballot submitted by ${voterId}`)

    return `ballot_${voterId}_${ballot.timestamp}`
  }

  async tallyVotes(): Promise<VotingResult> {
    if (this.ballots.size === 0) {
      throw new Error("No ballots to tally")
    }

    const ballotArray = Array.from(this.ballots.values())

    // Start with first ballot
    let encryptedTally = ballotArray[0].encryptedVote

    // Add all other ballots (homomorphic addition)
    for (let i = 1; i < ballotArray.length; i++) {
      encryptedTally = await this.fhe.addVectors(
        encryptedTally,
        ballotArray[i].encryptedVote
      )
    }

    return {
      totalVotes: this.ballots.size,
      encryptedTally
    }
  }

  async revealResults(): Promise<number[]> {
    const { encryptedTally, totalVotes } = await this.tallyVotes()

    // Decrypt the tally
    const decryptedTally = await this.fhe.decryptVector(
      encryptedTally,
      this.electionPrivateKey
    )

    console.log(`Election results revealed. Total votes: ${totalVotes}`)
    console.log(`Results by candidate:`, decryptedTally)

    return decryptedTally
  }

  async verifyBallot(ballotId: string): Promise<boolean> {
    const parts = ballotId.split("_")
    const voterId = parts[1]

    return this.ballots.has(voterId)
  }

  getVoterCount(): number {
    return this.ballots.size
  }
}
```

### 3. Private Machine Learning Agent

Train models on encrypted data for privacy-preserving ML.

```typescript
import { FHE } from "@kynesyslabs/demosdk/encryption"

interface EncryptedDataset {
  features: Uint8Array[][]
  labels?: Uint8Array[]
  shape: { rows: number; cols: number }
}

interface ModelWeights {
  encrypted: Uint8Array[]
  shape: number[]
}

class PrivateMLAgent {
  private fhe: FHE.default
  private publicKey: Uint8Array
  private privateKey: Uint8Array

  async initialize(): Promise<void> {
    this.fhe = new FHE.default()
    const keypair = await this.fhe.generateKeypair()
    this.publicKey = keypair.publicKey
    this.privateKey = keypair.privateKey
  }

  async encryptDataset(
    features: number[][],
    labels?: number[]
  ): Promise<EncryptedDataset> {
    const encryptedFeatures: Uint8Array[][] = []

    for (const row of features) {
      const encryptedRow: Uint8Array[] = []
      for (const value of row) {
        encryptedRow.push(await this.fhe.encrypt(value, this.publicKey))
      }
      encryptedFeatures.push(encryptedRow)
    }

    let encryptedLabels: Uint8Array[] | undefined
    if (labels) {
      encryptedLabels = await Promise.all(
        labels.map(l => this.fhe.encrypt(l, this.publicKey))
      )
    }

    return {
      features: encryptedFeatures,
      labels: encryptedLabels,
      shape: { rows: features.length, cols: features[0].length }
    }
  }

  async linearRegression(
    dataset: EncryptedDataset,
    learningRate: number,
    iterations: number
  ): Promise<ModelWeights> {
    const { features, labels, shape } = dataset

    if (!labels) {
      throw new Error("Labels required for training")
    }

    // Initialize weights (encrypted zeros)
    let weights: Uint8Array[] = []
    for (let i = 0; i < shape.cols; i++) {
      weights.push(await this.fhe.encrypt(0, this.publicKey))
    }

    // Training loop (simplified gradient descent)
    for (let iter = 0; iter < iterations; iter++) {
      // Compute predictions (encrypted matrix multiplication)
      const predictions: Uint8Array[] = []
      for (let i = 0; i < shape.rows; i++) {
        let pred = await this.fhe.encrypt(0, this.publicKey)
        for (let j = 0; j < shape.cols; j++) {
          const product = await this.fhe.multiply(features[i][j], weights[j])
          pred = await this.fhe.add(pred, product)
        }
        predictions.push(pred)
      }

      // Compute gradients and update weights (all encrypted)
      for (let j = 0; j < shape.cols; j++) {
        let gradient = await this.fhe.encrypt(0, this.publicKey)

        for (let i = 0; i < shape.rows; i++) {
          // error = prediction - label
          const error = await this.fhe.subtract(predictions[i], labels[i])
          // gradient += error * feature
          const term = await this.fhe.multiply(error, features[i][j])
          gradient = await this.fhe.add(gradient, term)
        }

        // Scale gradient
        const scaledGradient = await this.fhe.multiplyByConstant(
          gradient,
          learningRate / shape.rows
        )

        // Update weight
        weights[j] = await this.fhe.subtract(weights[j], scaledGradient)
      }

      console.log(`Iteration ${iter + 1}/${iterations} complete`)
    }

    return {
      encrypted: weights,
      shape: [shape.cols]
    }
  }

  async predict(
    model: ModelWeights,
    encryptedInput: Uint8Array[]
  ): Promise<Uint8Array> {
    if (encryptedInput.length !== model.shape[0]) {
      throw new Error("Input dimensions don't match model")
    }

    let prediction = await this.fhe.encrypt(0, this.publicKey)

    for (let i = 0; i < encryptedInput.length; i++) {
      const product = await this.fhe.multiply(
        encryptedInput[i],
        model.encrypted[i]
      )
      prediction = await this.fhe.add(prediction, product)
    }

    return prediction
  }

  async decryptWeights(model: ModelWeights): Promise<number[]> {
    return await Promise.all(
      model.encrypted.map(w => this.fhe.decrypt(w, this.privateKey))
    )
  }

  async decryptPrediction(encryptedPrediction: Uint8Array): Promise<number> {
    return await this.fhe.decrypt(encryptedPrediction, this.privateKey)
  }
}
```

### 4. Private Auction Agent

Conduct sealed-bid auctions with encrypted bids.

```typescript
import { FHE } from "@kynesyslabs/demosdk/encryption"

interface EncryptedBid {
  bidderId: string
  encryptedAmount: Uint8Array
  timestamp: number
  commitment: string
}

interface AuctionResult {
  winnerId: string
  winningBid: number
  totalBids: number
}

class PrivateAuctionAgent {
  private fhe: FHE.default
  private auctionPublicKey: Uint8Array
  private auctionPrivateKey: Uint8Array
  private bids: Map<string, EncryptedBid> = new Map()
  private auctionId: string
  private endTime: number

  async createAuction(
    auctionId: string,
    durationMinutes: number
  ): Promise<{ publicKey: string; endTime: number }> {
    this.fhe = new FHE.default()
    this.auctionId = auctionId
    this.endTime = Date.now() + durationMinutes * 60 * 1000

    const keypair = await this.fhe.generateKeypair()
    this.auctionPublicKey = keypair.publicKey
    this.auctionPrivateKey = keypair.privateKey

    console.log(`Auction ${auctionId} created, ends at ${new Date(this.endTime)}`)

    return {
      publicKey: Buffer.from(this.auctionPublicKey).toString("base64"),
      endTime: this.endTime
    }
  }

  async encryptBid(amount: number): Promise<Uint8Array> {
    return await this.fhe.encrypt(amount, this.auctionPublicKey)
  }

  async submitBid(
    bidderId: string,
    encryptedAmount: Uint8Array
  ): Promise<string> {
    if (Date.now() > this.endTime) {
      throw new Error("Auction has ended")
    }

    if (this.bids.has(bidderId)) {
      throw new Error("Bidder has already submitted a bid")
    }

    // Create commitment hash
    const commitment = await this.hashBid(bidderId, encryptedAmount)

    const bid: EncryptedBid = {
      bidderId,
      encryptedAmount,
      timestamp: Date.now(),
      commitment
    }

    this.bids.set(bidderId, bid)
    console.log(`Bid received from ${bidderId}`)

    return commitment
  }

  async determineWinner(): Promise<AuctionResult> {
    if (Date.now() < this.endTime) {
      throw new Error("Auction has not ended yet")
    }

    if (this.bids.size === 0) {
      throw new Error("No bids received")
    }

    const bidArray = Array.from(this.bids.values())

    // Find maximum bid using homomorphic comparison
    let maxBid = bidArray[0]
    let maxEncrypted = maxBid.encryptedAmount

    for (let i = 1; i < bidArray.length; i++) {
      const current = bidArray[i]

      // Homomorphic comparison
      const isGreater = await this.fhe.greaterThan(
        current.encryptedAmount,
        maxEncrypted
      )

      // Conditional select based on encrypted comparison
      const newMax = await this.fhe.conditionalSelect(
        isGreater,
        current.encryptedAmount,
        maxEncrypted
      )

      // Decrypt comparison result to determine winner ID
      const isGreaterDecrypted = await this.fhe.decrypt(isGreater, this.auctionPrivateKey)
      if (isGreaterDecrypted) {
        maxBid = current
        maxEncrypted = newMax
      }
    }

    // Decrypt winning amount
    const winningAmount = await this.fhe.decrypt(
      maxEncrypted,
      this.auctionPrivateKey
    )

    return {
      winnerId: maxBid.bidderId,
      winningBid: winningAmount,
      totalBids: this.bids.size
    }
  }

  async verifyBid(commitment: string): Promise<boolean> {
    for (const bid of this.bids.values()) {
      if (bid.commitment === commitment) {
        return true
      }
    }
    return false
  }

  private async hashBid(
    bidderId: string,
    encryptedAmount: Uint8Array
  ): Promise<string> {
    const data = new TextEncoder().encode(
      bidderId + Buffer.from(encryptedAmount).toString("base64")
    )
    const hash = await crypto.subtle.digest("SHA-256", data)
    return Buffer.from(hash).toString("hex")
  }

  getAuctionStatus(): {
    id: string
    isOpen: boolean
    bidCount: number
    endsAt: Date
  } {
    return {
      id: this.auctionId,
      isOpen: Date.now() < this.endTime,
      bidCount: this.bids.size,
      endsAt: new Date(this.endTime)
    }
  }
}
```

## Best Practices

1. **Generate keys securely** - Use proper entropy for keypair generation
2. **Minimize decryptions** - Decrypt only final results, not intermediate values
3. **Consider noise growth** - Deep circuits increase noise; use bootstrapping if needed
4. **Batch operations** - Group homomorphic operations for efficiency
5. **Verify inputs** - Validate encrypted data before computation

## Limitations

- FHE is computationally intensive
- Circuit depth affects noise and performance
- Not all operations are equally efficient
- Key sizes are large compared to traditional encryption

## Related Skills

- [Unified Crypto Agent](./unified-crypto-agent.md) - Other encryption algorithms
- [ZK Identity Agent](./zk-identity-agent.md) - Zero-knowledge proofs
- [L2PS Private Subnet Agent](./l2ps-private-subnet-agent.md) - Private computation networks
