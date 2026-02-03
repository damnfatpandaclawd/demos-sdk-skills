# Scheduler Agent Skill

Build agents that execute tasks on schedules and manage recurring operations.

## Overview

Scheduler Agent enables time-based task execution, cron-like scheduling, and job management. Essential for automated operations, periodic maintenance, and time-triggered workflows.

## SDK Reference

```typescript
import { DemosWork, BaseOperation } from "@kynesyslabs/demoswork"

// Scheduler uses DemosWork for complex scheduled tasks
```

## Agent Use Cases

### 1. Cron-Like Scheduler Agent

Schedule recurring tasks:

```typescript
class SchedulerAgent {
  private jobs: Map<string, ScheduledJob> = new Map()
  private timers: Map<string, NodeJS.Timeout> = new Map()

  async scheduleJob(
    name: string,
    schedule: Schedule,
    task: () => Promise<void>
  ): Promise<string> {
    const jobId = this.generateJobId()

    const job: ScheduledJob = {
      id: jobId,
      name,
      schedule,
      task,
      lastRun: null,
      nextRun: this.calculateNextRun(schedule),
      status: "scheduled"
    }

    this.jobs.set(jobId, job)
    this.scheduleNextExecution(jobId)

    return jobId
  }

  private scheduleNextExecution(jobId: string): void {
    const job = this.jobs.get(jobId)
    if (!job) return

    const delay = job.nextRun - Date.now()

    const timer = setTimeout(async () => {
      await this.executeJob(jobId)

      // Schedule next execution
      job.nextRun = this.calculateNextRun(job.schedule)
      this.scheduleNextExecution(jobId)
    }, delay)

    this.timers.set(jobId, timer)
  }

  private async executeJob(jobId: string): Promise<void> {
    const job = this.jobs.get(jobId)
    if (!job) return

    job.status = "running"
    job.lastRun = Date.now()

    try {
      await job.task()
      job.status = "scheduled"
    } catch (error) {
      job.status = "failed"
      job.lastError = error.message
    }
  }

  async cancelJob(jobId: string): Promise<void> {
    const timer = this.timers.get(jobId)
    if (timer) {
      clearTimeout(timer)
      this.timers.delete(jobId)
    }
    this.jobs.delete(jobId)
  }

  private calculateNextRun(schedule: Schedule): number {
    // Simple interval-based scheduling
    if (schedule.interval) {
      return Date.now() + schedule.interval
    }

    // Cron-like scheduling
    if (schedule.cron) {
      return this.parseCronNextRun(schedule.cron)
    }

    // Specific time
    if (schedule.at) {
      return new Date(schedule.at).getTime()
    }

    throw new Error("Invalid schedule")
  }
}
```

### 2. Task Queue Agent

Queue and process tasks:

```typescript
class TaskQueueAgent {
  private queue: Task[] = []
  private processing: boolean = false
  private concurrency: number = 1

  async enqueue(
    task: Task,
    priority: number = 0
  ): Promise<string> {
    task.id = this.generateTaskId()
    task.priority = priority
    task.status = "pending"
    task.enqueuedAt = Date.now()

    this.queue.push(task)
    this.queue.sort((a, b) => b.priority - a.priority)

    this.processQueue()

    return task.id
  }

  private async processQueue(): Promise<void> {
    if (this.processing) return

    this.processing = true

    while (this.queue.length > 0) {
      const task = this.queue.shift()!
      task.status = "running"
      task.startedAt = Date.now()

      try {
        task.result = await task.execute()
        task.status = "completed"
      } catch (error) {
        task.status = "failed"
        task.error = error.message

        // Retry logic
        if (task.retries < (task.maxRetries || 3)) {
          task.retries++
          task.status = "pending"
          this.queue.push(task)
        }
      }

      task.completedAt = Date.now()
    }

    this.processing = false
  }

  async getTaskStatus(taskId: string): Promise<Task | null> {
    return this.queue.find(t => t.id === taskId) || null
  }
}
```

## Best Practices

1. **Handle missed schedules** gracefully
2. **Implement job persistence** for recovery
3. **Add retry logic** for failed tasks
4. **Monitor job execution times**
5. **Log all job executions**

## Related Skills

- [Workflow Orchestration](./workflow-orchestration-agent.md) - Complex workflows
- [Batch Transaction](./batch-transaction-agent.md) - Scheduled batches
