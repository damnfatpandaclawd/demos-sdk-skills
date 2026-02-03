# CCI: Cross-Context Identity

Learn to manage unified identities across blockchains and Web2 platforms.

## What is CCI?

CCI (Cross-Context Identity) is Demos' universal identity system that:

- **Links Multiple Wallets** - Connect EVM, Solana, TON addresses to one identity
- **Links Web2 Accounts** - Connect Twitter, GitHub, Discord for social proofs
- **Privacy-Preserving** - ZK proofs allow verification without revealing identity
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

## Core Pattern: Linking Wallets

```typescript
import { Demos } from "@kynesyslabs/demosdk/websdk";

async function linkEVMWallet(evmPrivateKey: string) {
  const demos = new Demos();
  await demos.connect("https://demosnode.discus.sh/");
  await demos.connectWallet(demosMnemonic);
  
  // Get your Demos identity
  const demosAddress = demos.wallet.getAddress();
  console.log("Demos Address:", demosAddress);
  
  // Link an EVM wallet
  const result = await demos.identity.addXmIdentity({
    chain: "evm",
    address: evmAddress,
    signature: await signLinkMessage(evmPrivateKey, demosAddress)
  });
  
  return result;
}

// Helper: Sign linking message
async function signLinkMessage(privateKey: string, demosAddress: string) {
  const message = `Link to Demos: ${demosAddress}`;
  // Use EVM SDK to sign
  const evm = await EVM.create("https://eth.llamarpc.com");
  await evm.connectWallet(privateKey);
  return await evm.signMessage(message);
}
```

## ZK Identity (Privacy-Preserving)

For anonymous attestations using zero-knowledge proofs:

```typescript
import { ZKIdentity } from "@kynesyslabs/demosdk/encryption";

async function createPrivateIdentity() {
  // 1. Create ZK identity from provider ID
  const identity = new ZKIdentity("github:12345678");
  
  // 2. Get commitment (safe to share publicly)
  const commitment = identity.getCommitment();
  console.log("Commitment:", commitment);
  
  // 3. Submit commitment to Merkle tree
  const commitmentTx = await identity.createCommitmentTransaction(
    "https://demosnode.discus.sh/"
  );
  
  // 4. Later: Create anonymous attestation
  const attestation = await identity.createAttestationTransaction(
    "https://demosnode.discus.sh/",
    "dao_vote_proposal_42"  // Context (one-time use)
  );
  
  return { commitment, attestation };
}
```

## ZK Identity Methods

| Method | Purpose |
|--------|---------|
| `new ZKIdentity(providerId)` | Create from provider ID |
| `ZKIdentity.generate(providerId)` | Generate with random secret |
| `getCommitment()` | Get public commitment hash |
| `getProvider()` | Get provider name |
| `getSecret()` | Get secret (KEEP SECURE!) |
| `createCommitmentTransaction()` | Add to Merkle tree |
| `createAttestationTransaction()` | Create ZK proof |
| `export()` | Export for backup |
| `ZKIdentity.import(data)` | Restore from backup |
| `ZKIdentity.verifyAttestation()` | Verify proof |

## Linking Web2 Accounts

```typescript
async function linkTwitterAccount(demos: Demos) {
  // 1. Get challenge from node
  const challenge = await demos.identity.getWeb2Challenge("twitter");
  
  // 2. User posts challenge to their Twitter
  // e.g., "Verifying my Demos identity: abc123xyz"
  
  // 3. Submit proof (tweet URL)
  const result = await demos.identity.addWeb2Identity({
    platform: "twitter",
    proof: "https://twitter.com/username/status/123456789",
    challenge: challenge.id
  });
  
  return result;
}
```

## Querying Identities

```typescript
async function lookupIdentity(demos: Demos, address: string) {
  // Get all linked identities for a Demos address
  const identity = await demos.identity.getIdentity(address);
  
  return {
    demosAddress: address,
    xmIdentities: identity.xmIdentities.map(xm => ({
      chain: xm.chain,
      address: xm.address,
      verified: xm.verified
    })),
    web2Identities: identity.web2Identities.map(w2 => ({
      platform: w2.platform,
      handle: w2.handle,
      verified: w2.verified
    }))
  };
}

// Resolve: Find Demos address from any linked address
async function resolveAddress(demos: Demos, anyAddress: string) {
  const result = await demos.identity.resolve(anyAddress);
  return result.demosAddress;
}
```

## Identity Backup & Recovery

```typescript
// Export ZK identity for backup
function backupIdentity(identity: ZKIdentity) {
  const backup = identity.export();
  
  // IMPORTANT: Encrypt before storing!
  const encrypted = encryptBackup(backup, userPassword);
  localStorage.setItem("zk_identity_backup", encrypted);
  
  return backup;
}

// Restore from backup
function restoreIdentity(encryptedBackup: string, password: string) {
  const backup = decryptBackup(encryptedBackup, password);
  return ZKIdentity.import(backup);
}
```

## Use Cases

### 1. Sybil-Resistant Voting

```typescript
async function castAnonymousVote(identity: ZKIdentity, proposalId: string) {
  // Create attestation (each proposal can only be voted once per identity)
  const attestation = await identity.createAttestationTransaction(
    "https://demosnode.discus.sh/",
    `vote:${proposalId}`  // Nullifier prevents double-voting
  );
  
  // Submit vote with ZK proof
  const result = await demos.nodeCall("submitVote", {
    proposalId,
    vote: "yes",
    proof: attestation
  });
  
  return result;
}
```

### 2. Cross-Chain Reputation

```typescript
async function getUnifiedReputation(demos: Demos, demosAddress: string) {
  const identity = await demos.identity.getIdentity(demosAddress);
  
  const reputation = {
    onChain: [],
    social: []
  };
  
  // Aggregate on-chain activity
  for (const xm of identity.xmIdentities) {
    const activity = await getChainActivity(xm.chain, xm.address);
    reputation.onChain.push({ chain: xm.chain, ...activity });
  }
  
  // Aggregate social proof
  for (const w2 of identity.web2Identities) {
    const social = await getSocialMetrics(w2.platform, w2.handle);
    reputation.social.push({ platform: w2.platform, ...social });
  }
  
  return reputation;
}
```

### 3. Gated Access

```typescript
async function checkAccess(demos: Demos, demosAddress: string) {
  const identity = await demos.identity.getIdentity(demosAddress);
  
  // Check if user has verified GitHub
  const hasGitHub = identity.web2Identities.some(
    w2 => w2.platform === "github" && w2.verified
  );
  
  // Check if user has EVM wallet
  const hasEVM = identity.xmIdentities.some(
    xm => xm.chain === "evm" && xm.verified
  );
  
  return {
    canAccessDevTools: hasGitHub,
    canAccessDeFi: hasEVM,
    fullyVerified: hasGitHub && hasEVM
  };
}
```

## Security Best Practices

1. **Never share ZK secrets** - The secret allows creating attestations as you
2. **Encrypt backups** - Always encrypt identity exports before storage
3. **Verify signatures** - Always verify linking signatures server-side
4. **Use HTTPS** - All identity operations should use secure connections
5. **Rate limit** - Protect identity endpoints from abuse

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
      console.error("Signature verification failed");
      break;
    case "COMMITMENT_EXISTS":
      console.error("ZK commitment already in Merkle tree");
      break;
    case "NULLIFIER_USED":
      console.error("This attestation context was already used");
      break;
  }
}
```
