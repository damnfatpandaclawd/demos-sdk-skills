# Cross-Chain Bridges & Swaps

Learn to perform cross-chain swaps using the Demos Bridge module (powered by Rubic).

## What is the Bridge Module?

The Bridge module enables:

- **Cross-Chain Swaps** - Move assets between different blockchains
- **Best Route Finding** - Automatically finds optimal swap routes
- **Multi-DEX Aggregation** - Uses Rubic's aggregator for best prices
- **Unified Interface** - Single API for all supported chains

## Supported Chains

| Chain | Chain ID | Native Token |
|-------|----------|--------------|
| Ethereum | 1 | ETH |
| BSC | 56 | BNB |
| Polygon | 137 | MATIC |
| Arbitrum | 42161 | ETH |
| Avalanche | 43114 | AVAX |
| Base | 8453 | ETH |
| Optimism | 10 | ETH |

## Core Pattern

```typescript
import { Demos } from "@kynesyslabs/demosdk/websdk";
import { RubicBridge } from "@kynesyslabs/demosdk/bridge";

async function crossChainSwap(
  fromChain: string,
  toChain: string,
  fromToken: string,
  toToken: string,
  amount: string
) {
  // 1. Connect to Demos
  const demos = new Demos();
  await demos.connect("https://demosnode.discus.sh/");
  await demos.connectWallet(mnemonic);
  
  // 2. Create bridge instance
  const bridge = new RubicBridge();
  
  // 3. Get trade quote
  const trade = await bridge.getTrade(demos, fromChain, {
    fromChain,
    toChain,
    fromToken,
    toToken,
    amount,
    slippage: 0.5  // 0.5% slippage tolerance
  });
  
  console.log("Trade quote:", {
    expectedOutput: trade.toAmount,
    priceImpact: trade.priceImpact,
    estimatedGas: trade.estimatedGas,
    route: trade.route
  });
  
  // 4. Execute swap
  const result = await bridge.executeTrade(demos, fromChain, trade);
  
  return result;
}
```

## Getting a Quote

Before executing, get a quote to see expected output:

```typescript
import { RubicBridge, BridgeTradePayload } from "@kynesyslabs/demosdk/bridge";

async function getSwapQuote(payload: BridgeTradePayload) {
  const demos = new Demos();
  await demos.connect("https://demosnode.discus.sh/");
  await demos.connectWallet(mnemonic);
  
  const bridge = new RubicBridge();
  const quote = await bridge.getTrade(demos, payload.fromChain, payload);
  
  return {
    inputAmount: payload.amount,
    outputAmount: quote.toAmount,
    minimumReceived: quote.minAmount,
    priceImpact: quote.priceImpact,
    fees: {
      gas: quote.estimatedGas,
      protocol: quote.protocolFee
    },
    route: quote.route,
    estimatedTime: quote.estimatedTime
  };
}

// Usage
const quote = await getSwapQuote({
  fromChain: "ethereum",
  toChain: "polygon",
  fromToken: "ETH",
  toToken: "MATIC",
  amount: "0.1",
  slippage: 1
});

console.log(`Swapping 0.1 ETH for ~${quote.outputAmount} MATIC`);
```

## Token Addresses

For ERC20 tokens, use contract addresses:

```typescript
const TOKENS = {
  ethereum: {
    NATIVE: "0x0000000000000000000000000000000000000000",  // ETH
    USDC: "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48",
    USDT: "0xdAC17F958D2ee523a2206206994597C13D831ec7",
    WETH: "0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2"
  },
  polygon: {
    NATIVE: "0x0000000000000000000000000000000000000000",  // MATIC
    USDC: "0x2791Bca1f2de4661ED88A30C99A7a9449Aa84174",
    WETH: "0x7ceB23fD6bC0adD59E62ac25578270cFf1b9f619"
  },
  base: {
    NATIVE: "0x0000000000000000000000000000000000000000",  // ETH
    USDC: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913"
  }
};

// Swap USDC on Ethereum to MATIC on Polygon
const quote = await getSwapQuote({
  fromChain: "ethereum",
  toChain: "polygon",
  fromToken: TOKENS.ethereum.USDC,
  toToken: TOKENS.polygon.NATIVE,
  amount: "100",  // 100 USDC
  slippage: 1
});
```

## Complete Flow Example

```typescript
import { Demos } from "@kynesyslabs/demosdk/websdk";
import { RubicBridge } from "@kynesyslabs/demosdk/bridge";
import { EVM } from "@kynesyslabs/demosdk/xm-websdk";

async function bridgeETHToPolygon(amount: string, privateKey: string) {
  // Connect to Demos
  const demos = new Demos();
  await demos.connect("https://demosnode.discus.sh/");
  await demos.connectWallet(mnemonic);
  
  // Check source balance first
  const eth = await EVM.create("https://eth.llamarpc.com");
  await eth.connectWallet(privateKey);
  const balance = await eth.getBalance(eth.getAddress());
  
  if (parseFloat(balance) < parseFloat(amount)) {
    throw new Error(`Insufficient balance: ${balance} ETH`);
  }
  
  // Get quote
  const bridge = new RubicBridge();
  const trade = await bridge.getTrade(demos, "ethereum", {
    fromChain: "ethereum",
    toChain: "polygon",
    fromToken: "0x0000000000000000000000000000000000000000",
    toToken: "0x0000000000000000000000000000000000000000",
    amount,
    slippage: 1
  });
  
  console.log(`Bridging ${amount} ETH → ~${trade.toAmount} MATIC`);
  console.log(`Route: ${trade.route.map(r => r.dex).join(" → ")}`);
  
  // Execute
  const result = await bridge.executeTrade(demos, "ethereum", trade);
  
  // Clean up
  await eth.disconnect();
  
  return {
    txHash: result.transactionHash,
    expectedOutput: trade.toAmount,
    destinationChain: "polygon"
  };
}
```

## Mock Trading (Testnet)

For testing without real funds:

```typescript
async function mockBridgeTrade() {
  const demos = new Demos();
  await demos.connect("https://dev.node2.demos.sh/");  // Dev node
  await demos.connectWallet(mnemonic);
  
  const bridge = new RubicBridge();
  
  // Get wrapped trade for mock execution
  const trade = await bridge.getTrade(demos, "ethereum", {
    fromChain: "ethereum",
    toChain: "polygon",
    fromToken: "ETH",
    toToken: "MATIC",
    amount: "1",
    slippage: 1
  });
  
  // Execute mock (no real tx)
  const mockResult = await bridge.executeMockTrade(demos, "ethereum", trade);
  
  console.log("Mock result:", mockResult);
  return mockResult;
}
```

## Error Handling

```typescript
try {
  const trade = await bridge.getTrade(demos, fromChain, payload);
  const result = await bridge.executeTrade(demos, fromChain, trade);
} catch (error) {
  switch (error.code) {
    case "INSUFFICIENT_LIQUIDITY":
      console.error("Not enough liquidity for this trade");
      break;
    case "SLIPPAGE_EXCEEDED":
      console.error("Price moved too much, increase slippage");
      break;
    case "INVALID_CHAIN":
      console.error("Unsupported chain");
      break;
    case "INSUFFICIENT_BALANCE":
      console.error("Not enough tokens for trade + gas");
      break;
    default:
      console.error("Bridge error:", error.message);
  }
}
```

## Slippage Settings

```typescript
// Conservative (stable pairs)
{ slippage: 0.1 }  // 0.1%

// Standard
{ slippage: 0.5 }  // 0.5%

// Volatile pairs
{ slippage: 1 }    // 1%

// Very volatile / low liquidity
{ slippage: 3 }    // 3%
```

## Integration with DemosWork

```typescript
import { DemosWork, BaseOperation, WorkStep } from "@kynesyslabs/demoswork";

// Create bridge step in workflow
const bridgeStep = new WorkStep({
  context: "bridge",
  content: {
    action: "swap",
    fromChain: "ethereum",
    toChain: "base",
    fromToken: "ETH",
    toToken: "ETH",
    amount: "0.5",
    slippage: 1
  },
  critical: true,
  description: "Bridge 0.5 ETH from Ethereum to Base"
});

const work = new DemosWork();
work.push(new BaseOperation(bridgeStep));
```

## Best Practices

1. **Always get a quote first** - Check expected output before executing
2. **Set appropriate slippage** - Too low = failed trades, too high = bad execution
3. **Check balances** - Verify sufficient funds for trade + gas
4. **Handle errors gracefully** - Bridge operations can fail for many reasons
5. **Monitor pending transactions** - Cross-chain trades take time
6. **Use testnet first** - Mock trades or testnets before mainnet
