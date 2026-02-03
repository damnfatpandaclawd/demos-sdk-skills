# CCI: Cross-Context Identity

> **⚠️ Prerequisites**: Complete [SDK Setup](./00-sdk-setup.md) first to configure your environment.

> ⚠️ **Coming Soon**: The identity linking APIs (`demos.identity.*`) are planned but not yet available in SDK v2.9.x. This skill documents the expected patterns for when the feature is released.

## What is CCI?

CCI (Cross-Context Identity) is Demos' universal identity system that will:

- **Link Multiple Wallets** - Connect EVM, Solana, TON addresses to one identity
- **Link Web2 Accounts** - Connect Twitter, GitHub, Discord for social proofs
- **Attested Proofs** - Cryptographic attestations verify identity ownership
- **Cross-Chain** - Single identity works across all supported networks

## Current Status

| Feature | Status |
|---------|--------|
| Demos wallet connection | ✅ Available |
| Get Demos address | ✅ Available |
| XM cross-chain operations | ✅ Available |
| Identity linking (`demos.identity.*`) | 🚧 Coming Soon |
| Web2 account linking | 🚧 Coming Soon |
| Identity queries | 🚧 Coming Soon |

## What Works Now

### Connect and Get Identity Address

Your Demos wallet address IS your identity:

```typescript
import { Demos } from "@kynesyslabs/demosdk/websdk";

async function getMyIdentity() {
  const demos = new Demos();
  await demos.connect("https://demosnode.discus.sh/");
  await demos.connectWallet(mnemonic);
  
  // Your Demos address is your identity
  const demosAddress = demos.getAddress();
  console.log("My Demos Identity:", demosAddress);
  
  return demosAddress;
}
```

### Cross-Chain Operations (XM)

You can already use cross-chain wallets via XM SDK:

```typescript
import { EVM } from "@kynesyslabs/demosdk/xm-websdk";

async function useEVMWallet() {
  const evm = await EVM.create("https://eth.llamarpc.com");
  await evm.connectWallet(evmPrivateKey);
  
  const address = evm.getAddress();
  console.log("EVM Address:", address);
  
  // Prepare transactions for Demos
  const tx = await evm.preparePay(recipient, amount);
  
  await evm.disconnect();
  return tx;
}
```

### Web2 Data via DAHR

Fetch Web2 data with attestations using DAHR:

```typescript
async function fetchSocialData(demos: Demos) {
  const dahr = await demos.web2.createDahr();
  
  // Fetch data from Web2 APIs with attestation
  const response = await dahr.startProxy({
    url: "https://api.github.com/users/username",
    method: "GET",
    headers: { "Accept": "application/json" }
  });
  
  const data = JSON.parse(response.data);
  return {
    data,
    attestationHash: response.responseHash,
    txHash: response.txHash
  };
}
```

## Planned Identity Structure

When identity linking is available, the structure will be:

```
CCI (Demos Address)
├── XM Identities (Blockchain)
│   ├── EVM: 0x1234...
│   ├── Solana: 7xKn...
│   └── TON: EQCd...
└── Web2 Identities (Social)
    ├── Twitter: @username
    ├── GitHub: user123
    └── Discord: user#1234
```

## Planned API (Coming Soon)

### Link Blockchain Wallet

```typescript
// PLANNED - Not yet available
async function linkEVMWallet(demos: Demos, evmPrivateKey: string) {
  const demosAddress = demos.getAddress();
  
  // Sign attestation with EVM wallet
  const evm = await EVM.create("https://eth.llamarpc.com");
  await evm.connectWallet(evmPrivateKey);
  const evmAddress = evm.getAddress();
  
  const message = `Link ${evmAddress} to Demos identity ${demosAddress}`;
  const signature = await evm.signMessage(message);
  
  // Submit link (COMING SOON)
  const result = await demos.identity.addXmIdentity({
    chain: "evm",
    address: evmAddress,
    message,
    signature
  });
  
  return result;
}
```

### Link Web2 Account

```typescript
// PLANNED - Not yet available
async function linkTwitter(demos: Demos, handle: string) {
  // Get challenge (COMING SOON)
  const challenge = await demos.identity.getWeb2Challenge({
    platform: "twitter",
    handle
  });
  
  // User posts challenge to Twitter
  // ...
  
  // Submit proof (COMING SOON)
  const result = await demos.identity.addWeb2Identity({
    platform: "twitter",
    handle,
    proof: "https://twitter.com/user/status/123",
    challengeId: challenge.id
  });
  
  return result;
}
```

### Query Identity

```typescript
// PLANNED - Not yet available
async function getIdentity(demos: Demos, address: string) {
  const identity = await demos.identity.getIdentity(address);
  
  return {
    demosAddress: address,
    xmIdentities: identity.xmIdentities,
    web2Identities: identity.web2Identities
  };
}
```

## Workaround: Manual Identity Tracking

Until the identity API is available, you can track linked addresses manually:

```typescript
interface ManualIdentity {
  demosAddress: string;
  linkedWallets: { chain: string; address: string }[];
  linkedSocials: { platform: string; handle: string }[];
}

// Store in your own database or local storage
const identities = new Map<string, ManualIdentity>();

function trackIdentity(demosAddress: string, chain: string, address: string) {
  let identity = identities.get(demosAddress);
  if (\!identity) {
    identity = { demosAddress, linkedWallets: [], linkedSocials: [] };
    identities.set(demosAddress, identity);
  }
  identity.linkedWallets.push({ chain, address });
}
```

## Important Notes

> **Status**: Identity linking APIs are coming soon. Use DAHR and XM SDK for current functionality.

> **Workaround**: Track identities manually in your own database until the API is available.

> **Updates**: Check [Demos documentation](https://demos.sh/docs) for release announcements.
