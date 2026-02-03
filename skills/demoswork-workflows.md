# DemosWork: Multi-Step Workflows

Learn to create complex, multi-step operations using DemosWork.

## What is DemosWork?

DemosWork is a workflow engine that enables:

- **Multi-step Operations** - Chain multiple actions together
- **Conditional Logic** - Execute steps based on conditions
- **Cross-Context** - Combine native, XM, and Web2 operations
- **Atomic Execution** - All-or-nothing with rollback support
- **Dependencies** - Steps can depend on outputs of previous steps

## Core Concepts

### Hierarchy

```
DemosWork
├── BaseOperation (group of steps)
│   ├── WorkStep (native/xm/web2 action)
│   ├── WorkStep
│   └── WorkStep
├── ConditionalOperation (if/else)
│   ├── Condition
│   └── BaseOperation
└── BaseOperation
```

### Step Types

| Type | Class | Use Case |
|------|-------|----------|
| Native | `NativeWorkStep` | Demos network operations |
| XM | `XmWorkStep` | Cross-chain operations |
| Web2 | `Web2WorkStep` | DAHR attested requests |

## Basic Pattern

```typescript
import { 
  DemosWork, 
  BaseOperation, 
  WorkStep 
} from "@kynesyslabs/demosdk/demoswork";

// 1. Create workflow
const work = new DemosWork();

// 2. Create steps
const step1 = new WorkStep({
  context: "native",
  content: { /* payload */ },
  critical: true,
  description: "First operation"
});

const step2 = new WorkStep({
  context: "xm",
  content: { /* payload */ },
  critical: true,
  depends_on: [step1.id],  // Wait for step1
  description: "Second operation"
});

// 3. Create operation and add steps
const operation = new BaseOperation(step1, step2);

// 4. Add to workflow
work.push(operation);

// 5. Execute or serialize
const script = work.toJSON();
```

## Real-World Example: Token Purchase Flow

```typescript
import { 
  DemosWork, 
  BaseOperation, 
  WorkStep,
  prepareNativeStep,
  prepareXmStep
} from "@kynesyslabs/demosdk/demoswork";

async function createTokenPurchaseWorkflow(
  tokenAddress: string,
  amount: string,
  maxPrice: string
) {
  const work = new DemosWork();
  
  // Step 1: Check token price (Web2 - attested)
  const priceCheck = new WorkStep({
    context: "web2",
    content: {
      url: `https://api.dexscreener.com/latest/dex/tokens/${tokenAddress}`,
      method: "GET"
    },
    critical: true,
    description: "Check current token price"
  });
  
  // Step 2: Approve token spend (XM - on-chain)
  const approve = new WorkStep({
    context: "xm",
    content: {
      chain: "base",
      action: "approve",
      contract: tokenAddress,
      spender: "0xDEX_ROUTER",
      amount: amount
    },
    critical: true,
    depends_on: [priceCheck.id],
    description: "Approve DEX to spend tokens"
  });
  
  // Step 3: Execute swap (XM - on-chain)
  const swap = new WorkStep({
    context: "xm",
    content: {
      chain: "base",
      action: "swap",
      tokenIn: "ETH",
      tokenOut: tokenAddress,
      amountIn: amount,
      minOut: "0"  // Would calculate from price
    },
    critical: true,
    depends_on: [approve.id],
    description: "Execute token swap"
  });
  
  // Create operation
  const purchaseOp = new BaseOperation(priceCheck, approve, swap);
  purchaseOp.critical = true;
  
  work.push(purchaseOp);
  
  return work;
}
```

## Conditional Operations

```typescript
import { 
  DemosWork, 
  ConditionalOperation,
  Condition,
  BaseOperation,
  WorkStep 
} from "@kynesyslabs/demosdk/demoswork";

// Create conditional: if price < threshold, buy
const priceCondition = new Condition({
  left: { ref: "priceStep.output.price" },
  operator: "<",
  right: { value: 100 }
});

const buyStep = new WorkStep({
  context: "xm",
  content: { /* buy payload */ },
  critical: true
});

const conditionalBuy = new ConditionalOperation(
  priceCondition,
  new BaseOperation(buyStep),  // if true
  null  // else (optional)
);

work.push(conditionalBuy);
```

## Using Step Outputs

Steps can reference outputs from previous steps:

```typescript
const step1 = new WorkStep({
  context: "web2",
  content: { url: "https://api.example.com/data" },
  description: "Fetch data"
});

const step2 = new WorkStep({
  context: "native",
  content: {
    action: "store",
    // Reference step1's output
    data: { : `${step1.id}.output.data` }
  },
  depends_on: [step1.id],
  description: "Store fetched data"
});
```

## Critical vs Non-Critical Steps

```typescript
// Critical: workflow fails if this fails
const criticalStep = new WorkStep({
  context: "xm",
  content: { /* ... */ },
  critical: true  // MUST succeed
});

// Non-critical: workflow continues if this fails
const optionalStep = new WorkStep({
  context: "web2",
  content: { /* ... */ },
  critical: false  // Can fail
});
```

## Serialization

```typescript
// Serialize to JSON (for storage/transmission)
const json = work.toJSON();

// Restore from JSON
const restored = new DemosWork();
restored.fromJSON(json);

// Validate workflow
restored.validate(json);  // Throws if invalid
```

## Executing Workflows

```typescript
import { Demos } from "@kynesyslabs/demosdk/websdk";
import { prepareDemosWorkPayload } from "@kynesyslabs/demosdk/demoswork";

async function executeWorkflow(work: DemosWork) {
  const demos = new Demos();
  await demos.connect("https://demosnode.discus.sh/");
  await demos.connectWallet(mnemonic);
  
  // Prepare workflow payload
  const payload = prepareDemosWorkPayload(work);
  
  // Submit to Demos network
  const result = await demos.nodeCall("executeWork", {
    script: payload
  });
  
  return result;
}
```

## Best Practices

### 1. Order Dependencies Correctly
```typescript
// ✅ Good: explicit dependencies
step2.depends_on = [step1.id];

// ❌ Bad: implicit ordering
// (steps may execute in parallel)
```

### 2. Mark Critical Steps
```typescript
// Financial operations should be critical
transferStep.critical = true;

// Logging/notification can be non-critical
notifyStep.critical = false;
```

### 3. Add Descriptions
```typescript
const step = new WorkStep({
  // ...
  description: "Transfer 1 ETH to treasury"  // Human-readable
});
```

### 4. Validate Before Execution
```typescript
try {
  work.validate(work.toJSON());
} catch (error) {
  console.error("Invalid workflow:", error.message);
}
```

## Common Patterns

### Sequential Operations
```typescript
const op = new BaseOperation(step1);
op.add(step2);  // Adds after step1
op.add(step3);  // Adds after step2
```

### Parallel Operations
```typescript
// No depends_on = parallel execution
const step1 = new WorkStep({ /* ... */ });
const step2 = new WorkStep({ /* ... */ });  // No depends_on
const op = new BaseOperation(step1, step2);
```

### Error Handling
```typescript
const results = await executeWorkflow(work);

for (const [stepId, result] of Object.entries(results)) {
  if (!result.success) {
    console.error(`Step ${stepId} failed:`, result.error);
  }
}
```
