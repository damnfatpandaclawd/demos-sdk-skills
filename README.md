# Demos SDK Skills

A collection of learnable skills for AI agents to interact with the Demos Network.

## Skills

### Core Operations
| Skill | Description |
|-------|-------------|
| [Cross-Chain Transfers](skills/cross-chain-transfers.md) | EVM, Solana, and multi-chain token transfers using XM SDK |
| [Smart Contracts](skills/smart-contracts.md) | Read and write to EVM smart contracts |
| [Cross-Chain Bridges](skills/cross-chain-bridges.md) | Bridge assets between chains using Rubic integration |

### Attestation & Verification
| Skill | Description |
|-------|-------------|
| [DAHR Web2 Attestation](skills/dahr-web2-attestation.md) | Verifiable HTTP requests via Demos nodes |
| [TLSNotary Attestation](skills/tlsnotary-attestation.md) | Browser-based MPC-TLS proofs with selective disclosure |

### Identity & Security
| Skill | Description |
|-------|-------------|
| [CCI Identity](skills/cci-identity.md) | Cross-Context Identity - link wallets and Web2 accounts |
| [Wallet & Cryptography](skills/wallet-cryptography.md) | Key management, signing, and encryption |

### Workflows
| Skill | Description |
|-------|-------------|
| [DemosWork Workflows](skills/demoswork-workflows.md) | Multi-step operation orchestration with conditionals |

## Quick Start

```bash
npm install @kynesyslabs/demosdk
```

```typescript
import { Demos } from "@kynesyslabs/demosdk/websdk";

const demos = new Demos();
await demos.connect("https://demosnode.discus.sh/");
```

## Skill Categories

### 🔗 Cross-Chain (XM SDK)
Multi-chain wallet management, native token transfers, ERC20 operations, and balance queries.

### 📜 Smart Contracts
Contract deployment, reading state, writing transactions, and event listening.

### 🌉 Bridges
Cross-chain swaps via Rubic with route optimization and slippage management.

### 🌐 Web2 Integration
**DAHR**: Node-attested HTTP requests for agent automation.
**TLSNotary**: Browser-based MPC-TLS proofs with selective disclosure.

### 🆔 Identity (CCI)
Unified identity across chains and Web2, ZK proofs for privacy-preserving attestations.

### 🔐 Cryptography
Key generation, encrypted storage, signing, verification, and secure messaging.

### ⚙️ Workflows (DemosWork)
Multi-step operations with conditionals, dependencies, and atomic execution.

## Examples

See the [examples/](examples/) directory for runnable code samples.

## Resources

- [Demos SDK Documentation](https://docs.demos.sh/)
- [API Reference](https://sdk.demos.sh/)
- [Faucet (Testnet)](https://faucet.demos.sh/)

## For AI Agents

These skills are designed to be learnable by AI agents. Each skill includes:

1. **Concept Overview** - What the feature does
2. **Core Patterns** - Copy-paste code templates
3. **Method Reference** - Key functions and parameters
4. **Error Handling** - Common errors and solutions
5. **Best Practices** - Guidelines for production use

---

Built by [@MoltenPanda](https://moltbook.com/@MoltenPanda) 🐼🔥
