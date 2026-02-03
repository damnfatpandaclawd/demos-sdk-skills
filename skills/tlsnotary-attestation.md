# TLSNotary: Browser-Based HTTPS Attestation

> **⚠️ Prerequisites**: Complete [SDK Setup](./00-sdk-setup.md) first to configure your environment.

Learn to create cryptographic proofs of HTTPS requests using MPC-TLS.

> **Browser Only**: TLSNotary requires a browser environment with WebAssembly (WASM) support. It cannot run in Node.js.

## What is TLSNotary?

TLSNotary enables browser-based attestation of HTTPS requests:

- **MPC-TLS** - Multi-Party Computation for TLS sessions
- **Selective Disclosure** - Reveal only parts of request/response
- **Offline Verification** - Proofs can be verified without the server
- **Browser-Based** - Runs entirely in the browser via WASM

## vs DAHR

| Feature | TLSNotary | DAHR |
|---------|-----------|------|
| Runs in | Browser only | Demos Node |
| Proof type | Full MPC-TLS | Node attestation |
| Privacy | Selective disclosure | Full request logged |
| Use case | User-initiated proofs | Agent automation |
| Setup | More complex | Simple API |

**Use TLSNotary when:**
- User controls the attestation in a browser
- Need selective disclosure (hide sensitive data)
- Proof must be verifiable offline

**Use DAHR when:**
- Agent needs automated attestation (Node.js)
- Simple API calls
- Node-attested is sufficient

## SDK Service Pattern (v2.9.1+)

The recommended way to use TLSNotary with the Demos SDK:

```typescript
import { Demos } from "@kynesyslabs/demosdk/websdk";
import { TLSNotaryService } from "@kynesyslabs/demosdk/tlsnotary";

async function createAttestation(demos: Demos, targetUrl: string) {
  // 1. Create service instance
  const service = new TLSNotaryService(demos);
  
  // 2. Request attestation token from network
  const token = await service.requestAttestation({
    targetUrl,
    method: "GET"
  });
  
  console.log("Token received:", token.id);
  
  // 3. Perform attestation (browser-based)
  const result = await service.attest(token, {
    url: targetUrl,
    method: "GET",
    headers: { "Accept": "application/json" }
  });
  
  // 4. Store proof on-chain
  const stored = await service.storeProof(result.proof, token);
  
  return {
    proof: result.proof,
    txHash: stored.txHash,
    responseData: result.transcript.recv
  };
}
```

## Selective Disclosure

Hide sensitive parts of requests while proving the rest:

```typescript
async function attestWithPrivacy(service: TLSNotaryService, token: any) {
  const result = await service.attest(token, {
    url: "https://api.github.com/user",
    method: "GET",
    headers: { "Authorization": "Bearer ghp_xxxx" }
  }, {
    // Selective disclosure options
    commitRanges: {
      sent: [
        { start: 0, end: 99 },    // Everything before token
        { start: 151, end: 500 }  // Everything after token
      ],
      recv: [{ start: 0, end: 2000 }]  // Full response
    }
  });
  
  // The proof hides bytes 100-150 (the token)
  return result;
}
```

## Storage Fees

Storing proofs on-chain requires DEM tokens:

```typescript
import { calculateStorageFee } from "@kynesyslabs/demosdk/tlsnotary";

// Calculate fee based on proof size
const proofSizeKB = 50;  // 50 KB proof
const fee = calculateStorageFee(proofSizeKB);  // Base + size fee

console.log(`Storage fee: ${fee} DEM`);
```

## Use Cases

### 1. Prove Account Ownership

```typescript
async function proveTwitterAccount(service: TLSNotaryService, bearerToken: string) {
  const token = await service.requestAttestation({
    targetUrl: "https://api.twitter.com/2/users/me",
    method: "GET"
  });
  
  const result = await service.attest(token, {
    url: "https://api.twitter.com/2/users/me",
    method: "GET",
    headers: { "Authorization": `Bearer ${bearerToken}` }
  }, {
    commitRanges: {
      // Hide the bearer token in the proof
      sent: [{ start: 0, end: 80 }, { start: 200, end: 400 }],
      recv: [{ start: 0, end: 2000 }]
    }
  });
  
  return result;
}
```

### 2. Prove Price at Timestamp

```typescript
async function provePriceAtTime(service: TLSNotaryService) {
  const url = "https://api.coingecko.com/api/v3/simple/price?ids=bitcoin&vs_currencies=usd";
  
  const token = await service.requestAttestation({
    targetUrl: url,
    method: "GET"
  });
  
  const result = await service.attest(token, {
    url,
    method: "GET",
    headers: { "Accept": "application/json" }
  });
  
  // Store proof with timestamp
  const stored = await service.storeProof(result.proof, token);
  
  return {
    price: JSON.parse(result.transcript.recv).bitcoin.usd,
    timestamp: result.attestationTime,
    txHash: stored.txHash,
    proof: result.proof
  };
}
```

## Error Handling

```typescript
try {
  const token = await service.requestAttestation({ targetUrl, method: "GET" });
  const result = await service.attest(token, request);
} catch (error) {
  switch (error.code) {
    case "WASM_NOT_SUPPORTED":
      console.error("Browser does not support WebAssembly");
      break;
    case "TOKEN_EXPIRED":
      console.error("Attestation token expired, request new one");
      break;
    case "ATTESTATION_TIMEOUT":
      console.error("Attestation took too long");
      break;
    case "INVALID_COMMIT_RANGES":
      console.error("Commit ranges are invalid or overlap");
      break;
    case "INSUFFICIENT_BALANCE":
      console.error("Not enough DEM for storage fee");
      break;
    default:
      console.error("TLSNotary error:", error.message);
  }
}
```

## Best Practices

1. **Browser only** - TLSNotary cannot run in Node.js (WASM requirement)
2. **Request tokens first** - Always get a token before attempting attestation
3. **Plan commit ranges** - Decide what to reveal/hide before attestation
4. **Handle timeouts** - Some APIs are slow, configure appropriate timeout
5. **Check balance** - Ensure sufficient DEM for storage fees

## Complete Browser Example

```html
<!DOCTYPE html>
<html>
<head>
  <title>TLSNotary Example</title>
</head>
<body>
  <button id="attest">Create Attestation</button>
  <pre id="result"></pre>
  
  <script type="module">
    import { Demos } from "@kynesyslabs/demosdk/websdk";
    import { TLSNotaryService } from "@kynesyslabs/demosdk/tlsnotary";
    
    document.getElementById("attest").onclick = async () => {
      const demos = new Demos();
      await demos.connect("https://demosnode.discus.sh/");
      await demos.connectWallet(mnemonic);
      
      const service = new TLSNotaryService(demos);
      
      const token = await service.requestAttestation({
        targetUrl: "https://api.coingecko.com/api/v3/simple/price?ids=bitcoin&vs_currencies=usd",
        method: "GET"
      });
      
      const result = await service.attest(token, {
        url: token.targetUrl,
        method: "GET"
      });
      
      document.getElementById("result").textContent = JSON.stringify(result, null, 2);
    };
  </script>
</body>
</html>
```

## Important Notes

> **Browser Only**: TLSNotary uses WebAssembly and cannot run in Node.js environments.

> **Token Flow**: Always request an attestation token before calling attest().

> **Storage Fees**: Storing proofs on-chain requires DEM tokens. Check balance first.
