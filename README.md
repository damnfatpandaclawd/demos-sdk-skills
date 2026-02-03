# Demos SDK Skills

A comprehensive collection of development skills for building on the Demos Network using `@kynesyslabs/demosdk`.

## Overview

These skills provide patterns, examples, and best practices for:
- Cross-chain operations (EVM, Solana, MultiversX, NEAR, TON, XRPL, APTOS)
- Identity management (CCI - Cross-Context Identity)
- Multi-step workflow automation (DemosWork)
- Web2 API integration (DAHR proxy)
- Privacy and encryption (L2PS, PQC, UnifiedCrypto)
- Storage solutions (on-chain, IPFS)
- **Autonomous Agent Development** (NEW!)

## Skills by Category

### 🔧 Core Operations (4 skills)

| Skill | Description |
|-------|-------------|
| [core-connection](skills/core-connection.md) | Node connection, wallet setup, basic transactions |
| [cross-chain-xm](skills/cross-chain-xm.md) | Multi-chain operations with XM SDK |
| [native-payments](skills/native-payments.md) | Demos native token transfers and payments |
| [demoswork-basics](skills/demoswork-basics.md) | Multi-step workflow scripting fundamentals |

### 🔐 Identity & Security (4 skills)

| Skill | Description |
|-------|-------------|
| [identity-cci](skills/identity-cci.md) | Cross-Context Identity management |
| [web2-identities](skills/web2-identities.md) | Social identity linking (Twitter, GitHub, Discord) |
| [siwd-authentication](skills/siwd-authentication.md) | Sign-In with Demos for dApps |
| [zk-identity](skills/zk-identity.md) | Zero-knowledge identity proofs |

### 🔒 Privacy & Encryption (3 skills)

| Skill | Description |
|-------|-------------|
| [l2ps-private-subnets](skills/l2ps-private-subnets.md) | Layer 2 Private Subnets with AES-GCM encryption |
| [pqc-enigma](skills/pqc-enigma.md) | Post-Quantum Cryptography (ML-KEM, ML-DSA, Falcon) |
| [unified-crypto](skills/unified-crypto.md) | Multi-algorithm cryptography interface |

### 💾 Storage (1 skill)

| Skill | Description |
|-------|-------------|
| [storage-ipfs](skills/storage-ipfs.md) | On-chain storage programs and IPFS integration |

### 🤖 Agent Development (4 skills) - NEW!

| Skill | Description |
|-------|-------------|
| [tlsnotary-oracle-agent](skills/tlsnotary-oracle-agent.md) | Build oracle agents with cryptographic Web2 proofs |
| [demoswork-agent-pipelines](skills/demoswork-agent-pipelines.md) | Multi-step conditional workflows for agent automation |
| [crosschain-treasury-agent](skills/crosschain-treasury-agent.md) | Cross-chain asset management with gasless bridges |
| [web2-integration-agent](skills/web2-integration-agent.md) | API integrations via DAHR proxy |

## Agent Use Case Examples

### TLSNotary Oracle Agent
- **Price Oracle**: Fetch crypto prices with cryptographic proof
- **Social Verification**: Prove Twitter followers or GitHub stars
- **KYC Agent**: Attest identity data without exposing raw information

### DemosWork Agent Pipelines
- **Arbitrage Agent**: Conditional cross-chain swaps based on price differences
- **DCA Agent**: Automated dollar-cost averaging with balance checks
- **Portfolio Rebalancer**: Automatic allocation adjustments

### Cross-Chain Treasury Agent
- **Yield Chaser**: Move stablecoins to highest-yield chains
- **Emergency Evacuator**: Auto-bridge during protocol issues
- **Cross-Chain Payroll**: Pay team on their preferred chains

### Web2 Integration Agent
- **Social Media Bot**: Cross-post to Twitter/Discord/Telegram
- **Notification Agent**: SMS/Email alerts via Twilio/SendGrid
- **Payment Processor**: Stripe/PayPal fiat integrations

## Quick Start

```typescript
import { Demos } from '@kynesyslabs/demosdk/websdk'

const demos = new Demos()
await demos.connect('https://demosnode.discus.sh/')
await demos.connectWallet(privateKey)

// Now use any skill patterns...
```

## Installation

```bash
npm install @kynesyslabs/demosdk@latest
```

## Resources

- [Demos SDK Documentation](https://demos.sh/docs)
- [API Reference](https://api.demos.sh)
- [Faucet](https://faucet.demos.sh)

## Contributing

Skills are generated and maintained by the Demos community. Submit improvements via PR!

---

**Total Skills**: 16 across 5 categories
