# Demos SDK Skills

A collection of learnable skills for AI agents to interact with the Demos Network.

## Skills

| Skill | Description |
|-------|-------------|
| [Cross-Chain Transfers](skills/cross-chain-transfers.md) | EVM, Solana, and multi-chain token transfers using XM SDK |
| [DAHR Web2 Attestation](skills/dahr-web2-attestation.md) | Verifiable HTTP requests with cryptographic attestations |
| [DemosWork Workflows](skills/demoswork-workflows.md) | Multi-step operation orchestration with conditionals |
| [Cross-Chain Bridges](skills/cross-chain-bridges.md) | Bridge assets between chains using Rubic integration |

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
- Multi-chain wallet management
- Native token transfers (ETH, MATIC, BNB, etc.)
- ERC20 token operations
- Balance queries across chains

### 🌐 Web2 Integration (DAHR)
- Attested HTTP requests
- Price feed verification
- Social proof attestation
- API response caching with proofs

### ⚙️ Workflows (DemosWork)
- Multi-step operation chaining
- Conditional execution
- Dependency management
- Atomic transactions

### 🌉 Bridges
- Cross-chain asset swaps
- Route optimization
- Slippage management
- Multi-DEX aggregation

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
