# Demos SDK Skills

Comprehensive skill documentation for AI agents working with the Demos Network SDK (@kynesyslabs/demosdk).

## Skills by Category

### Core Operations
| Skill | Description |
|-------|-------------|
| [cross-chain-transfers](skills/cross-chain-transfers.md) | XM SDK patterns for EVM/Solana transfers |
| [dahr-web2-attestation](skills/dahr-web2-attestation.md) | Attested HTTP requests via DAHR proxy |
| [demoswork-workflows](skills/demoswork-workflows.md) | Multi-step workflow orchestration |
| [cross-chain-bridges](skills/cross-chain-bridges.md) | RubicBridge cross-chain swaps |

### Identity & Security
| Skill | Description |
|-------|-------------|
| [cci-identity](skills/cci-identity.md) | Cross-Context Identity with ZKIdentity |
| [smart-contracts](skills/smart-contracts.md) | EVM contract read/write/events |
| [wallet-cryptography](skills/wallet-cryptography.md) | Key generation, signing, encryption |
| [tlsnotary-attestation](skills/tlsnotary-attestation.md) | Browser-based MPC-TLS attestation |

### Privacy & Encryption
| Skill | Description |
|-------|-------------|
| [l2ps-private-subnets](skills/l2ps-private-subnets.md) | Layer 2 Private Subnets with AES-GCM encryption |
| [pqc-enigma](skills/pqc-enigma.md) | Post-Quantum Cryptography (ML-KEM, ML-DSA, Falcon) |
| [unified-crypto](skills/unified-crypto.md) | Multi-algorithm cryptography interface |

### Storage
| Skill | Description |
|-------|-------------|
| [storage-ipfs](skills/storage-ipfs.md) | On-chain storage programs & IPFS integration |

## Quick Start

```typescript
import { Demos } from "@kynesyslabs/demosdk/websdk"

const demos = new Demos()
await demos.connect("https://demosnode.discus.sh/")
await demos.connectWallet(privateKey)
```

## SDK Modules

| Module | Import Path |
|--------|-------------|
| WebSDK | `@kynesyslabs/demosdk/websdk` |
| XM SDK | `@kynesyslabs/demosdk/xm-websdk` |
| DemosWork | `@kynesyslabs/demosdk/demoswork` |
| Bridge | `@kynesyslabs/demosdk/bridge` |
| Encryption | `@kynesyslabs/demosdk/encryption` |
| Storage | `@kynesyslabs/demosdk/storage` |
| IPFS | `@kynesyslabs/demosdk/ipfs` |
| L2PS | `@kynesyslabs/demosdk/l2ps` |
| TLSNotary | `@kynesyslabs/demosdk/tlsnotary` |

## Resources

- [Demos Faucet](https://faucet.demos.sh/)
- [SDK Documentation](https://docs.demos.sh/)
- Local node: `http://localhost:53550`

## Examples

See the [examples](examples/) directory for working code samples:
- [cross-chain-balance.js](examples/cross-chain-balance.js) - Multi-chain balance checker
- [dahr-price-feed.js](examples/dahr-price-feed.js) - Attested price feed
