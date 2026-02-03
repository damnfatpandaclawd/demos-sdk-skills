# Cross-Chain Transfers with XM SDK

Learn to perform cross-chain token transfers using the Demos XM SDK.

## Overview

The XM SDK provides a unified interface for interacting with multiple blockchain networks including EVM chains (Ethereum, Base, Polygon, Arbitrum), Solana, MultiversX, TON, and more.

## Supported Chains

| Chain Type | Networks | Import |
|------------|----------|--------|
| **EVM** | Ethereum, Base, Polygon, Arbitrum, BSC, Avalanche | `EVM` from `xm-websdk` |
| **Solana** | Mainnet, Devnet | `Solana` from `xm-websdk` |
| **MultiversX** | Mainnet, Devnet | `MultiversX` from `xm-websdk` |
| **TON** | Mainnet, Testnet | `TON` from `xm-websdk` |

## Core Pattern: EVM Transfer

```typescript
import { EVM } from "@kynesyslabs/demosdk/xm-websdk";

async function transferOnEVM(
  rpcUrl: string,
  privateKey: string,
  recipient: string,
  amount: string
): Promise<string> {
  // 1. Create and connect to chain
  const evm = await EVM.create(rpcUrl);
  
  // 2. Connect wallet
  await evm.connectWallet(privateKey);
  
  // 3. Get current address and balance
  const address = evm.getAddress();
  const balance = await evm.getBalance(address);
  console.log(`Wallet: ${address}, Balance: ${balance}`);
  
  // 4. Prepare signed transaction (for DEMOS network submission)
  const signedTx = await evm.preparePay(recipient, amount);
  
  // 5. Clean up
  await evm.disconnect();
  
  return signedTx;
}
```

## Key Methods

### Connection
| Method | Purpose |
|--------|---------|
| `EVM.create(rpcUrl)` | Create and connect to RPC |
| `connectWallet(privateKey)` | Connect wallet with private key |
| `disconnect()` | Clean up connection |

### Queries
| Method | Purpose |
|--------|---------|
| `getAddress()` | Get connected wallet address |
| `getBalance(address)` | Get native token balance |
| `getTokenBalance(contract, address)` | Get ERC20 token balance |
| `isAddress(address)` | Validate address format |

### Transactions
| Method | Purpose |
|--------|---------|
| `preparePay(to, amount)` | Prepare native token transfer |
| `preparePays(payments[])` | Batch multiple transfers |
| `signTransaction(tx)` | Sign arbitrary transaction |
| `signMessage(message)` | Sign a message |

## Multi-Chain Example

```typescript
import { EVM } from "@kynesyslabs/demosdk/xm-websdk";

// RPC endpoints for different chains
const RPCS = {
  ethereum: "https://eth.llamarpc.com",
  base: "https://mainnet.base.org",
  polygon: "https://polygon-rpc.com",
  arbitrum: "https://arb1.arbitrum.io/rpc",
  avalanche: "https://api.avax.network/ext/bc/C/rpc"
};

async function getBalancesAcrossChains(privateKey: string) {
  const balances: Record<string, string> = {};
  
  for (const [chain, rpc] of Object.entries(RPCS)) {
    try {
      const evm = await EVM.create(rpc);
      await evm.connectWallet(privateKey);
      const address = evm.getAddress();
      balances[chain] = await evm.getBalance(address);
      await evm.disconnect();
    } catch (e) {
      balances[chain] = "error";
    }
  }
  
  return balances;
}
```

## Token Transfers (ERC20)

```typescript
async function transferERC20(
  rpcUrl: string,
  privateKey: string,
  tokenContract: string,
  recipient: string,
  amount: string
): Promise<string> {
  const evm = await EVM.create(rpcUrl);
  await evm.connectWallet(privateKey);
  
  // Get contract instance
  const erc20Abi = [
    "function transfer(address to, uint256 amount) returns (bool)",
    "function balanceOf(address) view returns (uint256)"
  ];
  const contract = await evm.getContractInstance(tokenContract, JSON.stringify(erc20Abi));
  
  // Execute transfer
  const txHash = await evm.writeToContract(contract, "transfer", [recipient, amount]);
  
  await evm.disconnect();
  return txHash;
}
```

## Integration with Demos Network

When using XM SDK with Demos, transactions are prepared locally but submitted through the Demos network for consensus:

```typescript
import { Demos } from "@kynesyslabs/demosdk/websdk";
import { EVM } from "@kynesyslabs/demosdk/xm-websdk";

async function demosXMTransfer() {
  // Connect to Demos
  const demos = new Demos();
  await demos.connect("https://demosnode.discus.sh/");
  await demos.connectWallet(mnemonic);
  
  // Prepare XM transaction
  const evm = await EVM.create("https://sepolia.base.org");
  await evm.connectWallet(privateKey);
  const signedTx = await evm.preparePay(recipient, "0.01");
  
  // Submit through Demos
  const result = await demos.nodeCall("submitXMTransaction", {
    chain: "base-sepolia",
    signedTransaction: signedTx
  });
  
  await evm.disconnect();
  return result;
}
```

## Error Handling

```typescript
try {
  const evm = await EVM.create(rpcUrl);
  await evm.connectWallet(privateKey);
  // ... operations
} catch (error) {
  if (error.code === "INSUFFICIENT_FUNDS") {
    console.error("Not enough balance for transaction + gas");
  } else if (error.code === "NETWORK_ERROR") {
    console.error("RPC endpoint unavailable");
  } else if (error.code === "INVALID_ARGUMENT") {
    console.error("Invalid address or amount format");
  }
} finally {
  await evm?.disconnect();
}
```

## Best Practices

1. **Always disconnect** - Call `disconnect()` when done to clean up resources
2. **Validate addresses** - Use `isAddress()` before transactions
3. **Check balances** - Verify sufficient funds before `preparePay()`
4. **Handle errors** - Wrap operations in try/catch
5. **Use testnet first** - Test on Sepolia/testnet before mainnet
