# Workflow Orchestration Agent

Build agents that orchestrate complex multi-step workflows using DemosWork's conditional execution engine.

## SDK Reference

```typescript
import {
  DemosWork,
  BaseOperation,
  ConditionalOperation,
  Condition,
  WorkStep,
  NativeWorkStep,
  XmWorkStep,
  Web2WorkStep,
  prepareDemosWorkPayload
} from "@kynesyslabs/demosdk/demoswork"
```

### Core Classes

| Class | Purpose |
|-------|---------|
| `DemosWork` | Main workflow container |
| `BaseOperation` | Standard operation wrapper |
| `ConditionalOperation` | Operation with conditions |
| `Condition` | Condition definition |
| `WorkStep` | Generic workflow step |
| `NativeWorkStep` | Demos-native operation step |
| `XmWorkStep` | Cross-chain operation step |
| `Web2WorkStep` | Web2 API operation step |

### Key Interfaces

```typescript
interface WorkStep {
  context: "native" | "xm" | "web2"
  content: any
  critical?: boolean
}

interface Conditional {
  condition: string
  onTrue: Operation
  onFalse?: Operation
}
```

## Use Cases

### 1. Multi-Step Transaction Agent

Orchestrate complex multi-step blockchain operations with rollback support.

```typescript
import { Demos } from "@kynesyslabs/demosdk/websdk"
import {
  DemosWork,
  BaseOperation,
  WorkStep,
  prepareDemosWorkPayload
} from "@kynesyslabs/demosdk/demoswork"

interface TransactionPipeline {
  steps: Array<{
    name: string
    action: WorkStep
    rollback?: WorkStep
  }>
}

class MultiStepTransactionAgent {
  private demos: Demos

  async initialize(): Promise<void> {
    this.demos = new Demos()
    await this.demos.connect("https://demosnode.discus.sh/")
  }

  async executePipeline(pipeline: TransactionPipeline): Promise<string> {
    const work = new DemosWork()

    // Add each step to the workflow
    for (const step of pipeline.steps) {
      const operation = new BaseOperation(step.action)

      if (step.action.critical) {
        // Critical steps halt workflow on failure
        operation.critical = true
      }

      work.push(operation)
    }

    // Validate workflow before execution
    const validation = work.validate()
    if (!validation.valid) {
      throw new Error(`Invalid workflow: ${validation.errors.join(", ")}`)
    }

    // Prepare and submit
    const payload = await prepareDemosWorkPayload(work, this.demos)
    const result = await this.demos.submitTransaction(payload)

    console.log(`Workflow executed: ${result.hash}`)
    return result.hash
  }

  async createSwapAndBridgePipeline(params: {
    sourceChain: string
    targetChain: string
    tokenIn: string
    tokenOut: string
    amount: string
  }): Promise<TransactionPipeline> {
    return {
      steps: [
        {
          name: "approve_token",
          action: new WorkStep({
            context: "xm",
            content: {
              chain: params.sourceChain,
              action: "approve",
              token: params.tokenIn,
              amount: params.amount
            },
            critical: true
          })
        },
        {
          name: "swap_tokens",
          action: new WorkStep({
            context: "xm",
            content: {
              chain: params.sourceChain,
              action: "swap",
              tokenIn: params.tokenIn,
              tokenOut: params.tokenOut,
              amount: params.amount
            },
            critical: true
          })
        },
        {
          name: "bridge_to_target",
          action: new WorkStep({
            context: "xm",
            content: {
              action: "bridge",
              from: params.sourceChain,
              to: params.targetChain,
              token: params.tokenOut
            },
            critical: true
          })
        }
      ]
    }
  }

  async createDeFiPipeline(params: {
    depositToken: string
    poolAddress: string
    amount: string
  }): Promise<TransactionPipeline> {
    return {
      steps: [
        {
          name: "approve_deposit",
          action: new WorkStep({
            context: "xm",
            content: {
              action: "approve",
              token: params.depositToken,
              spender: params.poolAddress,
              amount: params.amount
            },
            critical: true
          })
        },
        {
          name: "deposit_to_pool",
          action: new WorkStep({
            context: "xm",
            content: {
              action: "deposit",
              pool: params.poolAddress,
              token: params.depositToken,
              amount: params.amount
            },
            critical: true
          })
        },
        {
          name: "stake_lp_tokens",
          action: new WorkStep({
            context: "xm",
            content: {
              action: "stake",
              pool: params.poolAddress
            }
          })
        }
      ]
    }
  }
}
```

### 2. Conditional Workflow Agent

Execute workflows with branching logic based on conditions.

```typescript
import {
  DemosWork,
  BaseOperation,
  ConditionalOperation,
  Condition,
  WorkStep
} from "@kynesyslabs/demoswork"

interface ConditionalWorkflowParams {
  condition: string
  onTrueSteps: WorkStep[]
  onFalseSteps?: WorkStep[]
}

class ConditionalWorkflowAgent {
  private demos: Demos

  async initialize(): Promise<void> {
    this.demos = new Demos()
    await this.demos.connect("https://demosnode.discus.sh/")
  }

  createCondition(expression: string): Condition {
    return new Condition(expression)
  }

  async executeConditionalWorkflow(params: ConditionalWorkflowParams): Promise<string> {
    const work = new DemosWork()

    // Create condition
    const condition = this.createCondition(params.condition)

    // Create true branch operations
    const trueBranch = new DemosWork()
    for (const step of params.onTrueSteps) {
      trueBranch.push(new BaseOperation(step))
    }

    // Create false branch operations (if provided)
    let falseBranch: DemosWork | undefined
    if (params.onFalseSteps && params.onFalseSteps.length > 0) {
      falseBranch = new DemosWork()
      for (const step of params.onFalseSteps) {
        falseBranch.push(new BaseOperation(step))
      }
    }

    // Create conditional operation
    const conditionalOp = new ConditionalOperation(
      condition,
      trueBranch,
      falseBranch
    )

    work.push(conditionalOp)

    const payload = await prepareDemosWorkPayload(work, this.demos)
    return (await this.demos.submitTransaction(payload)).hash
  }

  async createBalanceCheckWorkflow(params: {
    address: string
    threshold: string
    aboveThresholdAction: WorkStep
    belowThresholdAction: WorkStep
  }): Promise<string> {
    return await this.executeConditionalWorkflow({
      condition: `balance("${params.address}") >= ${params.threshold}`,
      onTrueSteps: [params.aboveThresholdAction],
      onFalseSteps: [params.belowThresholdAction]
    })
  }

  async createPriceCheckWorkflow(params: {
    token: string
    targetPrice: string
    buyAction: WorkStep
    waitAction: WorkStep
  }): Promise<string> {
    return await this.executeConditionalWorkflow({
      condition: `price("${params.token}") <= ${params.targetPrice}`,
      onTrueSteps: [params.buyAction],
      onFalseSteps: [params.waitAction]
    })
  }

  async createChainedConditions(conditions: Array<{
    check: string
    action: WorkStep
  }>): Promise<string> {
    const work = new DemosWork()

    // Chain conditions - each depends on previous
    for (let i = 0; i < conditions.length; i++) {
      const cond = conditions[i]
      const condition = this.createCondition(cond.check)

      // Remaining conditions as nested false branch
      let falseBranch: DemosWork | undefined
      if (i < conditions.length - 1) {
        falseBranch = new DemosWork()
        // Continue checking next conditions
      }

      const trueBranch = new DemosWork()
      trueBranch.push(new BaseOperation(cond.action))

      work.push(new ConditionalOperation(condition, trueBranch, falseBranch))
    }

    const payload = await prepareDemosWorkPayload(work, this.demos)
    return (await this.demos.submitTransaction(payload)).hash
  }
}
```

### 3. Cross-Context Workflow Agent

Orchestrate workflows spanning native, cross-chain, and Web2 contexts.

```typescript
import {
  DemosWork,
  BaseOperation,
  NativeWorkStep,
  XmWorkStep,
  Web2WorkStep,
  prepareDemosWorkPayload
} from "@kynesyslabs/demoswork"

class CrossContextWorkflowAgent {
  private demos: Demos

  async initialize(): Promise<void> {
    this.demos = new Demos()
    await this.demos.connect("https://demosnode.discus.sh/")
  }

  createNativeStep(content: any): NativeWorkStep {
    return new NativeWorkStep({
      context: "native",
      content,
      critical: true
    })
  }

  createXmStep(chain: string, action: any): XmWorkStep {
    return new XmWorkStep({
      context: "xm",
      content: { chain, ...action },
      critical: true
    })
  }

  createWeb2Step(url: string, method: string, body?: any): Web2WorkStep {
    return new Web2WorkStep({
      context: "web2",
      content: { url, method, body }
    })
  }

  async executeCrossContextWorkflow(steps: Array<{
    type: "native" | "xm" | "web2"
    data: any
  }>): Promise<string> {
    const work = new DemosWork()

    for (const step of steps) {
      let workStep

      switch (step.type) {
        case "native":
          workStep = this.createNativeStep(step.data)
          break
        case "xm":
          workStep = this.createXmStep(step.data.chain, step.data.action)
          break
        case "web2":
          workStep = this.createWeb2Step(
            step.data.url,
            step.data.method,
            step.data.body
          )
          break
      }

      work.push(new BaseOperation(workStep))
    }

    const payload = await prepareDemosWorkPayload(work, this.demos)
    return (await this.demos.submitTransaction(payload)).hash
  }

  async createOracleTriggeredTrade(params: {
    oracleUrl: string
    priceThreshold: string
    tradeChain: string
    tradeAction: any
  }): Promise<string> {
    return await this.executeCrossContextWorkflow([
      // Step 1: Fetch price from oracle (Web2)
      {
        type: "web2",
        data: {
          url: params.oracleUrl,
          method: "GET"
        }
      },
      // Step 2: Execute trade if conditions met (XM)
      {
        type: "xm",
        data: {
          chain: params.tradeChain,
          action: params.tradeAction
        }
      },
      // Step 3: Record trade on Demos (Native)
      {
        type: "native",
        data: {
          action: "record_trade",
          metadata: { oracleUrl: params.oracleUrl }
        }
      }
    ])
  }

  async createNotificationWorkflow(params: {
    checkAction: any
    webhookUrl: string
    message: string
  }): Promise<string> {
    return await this.executeCrossContextWorkflow([
      // Step 1: Check condition (XM)
      {
        type: "xm",
        data: {
          chain: "ethereum",
          action: params.checkAction
        }
      },
      // Step 2: Send webhook notification (Web2)
      {
        type: "web2",
        data: {
          url: params.webhookUrl,
          method: "POST",
          body: { message: params.message }
        }
      }
    ])
  }
}
```

### 4. Workflow Template Agent

Create and manage reusable workflow templates.

```typescript
import {
  DemosWork,
  BaseOperation,
  WorkStep,
  prepareDemosWorkPayload
} from "@kynesyslabs/demoswork"

interface WorkflowTemplate {
  id: string
  name: string
  description: string
  parameters: Array<{
    name: string
    type: "string" | "number" | "address" | "amount"
    required: boolean
  }>
  steps: Array<{
    stepTemplate: any
    parameterMappings: Record<string, string>
  }>
}

class WorkflowTemplateAgent {
  private demos: Demos
  private templates: Map<string, WorkflowTemplate> = new Map()

  async initialize(): Promise<void> {
    this.demos = new Demos()
    await this.demos.connect("https://demosnode.discus.sh/")
    await this.loadBuiltInTemplates()
  }

  private async loadBuiltInTemplates(): Promise<void> {
    // Token transfer template
    this.registerTemplate({
      id: "token_transfer",
      name: "Token Transfer",
      description: "Transfer tokens between addresses",
      parameters: [
        { name: "recipient", type: "address", required: true },
        { name: "amount", type: "amount", required: true },
        { name: "token", type: "address", required: true }
      ],
      steps: [
        {
          stepTemplate: {
            context: "xm",
            content: {
              action: "transfer",
              to: "{{recipient}}",
              amount: "{{amount}}",
              token: "{{token}}"
            },
            critical: true
          },
          parameterMappings: {
            "{{recipient}}": "recipient",
            "{{amount}}": "amount",
            "{{token}}": "token"
          }
        }
      ]
    })

    // Swap and transfer template
    this.registerTemplate({
      id: "swap_and_transfer",
      name: "Swap and Transfer",
      description: "Swap tokens then transfer to recipient",
      parameters: [
        { name: "tokenIn", type: "address", required: true },
        { name: "tokenOut", type: "address", required: true },
        { name: "amount", type: "amount", required: true },
        { name: "recipient", type: "address", required: true }
      ],
      steps: [
        {
          stepTemplate: {
            context: "xm",
            content: {
              action: "swap",
              tokenIn: "{{tokenIn}}",
              tokenOut: "{{tokenOut}}",
              amount: "{{amount}}"
            },
            critical: true
          },
          parameterMappings: {
            "{{tokenIn}}": "tokenIn",
            "{{tokenOut}}": "tokenOut",
            "{{amount}}": "amount"
          }
        },
        {
          stepTemplate: {
            context: "xm",
            content: {
              action: "transfer",
              to: "{{recipient}}",
              token: "{{tokenOut}}"
            },
            critical: true
          },
          parameterMappings: {
            "{{recipient}}": "recipient",
            "{{tokenOut}}": "tokenOut"
          }
        }
      ]
    })
  }

  registerTemplate(template: WorkflowTemplate): void {
    this.templates.set(template.id, template)
    console.log(`Template registered: ${template.name}`)
  }

  getTemplate(templateId: string): WorkflowTemplate | undefined {
    return this.templates.get(templateId)
  }

  listTemplates(): WorkflowTemplate[] {
    return Array.from(this.templates.values())
  }

  validateParameters(
    templateId: string,
    params: Record<string, any>
  ): { valid: boolean; errors: string[] } {
    const template = this.templates.get(templateId)
    if (!template) {
      return { valid: false, errors: ["Template not found"] }
    }

    const errors: string[] = []

    for (const param of template.parameters) {
      if (param.required && !(param.name in params)) {
        errors.push(`Missing required parameter: ${param.name}`)
      }
    }

    return { valid: errors.length === 0, errors }
  }

  async executeTemplate(
    templateId: string,
    params: Record<string, any>
  ): Promise<string> {
    const template = this.templates.get(templateId)
    if (!template) {
      throw new Error(`Template ${templateId} not found`)
    }

    // Validate parameters
    const validation = this.validateParameters(templateId, params)
    if (!validation.valid) {
      throw new Error(`Invalid parameters: ${validation.errors.join(", ")}`)
    }

    // Build workflow from template
    const work = new DemosWork()

    for (const step of template.steps) {
      // Replace placeholders with actual values
      const stepContent = JSON.parse(
        JSON.stringify(step.stepTemplate),
        (key, value) => {
          if (typeof value === "string" && value.startsWith("{{")) {
            const paramName = step.parameterMappings[value]
            return params[paramName]
          }
          return value
        }
      )

      work.push(new BaseOperation(new WorkStep(stepContent)))
    }

    const payload = await prepareDemosWorkPayload(work, this.demos)
    return (await this.demos.submitTransaction(payload)).hash
  }
}
```

## Integration Patterns

### DemosWork with Error Handling

```typescript
import { DemosWork, BaseOperation, WorkStep } from "@kynesyslabs/demoswork"

async function executeWithRetry(
  work: DemosWork,
  demos: Demos,
  maxRetries: number = 3
): Promise<string> {
  let lastError: Error | null = null

  for (let i = 0; i < maxRetries; i++) {
    try {
      const payload = await prepareDemosWorkPayload(work, demos)
      const result = await demos.submitTransaction(payload)
      return result.hash
    } catch (error) {
      lastError = error as Error
      console.log(`Attempt ${i + 1} failed, retrying...`)
      await new Promise(r => setTimeout(r, 1000 * (i + 1)))
    }
  }

  throw lastError || new Error("Max retries exceeded")
}
```

## Best Practices

1. **Mark critical steps** - Use `critical: true` for steps that must succeed
2. **Validate before execution** - Always call `work.validate()` first
3. **Use appropriate contexts** - native, xm, or web2 based on operation type
4. **Handle errors gracefully** - Implement retry logic for transient failures
5. **Template reusable workflows** - Create templates for common patterns

## Related Skills

- [Cross-Chain Bridge Agent](./crosschain-bridge-agent.md) - Bridge operations in workflows
- [EVM Operations Agent](./evm-operations-agent.md) - EVM steps in workflows
- [DAHR Web2 Proxy Agent](./dahr-web2-proxy-agent.md) - Web2 steps in workflows
