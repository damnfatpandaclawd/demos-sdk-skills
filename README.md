# Demos SDK Skills

A comprehensive collection of **100 Claude Code skills** for building AI agents on the Demos Network using `@kynesyslabs/demosdk`.

## Overview

These skills provide patterns, code examples, and best practices for building autonomous agents that leverage Demos Network's cross-chain capabilities, privacy features, and decentralized infrastructure.

## Skills by Category

### Core Infrastructure (8 skills)

| Skill | Description | Key Features |
|-------|-------------|--------------|
| [Workflow Orchestration](./skills/workflow-orchestration-agent.md) | Multi-step conditional workflows | DemosWork pipelines, state machines |
| [Batch Transaction](./skills/batch-transaction-agent.md) | Efficient multi-transaction batching | Atomic batches, gas optimization |
| [Scheduler Agent](./skills/scheduler-agent.md) | Time-based task execution | Cron scheduling, job queues |
| [Health Monitor](./skills/health-monitor-agent.md) | System health and self-diagnostics | Health checks, self-healing |
| [Cache Manager](./skills/cache-manager-agent.md) | Data caching with TTL | LRU cache, multi-level cache |
| [Notification Agent](./skills/notification-agent.md) | Multi-channel alert delivery | Webhooks, aggregation |
| [Rate Limiter](./skills/rate-limiter-agent.md) | API protection and rate control | Token bucket, sliding window |
| [Fee Estimation](./skills/fee-estimation-agent.md) | Dynamic fee optimization | Gas prediction, priority fees |

### Privacy & Encryption (7 skills)

| Skill | Description | Key Features |
|-------|-------------|--------------|
| [FHE Privacy Agent](./skills/fhe-privacy-agent.md) | Homomorphic encryption computation | Private analytics, voting |
| [FHE Computation](./skills/fhe-computation-agent.md) | Advanced FHE operations | Encrypted ML, aggregation |
| [ZK Interactive Proofs](./skills/zk-interactive-agent.md) | Zero-knowledge proof generation | Age verification, solvency |
| [ZK Identity](./skills/zk-identity-agent.md) | Privacy-preserving identity | Anonymous credentials |
| [Wallet Security](./skills/wallet-security-agent.md) | Post-quantum cryptography | Hybrid signatures, recovery |
| [Messaging Agent](./skills/messaging-agent.md) | E2E encrypted P2P messaging | Agent coordination, alerts |
| [L2PS Private Subnet](./skills/l2ps-private-subnet-agent.md) | Encrypted private network shards | Confidential compute |

### Identity & Verification (3 skills)

| Skill | Description | Key Features |
|-------|-------------|--------------|
| [Identity Resolution](./skills/identity-resolution-agent.md) | Cross-context identity (CCI) | Reputation, social proof |
| [Social Identity](./skills/social-identity-agent.md) | Web2 identity verification | Twitter, GitHub, Discord proofs |
| [TLSNotary Attestation](./skills/tlsnotary-attestation-agent.md) | MPC-TLS web data proofs | Price oracles, attestation |

### Storage & Data (4 skills)

| Skill | Description | Key Features |
|-------|-------------|--------------|
| [On-Chain Storage](./skills/onchain-storage-agent.md) | Persistent data with ACL | Config store, knowledge base |
| [Storage Program](./skills/storage-program-agent.md) | Key-value storage operations | Encrypted storage, versioning |
| [DAHR Web2 Proxy](./skills/dahr-web2-proxy-agent.md) | Attested HTTP requests | Oracle data, API bridge |
| [Data Indexing](./skills/data-indexing-agent.md) | Query and aggregate chain data | Analytics, dashboards |

### Multi-Chain Operations (6 skills)

| Skill | Description | Key Features |
|-------|-------------|--------------|
| [Token Discovery](./skills/token-discovery-agent.md) | Find tokens across EVM chains | Arbitrage scanning, tracking |
| [Transaction Builder](./skills/transaction-builder-agent.md) | Complex transaction construction | Batching, simulation |
| [Event Monitoring](./skills/event-monitoring-agent.md) | Real-time blockchain events | Price alerts, whale watching |
| [Cross-Chain Bridge](./skills/crosschain-bridge-agent.md) | Rubic DEX & native bridging | Atomic swaps, arbitrage |
| [Address Monitoring](./skills/address-monitoring-agent.md) | Real-time address tracking | Balance alerts, whale watching |
| [Smart Contract](./skills/smart-contract-agent.md) | Contract deployment & interaction | ABI management, upgrades |

### Chain-Specific Operations (8 skills)

| Skill | Description | Key Features |
|-------|-------------|--------------|
| [Unified Crypto Agent](./skills/unified-crypto-agent.md) | Chain-agnostic operations | Universal interface |
| [Solana Operations](./skills/solana-operations-agent.md) | SPL tokens, PDAs, programs | Jupiter, Raydium integration |
| [Bitcoin Operations](./skills/bitcoin-operations-agent.md) | UTXO, Ordinals, Lightning | Runes, BRC-20 |
| [TON Operations](./skills/ton-operations-agent.md) | Jettons, NFTs, smart contracts | TON DNS, payments |
| [NEAR Operations](./skills/near-operations-agent.md) | Account model, storage staking | Ref Finance, Aurora |
| [XRPL Operations](./skills/xrpl-operations-agent.md) | Trust lines, DEX, escrow | AMM, cross-currency |
| [MultiversX Operations](./skills/multiversx-operations-agent.md) | ESDT tokens, smart contracts | xExchange, staking |
| [IBC Operations](./skills/ibc-operations-agent.md) | Cosmos interchain transfers | Osmosis, packet relay |

### DeFi Operations (8 skills)

| Skill | Description | Key Features |
|-------|-------------|--------------|
| [DEX Integration](./skills/dex-integration-agent.md) | Swap routing & liquidity | Smart routing, TWAP |
| [NFT Operations](./skills/nft-operations-agent.md) | NFT minting, trading | Rarity analysis, sniping |
| [Governance Agent](./skills/governance-agent.md) | DAO voting & delegation | Auto-voting, proposals |
| [Staking Operations](./skills/staking-operations-agent.md) | Staking and delegation | Auto-compound, validator selection |
| [Liquidity Pool](./skills/liquidity-pool-agent.md) | LP management | Impermanent loss monitoring |
| [Yield Optimization](./skills/yield-optimization-agent.md) | Yield aggregation | Auto-rebalancing, strategies |
| [Escrow Agent](./skills/escrow-agent.md) | Trustless escrow services | Multi-party, milestone release |
| [Airdrop Distribution](./skills/airdrop-distribution-agent.md) | Token distribution | Merkle proofs, vesting |

### Security & Compliance (4 skills)

| Skill | Description | Key Features |
|-------|-------------|--------------|
| [Compliance Monitoring](./skills/compliance-monitoring-agent.md) | AML/KYC screening | Pattern detection, alerts |
| [Audit Trail](./skills/audit-trail-agent.md) | Immutable operation logging | Tamper-proof records |
| [Permission Manager](./skills/permission-manager-agent.md) | Role-based access control | RBAC, capability tokens |
| [Session Manager](./skills/session-manager-agent.md) | Session management | JWT-like tokens, refresh |

### Specialized Storage (2 skills)

| Skill | Description | Key Features |
|-------|-------------|--------------|
| [IPFS Storage](./skills/ipfs-storage-agent.md) | Decentralized file storage | Pinning, content addressing |
| [L2PS Subnet](./skills/l2ps-subnet-agent.md) | Private subnet operations | Encrypted transactions |

---

## NEW: Trading & Market Making (10 skills)

| Skill | Description | Key Features |
|-------|-------------|--------------|
| [Market Maker Agent](./skills/market-maker-agent.md) | Automated market making | Spread management, inventory control |
| [Arbitrage Executor](./skills/arbitrage-executor-agent.md) | Cross-DEX arbitrage | Path finding, profit calculation |
| [Order Book Agent](./skills/order-book-agent.md) | Order book aggregation | Depth analysis, spread tracking |
| [Price Oracle Agent](./skills/price-oracle-agent.md) | Decentralized price feeds | TWAP, multi-source aggregation |
| [Slippage Protection](./skills/slippage-protection-agent.md) | Trade slippage prevention | Impact calculation, MEV protection |
| [Flash Loan Agent](./skills/flash-loan-agent.md) | Flash loan execution | Multi-protocol, arbitrage bundling |
| [MEV Protection Agent](./skills/mev-protection-agent.md) | MEV mitigation strategies | Private mempool, backrun prevention |
| [Limit Order Agent](./skills/limit-order-agent.md) | Decentralized limit orders | Price triggers, partial fills |
| [TWAP Executor Agent](./skills/twap-executor-agent.md) | Time-weighted average price | Order splitting, execution timing |
| [Portfolio Rebalancer](./skills/portfolio-rebalancer-agent.md) | Automated rebalancing | Target allocation, drift detection |

## NEW: Analytics & Intelligence (10 skills)

| Skill | Description | Key Features |
|-------|-------------|--------------|
| [Whale Tracker Agent](./skills/whale-tracker-agent.md) | Large holder monitoring | Wallet tracking, flow analysis |
| [Sentiment Analysis Agent](./skills/sentiment-analysis-agent.md) | Social sentiment scoring | Twitter/Discord analysis, trends |
| [On-Chain Analytics](./skills/on-chain-analytics-agent.md) | Blockchain data analysis | TVL tracking, protocol metrics |
| [Token Metrics Agent](./skills/token-metrics-agent.md) | Token fundamental analysis | Supply dynamics, holder distribution |
| [Gas Tracker Agent](./skills/gas-tracker-agent.md) | Gas price monitoring | Prediction, optimal timing |
| [Mempool Monitor Agent](./skills/mempool-monitor-agent.md) | Pending transaction analysis | MEV detection, whale alerts |
| [Contract Analyzer Agent](./skills/contract-analyzer-agent.md) | Smart contract analysis | Security scanning, pattern detection |
| [Risk Assessment Agent](./skills/risk-assessment-agent.md) | Protocol risk evaluation | Exposure analysis, scoring |
| [Volatility Tracker Agent](./skills/volatility-tracker-agent.md) | Price volatility analysis | Historical vol, regime detection |

## NEW: Agent Coordination (10 skills)

| Skill | Description | Key Features |
|-------|-------------|--------------|
| [Agent Registry Agent](./skills/agent-registry-agent.md) | On-chain agent registration | Identity management, discovery |
| [Agent Reputation Agent](./skills/agent-reputation-agent.md) | Performance-based reputation | Scoring, history tracking |
| [Multi-Agent Coordinator](./skills/multi-agent-coordinator-agent.md) | Cross-agent orchestration | Task distribution, consensus |
| [Agent Marketplace Agent](./skills/agent-marketplace-agent.md) | Service marketplace | Bidding, SLA management |
| [Task Delegation Agent](./skills/task-delegation-agent.md) | Intelligent task routing | Load balancing, specialization |
| [Consensus Agent](./skills/consensus-agent.md) | Multi-agent consensus | Voting, threshold agreements |
| [Swarm Intelligence Agent](./skills/swarm-intelligence-agent.md) | Collective decision making | Emergent behavior, optimization |
| [Agent Communication Agent](./skills/agent-communication-agent.md) | Inter-agent messaging | Protocols, encryption |
| [Agent Payment Agent](./skills/agent-payment-agent.md) | Agent-to-agent payments | Micropayments, escrow |
| [Agent Discovery Agent](./skills/agent-discovery-agent.md) | Agent capability discovery | Indexing, matching |

## NEW: DeFi Advanced (10 skills)

| Skill | Description | Key Features |
|-------|-------------|--------------|
| [Lending Protocol Agent](./skills/lending-protocol-agent.md) | Lending/borrowing automation | Rate optimization, health monitoring |
| [Perpetuals Agent](./skills/perpetuals-agent.md) | Perpetual futures trading | Funding rates, position management |
| [Options Agent](./skills/options-agent.md) | Options trading strategies | Greeks calculation, hedging |
| [Vault Manager Agent](./skills/vault-manager-agent.md) | Yield vault management | Strategy rotation, auto-compound |
| [Insurance Agent](./skills/insurance-agent.md) | DeFi insurance protocols | Coverage, claims processing |
| [Collateral Manager Agent](./skills/collateral-manager-agent.md) | Collateral optimization | Health factor, rebalancing |
| [Liquidation Agent](./skills/liquidation-agent.md) | Liquidation monitoring | Opportunity detection, execution |
| [Leverage Agent](./skills/leverage-agent.md) | Leveraged position management | Looping, risk management |
| [Farming Optimizer Agent](./skills/farming-optimizer-agent.md) | Yield farming optimization | APY comparison, auto-compound |
| [Token Launch Agent](./skills/token-launch-agent.md) | Token launch coordination | LBP, fair launch, vesting |

## NEW: Infrastructure (10 skills)

| Skill | Description | Key Features |
|-------|-------------|--------------|
| [Load Balancer Agent](./skills/load-balancer-agent.md) | Request distribution | Round robin, adaptive routing |
| [Failover Agent](./skills/failover-agent.md) | High availability management | Active-passive, circuit breaker |
| [Backup Recovery Agent](./skills/backup-recovery-agent.md) | Data backup and restoration | Incremental, point-in-time recovery |
| [Migration Agent](./skills/migration-agent.md) | Schema and data migration | Zero-downtime, rollback support |
| [Upgrade Manager Agent](./skills/upgrade-manager-agent.md) | System upgrade coordination | Rolling updates, dependency management |
| [Config Manager Agent](./skills/config-manager-agent.md) | Distributed configuration | Feature flags, env management |
| [Secret Manager Agent](./skills/secret-manager-agent.md) | Secrets and credentials | Encryption, rotation, access control |
| [Log Aggregator Agent](./skills/log-aggregator-agent.md) | Centralized logging | Parsing, analytics, anomaly detection |
| [Metrics Collector Agent](./skills/metrics-collector-agent.md) | Performance metrics | Time-series, dashboards |
| [Alert Manager Agent](./skills/alert-manager-agent.md) | Alert routing and escalation | Rules, notifications, incidents |

---

## Quick Start

### Install Demos SDK

```bash
npm install @kynesyslabs/demosdk
```

### Basic Connection

```typescript
import { Demos } from "@kynesyslabs/demosdk/websdk"

const demos = new Demos()
await demos.connect("https://demosnode.discus.sh/")
await demos.connectWallet(privateKey)
```

### Cross-Chain Transaction

```typescript
import { EVM } from "@kynesyslabs/demosdk/xm-websdk"

const evm = await EVM.create("https://rpc.ankr.com/eth_sepolia")
await evm.connectWallet(privateKey)
const tx = await evm.preparePay(recipient, amount)
await evm.disconnect()
```

### DemosWork Pipeline

```typescript
import { DemosWork, BaseOperation, WorkStep } from "@kynesyslabs/demosdk/demoswork"

const work = new DemosWork()
work.push(new BaseOperation(new WorkStep({ context: "xm", content: payload })))
const txPayload = await prepareDemosWorkPayload(work, demos)
```

## Supported Chains

| Chain | Type | SDK Module |
|-------|------|------------|
| Ethereum | EVM | `EVM` |
| Polygon | EVM | `EVM` |
| Arbitrum | EVM | `EVM` |
| Base | EVM | `EVM` |
| Optimism | EVM | `EVM` |
| BSC | EVM | `EVM` |
| Avalanche | EVM | `EVM` |
| Solana | Non-EVM | `Solana` |
| MultiversX | Non-EVM | `MultiversX` |
| NEAR | Non-EVM | `NEAR` |
| TON | Non-EVM | `TON` |
| XRPL | Non-EVM | `XRPL` |
| Bitcoin | Non-EVM | `BTC` |
| Cosmos/IBC | Non-EVM | `IBC` |

## Skill Categories Overview

| Category | Skills | Focus Area |
|----------|--------|------------|
| Core Infrastructure | 8 | Workflows, batching, scheduling, monitoring |
| Privacy & Encryption | 7 | FHE, ZK proofs, secure messaging |
| Identity & Verification | 3 | CCI, social proofs, attestations |
| Storage & Data | 4 | On-chain, IPFS, Web2 proxy |
| Multi-Chain Operations | 6 | Cross-chain, events, bridging |
| Chain-Specific | 8 | Solana, Bitcoin, TON, NEAR, etc. |
| DeFi Operations | 8 | DEX, NFT, governance, staking |
| Security & Compliance | 4 | AML, audit, RBAC |
| Specialized Storage | 2 | IPFS, L2PS |
| Trading & Market Making | 10 | Market making, arbitrage, oracles |
| Analytics & Intelligence | 10 | Whale tracking, sentiment, metrics |
| Agent Coordination | 10 | Registry, reputation, consensus |
| DeFi Advanced | 10 | Lending, perpetuals, options, vaults |
| Infrastructure | 10 | Load balancing, failover, backups |
| **Total** | **100** | |

## MCP Tools Integration

These skills work with Demos SDK MCP tools:

```typescript
// Search SDK documentation
mcp__demosdk_references__search_docs({ query: "preparePay" })

// Get specific module docs
mcp__demosdk_references__get_page({ path: "classes/xmwebsdk.EVM.html" })

// List all modules
mcp__demosdk_references__list_modules()
```

## Resources

- **SDK Documentation**: [docs.demos.sh](https://docs.demos.sh/)
- **Faucet**: [faucet.demos.sh](https://faucet.demos.sh/)
- **Brand Guidelines**: [demos.sh/docs-pages/demos-brand-guidelines](https://demos.sh/docs-pages/demos-brand-guidelines)

## Brand Colors

| Color | Hex | Usage |
|-------|-----|-------|
| Palatinate Blue | `#2B36D9` | Primary CTAs |
| Solar Flame | `#FF4808` | Secondary CTAs |
| Fuchsia | `#FF35F9` | Creative accents |
| Sky Blue | `#00DAFF` | Data visualization |
| Background Dark | `#010109` | Dark mode |

## Contributing

To add a new skill:

1. Create a markdown file in `./skills/`
2. Include SDK reference, use cases, and code examples
3. Add to this README under appropriate category
4. Link related skills for navigation

## License

MIT - See [LICENSE](./LICENSE) for details.

---

Built for the Demos Network ecosystem using `@kynesyslabs/demosdk`
