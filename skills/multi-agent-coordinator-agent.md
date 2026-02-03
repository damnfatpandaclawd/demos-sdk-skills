# Multi-Agent Coordinator Agent Skill

> **⚠️ Prerequisites**: Complete [SDK Setup](./00-sdk-setup.md) first to configure your environment.

Build agents that coordinate multiple agents for complex task execution.

## Overview

Multi-Agent Coordinator enables orchestration of multiple specialized agents, task decomposition, and result aggregation. Essential for complex workflows, distributed computing, and agent collaboration.

## SDK Reference

```typescript
import { Demos } from "@kynesyslabs/demosdk/websdk"
import { DemosWork, BaseOperation } from "@kynesyslabs/demoswork"
import { Messaging } from "@kynesyslabs/demosdk/messaging"

// Inter-agent communication
const messaging = await demos.messaging.create()
```

## Agent Use Cases

### 1. Task Orchestrator

Decompose and coordinate complex tasks:

```typescript
class TaskOrchestrator {
  private registry: AgentRegistry
  private messaging: Messaging
  private activeTasks: Map<string, OrchestratedTask> = new Map()

  async orchestrateTask(task: ComplexTask): Promise<OrchestratedResult> {
    const taskId = this.generateTaskId()

    // Decompose task into subtasks
    const subtasks = await this.decomposeTask(task)

    // Find suitable agents for each subtask
    const assignments = await this.assignAgents(subtasks)

    // Create orchestration plan
    const plan: OrchestratedTask = {
      id: taskId,
      originalTask: task,
      subtasks: assignments,
      status: "planning",
      createdAt: Date.now(),
      results: new Map()
    }

    this.activeTasks.set(taskId, plan)

    // Execute plan
    return await this.executePlan(plan)
  }

  private async decomposeTask(task: ComplexTask): Promise<Subtask[]> {
    const subtasks: Subtask[] = []

    // Analyze task requirements
    if (task.requiresData) {
      subtasks.push({
        id: `${task.id}-data`,
        type: "data_fetch",
        description: "Gather required data",
        dependencies: [],
        capabilities: ["price_oracle", "data_indexing"],
        priority: "high"
      })
    }

    if (task.requiresAnalysis) {
      subtasks.push({
        id: `${task.id}-analysis`,
        type: "analysis",
        description: "Analyze data",
        dependencies: task.requiresData ? [`${task.id}-data`] : [],
        capabilities: ["analytics"],
        priority: "medium"
      })
    }

    if (task.requiresExecution) {
      subtasks.push({
        id: `${task.id}-execute`,
        type: "execution",
        description: "Execute transaction",
        dependencies: task.requiresAnalysis
          ? [`${task.id}-analysis`]
          : task.requiresData
          ? [`${task.id}-data`]
          : [],
        capabilities: ["swap", "transaction"],
        priority: "high"
      })
    }

    if (task.requiresVerification) {
      subtasks.push({
        id: `${task.id}-verify`,
        type: "verification",
        description: "Verify execution",
        dependencies: [`${task.id}-execute`],
        capabilities: ["verification"],
        priority: "medium"
      })
    }

    return subtasks
  }

  private async assignAgents(subtasks: Subtask[]): Promise<SubtaskAssignment[]> {
    const assignments: SubtaskAssignment[] = []

    for (const subtask of subtasks) {
      // Find best agent for this subtask
      const candidates = await this.registry.findAgentsByCapabilities(
        subtask.capabilities
      )

      if (candidates.length === 0) {
        throw new Error(`No agent found for subtask: ${subtask.type}`)
      }

      // Select best based on reputation and availability
      const selected = await this.selectBestAgent(candidates, subtask)

      assignments.push({
        subtask,
        agent: selected,
        status: "pending"
      })
    }

    return assignments
  }

  private async executePlan(plan: OrchestratedTask): Promise<OrchestratedResult> {
    plan.status = "executing"

    // Build execution order based on dependencies
    const executionOrder = this.topologicalSort(plan.subtasks)

    for (const batch of executionOrder) {
      // Execute all subtasks in this batch in parallel
      const batchResults = await Promise.all(
        batch.map(assignment => this.executeSubtask(plan, assignment))
      )

      // Check for failures
      const failed = batchResults.filter(r => !r.success)
      if (failed.length > 0) {
        plan.status = "failed"
        return {
          taskId: plan.id,
          success: false,
          error: `Subtasks failed: ${failed.map(f => f.subtaskId).join(", ")}`,
          results: plan.results
        }
      }
    }

    plan.status = "completed"

    // Aggregate results
    return {
      taskId: plan.id,
      success: true,
      results: plan.results,
      aggregated: this.aggregateResults(plan)
    }
  }

  private async executeSubtask(
    plan: OrchestratedTask,
    assignment: SubtaskAssignment
  ): Promise<SubtaskResult> {
    assignment.status = "executing"
    assignment.startedAt = Date.now()

    try {
      // Gather inputs from dependencies
      const inputs: Record<string, any> = {}
      for (const depId of assignment.subtask.dependencies) {
        inputs[depId] = plan.results.get(depId)
      }

      // Send task to agent
      const response = await this.messaging.sendRequest(
        assignment.agent.publicKey,
        {
          type: "subtask_request",
          subtask: assignment.subtask,
          inputs,
          timeout: 60000
        }
      )

      assignment.status = "completed"
      assignment.completedAt = Date.now()

      plan.results.set(assignment.subtask.id, response.result)

      return {
        subtaskId: assignment.subtask.id,
        success: true,
        result: response.result
      }
    } catch (error) {
      assignment.status = "failed"
      assignment.error = error.message

      return {
        subtaskId: assignment.subtask.id,
        success: false,
        error: error.message
      }
    }
  }

  private topologicalSort(
    assignments: SubtaskAssignment[]
  ): SubtaskAssignment[][] {
    const batches: SubtaskAssignment[][] = []
    const completed = new Set<string>()
    const remaining = [...assignments]

    while (remaining.length > 0) {
      const batch = remaining.filter(a =>
        a.subtask.dependencies.every(d => completed.has(d))
      )

      if (batch.length === 0 && remaining.length > 0) {
        throw new Error("Circular dependency detected")
      }

      batches.push(batch)

      for (const assignment of batch) {
        completed.add(assignment.subtask.id)
        const index = remaining.indexOf(assignment)
        remaining.splice(index, 1)
      }
    }

    return batches
  }
}
```

### 2. Consensus Coordinator

Coordinate multiple agents to reach consensus:

```typescript
class ConsensusCoordinator {
  private messaging: Messaging
  private minParticipants: number = 3
  private consensusThreshold: number = 0.67 // 2/3 majority

  async reachConsensus<T>(
    question: ConsensusQuestion,
    participants: AgentProfile[]
  ): Promise<ConsensusResult<T>> {
    if (participants.length < this.minParticipants) {
      throw new Error(`Need at least ${this.minParticipants} participants`)
    }

    const roundId = this.generateRoundId()

    // Collect votes
    const votes = await this.collectVotes<T>(roundId, question, participants)

    // Tally results
    const tally = this.tallyVotes(votes)

    // Check consensus
    const totalWeight = votes.reduce((sum, v) => sum + v.weight, 0)
    const maxOption = tally.sort((a, b) => b.weight - a.weight)[0]

    const consensusReached = maxOption.weight / totalWeight >= this.consensusThreshold

    return {
      roundId,
      question,
      participants: participants.length,
      votes: votes.length,
      tally,
      consensusReached,
      result: consensusReached ? maxOption.value : null,
      confidence: maxOption.weight / totalWeight
    }
  }

  private async collectVotes<T>(
    roundId: string,
    question: ConsensusQuestion,
    participants: AgentProfile[]
  ): Promise<Vote<T>[]> {
    const votes: Vote<T>[] = []
    const timeout = 30000 // 30 seconds

    const votePromises = participants.map(async participant => {
      try {
        const response = await this.messaging.sendRequest(
          participant.publicKey,
          {
            type: "consensus_vote_request",
            roundId,
            question,
            options: question.options,
            timeout
          }
        )

        return {
          participant: participant.id,
          value: response.vote as T,
          weight: participant.reputation?.score || 50,
          timestamp: Date.now(),
          signature: response.signature
        }
      } catch {
        return null
      }
    })

    const results = await Promise.all(votePromises)
    return results.filter((v): v is Vote<T> => v !== null)
  }

  private tallyVotes<T>(votes: Vote<T>[]): VoteTally<T>[] {
    const tally = new Map<string, { value: T; weight: number; count: number }>()

    for (const vote of votes) {
      const key = JSON.stringify(vote.value)

      if (!tally.has(key)) {
        tally.set(key, { value: vote.value, weight: 0, count: 0 })
      }

      const entry = tally.get(key)!
      entry.weight += vote.weight
      entry.count++
    }

    return Array.from(tally.values())
  }

  async runMultiRoundConsensus<T>(
    question: ConsensusQuestion,
    participants: AgentProfile[],
    maxRounds: number = 3
  ): Promise<ConsensusResult<T>> {
    let currentParticipants = participants
    let result: ConsensusResult<T> | null = null

    for (let round = 0; round < maxRounds; round++) {
      result = await this.reachConsensus<T>(question, currentParticipants)

      if (result.consensusReached) {
        return result
      }

      // Narrow down options for next round
      if (result.tally.length > 2) {
        // Keep top 2 options
        const topOptions = result.tally.slice(0, 2).map(t => t.value)
        question = {
          ...question,
          options: topOptions
        }
      }

      // Remove abstaining participants
      currentParticipants = currentParticipants.filter(p =>
        result!.votes.some(v => v.participant === p.id)
      )
    }

    return result!
  }
}
```

### 3. Workflow Executor

Execute multi-agent workflows:

```typescript
class WorkflowExecutor {
  private orchestrator: TaskOrchestrator
  private workflowTemplates: Map<string, WorkflowTemplate> = new Map()

  registerWorkflow(template: WorkflowTemplate): void {
    this.workflowTemplates.set(template.id, template)
  }

  async executeWorkflow(
    templateId: string,
    params: WorkflowParams
  ): Promise<WorkflowResult> {
    const template = this.workflowTemplates.get(templateId)
    if (!template) throw new Error("Workflow template not found")

    const instance: WorkflowInstance = {
      id: this.generateInstanceId(),
      templateId,
      params,
      status: "initializing",
      steps: template.steps.map(s => ({
        ...s,
        status: "pending",
        attempts: 0
      })),
      context: {},
      startedAt: Date.now()
    }

    return await this.runWorkflow(instance)
  }

  private async runWorkflow(
    instance: WorkflowInstance
  ): Promise<WorkflowResult> {
    instance.status = "running"

    for (let i = 0; i < instance.steps.length; i++) {
      const step = instance.steps[i]

      // Check conditions
      if (step.condition && !this.evaluateCondition(step.condition, instance.context)) {
        step.status = "skipped"
        continue
      }

      // Execute step
      const result = await this.executeStep(step, instance)

      if (!result.success) {
        // Handle failure
        if (step.onFailure === "retry" && step.attempts < (step.maxRetries || 3)) {
          i-- // Retry this step
          await new Promise(r => setTimeout(r, step.retryDelay || 5000))
          continue
        }

        if (step.onFailure === "skip") {
          step.status = "skipped"
          continue
        }

        // Default: fail workflow
        instance.status = "failed"
        return {
          instanceId: instance.id,
          success: false,
          error: `Step ${step.id} failed: ${result.error}`,
          context: instance.context,
          completedSteps: instance.steps.filter(s => s.status === "completed").length
        }
      }

      // Update context with step output
      instance.context[step.id] = result.output

      // Execute parallel steps if any
      if (step.parallel) {
        const parallelResults = await Promise.all(
          step.parallel.map(pStep =>
            this.executeStep(pStep, instance)
          )
        )

        for (let j = 0; j < parallelResults.length; j++) {
          instance.context[step.parallel[j].id] = parallelResults[j].output
        }
      }
    }

    instance.status = "completed"
    instance.completedAt = Date.now()

    return {
      instanceId: instance.id,
      success: true,
      context: instance.context,
      completedSteps: instance.steps.filter(s => s.status === "completed").length,
      duration: instance.completedAt - instance.startedAt
    }
  }

  private async executeStep(
    step: WorkflowStep,
    instance: WorkflowInstance
  ): Promise<StepResult> {
    step.status = "running"
    step.attempts++
    step.startedAt = Date.now()

    try {
      // Resolve inputs from context
      const inputs = this.resolveInputs(step.inputs, instance.context, instance.params)

      // Execute based on step type
      let output: any

      switch (step.type) {
        case "agent_task":
          output = await this.orchestrator.orchestrateTask({
            ...step.taskConfig,
            inputs
          })
          break

        case "transform":
          output = await this.executeTransform(step.transform!, inputs)
          break

        case "decision":
          output = this.evaluateDecision(step.decision!, inputs)
          break

        case "wait":
          await new Promise(r => setTimeout(r, step.duration || 1000))
          output = { waited: step.duration }
          break

        default:
          throw new Error(`Unknown step type: ${step.type}`)
      }

      step.status = "completed"
      step.completedAt = Date.now()

      return { success: true, output }
    } catch (error) {
      step.status = "failed"
      step.error = error.message

      return { success: false, error: error.message }
    }
  }

  private resolveInputs(
    inputDefs: Record<string, InputDef>,
    context: Record<string, any>,
    params: WorkflowParams
  ): Record<string, any> {
    const resolved: Record<string, any> = {}

    for (const [key, def] of Object.entries(inputDefs)) {
      if (def.source === "context") {
        resolved[key] = this.getNestedValue(context, def.path)
      } else if (def.source === "params") {
        resolved[key] = params[def.path]
      } else if (def.source === "literal") {
        resolved[key] = def.value
      }
    }

    return resolved
  }
}
```

## Best Practices

1. **Decompose tasks logically** with clear dependencies
2. **Handle partial failures** gracefully
3. **Implement timeouts** for all agent communications
4. **Track execution progress** for debugging
5. **Allow workflow resumption** after failures

## Related Skills

- [Agent Registry Agent](./agent-registry-agent.md) - Agent discovery
- [Consensus Agent](./consensus-agent.md) - Consensus protocols
- [Task Delegation Agent](./task-delegation-agent.md) - Task routing
