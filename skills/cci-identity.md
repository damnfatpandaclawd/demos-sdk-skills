# CCI: Cross-Context Identity

Learn to manage unified identities across blockchains and Web2 platforms.

## What is CCI?

CCI (Cross-Context Identity) is Demos' universal identity system that:

- **Links Multiple Wallets** - Connect EVM, Solana, TON addresses to one identity
- **Links Web2 Accounts** - Connect Twitter, GitHub, Discord for social proofs
- **Attested Proofs** - Cryptographic attestations verify identity ownership
- **Cross-Chain** - Single identity works across all supported networks

## Identity Structure

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

## Getting Started

```typescript
import { Demos } from "@kynesyslabs/demosdk/websdk";

async function connectIdentity() {
  const demos = new Demos();
  await demos.connect("https://demosnode.discus.sh/");
  await demos.connectWallet(mnemonic);
  
  // Your Demos address IS your identity
  const demosAddress = demos.getAddress();
  console.log("Demos Identity:", demosAddress);
  
  return demos;
}
```

## Linking Blockchain Wallets (XM Identities)

Link external blockchain wallets to your Demos identity using signed attestations.

### Link EVM Wallet

```typescript
import { Demos } from "@kynesyslabs/demosdk/websdk";
import { EVM } from "@kynesyslabs/demosdk/xm-websdk";

async function linkEVMWallet(demos: Demos, evmPrivateKey: string) {
  const demosAddress = demos.getAddress();
  
  // 1. Create EVM instance and get address
  const evm = await EVM.create("https://eth.llamarpc.com");
  await evm.connectWallet(evmPrivateKey);
  const evmAddress = evm.getAddress();
  
  // 2. Create attestation message
  const message = `Link ${evmAddress} to Demos identity ${demosAddress}`;
  
  // 3. Sign with EVM wallet (proves ownership)
  const signature = await evm.signMessage(message);
  
  // 4. Submit link attestation to Demos
  const result = await demos.identity.addXmIdentity({
    chain: "evm",
    address: evmAddress,
    message,
    signature
  });
  
  await evm.disconnect();
  return result;
}
```

### Link Solana Wallet

```typescript
import { Solana } from "@kynesyslabs/demosdk/xm-websdk";

async function linkSolanaWallet(demos: Demos, solanaPrivateKey: string) {
  const demosAddress = demos.getAddress();
  
  // 1. Create Solana instance
  const solana = await Solana.create("https://api.mainnet-beta.solana.com");
  await solana.connectWallet(solanaPrivateKey);
  const solAddress = solana.getAddress();
  
  // 2. Create and sign attestation
  const message = `Link ${solAddress} to Demos identity ${demosAddress}`;
  const signature = await solana.signMessage(message);
  
  // 3. Submit to Demos
  const result = await demos.identity.addXmIdentity({
    chain: "solana",
    address: solAddress,
    message,
    signature
  });
  
  await solana.disconnect();
  return result;
}
```

## Linking Web2 Accounts

Link social accounts using attested proofs (posting verification messages).

### Link Twitter

```typescript
async function linkTwitter(demos: Demos, twitterHandle: string) {
  const demosAddress = demos.getAddress();
  
  // 1. Get verification challenge
  const challenge = await demos.identity.getWeb2Challenge({
    platform: "twitter",
    handle: twitterHandle
  });
  
  console.log("Post this tweet:", challenge.message);
  // Example: "Verifying my Demos identity: demos1abc...xyz #DemosNetwork"
  
  // 2. User posts the challenge to Twitter
  // ... user action required ...
  
  // 3. Submit proof (tweet URL)
  const result = await demos.identity.addWeb2Identity({
    platform: "twitter",
    handle: twitterHandle,
    proof: "https://twitter.com/username/status/123456789",
    challengeId: challenge.id
  });
  
  return result;
}
```

### Link GitHub

```typescript
async function linkGitHub(demos: Demos, githubUsername: string) {
  const demosAddress = demos.getAddress();
  
  // 1. Get verification challenge
  const challenge = await demos.identity.getWeb2Challenge({
    platform: "github",
    handle: githubUsername
  });
  
  console.log("Create a gist with this content:", challenge.message);
  
  // 2. User creates public gist with challenge
  // ... user action required ...
  
  // 3. Submit proof (gist URL)
  const result = await demos.identity.addWeb2Identity({
    platform: "github",
    handle: githubUsername,
    proof: "https://gist.github.com/username/abc123",
    challengeId: challenge.id
  });
  
  return result;
}
```

## Querying Identities

### Get Full Identity

```typescript
async function getIdentity(demos: Demos, address: string) {
  const identity = await demos.identity.getIdentity(address);
  
  return {
    demosAddress: address,
    xmIdentities: identity.xmIdentities.map(xm => ({
      chain: xm.chain,
      address: xm.address,
      verified: xm.verified,
      linkedAt: xm.timestamp
    })),
    web2Identities: identity.web2Identities.map(w2 => ({
      platform: w2.platform,
      handle: w2.handle,
      verified: w2.verified,
      linkedAt: w2.timestamp
    }))
  };
}
```

### Resolve Address

Find Demos identity from any linked address:

```typescript
async function resolveToDemo(demos: Demos, anyAddress: string) {
  // Works with EVM, Solana, or any linked address
  const result = await demos.identity.resolve(anyAddress);
  
  if (result) {
    console.log("Demos identity:", result.demosAddress);
    console.log("Linked addresses:", result.linkedAddresses);
  }
  
  return result;
}
```

### Check Verification Status

```typescript
async function checkVerification(demos: Demos, demosAddress: string) {
  const identity = await demos.identity.getIdentity(demosAddress);
  
  return {
    hasVerifiedEVM: identity.xmIdentities.some(
      xm => xm.chain === "evm" && xm.verified
    ),
    hasVerifiedTwitter: identity.web2Identities.some(
      w2 => w2.platform === "twitter" && w2.verified
    ),
    hasVerifiedGitHub: identity.web2Identities.some(
      w2 => w2.platform === "github" && w2.verified
    ),
    totalLinkedWallets: identity.xmIdentities.length,
    totalLinkedSocials: identity.web2Identities.length
  };
}
```

## Use Cases

### 1. Cross-Chain Reputation

Aggregate reputation from all linked wallets:

```typescript
async function getUnifiedReputation(demos: Demos, demosAddress: string) {
  const identity = await demos.identity.getIdentity(demosAddress);
  
  const reputation = {
    chains: [],
    totalTxCount: 0,
    totalValue: 0
  };
  
  // Aggregate from each linked chain
  for (const xm of identity.xmIdentities) {
    const chainData = await getChainActivity(xm.chain, xm.address);
    reputation.chains.push({
      chain: xm.chain,
      txCount: chainData.txCount,
      value: chainData.totalValue
    });
    reputation.totalTxCount += chainData.txCount;
    reputation.totalValue += chainData.totalValue;
  }
  
  return reputation;
}
```

### 2. Gated Access

Control access based on verified identities:

```typescript
async function checkAccess(demos: Demos, demosAddress: string) {
  const identity = await demos.identity.getIdentity(demosAddress);
  
  // Require verified GitHub for dev tools
  const hasGitHub = identity.web2Identities.some(
    w2 => w2.platform === "github" && w2.verified
  );
  
  // Require verified EVM wallet for DeFi features
  const hasEVM = identity.xmIdentities.some(
    xm => xm.chain === "evm" && xm.verified
  );
  
  return {
    canAccessDevTools: hasGitHub,
    canAccessDeFi: hasEVM,
    canAccessPremium: hasGitHub && hasEVM
  };
}
```

### 3. Cross-Chain Payments

Pay to any linked address:

```typescript
async function payByIdentity(demos: Demos, recipientDemos: string, preferredChain: string) {
  const identity = await demos.identity.getIdentity(recipientDemos);
  
  // Find address on preferred chain
  const chainIdentity = identity.xmIdentities.find(
    xm => xm.chain === preferredChain && xm.verified
  );
  
  if (!chainIdentity) {
    throw new Error(`Recipient has no verified ${preferredChain} address`);
  }
  
  return chainIdentity.address;
}
```

## Error Handling

```typescript
try {
  await demos.identity.addXmIdentity(payload);
} catch (error) {
  switch (error.code) {
    case "ALREADY_LINKED":
      console.error("This wallet is already linked to another identity");
      break;
    case "INVALID_SIGNATURE":
      console.error("Signature verification failed - sign with correct wallet");
      break;
    case "IDENTITY_NOT_FOUND":
      console.error("No identity found for this address");
      break;
    case "CHALLENGE_EXPIRED":
      console.error("Verification challenge expired - request new one");
      break;
    case "PROOF_INVALID":
      console.error("Could not verify proof - check URL is correct");
      break;
  }
}
```

## Security Best Practices

1. **Verify signatures server-side** - Don't trust client-side verification alone
2. **Check attestation timestamps** - Reject old attestations to prevent replay
3. **Rate limit linking** - Prevent spam identity creation
4. **Validate proof URLs** - Ensure proofs come from correct platforms
5. **Use HTTPS** - All identity operations should use secure connections

## Important Notes

> **ESM Required**: Use `.mjs` files or add `"type": "module"` to your package.json.

> **Attestations**: All identity links require cryptographic attestations (signatures or posted proofs).

> **Immutable Links**: Once verified, identity links are recorded on-chain and cannot be removed.
