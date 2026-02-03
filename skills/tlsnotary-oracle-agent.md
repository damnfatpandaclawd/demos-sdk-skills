# TLSNotary Oracle Agent

Build autonomous oracle agents that fetch, attest, and provide verifiable Web2 data on-chain using MPC-TLS cryptographic proofs.

## Agent Use Cases

| Use Case | Description |
|----------|-------------|
| **Price Oracle Agent** | Fetch cryptocurrency prices from CoinGecko/Binance with cryptographic proof |
| **Social Proof Agent** | Verify Twitter followers, GitHub stars, or Discord membership |
| **KYC Verification Agent** | Attest identity data from trusted providers without exposing raw data |
| **Sports/Events Oracle** | Provide verified game scores or event outcomes for prediction markets |
| **API Data Attestor** | Generic agent that proves any HTTPS response came from a specific server |

## How TLSNotary Works

```
┌─────────────┐     ┌─────────────┐     ┌─────────────┐
│   Agent     │────▶│  TLS Proxy  │────▶│  Target API │
│  (Prover)   │◀────│  (Notary)   │◀────│  (Server)   │
└─────────────┘     └─────────────┘     └─────────────┘
      │                    │
      │   MPC-TLS splits   │
      │   encryption keys  │
      ▼                    ▼
┌─────────────────────────────────────┐
│  Cryptographic Proof Generated      │
│  - Server identity verified         │
│  - Response cannot be forged        │
│  - Selective disclosure supported   │
└─────────────────────────────────────┘
```

## Import

```typescript
import { TLSNotary, TLSNotaryService, initTlsn } from '@kynesyslabs/demosdk/tlsnotary'
```

## Core Classes

### TLSNotary

The prover that runs in browser via WASM to create attestations.

| Method | Purpose |
|--------|---------|
| `initialize()` | Initialize WASM module (once per page load) |
| `attest(request, commit?, onStatus?)` | Full attestation with custom commit ranges |
| `attestQuick(options)` | Simple attestation for straightforward cases |
| `verify(presentationJSON)` | Verify a proof (can be done offline) |
| `getTranscript(request)` | Inspect transcript to plan commit ranges |
| `destroy()` | Cleanup resources when done |

### TLSNotaryService

Manages attestation tokens and on-chain proof storage.

| Method | Purpose |
|--------|---------|
| `requestAttestation(config)` | Request token (burns 1 DEM) |
| `storeProof(tokenId, proof)` | Store proof on-chain (1 + KB fee) |

## Price Oracle Agent Example

```typescript
import { Demos } from '@kynesyslabs/demosdk/websdk'
import { TLSNotary, TLSNotaryService, initTlsn } from '@kynesyslabs/demosdk/tlsnotary'

class PriceOracleAgent {
  private demos: Demos
  private tlsn: TLSNotary
  private service: TLSNotaryService

  async initialize(nodeUrl: string) {
    // Connect to Demos
    this.demos = new Demos()
    await this.demos.connect(nodeUrl)
    await this.demos.connectWallet(process.env.AGENT_PRIVATE_KEY)
    
    // Initialize TLSNotary WASM
    await initTlsn()
    
    // Create TLSNotary instance
    this.tlsn = new TLSNotary({
      notaryUrl: 'wss://notary.demos.sh',
      proxyUrl: 'wss://proxy.demos.sh'
    })
    await this.tlsn.initialize()
    
    // Create service for token management
    this.service = new TLSNotaryService(this.demos)
  }

  async fetchVerifiedPrice(asset: string): Promise<{
    price: number
    proof: any
    timestamp: number
  }> {
    // 1. Request attestation token (burns 1 DEM)
    const { proxyUrl, tokenId } = await this.service.requestAttestation({
      targetUrl: `https://api.coingecko.com/api/v3/simple/price?ids=${asset}&vs_currencies=usd`
    })
    
    // 2. Perform attested request
    const result = await this.tlsn.attestQuick({
      url: `https://api.coingecko.com/api/v3/simple/price?ids=${asset}&vs_currencies=usd`
    })
    
    // 3. Parse the verified response
    const priceData = JSON.parse(result.recv)
    
    // 4. Store proof on-chain (optional - costs 1 + KB DEM)
    const { txHash } = await this.service.storeProof(
      tokenId,
      JSON.stringify(result.presentation)
    )
    
    return {
      price: priceData[asset].usd,
      proof: result.presentation,
      timestamp: result.time
    }
  }

  async verifyExistingProof(proofJson: any): Promise<{
    valid: boolean
    serverName: string
    data: string
  }> {
    // Verify a proof (can be done offline)
    const verification = await this.tlsn.verify(proofJson)
    
    return {
      valid: true,
      serverName: verification.serverName,
      data: verification.recv
    }
  }
}
```

## Social Verification Agent

Agent that verifies social media metrics with cryptographic proof.

```typescript
class SocialVerificationAgent {
  private tlsn: TLSNotary

  async verifyGitHubStars(repo: string): Promise<{
    stars: number
    proof: any
    verified: boolean
  }> {
    // Attest GitHub API response
    const result = await this.tlsn.attest({
      url: `https://api.github.com/repos/${repo}`,
      method: 'GET',
      headers: {
        'User-Agent': 'DemosOracleAgent/1.0'
      }
    }, {
      // Selective disclosure: only reveal star count, hide other data
      recv: [
        { start: 0, end: 100 },      // Headers
        { start: 500, end: 600 }     // Stars field only
      ]
    })
    
    const repoData = JSON.parse(result.recv)
    
    return {
      stars: repoData.stargazers_count,
      proof: result.presentation,
      verified: true
    }
  }

  async verifyTwitterFollowers(
    username: string,
    bearerToken: string
  ): Promise<{
    followers: number
    proof: any
  }> {
    // First, inspect transcript to find follower data location
    const transcript = await this.tlsn.getTranscript({
      url: `https://api.twitter.com/2/users/by/username/${username}?user.fields=public_metrics`,
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${bearerToken}`
      }
    })
    
    // Create attestation with auth header hidden (selective disclosure)
    const result = await this.tlsn.attest({
      url: `https://api.twitter.com/2/users/by/username/${username}?user.fields=public_metrics`,
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${bearerToken}`
      }
    }, {
      // Hide authorization header, reveal only response
      sent: [{ start: 0, end: 50 }],  // Hide auth
      recv: [{ start: 0, end: transcript.recvBytes.length }]
    })
    
    const userData = JSON.parse(result.recv)
    
    return {
      followers: userData.data.public_metrics.followers_count,
      proof: result.presentation
    }
  }
}
```

## Sports Oracle Agent

Agent for prediction markets that provides verified game results.

```typescript
class SportsOracleAgent {
  private tlsn: TLSNotary
  private service: TLSNotaryService

  async getVerifiedGameResult(gameId: string): Promise<{
    homeScore: number
    awayScore: number
    final: boolean
    proof: any
    proofTxHash: string
  }> {
    // Request attestation token
    const { tokenId } = await this.service.requestAttestation({
      targetUrl: `https://api.sportsdata.io/v3/nfl/scores/json/Game/${gameId}`
    })
    
    // Fetch with attestation
    const result = await this.tlsn.attestQuick({
      url: `https://api.sportsdata.io/v3/nfl/scores/json/Game/${gameId}`,
      headers: {
        'Ocp-Apim-Subscription-Key': process.env.SPORTSDATA_API_KEY
      }
    })
    
    const game = JSON.parse(result.recv)
    
    // Store proof on-chain for dispute resolution
    const { txHash } = await this.service.storeProof(
      tokenId,
      JSON.stringify(result.presentation)
    )
    
    return {
      homeScore: game.HomeScore,
      awayScore: game.AwayScore,
      final: game.Status === 'Final',
      proof: result.presentation,
      proofTxHash: txHash
    }
  }
}
```

## Proof Storage Fee Calculation

```typescript
import { calculateStorageFee } from '@kynesyslabs/demosdk/tlsnotary'

// Fee structure:
// - 1 DEM base fee for attestation token
// - 1 DEM per KB for proof storage

const proofSize = JSON.stringify(proof).length / 1024  // KB
const storageFee = calculateStorageFee(proofSize)

console.log(`Storage fee: ${storageFee} DEM`)
// Example: 3KB proof = 1 (base) + 3 (storage) = 4 DEM
```

## Verification Patterns

```typescript
// Verify proof offline (no network needed)
async function verifyProofOffline(proofJson: any): Promise<boolean> {
  const result = await tlsn.verify(proofJson)
  
  console.log('Server:', result.serverName)        // e.g., api.coingecko.com
  console.log('Time:', new Date(result.time * 1000))
  console.log('Response:', result.recv)
  
  return true  // Proof is cryptographically valid
}

// Cross-check proof against expected server
function validateProofSource(proof: any, expectedServer: string): boolean {
  const result = tlsn.verify(proof)
  return result.serverName === expectedServer
}
```

## Agent Architecture Pattern

```typescript
// Generic oracle agent framework
abstract class TLSNotaryOracleAgent {
  protected tlsn: TLSNotary
  protected service: TLSNotaryService
  
  abstract getDataUrl(params: any): string
  abstract parseResponse(response: string): any
  
  async fetchWithProof(params: any): Promise<{
    data: any
    proof: any
    txHash?: string
  }> {
    const url = this.getDataUrl(params)
    
    // Get attestation
    const { tokenId } = await this.service.requestAttestation({ targetUrl: url })
    const result = await this.tlsn.attestQuick({ url })
    
    // Parse data
    const data = this.parseResponse(result.recv)
    
    // Store proof
    const { txHash } = await this.service.storeProof(
      tokenId,
      JSON.stringify(result.presentation)
    )
    
    return { data, proof: result.presentation, txHash }
  }
}

// Concrete implementation
class CryptoOracleAgent extends TLSNotaryOracleAgent {
  getDataUrl(params: { asset: string }) {
    return `https://api.coingecko.com/api/v3/simple/price?ids=${params.asset}&vs_currencies=usd`
  }
  
  parseResponse(response: string) {
    return JSON.parse(response)
  }
}
```

## Quick Reference

| Task | Method |
|------|--------|
| Initialize WASM | `initTlsn()` |
| Create prover | `new TLSNotary(config)` |
| Simple attestation | `tlsn.attestQuick({ url })` |
| Custom commit ranges | `tlsn.attest(request, commitRanges)` |
| Verify proof | `tlsn.verify(proofJson)` |
| Request token | `service.requestAttestation({ targetUrl })` |
| Store on-chain | `service.storeProof(tokenId, proof)` |
| Calculate fee | `calculateStorageFee(sizeKB)` |
