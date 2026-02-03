# TLSNotary: Browser-Based HTTPS Attestation

Learn to create cryptographic proofs of HTTPS requests using MPC-TLS.

## What is TLSNotary?

TLSNotary enables browser-based attestation of HTTPS requests:

- **MPC-TLS** - Multi-Party Computation for TLS sessions
- **Selective Disclosure** - Reveal only parts of request/response
- **Offline Verification** - Proofs can be verified without the server
- **Browser-Based** - Runs entirely in the browser via WASM

## vs DAHR

| Feature | TLSNotary | DAHR |
|---------|-----------|------|
| Runs in | Browser | Demos Node |
| Proof type | Full MPC-TLS | Node attestation |
| Privacy | Selective disclosure | Full request logged |
| Use case | User-initiated proofs | Agent automation |
| Setup | More complex | Simple API |

**Use TLSNotary when:**
- User controls the attestation
- Need selective disclosure (hide sensitive data)
- Proof must be verifiable offline

**Use DAHR when:**
- Agent needs automated attestation
- Simple API calls
- Node-attested is sufficient

## Quick Start

```typescript
import { TLSNotary } from "@kynesyslabs/demosdk/tlsnotary";

async function quickAttestation() {
  // 1. Create instance
  const tlsn = new TLSNotary({
    notaryUrl: "https://notary.demos.sh",
    proxyUrl: "wss://proxy.demos.sh"
  });
  
  // 2. Initialize WASM (once per page)
  await tlsn.initialize();
  
  // 3. Quick attestation
  const result = await tlsn.attestQuick({
    url: "https://api.coingecko.com/api/v3/simple/price?ids=bitcoin&vs_currencies=usd"
  });
  
  console.log("Proof:", result.presentation);
  console.log("Response:", result.transcript.recv);
  
  // 4. Cleanup
  tlsn.destroy();
  
  return result;
}
```

## Full Attestation Flow

```typescript
import { TLSNotary } from "@kynesyslabs/demosdk/tlsnotary";

async function fullAttestation() {
  const tlsn = new TLSNotary({
    notaryUrl: "https://notary.demos.sh",
    proxyUrl: "wss://proxy.demos.sh"
  });
  
  await tlsn.initialize();
  
  // Full attestation with options
  const result = await tlsn.attest(
    {
      url: "https://api.example.com/user",
      method: "GET",
      headers: {
        "Authorization": "Bearer secret_token",
        "Accept": "application/json"
      }
    },
    {
      // Selective disclosure: hide authorization header
      sent: [{ start: 0, end: 50 }, { start: 150, end: 300 }],
      recv: [{ start: 0, end: 1000 }]  // First 1KB of response
    },
    (status) => {
      console.log("Status:", status);  // Progress updates
    }
  );
  
  tlsn.destroy();
  return result;
}
```

## Selective Disclosure

Hide sensitive parts of requests while proving the rest:

```typescript
async function attestWithPrivacy(tlsn: TLSNotary) {
  // First, get transcript to see byte ranges
  const transcript = await tlsn.getTranscript({
    url: "https://api.github.com/user",
    method: "GET",
    headers: { "Authorization": "Bearer ghp_xxxx" }
  });
  
  console.log("Sent bytes:", transcript.sent.length);
  console.log("Recv bytes:", transcript.recv.length);
  
  // Now attest with selective disclosure
  // Hide the auth token (bytes 100-150 in this example)
  const result = await tlsn.attest(
    {
      url: "https://api.github.com/user",
      method: "GET",
      headers: { "Authorization": "Bearer ghp_xxxx" }
    },
    {
      sent: [
        { start: 0, end: 99 },    // Everything before token
        { start: 151, end: 500 }  // Everything after token
      ],
      recv: [{ start: 0, end: transcript.recv.length }]  // Full response
    }
  );
  
  // The proof hides bytes 100-150 (the token)
  return result;
}
```

## Verification

Proofs can be verified offline:

```typescript
async function verifyProof(tlsn: TLSNotary, proofJSON: PresentationJSON) {
  const result = await tlsn.verify(proofJSON);
  
  return {
    serverName: result.serverName,  // Domain the request was made to
    time: new Date(result.time * 1000),  // Attestation timestamp
    sent: result.sent,  // Request data (with redactions)
    recv: result.recv   // Response data (with redactions)
  };
}

// Verify saved proof
const savedProof = JSON.parse(localStorage.getItem("myProof"));
const verification = await verifyProof(tlsn, savedProof);
```

## Use Cases

### 1. Prove Account Ownership

```typescript
async function proveTwitterAccount(tlsn: TLSNotary, bearerToken: string) {
  const result = await tlsn.attest(
    {
      url: "https://api.twitter.com/2/users/me",
      method: "GET",
      headers: {
        "Authorization": `Bearer ${bearerToken}`
      }
    },
    {
      // Hide the bearer token in the proof
      sent: [{ start: 0, end: 80 }, { start: 200, end: 400 }],
      recv: [{ start: 0, end: 2000 }]  // Show full user response
    }
  );
  
  return result;
}
```

### 2. Prove Financial Data

```typescript
async function proveBalance(tlsn: TLSNotary, exchangeApiKey: string) {
  const result = await tlsn.attest(
    {
      url: "https://api.exchange.com/v1/account/balance",
      method: "GET",
      headers: {
        "X-API-Key": exchangeApiKey
      }
    },
    {
      // Hide API key, show response
      sent: [{ start: 0, end: 50 }],
      recv: [{ start: 0, end: 5000 }]
    }
  );
  
  return result;
}
```

### 3. Prove Price at Timestamp

```typescript
async function provePriceAtTime(tlsn: TLSNotary) {
  const result = await tlsn.attestQuick({
    url: "https://api.coingecko.com/api/v3/simple/price?ids=bitcoin&vs_currencies=usd"
  });
  
  // Proof includes timestamp from notary
  const verification = await tlsn.verify(result.presentation);
  
  return {
    price: JSON.parse(verification.recv).bitcoin.usd,
    timestamp: verification.time,
    proof: result.presentation
  };
}
```

## Token Management

For production use, manage attestation tokens:

```typescript
import { TLSNotaryService } from "@kynesyslabs/demosdk/tlsnotary";
import { calculateStorageFee } from "@kynesyslabs/demosdk/tlsnotary";

async function manageTokens(demos: Demos) {
  const service = new TLSNotaryService(demos);
  
  // Get token for attestation
  const token = await service.getToken();
  
  // Calculate storage fee for proof
  const proofSizeKB = 50;  // 50 KB proof
  const fee = calculateStorageFee(proofSizeKB);  // 1 + 50 = 51 DEM
  
  // Store proof on-chain
  const result = await service.storeProof(proofJSON, token);
  
  return result;
}
```

## Configuration

```typescript
const tlsn = new TLSNotary({
  notaryUrl: "https://notary.demos.sh",  // Notary server
  proxyUrl: "wss://proxy.demos.sh",      // WebSocket proxy
  maxTranscriptSize: 16384,               // Max bytes (optional)
  timeout: 30000                          // Timeout in ms (optional)
});

// Update config later
tlsn.updateConfig({
  timeout: 60000
});

// Get current config
const config = tlsn.getConfig();
```

## Error Handling

```typescript
try {
  await tlsn.initialize();
  const result = await tlsn.attest(request, commitRanges);
} catch (error) {
  switch (error.code) {
    case "WASM_INIT_FAILED":
      console.error("Failed to initialize WASM module");
      break;
    case "NOTARY_UNREACHABLE":
      console.error("Cannot connect to notary server");
      break;
    case "PROXY_ERROR":
      console.error("WebSocket proxy connection failed");
      break;
    case "ATTESTATION_TIMEOUT":
      console.error("Attestation took too long");
      break;
    case "INVALID_COMMIT_RANGES":
      console.error("Commit ranges are invalid or overlap");
      break;
    case "TRANSCRIPT_TOO_LARGE":
      console.error("Response exceeds max transcript size");
      break;
    default:
      console.error("TLSNotary error:", error.message);
  }
} finally {
  tlsn.destroy();  // Always cleanup
}
```

## Best Practices

1. **Initialize once** - Call `initialize()` once per page load
2. **Always destroy** - Call `destroy()` when done to free resources
3. **Plan commit ranges** - Use `getTranscript()` first to plan selective disclosure
4. **Handle timeouts** - Some APIs are slow, increase timeout if needed
5. **Verify locally** - Test proof verification before sharing
6. **Store proofs securely** - Proofs contain request data (even redacted)

## Lifecycle

```typescript
// Recommended pattern
const tlsn = new TLSNotary(config);

try {
  // Initialize (once)
  await tlsn.initialize();
  
  // Multiple attestations
  const proof1 = await tlsn.attestQuick({ url: url1 });
  const proof2 = await tlsn.attestQuick({ url: url2 });
  
  // Verifications
  const v1 = await tlsn.verify(proof1.presentation);
  const v2 = await tlsn.verify(proof2.presentation);
  
} finally {
  // Always cleanup
  tlsn.destroy();
}
```
