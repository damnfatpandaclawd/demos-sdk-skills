# DAHR: Attested HTTP Requests

> **⚠️ Prerequisites**: Complete [SDK Setup](./00-sdk-setup.md) first to configure your environment.

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
  
  // 4. Parse the response data (returned as string)
  const data = JSON.parse(response.data);
  
  // 5. Response includes attestation hashes
  return {
    data,
    status: response.status,
    responseHash: response.responseHash,
    txHash: response.txHash
  };
}
```

## Response Structure

> **Important**: The response `data` field is a **string** that must be parsed with `JSON.parse()`.

```typescript
interface IWeb2Result {
  status: number;              // HTTP status code (200, 404, etc.)
  statusText: string;          // HTTP status text ("OK", "Not Found", etc.)
  headers: Record<string, string>;  // Response headers
  data: string;                // Response body as STRING - must JSON.parse()
  responseHash: string;        // Hash of response for verification
  responseHeadersHash: string; // Hash of response headers
  txHash: string;              // Transaction hash on Demos network
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
  
  // Parse the string response
  const data = JSON.parse(response.data);
  
  return {
    price: data[symbol]?.usd,
    responseHash: response.responseHash,
    txHash: response.txHash,
    verifiable: true
  };
}

// Usage
const btcPrice = await getAttestedPrice("bitcoin");
console.log(`BTC: $${btcPrice.price} (attested: ${btcPrice.txHash})`);
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
  
  // Parse the string response
  const data = JSON.parse(response.data);
  
  return {
    followers: data.data?.public_metrics?.followers_count,
    responseHash: response.responseHash,
    txHash: response.txHash
  };
}
```

### 3. API Response Caching with Proof

```typescript
interface AttestedCache {
  data: any;
  responseHash: string;
  txHash: string;
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
  
  // Parse the string response
  const data = JSON.parse(response.data);
  
  const result: AttestedCache = {
    data,
    responseHash: response.responseHash,
    txHash: response.txHash,
    timestamp: Date.now(),
    expiresAt: Date.now() + ttlMs
  };
  
  cache.set(url, result);
  return result;
}
```

## Verifying Attestations

Attestation verification is done by checking the `responseHash` and `txHash` against the Demos network:

```typescript
async function verifyDAHRResponse(response: IWeb2Result, demos: Demos) {
  // The txHash can be looked up on the Demos network
  // to verify the attestation was recorded
  const tx = await demos.getTransaction(response.txHash);
  
  if (!tx) {
    throw new Error("Attestation transaction not found");
  }
  
  // Verify the response hash matches
  if (tx.responseHash !== response.responseHash) {
    throw new Error("Response hash mismatch");
  }
  
  return JSON.parse(response.data);
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
  
  // Check HTTP status code
  if (response.status >= 400) {
    throw new Error(`HTTP ${response.status}: ${response.statusText}`);
  }
  
  // Parse and return data
  return JSON.parse(response.data);
} catch (error) {
  if (error.code === "DAHR_TIMEOUT") {
    console.error("Request timed out");
  } else if (error.code === "DAHR_UNREACHABLE") {
    console.error("Target URL unreachable");
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
import { DemosWork, WorkStep, BaseOperation } from "@kynesyslabs/demosdk/demoswork";

const work = new DemosWork();

// Add DAHR step to workflow
const priceStep = new WorkStep({
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

## Important Notes

> **ESM Required**: Use `.mjs` files or add `"type": "module"` to your package.json.

> **Response Parsing**: Always use `JSON.parse(response.data)` - the data field is a string, not an object.
