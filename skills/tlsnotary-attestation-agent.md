# TLSNotary Attestation Agent

> **⚠️ Prerequisites**: Complete [SDK Setup](./00-sdk-setup.md) first to configure your environment.

Build agents that create cryptographic proofs of web data using TLSNotary's MPC-TLS protocol on Demos Network.

## SDK Reference

```typescript
import { TLSNotary, TLSNotaryService } from "@kynesyslabs/demosdk/tlsnotary"
import { Demos } from "@kynesyslabs/demosdk/websdk"
```

## Core Concepts

### What is TLSNotary?
TLSNotary enables cryptographic attestation of HTTPS requests using Multi-Party Computation (MPC-TLS). This allows proving that data came from a specific website without revealing sensitive information.

### Key Features
- **MPC-TLS Protocol**: Browser-based prover via WASM
- **Selective Disclosure**: Hide sensitive parts of requests/responses
- **On-Chain Storage**: Store proofs on Demos for verification
- **Offline Verification**: Verify proofs without network access

### Fee Structure
- **Request Token**: 1 DEM (burned)
- **Store Proof**: 1 DEM base + 1 DEM per KB

### Key Classes

| Class | Purpose |
|-------|---------|
| `TLSNotaryService` | Token management, proof storage |
| `TLSNotary` | Browser-based attestation engine |

---

## Use Case 1: Price Oracle Agent

Create verifiable price attestations from external APIs.

```typescript
import { TLSNotaryService, TLSNotary } from "@kynesyslabs/demosdk/tlsnotary"
import { Demos } from "@kynesyslabs/demosdk/websdk"

interface PriceAttestation {
  asset: string
  price: number
  source: string
  timestamp: number
  proof: string
  tokenId: string
}

class PriceOracleAgent {
  private service: TLSNotaryService
  private demos: Demos

  constructor(demos: Demos) {
    this.demos = demos
    this.service = new TLSNotaryService(demos)
  }

  /**
   * Attest price from CoinGecko API
   */
  async attestPrice(
    assetId: string,
    currency = "usd"
  ): Promise<PriceAttestation> {
    const url = `https://api.coingecko.com/api/v3/simple/price?ids=${assetId}&vs_currencies=${currency}`

    console.log(`📊 Attesting price for ${assetId}...`)

    // Create TLSNotary instance with token
    const { tlsn, tokenId, proxyUrl } = await this.service.createTLSNotary({
      targetUrl: url
    })

    console.log(`🎫 Token acquired: ${tokenId}`)

    // Perform attestation
    const result = await tlsn.attest({
      url,
      method: "GET",
      headers: {
        "Accept": "application/json"
      }
    })

    console.log(`✅ Attestation complete`)

    // Parse price from response
    const responseData = JSON.parse(result.recv)
    const price = responseData[assetId]?.[currency]

    // Store proof on-chain
    const { txHash, storageFee } = await this.service.storeProof(
      tokenId,
      JSON.stringify(result.presentation),
      { storage: "onchain" }
    )

    console.log(`💾 Proof stored: ${txHash}`)
    console.log(`   Fee: ${storageFee} DEM`)

    // Cleanup
    tlsn.destroy()

    return {
      asset: assetId,
      price,
      source: "coingecko",
      timestamp: result.time,
      proof: JSON.stringify(result.presentation),
      tokenId
    }
  }

  /**
   * Attest multiple prices in batch
   */
  async attestMultiplePrices(
    assets: string[],
    currency = "usd"
  ): Promise<PriceAttestation[]> {
    const attestations: PriceAttestation[] = []

    for (const asset of assets) {
      try {
        const attestation = await this.attestPrice(asset, currency)
        attestations.push(attestation)

        // Rate limiting - wait between requests
        await new Promise(r => setTimeout(r, 2000))

      } catch (error) {
        console.error(`Failed to attest ${asset}:`, error)
      }
    }

    return attestations
  }

  /**
   * Verify existing attestation
   */
  async verifyAttestation(proof: string): Promise<{
    valid: boolean
    serverName: string
    timestamp: number
    data: any
  }> {
    const tlsn = new TLSNotary({
      notaryUrl: await this.demos.getNotaryUrl(),
      proxyUrl: ""  // Not needed for verification
    })

    await tlsn.initialize()

    const result = await tlsn.verify(JSON.parse(proof))

    tlsn.destroy()

    return {
      valid: true,
      serverName: result.serverName,
      timestamp: result.time,
      data: result.recv
    }
  }
}

// Usage
const demos = new Demos()
await demos.connect("https://demosnode.discus.sh/")
await demos.connectWallet(privateKey)

const oracle = new PriceOracleAgent(demos)

// Attest Bitcoin price
const btcAttestation = await oracle.attestPrice("bitcoin")
console.log(`BTC Price: $${btcAttestation.price}`)
console.log(`Proof Token: ${btcAttestation.tokenId}`)

// Verify the attestation
const verification = await oracle.verifyAttestation(btcAttestation.proof)
console.log(`Verified from: ${verification.serverName}`)
```

---

## Use Case 2: Social Identity Verifier

Attest social media account ownership.

```typescript
import { TLSNotaryService } from "@kynesyslabs/demosdk/tlsnotary"
import { Demos } from "@kynesyslabs/demosdk/websdk"

interface SocialAttestation {
  platform: string
  username: string
  userId: string
  verified: boolean
  proof: string
  tokenId: string
  timestamp: number
}

class SocialIdentityVerifier {
  private service: TLSNotaryService
  private demos: Demos

  constructor(demos: Demos) {
    this.demos = demos
    this.service = new TLSNotaryService(demos)
  }

  /**
   * Attest GitHub profile ownership
   */
  async attestGitHub(username: string): Promise<SocialAttestation> {
    const url = `https://api.github.com/users/${username}`

    console.log(`🐙 Attesting GitHub profile: ${username}`)

    const { tlsn, tokenId } = await this.service.createTLSNotary({
      targetUrl: url
    })

    // Attest with selective disclosure
    // Hide any sensitive headers
    const result = await tlsn.attest({
      url,
      method: "GET",
      headers: {
        "Accept": "application/vnd.github.v3+json",
        "User-Agent": "Demos-TLSNotary-Agent"
      }
    }, {
      // Commit ranges for selective disclosure
      sent: [{ start: 0, end: 100 }],  // Show URL/method only
      recv: [{ start: 0, end: 500 }]   // Show partial response
    })

    const userData = JSON.parse(result.recv)

    // Store proof
    await this.service.storeProof(
      tokenId,
      JSON.stringify(result.presentation),
      { storage: "onchain" }
    )

    tlsn.destroy()

    return {
      platform: "github",
      username: userData.login,
      userId: String(userData.id),
      verified: true,
      proof: JSON.stringify(result.presentation),
      tokenId,
      timestamp: result.time
    }
  }

  /**
   * Attest Twitter/X profile (requires auth)
   */
  async attestTwitter(
    username: string,
    bearerToken: string
  ): Promise<SocialAttestation> {
    const url = `https://api.twitter.com/2/users/by/username/${username}`

    console.log(`🐦 Attesting Twitter profile: ${username}`)

    const { tlsn, tokenId } = await this.service.createTLSNotary({
      targetUrl: url
    })

    const result = await tlsn.attest({
      url,
      method: "GET",
      headers: {
        "Authorization": `Bearer ${bearerToken}`,
        "Content-Type": "application/json"
      }
    }, {
      // IMPORTANT: Hide auth header in proof
      sent: [
        { start: 0, end: 50 },   // Method and URL
        { start: 200, end: 300 } // Skip Authorization header
      ],
      recv: [{ start: 0, end: 1000 }]
    })

    const userData = JSON.parse(result.recv)

    await this.service.storeProof(
      tokenId,
      JSON.stringify(result.presentation),
      { storage: "onchain" }
    )

    tlsn.destroy()

    return {
      platform: "twitter",
      username: userData.data?.username || username,
      userId: userData.data?.id || "",
      verified: true,
      proof: JSON.stringify(result.presentation),
      tokenId,
      timestamp: result.time
    }
  }

  /**
   * Attest Discord membership
   */
  async attestDiscord(
    serverId: string,
    userToken: string
  ): Promise<SocialAttestation> {
    const url = `https://discord.com/api/v10/users/@me/guilds`

    console.log(`💬 Attesting Discord membership...`)

    const { tlsn, tokenId } = await this.service.createTLSNotary({
      targetUrl: url
    })

    const result = await tlsn.attest({
      url,
      method: "GET",
      headers: {
        "Authorization": userToken
      }
    }, {
      // Hide auth token completely
      sent: [{ start: 0, end: 50 }],  // URL only
      recv: [{ start: 0, end: 2000 }]
    })

    const guilds = JSON.parse(result.recv)
    const targetGuild = guilds.find((g: any) => g.id === serverId)

    if (!targetGuild) {
      throw new Error("User not in target server")
    }

    await this.service.storeProof(
      tokenId,
      JSON.stringify(result.presentation),
      { storage: "onchain" }
    )

    tlsn.destroy()

    return {
      platform: "discord",
      username: "",
      userId: targetGuild.id,
      verified: true,
      proof: JSON.stringify(result.presentation),
      tokenId,
      timestamp: result.time
    }
  }

  /**
   * Create combined social proof
   */
  async createCombinedProof(
    platforms: {
      github?: string
      twitter?: { username: string; token: string }
      discord?: { serverId: string; token: string }
    }
  ): Promise<Map<string, SocialAttestation>> {
    const proofs = new Map<string, SocialAttestation>()

    if (platforms.github) {
      proofs.set("github", await this.attestGitHub(platforms.github))
    }

    if (platforms.twitter) {
      proofs.set("twitter", await this.attestTwitter(
        platforms.twitter.username,
        platforms.twitter.token
      ))
    }

    if (platforms.discord) {
      proofs.set("discord", await this.attestDiscord(
        platforms.discord.serverId,
        platforms.discord.token
      ))
    }

    return proofs
  }
}

// Usage
const verifier = new SocialIdentityVerifier(demos)

// Attest GitHub
const githubProof = await verifier.attestGitHub("octocat")
console.log(`GitHub verified: ${githubProof.username}`)

// Create combined proof
const allProofs = await verifier.createCombinedProof({
  github: "myusername",
  twitter: { username: "mytwitter", token: "bearer_token" }
})
```

---

## Use Case 3: Financial Data Attestor

Attest financial data from banking APIs.

```typescript
import { TLSNotaryService } from "@kynesyslabs/demosdk/tlsnotary"
import { Demos } from "@kynesyslabs/demosdk/websdk"

interface FinancialAttestation {
  type: "balance" | "transaction" | "credit_score"
  institution: string
  attestedValue: string  // Hashed or range, not exact
  timestamp: number
  proof: string
  tokenId: string
}

class FinancialDataAttestor {
  private service: TLSNotaryService
  private demos: Demos

  constructor(demos: Demos) {
    this.demos = demos
    this.service = new TLSNotaryService(demos)
  }

  /**
   * Attest balance is above threshold (without revealing exact amount)
   */
  async attestBalanceThreshold(
    apiUrl: string,
    authToken: string,
    threshold: number
  ): Promise<FinancialAttestation & { meetsThreshold: boolean }> {
    console.log(`💰 Attesting balance threshold...`)

    const { tlsn, tokenId } = await this.service.createTLSNotary({
      targetUrl: apiUrl
    })

    const result = await tlsn.attest({
      url: apiUrl,
      method: "GET",
      headers: {
        "Authorization": `Bearer ${authToken}`
      }
    }, {
      // Hide auth and exact balance
      sent: [{ start: 0, end: 30 }],  // URL only
      recv: [{ start: 0, end: 100 }]  // Partial response
    })

    const data = JSON.parse(result.recv)
    const balance = parseFloat(data.balance || data.available || "0")
    const meetsThreshold = balance >= threshold

    // Store proof
    await this.service.storeProof(
      tokenId,
      JSON.stringify(result.presentation),
      { storage: "onchain" }
    )

    tlsn.destroy()

    return {
      type: "balance",
      institution: new URL(apiUrl).hostname,
      attestedValue: meetsThreshold ? `>=${threshold}` : `<${threshold}`,
      timestamp: result.time,
      proof: JSON.stringify(result.presentation),
      tokenId,
      meetsThreshold
    }
  }

  /**
   * Attest credit score range
   */
  async attestCreditScoreRange(
    apiUrl: string,
    authToken: string
  ): Promise<FinancialAttestation & { range: string }> {
    console.log(`📊 Attesting credit score range...`)

    const { tlsn, tokenId } = await this.service.createTLSNotary({
      targetUrl: apiUrl
    })

    const result = await tlsn.attest({
      url: apiUrl,
      method: "GET",
      headers: {
        "Authorization": `Bearer ${authToken}`
      }
    }, {
      sent: [{ start: 0, end: 30 }],
      recv: [{ start: 0, end: 200 }]
    })

    const data = JSON.parse(result.recv)
    const score = data.credit_score || data.score || 0

    // Convert to range (privacy-preserving)
    let range: string
    if (score >= 800) range = "excellent (800+)"
    else if (score >= 740) range = "very-good (740-799)"
    else if (score >= 670) range = "good (670-739)"
    else if (score >= 580) range = "fair (580-669)"
    else range = "poor (<580)"

    await this.service.storeProof(
      tokenId,
      JSON.stringify(result.presentation),
      { storage: "onchain" }
    )

    tlsn.destroy()

    return {
      type: "credit_score",
      institution: new URL(apiUrl).hostname,
      attestedValue: range,
      timestamp: result.time,
      proof: JSON.stringify(result.presentation),
      tokenId,
      range
    }
  }

  /**
   * Attest recent transaction existence
   */
  async attestTransactionExists(
    apiUrl: string,
    authToken: string,
    txCriteria: {
      minAmount?: number
      maxAmount?: number
      merchant?: string
      afterDate?: Date
    }
  ): Promise<FinancialAttestation & { found: boolean }> {
    console.log(`🔍 Attesting transaction existence...`)

    const { tlsn, tokenId } = await this.service.createTLSNotary({
      targetUrl: apiUrl
    })

    const result = await tlsn.attest({
      url: apiUrl,
      method: "GET",
      headers: {
        "Authorization": `Bearer ${authToken}`
      }
    }, {
      sent: [{ start: 0, end: 30 }],
      recv: [{ start: 0, end: 500 }]
    })

    const data = JSON.parse(result.recv)
    const transactions = data.transactions || []

    // Check if matching transaction exists
    const found = transactions.some((tx: any) => {
      const amount = Math.abs(tx.amount)
      const date = new Date(tx.date)

      if (txCriteria.minAmount && amount < txCriteria.minAmount) return false
      if (txCriteria.maxAmount && amount > txCriteria.maxAmount) return false
      if (txCriteria.merchant && !tx.merchant.includes(txCriteria.merchant)) return false
      if (txCriteria.afterDate && date < txCriteria.afterDate) return false

      return true
    })

    await this.service.storeProof(
      tokenId,
      JSON.stringify(result.presentation),
      { storage: "onchain" }
    )

    tlsn.destroy()

    return {
      type: "transaction",
      institution: new URL(apiUrl).hostname,
      attestedValue: found ? "matching_tx_found" : "no_match",
      timestamp: result.time,
      proof: JSON.stringify(result.presentation),
      tokenId,
      found
    }
  }
}

// Usage
const attestor = new FinancialDataAttestor(demos)

// Attest balance threshold for loan application
const balanceProof = await attestor.attestBalanceThreshold(
  "https://api.bank.com/accounts/balance",
  "auth_token",
  10000  // Must have at least $10,000
)

console.log(`Meets threshold: ${balanceProof.meetsThreshold}`)
console.log(`Proof token: ${balanceProof.tokenId}`)
```

---

## Use Case 4: Web Data Oracle Service

Create a general-purpose web data oracle.

```typescript
import { TLSNotaryService, TLSNotary } from "@kynesyslabs/demosdk/tlsnotary"
import { Demos } from "@kynesyslabs/demosdk/websdk"
import { DemosWork, BaseOperation, WorkStep } from "@kynesyslabs/demosdk/demoswork"

interface OracleRequest {
  id: string
  url: string
  method: "GET" | "POST"
  headers?: Record<string, string>
  body?: string
  jsonPath?: string  // Extract specific field
  transform?: "number" | "string" | "boolean" | "hash"
}

interface OracleResponse {
  requestId: string
  value: any
  rawResponse: string
  timestamp: number
  proof: string
  tokenId: string
  verified: boolean
}

class WebDataOracleService {
  private service: TLSNotaryService
  private demos: Demos
  private cache: Map<string, OracleResponse> = new Map()

  constructor(demos: Demos) {
    this.demos = demos
    this.service = new TLSNotaryService(demos)
  }

  /**
   * Process oracle request with caching
   */
  async processRequest(
    request: OracleRequest,
    options: {
      cacheSeconds?: number
      storeProof?: boolean
    } = {}
  ): Promise<OracleResponse> {
    const cacheKey = `${request.url}:${request.method}:${request.jsonPath || ""}`

    // Check cache
    if (options.cacheSeconds) {
      const cached = this.cache.get(cacheKey)
      if (cached && (Date.now() - cached.timestamp) < options.cacheSeconds * 1000) {
        console.log(`📦 Returning cached response`)
        return cached
      }
    }

    console.log(`🔮 Processing oracle request: ${request.url}`)

    // Create TLSNotary
    const { tlsn, tokenId } = await this.service.createTLSNotary({
      targetUrl: request.url
    })

    // Perform attestation
    const result = await tlsn.attest({
      url: request.url,
      method: request.method,
      headers: request.headers || {},
      body: request.body
    })

    // Parse response
    let rawResponse = result.recv
    let value: any = rawResponse

    // Extract JSON path if specified
    if (request.jsonPath) {
      try {
        const json = JSON.parse(rawResponse)
        value = this.extractJsonPath(json, request.jsonPath)
      } catch (e) {
        console.warn("Failed to parse JSON:", e)
      }
    }

    // Transform value if specified
    if (request.transform) {
      value = this.transformValue(value, request.transform)
    }

    // Store proof if requested
    if (options.storeProof) {
      await this.service.storeProof(
        tokenId,
        JSON.stringify(result.presentation),
        { storage: "onchain" }
      )
    }

    tlsn.destroy()

    const response: OracleResponse = {
      requestId: request.id,
      value,
      rawResponse,
      timestamp: result.time * 1000,  // Convert to ms
      proof: JSON.stringify(result.presentation),
      tokenId,
      verified: true
    }

    // Cache result
    if (options.cacheSeconds) {
      this.cache.set(cacheKey, response)
    }

    return response
  }

  /**
   * Batch process multiple requests
   */
  async processBatch(
    requests: OracleRequest[],
    options: { parallel?: boolean; storeProofs?: boolean } = {}
  ): Promise<Map<string, OracleResponse>> {
    const results = new Map<string, OracleResponse>()

    if (options.parallel) {
      // Process in parallel (with rate limiting)
      const chunks = this.chunkArray(requests, 3)  // 3 at a time

      for (const chunk of chunks) {
        const chunkResults = await Promise.all(
          chunk.map(req => this.processRequest(req, { storeProof: options.storeProofs }))
        )

        chunkResults.forEach((res, i) => {
          results.set(chunk[i].id, res)
        })

        // Rate limit between chunks
        await new Promise(r => setTimeout(r, 2000))
      }
    } else {
      // Process sequentially
      for (const request of requests) {
        const response = await this.processRequest(request, { storeProof: options.storeProofs })
        results.set(request.id, response)
      }
    }

    return results
  }

  /**
   * Create scheduled oracle job via DemosWork
   */
  async createScheduledJob(
    request: OracleRequest,
    schedule: {
      intervalMs: number
      iterations: number
    }
  ): Promise<string> {
    const work = new DemosWork()

    for (let i = 0; i < schedule.iterations; i++) {
      const step = new WorkStep({
        context: "tlsnotary",
        content: {
          action: "attest",
          url: request.url,
          method: request.method,
          headers: request.headers,
          jsonPath: request.jsonPath,
          iteration: i
        },
        critical: false
      })

      work.push(new BaseOperation(step))

      // Add delay between iterations
      if (i < schedule.iterations - 1) {
        const delayStep = new WorkStep({
          context: "system",
          content: {
            action: "delay",
            duration: schedule.intervalMs
          }
        })
        work.push(new BaseOperation(delayStep))
      }
    }

    const compiled = await work.compile(this.demos, this.demos.getPublicKey())
    const tx = await this.demos.signAndBroadcast(compiled)

    console.log(`⏰ Scheduled oracle job created: ${tx.hash}`)

    return tx.hash
  }

  /**
   * Verify proof offline
   */
  async verifyProof(proof: string): Promise<{
    valid: boolean
    server: string
    timestamp: Date
    response: string
  }> {
    const tlsn = new TLSNotary({
      notaryUrl: "",  // Not needed for verification
      proxyUrl: ""
    })

    await tlsn.initialize()

    try {
      const result = await tlsn.verify(JSON.parse(proof))

      return {
        valid: true,
        server: result.serverName,
        timestamp: new Date(result.time * 1000),
        response: result.recv
      }
    } catch (error) {
      return {
        valid: false,
        server: "",
        timestamp: new Date(0),
        response: ""
      }
    } finally {
      tlsn.destroy()
    }
  }

  private extractJsonPath(obj: any, path: string): any {
    return path.split(".").reduce((o, k) => o?.[k], obj)
  }

  private transformValue(value: any, transform: string): any {
    switch (transform) {
      case "number":
        return parseFloat(value)
      case "string":
        return String(value)
      case "boolean":
        return Boolean(value)
      case "hash":
        // SHA-256 hash of value
        return this.hashValue(value)
      default:
        return value
    }
  }

  private hashValue(value: any): string {
    const str = JSON.stringify(value)
    // Simplified hash - in production use crypto.subtle
    let hash = 0
    for (let i = 0; i < str.length; i++) {
      hash = ((hash << 5) - hash) + str.charCodeAt(i)
      hash = hash & hash
    }
    return hash.toString(16)
  }

  private chunkArray<T>(array: T[], size: number): T[][] {
    const chunks: T[][] = []
    for (let i = 0; i < array.length; i += size) {
      chunks.push(array.slice(i, i + size))
    }
    return chunks
  }
}

// Usage
const oracle = new WebDataOracleService(demos)

// Single request
const btcPrice = await oracle.processRequest({
  id: "btc-price",
  url: "https://api.coingecko.com/api/v3/simple/price?ids=bitcoin&vs_currencies=usd",
  method: "GET",
  jsonPath: "bitcoin.usd",
  transform: "number"
}, {
  cacheSeconds: 60,
  storeProof: true
})

console.log(`BTC Price: $${btcPrice.value}`)

// Batch request for multiple assets
const prices = await oracle.processBatch([
  { id: "btc", url: "...", method: "GET", jsonPath: "bitcoin.usd", transform: "number" },
  { id: "eth", url: "...", method: "GET", jsonPath: "ethereum.usd", transform: "number" },
  { id: "sol", url: "...", method: "GET", jsonPath: "solana.usd", transform: "number" }
], { parallel: true, storeProofs: true })

// Scheduled job
await oracle.createScheduledJob(
  { id: "hourly-btc", url: "...", method: "GET", jsonPath: "bitcoin.usd" },
  { intervalMs: 3600000, iterations: 24 }  // Hourly for 24 hours
)
```

---

## Best Practices

### Selective Disclosure
```typescript
// Always hide sensitive headers
const result = await tlsn.attest({
  url: apiUrl,
  method: "GET",
  headers: { "Authorization": "Bearer secret_token" }
}, {
  sent: [
    { start: 0, end: 50 }  // Only show URL, hide auth
  ],
  recv: [
    { start: 0, end: 500 }  // Limit response disclosure
  ]
})
```

### Fee Estimation
```typescript
// Calculate storage fee before storing
const proofSizeKB = Math.ceil(JSON.stringify(proof).length / 1024)
const fee = service.calculateStorageFee(proofSizeKB)
console.log(`Storage will cost ${fee} DEM`)
```

### Resource Cleanup
```typescript
// Always cleanup TLSNotary instances
const tlsn = new TLSNotary(config)
try {
  await tlsn.initialize()
  const result = await tlsn.attest(request)
  return result
} finally {
  tlsn.destroy()  // Always cleanup
}
```

### User Confirmation
```typescript
// Use confirmation callbacks in user-facing apps
const { tlsn, tokenId } = await service.createTLSNotaryWithConfirmation(
  { targetUrl: url },
  {
    onConfirm: async (details) => {
      // Show UI confirmation
      return await showConfirmDialog({
        message: `Burn ${details.amount} DEM for attestation?`
      })
    }
  }
)
```

---

## Related Skills

- [Web2 Integration Agent](./web2-integration-agent.md) - DAHR proxy for APIs
- [Identity Resolution Agent](./identity-resolution-agent.md) - Social verification
- [On-Chain Storage Agent](./onchain-storage-agent.md) - Proof storage
- [ZK Interactive Agent](./zk-interactive-agent.md) - Zero-knowledge proofs
