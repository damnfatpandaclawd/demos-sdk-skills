# CCI: Cross-Context Identity

> **⚠️ Prerequisites**: Complete [SDK Setup](./00-sdk-setup.md) first to configure your environment.

## Overview

CCI (Cross-Context Identity) is Demos' universal identity system that:

- **Links Multiple Wallets** - Connect EVM, Solana, TON addresses to one Demos identity
- **Links Web2 Accounts** - Connect Twitter, GitHub, Discord with cryptographic proofs
- **Provides Attested Proofs** - Cryptographic attestations verify identity ownership
- **Works Cross-Chain** - Single identity across all supported networks

## Architecture

```
CCI (Demos Address)
├── Web2 Identities (stored in Identity Service)
│   ├── Twitter: @username + proof tweet
│   ├── GitHub: username + proof gist
│   └── Discord: user#1234 + proof message
└── XM Identities (stored on-chain)
    ├── EVM: 0x1234...
    ├── Solana: 7xKn...
    └── TON: EQCd...
```

> **Note**: Web2 identities are stored in a separate identity service container, while XM (blockchain) identities are stored on-chain.

## Quick Start

```typescript
import { Demos } from "@kynesyslabs/demosdk/websdk";
import { Identities } from "@kynesyslabs/demosdk/abstraction";

const demos = new Demos();
await demos.connect("https://demosnode.discus.sh/");
await demos.connectWallet(mnemonic);

const identities = new Identities();

// Get linked Web2 accounts
const web2 = await identities.getWeb2Identities(demos);
console.log("GitHub:", web2.response.github);
console.log("Twitter:", web2.response.twitter);

// Get linked blockchain wallets
const xm = await identities.getXmIdentities(demos);
console.log("XM Identities:", xm.response);
```

## Retrieving Web2 Identities

```typescript
import { Demos } from "@kynesyslabs/demosdk/websdk";
import { Identities } from "@kynesyslabs/demosdk/abstraction";

async function getMyWeb2Identities(demos: Demos) {
  const identities = new Identities();
  const result = await identities.getWeb2Identities(demos);

  // Response structure:
  // {
  //   result: 200,
  //   response: {
  //     github: [{ username, userId, proof, proofHash, timestamp }],
  //     twitter: [{ username, userId, proof, proofHash, timestamp }],
  //     discord: [{ ... }],
  //     telegram: [{ ... }]
  //   }
  // }

  if (result.result === 200) {
    const { github, twitter, discord, telegram } = result.response;

    console.log("GitHub accounts:", github || []);
    console.log("Twitter accounts:", twitter || []);
    console.log("Discord accounts:", discord || []);
    console.log("Telegram accounts:", telegram || []);

    return result.response;
  }

  throw new Error("Failed to retrieve Web2 identities");
}
```

### Web2 Identity Response Structure

```typescript
interface Web2IdentityResponse {
  result: number;  // 200 = success
  response: {
    github?: GitHubIdentity[];
    twitter?: TwitterIdentity[];
    discord?: DiscordIdentity[];
    telegram?: TelegramIdentity[];
  };
}

interface GitHubIdentity {
  username: string;      // GitHub username
  userId: number;        // GitHub user ID
  proof: string;         // Gist URL containing proof
  proofHash: string;     // Hash of the proof
  timestamp: number;     // When linked (Unix ms)
}

interface TwitterIdentity {
  username: string;      // Twitter handle (without @)
  userId: string;        // Twitter user ID
  proof: string;         // Tweet URL containing proof
  proofHash: string;     // Hash of the proof
  timestamp: number;     // When linked (Unix ms)
}
```

## Retrieving XM (Blockchain) Identities

```typescript
async function getMyXmIdentities(demos: Demos) {
  const identities = new Identities();
  const result = await identities.getXmIdentities(demos);

  // Response structure:
  // {
  //   result: 200,
  //   response: {
  //     evm: [{ address, chain, signature, timestamp }],
  //     solana: [{ address, signature, timestamp }],
  //     // ... other chains
  //   }
  // }

  if (result.result === 200) {
    return result.response;
  }

  throw new Error("Failed to retrieve XM identities");
}
```

## Linking a GitHub Account

```typescript
async function linkGitHub(demos: Demos, githubUsername: string) {
  const identities = new Identities();

  // Step 1: Generate proof payload
  const proofPayload = await identities.createWeb2ProofPayload(demos);
  console.log("Proof payload:", proofPayload);
  // Example: "demos:dw2p:ed25519:0x3418cd70..."

  // Step 2: User creates a GitHub Gist with the proof payload
  // The gist should contain ONLY the proof payload string
  // IMPORTANT: No trailing newline!

  const gistUrl = "https://gist.github.com/username/gist_id";

  // Step 3: Link the identity
  const result = await identities.addGithubIdentity(demos, githubUsername, gistUrl);

  if (result.result === 200) {
    console.log("GitHub linked successfully!");
    return result;
  }

  throw new Error("Failed to link GitHub: " + JSON.stringify(result));
}
```

## Linking a Twitter Account

```typescript
async function linkTwitter(demos: Demos, twitterHandle: string) {
  const identities = new Identities();

  // Step 1: Generate proof payload
  const proofPayload = await identities.createWeb2ProofPayload(demos);

  // Step 2: User posts a tweet with the proof payload
  // The tweet should contain the proof payload

  const tweetUrl = "https://x.com/username/status/1234567890";

  // Step 3: Link the identity
  const result = await identities.addTwitterIdentity(demos, twitterHandle, tweetUrl);

  if (result.result === 200) {
    console.log("Twitter linked successfully!");
    return result;
  }

  throw new Error("Failed to link Twitter: " + JSON.stringify(result));
}
```

## Linking Discord and Telegram

```typescript
// Discord
async function linkDiscord(demos: Demos, discordUsername: string, proofUrl: string) {
  const identities = new Identities();
  const proofPayload = await identities.createWeb2ProofPayload(demos);

  // User posts proof in Discord channel, get message URL
  const result = await identities.addDiscordIdentity(demos, discordUsername, proofUrl);
  return result;
}

// Telegram
async function linkTelegram(demos: Demos, telegramUsername: string, proofUrl: string) {
  const identities = new Identities();
  const proofPayload = await identities.createWeb2ProofPayload(demos);

  // User posts proof in Telegram, get message URL
  const result = await identities.addTelegramIdentity(demos, telegramUsername, proofUrl);
  return result;
}
```

## Reverse Lookup: Find Demos ID by Web2 Account

```typescript
async function findDemosIdByTwitter(demos: Demos, twitterHandle: string) {
  const identities = new Identities();
  const result = await identities.getDemosIdsByTwitter(demos, twitterHandle);

  // Returns list of Demos addresses linked to this Twitter account
  return result.response;
}

async function findDemosIdByGithub(demos: Demos, githubUsername: string) {
  const identities = new Identities();
  const result = await identities.getDemosIdsByGithub(demos, githubUsername);
  return result.response;
}
```

## Removing Identities

```typescript
async function removeTwitter(demos: Demos, twitterHandle: string) {
  const identities = new Identities();
  const result = await identities.removeWeb2Identity(demos, "twitter", twitterHandle);
  return result;
}

async function removeGithub(demos: Demos, githubUsername: string) {
  const identities = new Identities();
  const result = await identities.removeWeb2Identity(demos, "github", githubUsername);
  return result;
}
```

## Complete Example: Identity Dashboard

```typescript
import { Demos } from "@kynesyslabs/demosdk/websdk";
import { Identities } from "@kynesyslabs/demosdk/abstraction";

async function showIdentityDashboard(mnemonic: string) {
  const demos = new Demos();
  await demos.connect("https://demosnode.discus.sh/");
  await demos.connectWallet(mnemonic);

  const identities = new Identities();
  const demosAddress = demos.getAddress();

  console.log("═══════════════════════════════════════════");
  console.log("  DEMOS IDENTITY DASHBOARD");
  console.log("═══════════════════════════════════════════\n");

  console.log("Demos Address:", demosAddress);

  // Get Web2 identities
  console.log("\n--- Web2 Identities ---");
  const web2 = await identities.getWeb2Identities(demos);

  if (web2.result === 200) {
    const { github, twitter, discord, telegram } = web2.response;

    if (github?.length) {
      github.forEach(g => console.log(`  GitHub: @${g.username} (ID: ${g.userId})`));
    }
    if (twitter?.length) {
      twitter.forEach(t => console.log(`  Twitter: @${t.username} (ID: ${t.userId})`));
    }
    if (discord?.length) {
      discord.forEach(d => console.log(`  Discord: ${d.username}`));
    }
    if (telegram?.length) {
      telegram.forEach(t => console.log(`  Telegram: @${t.username}`));
    }

    if (!github?.length && !twitter?.length && !discord?.length && !telegram?.length) {
      console.log("  No Web2 identities linked");
    }
  }

  // Get XM identities
  console.log("\n--- Blockchain Identities ---");
  const xm = await identities.getXmIdentities(demos);

  if (xm.result === 200 && Object.keys(xm.response).length > 0) {
    Object.entries(xm.response).forEach(([chain, addresses]) => {
      console.log(`  ${chain.toUpperCase()}:`, addresses);
    });
  } else {
    console.log("  No blockchain wallets linked");
  }

  console.log("\n═══════════════════════════════════════════");
}
```

## Available Methods

| Method | Description |
|--------|-------------|
| `createWeb2ProofPayload(demos)` | Generate proof string for linking |
| `getWeb2Identities(demos)` | Get all linked Web2 accounts |
| `getXmIdentities(demos)` | Get all linked blockchain wallets |
| `addGithubIdentity(demos, username, gistUrl)` | Link GitHub account |
| `addTwitterIdentity(demos, handle, tweetUrl)` | Link Twitter account |
| `addDiscordIdentity(demos, username, proofUrl)` | Link Discord account |
| `addTelegramIdentity(demos, username, proofUrl)` | Link Telegram account |
| `removeWeb2Identity(demos, platform, username)` | Remove Web2 link |
| `getDemosIdsByTwitter(demos, handle)` | Find Demos ID by Twitter |
| `getDemosIdsByGithub(demos, username)` | Find Demos ID by GitHub |
| `getDemosIdsByDiscord(demos, username)` | Find Demos ID by Discord |

## Important Notes

> **Web2 Storage**: Web2 identities are stored in a separate identity service, not on the main Demos chain. They are retrieved via the Identities class.

> **Proof Format**: The proof payload format is `demos:dw2p:ed25519:0x{signature}` - this proves wallet ownership.

> **No Trailing Newline**: When creating GitHub gists for proofs, ensure there's no trailing newline in the content.

## Troubleshooting

### Empty Response from getWeb2Identities

If `getWeb2Identities()` returns empty `{}`:
- The identity service may be in a separate container
- Ensure identities were properly linked with valid proofs
- Check that the proof URLs are still accessible

### "Username passed as undefined"

When linking GitHub, ensure you pass the username correctly:
```typescript
// Correct
await identities.addGithubIdentity(demos, "myusername", gistUrl);

// Wrong - missing username
await identities.addGithubIdentity(demos, gistUrl);
```
