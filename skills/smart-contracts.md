# Smart Contract Interaction

> **⚠️ Prerequisites**: Complete [SDK Setup](./00-sdk-setup.md) first to configure your environment.

Learn to read from and write to smart contracts on EVM chains.

## Overview

The XM SDK provides comprehensive smart contract interaction:

- **Read Operations** - Query contract state (free, no gas)
- **Write Operations** - Execute contract functions (requires gas)
- **Event Listening** - Subscribe to contract events
- **Contract Instances** - Reusable contract objects

## Core Pattern

```typescript
import { EVM } from "@kynesyslabs/demosdk/xm-websdk";

async function interactWithContract() {
  // 1. Connect to chain
  const evm = await EVM.create("https://mainnet.base.org");
  await evm.connectWallet(privateKey);
  
  // 2. Get contract instance
  const contract = await evm.getContractInstance(
    contractAddress,
    JSON.stringify(contractABI)
  );
  
  // 3. Read from contract (free)
  const value = await evm.readFromContract(contract, "getValue", []);
  
  // 4. Write to contract (costs gas)
  const txHash = await evm.writeToContract(contract, "setValue", [42]);
  
  // 5. Clean up
  await evm.disconnect();
  
  return { value, txHash };
}
```

## Reading Contract State

```typescript
// Simple read (no arguments)
const totalSupply = await evm.readFromContract(contract, "totalSupply", []);

// Read with arguments
const balance = await evm.readFromContract(contract, "balanceOf", [walletAddress]);

// Read multiple values
const [name, symbol, decimals] = await Promise.all([
  evm.readFromContract(contract, "name", []),
  evm.readFromContract(contract, "symbol", []),
  evm.readFromContract(contract, "decimals", [])
]);
```

## Writing to Contracts

```typescript
// Simple write
const txHash = await evm.writeToContract(contract, "transfer", [recipient, amount]);

// Write with ETH value
const txHash = await evm.writeToContract(
  contract, 
  "deposit", 
  [],
  { value: "0.1" }  // Send 0.1 ETH
);

// Write with gas limit
const txHash = await evm.writeToContract(
  contract,
  "complexOperation",
  [arg1, arg2],
  { gasLimit: 500000 }
);
```

## ERC20 Token Operations

```typescript
const ERC20_ABI = [
  "function name() view returns (string)",
  "function symbol() view returns (string)",
  "function decimals() view returns (uint8)",
  "function totalSupply() view returns (uint256)",
  "function balanceOf(address) view returns (uint256)",
  "function transfer(address to, uint256 amount) returns (bool)",
  "function approve(address spender, uint256 amount) returns (bool)",
  "function allowance(address owner, address spender) view returns (uint256)"
];

async function getTokenInfo(evm: EVM, tokenAddress: string) {
  const contract = await evm.getContractInstance(
    tokenAddress,
    JSON.stringify(ERC20_ABI)
  );
  
  const [name, symbol, decimals, totalSupply] = await Promise.all([
    evm.readFromContract(contract, "name", []),
    evm.readFromContract(contract, "symbol", []),
    evm.readFromContract(contract, "decimals", []),
    evm.readFromContract(contract, "totalSupply", [])
  ]);
  
  return { name, symbol, decimals, totalSupply };
}

async function transferToken(
  evm: EVM,
  tokenAddress: string,
  recipient: string,
  amount: string
) {
  const contract = await evm.getContractInstance(
    tokenAddress,
    JSON.stringify(ERC20_ABI)
  );
  
  // Approve spending (if needed)
  const txHash = await evm.writeToContract(
    contract,
    "transfer",
    [recipient, amount]
  );
  
  return txHash;
}
```

## ERC721 NFT Operations

```typescript
const ERC721_ABI = [
  "function balanceOf(address owner) view returns (uint256)",
  "function ownerOf(uint256 tokenId) view returns (address)",
  "function tokenURI(uint256 tokenId) view returns (string)",
  "function approve(address to, uint256 tokenId)",
  "function transferFrom(address from, address to, uint256 tokenId)",
  "function safeTransferFrom(address from, address to, uint256 tokenId)"
];

async function getNFTMetadata(evm: EVM, nftAddress: string, tokenId: number) {
  const contract = await evm.getContractInstance(
    nftAddress,
    JSON.stringify(ERC721_ABI)
  );
  
  const [owner, tokenURI] = await Promise.all([
    evm.readFromContract(contract, "ownerOf", [tokenId]),
    evm.readFromContract(contract, "tokenURI", [tokenId])
  ]);
  
  // Fetch metadata from URI
  let metadata = null;
  if (tokenURI.startsWith("ipfs://")) {
    const gateway = "https://ipfs.io/ipfs/";
    const hash = tokenURI.replace("ipfs://", "");
    const response = await fetch(gateway + hash);
    metadata = await response.json();
  }
  
  return { owner, tokenURI, metadata };
}
```

## Event Listening

```typescript
// Listen for specific event
const eventData = await evm.listenForEvent(
  contractAddress,
  contractABI,
  "Transfer",  // Event name
  5000  // Timeout in ms
);

// Listen for all events
const removeListener = evm.listenForAllEvents(
  contractAddress,
  contractABI,
  (eventName, ...args) => {
    console.log(`Event: ${eventName}`, args);
  }
);

// Later: stop listening
removeListener();
```

## Raw Transactions

For advanced use cases:

```typescript
// Create raw transaction
const rawTx = await evm.createRawTransaction({
  to: contractAddress,
  data: encodedFunctionCall,
  value: "0",
  gasLimit: 100000
});

// Sign transaction
const signedTx = await evm.signTransaction(rawTx);

// Wait for receipt
const receipt = await evm.waitForReceipt(txHash);
console.log("Gas used:", receipt.gasUsed);
```

## Common Contract ABIs

### Uniswap V2 Router

```typescript
const UNISWAP_ROUTER_ABI = [
  "function swapExactTokensForTokens(uint amountIn, uint amountOutMin, address[] path, address to, uint deadline) returns (uint[] amounts)",
  "function getAmountsOut(uint amountIn, address[] path) view returns (uint[] amounts)"
];

async function getSwapQuote(evm: EVM, amountIn: string, path: string[]) {
  const router = await evm.getContractInstance(
    UNISWAP_ROUTER_ADDRESS,
    JSON.stringify(UNISWAP_ROUTER_ABI)
  );
  
  const amounts = await evm.readFromContract(
    router,
    "getAmountsOut",
    [amountIn, path]
  );
  
  return amounts[amounts.length - 1];  // Output amount
}
```

### Multicall (Batch Reads)

```typescript
const MULTICALL_ABI = [
  "function aggregate((address target, bytes callData)[] calls) view returns (uint256 blockNumber, bytes[] returnData)"
];

async function batchRead(evm: EVM, calls: Array<{target: string, callData: string}>) {
  const multicall = await evm.getContractInstance(
    MULTICALL_ADDRESS,
    JSON.stringify(MULTICALL_ABI)
  );
  
  const [blockNumber, results] = await evm.readFromContract(
    multicall,
    "aggregate",
    [calls]
  );
  
  return results;
}
```

## Error Handling

```typescript
try {
  const txHash = await evm.writeToContract(contract, "transfer", [to, amount]);
  const receipt = await evm.waitForReceipt(txHash);
  
  if (receipt.status === 0) {
    throw new Error("Transaction reverted");
  }
  
} catch (error) {
  if (error.code === "INSUFFICIENT_FUNDS") {
    console.error("Not enough ETH for gas");
  } else if (error.code === "CALL_EXCEPTION") {
    console.error("Contract call failed:", error.reason);
  } else if (error.code === "UNPREDICTABLE_GAS_LIMIT") {
    console.error("Transaction will likely fail - check parameters");
  } else {
    console.error("Contract error:", error.message);
  }
}
```

## Best Practices

1. **Cache contract instances** - Reuse `getContractInstance` results
2. **Batch reads** - Use Multicall for multiple read operations
3. **Estimate gas first** - Avoid failed transactions
4. **Handle reverts** - Check receipt status after write operations
5. **Use typed ABIs** - Include return types for better error messages
6. **Set deadlines** - For DEX operations, always use deadline parameters

## Integration with DemosWork

```typescript
import { DemosWork, XmWorkStep } from "@kynesyslabs/demosdk/demoswork";

const contractStep = new XmWorkStep({
  context: "xm",
  content: {
    chain: "base",
    action: "contract_call",
    contract: tokenAddress,
    function: "transfer",
    args: [recipient, amount],
    abi: ERC20_ABI
  },
  critical: true,
  description: "Transfer tokens"
});

const work = new DemosWork();
work.push(new BaseOperation(contractStep));
```
