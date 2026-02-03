# DAHR: Attested HTTP Requests

Learn to make verifiable Web2 API calls using Demos DAHR (Demos Attested HTTP Requests).

## What is DAHR?

DAHR allows agents to make HTTP requests to Web2 APIs and receive cryptographically attested responses. This enables:

- **Verifiable API Data** - Prove data came from a specific API
- **Trustless Integration** - No need to trust the agent making the request
- **On-chain Verification** - Attestations can be verified on-chain
- **Cross-Context Data** - Bring Web2 data into Web3 contexts

## Core Pattern

```typescript
import { Demos } from "@kynesyslabs/demosdk/websdk";

async function makeAttestedRequest(
  url: string,
  method: "GET" | "POST" = "GET",
  headers?: Record<string, string>,
  body?: string
) {
  // 1. Connect to Demos
  const demos = new Demos();
  await demos.connect("https://demosnode.discus.sh/");
  await demos.connectWallet(mnemonic);
  
  // 2. Create DAHR proxy session
  const dahr = await demos.web2.createDahr();
  
  // 3. Make attested request
  const response = await dahr.startProxy({
    url,
    method,
    headers: headers || {},
    body: body || ""
  });
  
  // 4. Response includes attestation
  return {
    data: response.data,
    attestation: response.attestation,
    timestamp: response.timestamp,
    nodeSignature: response.signature
  };
}
```

## Use Cases

### 1. Price Feed Attestation

Get verifiable price data from exchanges:

```typescript
async function getAttestedPrice(symbol: string) {
  const demos = new Demos();
  await demos.connect("https://demosnode.discus.sh/");
  await demos.connectWallet(mnemonic);
  
  const dahr = await demos.web2.createDahr();
  
  // Fetch from CoinGecko with attestation
  const response = await dahr.startProxy({
    url: `https://api.coingecko.com/api/v3/simple/price?ids=${symbol}&vs_currencies=usd`,
    method: "GET",
    headers: { "Accept": "application/json" }
  });
  
  return {
    price: response.data[symbol]?.usd,
    attestation: response.attestation,
    verifiable: true
  };
}

// Usage
const btcPrice = await getAttestedPrice("bitcoin");
console.log(`BTC: $${btcPrice.price} (attested)`);
```

### 2. Social Proof Verification

Verify social media data:

```typescript
async function verifyTwitterFollowers(username: string, apiKey: string) {
  const demos = new Demos();
  await demos.connect("https://demosnode.discus.sh/");
  await demos.connectWallet(mnemonic);
  
  const dahr = await demos.web2.createDahr();
  
  const response = await dahr.startProxy({
    url: `https://api.twitter.com/2/users/by/username/${username}?user.fields=public_metrics`,
    method: "GET",
    headers: {
      "Authorization": `Bearer ${apiKey}`,
      "Accept": "application/json"
    }
  });
  
  return {
    followers: response.data.data?.public_metrics?.followers_count,
    attestation: response.attestation
  };
}
```

### 3. API Response Caching with Proof

```typescript
interface AttestedCache {
  data: any;
  attestation: string;
  timestamp: number;
  expiresAt: number;
}

const cache = new Map<string, AttestedCache>();

async function cachedAttestedFetch(url: string, ttlMs: number = 60000) {
  const cached = cache.get(url);
  if (cached && Date.now() < cached.expiresAt) {
    return cached;
  }
  
  const demos = new Demos();
  await demos.connect("https://demosnode.discus.sh/");
  await demos.connectWallet(mnemonic);
  
  const dahr = await demos.web2.createDahr();
  const response = await dahr.startProxy({ url, method: "GET" });
  
  const result: AttestedCache = {
    data: response.data,
    attestation: response.attestation,
    timestamp: Date.now(),
    expiresAt: Date.now() + ttlMs
  };
  
  cache.set(url, result);
  return result;
}
```

## Response Structure

```typescript
interface IWeb2Result {
  success: boolean;
  data: any;              // Parsed response body
  statusCode: number;     // HTTP status code
  headers: Record<string, string>;
  attestation: {
    nodeId: string;       // Demos node that made request
    signature: string;    // Cryptographic signature
    timestamp: number;    // When request was made
    requestHash: string;  // Hash of original request
    responseHash: string; // Hash of response
  };
}
```

## Verifying Attestations

```typescript
import { verifyAttestation } from "@kynesyslabs/demosdk/websdk";

async function verifyDAHRResponse(response: IWeb2Result) {
  const isValid = await verifyAttestation({
    nodeId: response.attestation.nodeId,
    signature: response.attestation.signature,
    requestHash: response.attestation.requestHash,
    responseHash: response.attestation.responseHash,
    data: response.data
  });
  
  if (!isValid) {
    throw new Error("Attestation verification failed");
  }
  
  return response.data;
}
```

## Supported Request Types

| Method | Body Support | Use Case |
|--------|--------------|----------|
| GET | No | Read data, queries |
| POST | Yes | Submit data, mutations |
| PUT | Yes | Update resources |
| DELETE | No | Remove resources |

## Headers Best Practices

```typescript
// Always set Accept header
headers: {
  "Accept": "application/json",
  "Content-Type": "application/json"  // For POST/PUT
}

// API keys should be environment variables
headers: {
  "Authorization": `Bearer ${process.env.API_KEY}`
}
```

## Error Handling

```typescript
try {
  const dahr = await demos.web2.createDahr();
  const response = await dahr.startProxy({ url, method: "GET" });
  
  if (!response.success) {
    throw new Error(`HTTP ${response.statusCode}: Request failed`);
  }
  
  return response.data;
} catch (error) {
  if (error.code === "DAHR_TIMEOUT") {
    console.error("Request timed out");
  } else if (error.code === "DAHR_UNREACHABLE") {
    console.error("Target URL unreachable");
  } else if (error.code === "ATTESTATION_FAILED") {
    console.error("Node failed to attest response");
  }
  throw error;
}
```

## When to Use DAHR

| Scenario | Use DAHR? | Reason |
|----------|-----------|--------|
| Price feeds for DeFi | ✅ Yes | Verifiable pricing data |
| Social proof | ✅ Yes | Prove follower counts, posts |
| Identity verification | ✅ Yes | Verify external accounts |
| Internal APIs | ❌ No | No need for attestation |
| High-frequency data | ⚠️ Maybe | Consider caching |
| Large file downloads | ❌ No | Use direct fetch |

## Integration with DemosWork

DAHR can be used as a step in DemosWork workflows:

```typescript
import { DemosWork, Web2WorkStep } from "@kynesyslabs/demosdk/demoswork";

const work = new DemosWork();

// Add DAHR step to workflow
const priceStep = new Web2WorkStep({
  context: "web2",
  content: {
    url: "https://api.coingecko.com/api/v3/simple/price?ids=ethereum&vs_currencies=usd",
    method: "GET"
  },
  critical: true,
  description: "Fetch ETH price with attestation"
});

work.push(new BaseOperation(priceStep));
```
