# Config Manager Agent Skill

> **⚠️ Prerequisites**: Complete [SDK Setup](./00-sdk-setup.md) first to configure your environment.

Build agents that manage distributed configuration across services.

## Overview

Config Manager Agent enables centralized configuration management, dynamic updates, and environment-aware settings distribution. Essential for microservices, feature flags, and runtime configuration without redeployment.

## SDK Reference

```typescript
import { Demos } from "@kynesyslabs/demosdk/websdk"
import { StorageProgram } from "@kynesyslabs/demosdk/storage"

// Configuration storage
const storage = new StorageProgram(demos)
```

## Agent Use Cases

### 1. Centralized Config Server

Manage configuration across all services:

```typescript
class CentralizedConfigServer {
  private configs: Map<string, ConfigNamespace> = new Map()
  private subscribers: Map<string, ConfigSubscriber[]> = new Map()
  private versionHistory: Map<string, ConfigVersion[]> = new Map()

  async createNamespace(
    name: string,
    schema: ConfigSchema
  ): Promise<ConfigNamespace> {
    const namespace: ConfigNamespace = {
      name,
      schema,
      values: {},
      version: 1,
      createdAt: Date.now(),
      updatedAt: Date.now()
    }

    this.configs.set(name, namespace)
    this.versionHistory.set(name, [])

    return namespace
  }

  async setConfig(
    namespace: string,
    key: string,
    value: any,
    options: SetConfigOptions = {}
  ): Promise<ConfigUpdateResult> {
    const config = this.configs.get(namespace)
    if (!config) {
      throw new Error(`Namespace ${namespace} not found`)
    }

    // Validate against schema
    if (config.schema) {
      const validation = this.validateValue(key, value, config.schema)
      if (!validation.valid) {
        throw new Error(`Validation failed: ${validation.errors.join(", ")}`)
      }
    }

    // Store previous version
    const previousValue = config.values[key]
    this.recordVersion(namespace, key, previousValue, value)

    // Update config
    config.values[key] = value
    config.version++
    config.updatedAt = Date.now()

    // Notify subscribers
    if (!options.silent) {
      await this.notifySubscribers(namespace, key, value, previousValue)
    }

    return {
      namespace,
      key,
      value,
      previousValue,
      version: config.version,
      timestamp: config.updatedAt
    }
  }

  async getConfig(
    namespace: string,
    key?: string
  ): Promise<any> {
    const config = this.configs.get(namespace)
    if (!config) {
      throw new Error(`Namespace ${namespace} not found`)
    }

    if (key) {
      return config.values[key]
    }

    return { ...config.values }
  }

  async subscribe(
    namespace: string,
    callback: ConfigChangeCallback,
    filter?: ConfigFilter
  ): Promise<Subscription> {
    if (!this.subscribers.has(namespace)) {
      this.subscribers.set(namespace, [])
    }

    const subscriber: ConfigSubscriber = {
      id: `sub_${Date.now()}_${Math.random().toString(36).slice(2)}`,
      callback,
      filter,
      subscribedAt: Date.now()
    }

    this.subscribers.get(namespace)!.push(subscriber)

    // Send current config
    const currentConfig = await this.getConfig(namespace)
    callback({
      type: "initial",
      namespace,
      config: currentConfig
    })

    return {
      id: subscriber.id,
      unsubscribe: () => this.unsubscribe(namespace, subscriber.id)
    }
  }

  private async notifySubscribers(
    namespace: string,
    key: string,
    newValue: any,
    oldValue: any
  ): Promise<void> {
    const subscribers = this.subscribers.get(namespace) || []

    for (const subscriber of subscribers) {
      // Apply filter if present
      if (subscriber.filter) {
        if (subscriber.filter.keys && !subscriber.filter.keys.includes(key)) {
          continue
        }
      }

      try {
        await subscriber.callback({
          type: "update",
          namespace,
          key,
          newValue,
          oldValue,
          timestamp: Date.now()
        })
      } catch (error) {
        // Log subscriber error but don't fail
        console.error(`Subscriber ${subscriber.id} error:`, error)
      }
    }
  }

  async rollback(
    namespace: string,
    key: string,
    version?: number
  ): Promise<ConfigUpdateResult> {
    const history = this.versionHistory.get(namespace)
    if (!history || history.length === 0) {
      throw new Error("No version history available")
    }

    // Find target version
    const keyHistory = history.filter(v => v.key === key)
    if (keyHistory.length === 0) {
      throw new Error(`No history for key ${key}`)
    }

    const targetVersion = version
      ? keyHistory.find(v => v.version === version)
      : keyHistory[keyHistory.length - 1]

    if (!targetVersion) {
      throw new Error(`Version ${version} not found`)
    }

    // Restore value
    return await this.setConfig(namespace, key, targetVersion.oldValue, {
      silent: false
    })
  }

  private recordVersion(
    namespace: string,
    key: string,
    oldValue: any,
    newValue: any
  ): void {
    const config = this.configs.get(namespace)!
    const history = this.versionHistory.get(namespace)!

    history.push({
      key,
      version: config.version + 1,
      oldValue,
      newValue,
      timestamp: Date.now()
    })

    // Keep only last 100 versions per namespace
    if (history.length > 100) {
      history.shift()
    }
  }

  private validateValue(
    key: string,
    value: any,
    schema: ConfigSchema
  ): ValidationResult {
    const fieldSchema = schema.fields[key]
    const errors: string[] = []

    if (!fieldSchema) {
      if (schema.strict) {
        errors.push(`Unknown field: ${key}`)
      }
      return { valid: errors.length === 0, errors }
    }

    // Type validation
    if (fieldSchema.type && typeof value !== fieldSchema.type) {
      errors.push(`Expected ${fieldSchema.type}, got ${typeof value}`)
    }

    // Range validation
    if (fieldSchema.min !== undefined && value < fieldSchema.min) {
      errors.push(`Value below minimum: ${fieldSchema.min}`)
    }
    if (fieldSchema.max !== undefined && value > fieldSchema.max) {
      errors.push(`Value above maximum: ${fieldSchema.max}`)
    }

    // Enum validation
    if (fieldSchema.enum && !fieldSchema.enum.includes(value)) {
      errors.push(`Value must be one of: ${fieldSchema.enum.join(", ")}`)
    }

    return { valid: errors.length === 0, errors }
  }
}
```

### 2. Feature Flag Manager

Manage feature flags with targeting rules:

```typescript
class FeatureFlagManager {
  private flags: Map<string, FeatureFlag> = new Map()
  private evaluationCache: Map<string, CachedEvaluation> = new Map()

  async createFlag(config: FeatureFlagConfig): Promise<FeatureFlag> {
    const flag: FeatureFlag = {
      key: config.key,
      name: config.name,
      description: config.description,
      enabled: config.enabled || false,
      defaultValue: config.defaultValue,
      rules: config.rules || [],
      variants: config.variants,
      rolloutPercentage: config.rolloutPercentage || 100,
      createdAt: Date.now(),
      updatedAt: Date.now()
    }

    this.flags.set(flag.key, flag)
    return flag
  }

  async evaluate(
    flagKey: string,
    context: EvaluationContext
  ): Promise<FlagEvaluation> {
    const flag = this.flags.get(flagKey)

    if (!flag) {
      return {
        flagKey,
        value: null,
        reason: "FLAG_NOT_FOUND"
      }
    }

    if (!flag.enabled) {
      return {
        flagKey,
        value: flag.defaultValue,
        reason: "FLAG_DISABLED"
      }
    }

    // Check cache
    const cacheKey = this.getCacheKey(flagKey, context)
    const cached = this.evaluationCache.get(cacheKey)
    if (cached && Date.now() - cached.timestamp < 60000) {
      return cached.evaluation
    }

    // Evaluate rules
    for (const rule of flag.rules) {
      if (this.matchesRule(rule, context)) {
        const evaluation = {
          flagKey,
          value: rule.value,
          reason: "RULE_MATCH",
          ruleId: rule.id
        }

        this.cacheEvaluation(cacheKey, evaluation)
        return evaluation
      }
    }

    // Check rollout percentage
    if (flag.rolloutPercentage < 100) {
      const hash = this.hashContext(flagKey, context)
      const bucket = hash % 100

      if (bucket >= flag.rolloutPercentage) {
        return {
          flagKey,
          value: flag.defaultValue,
          reason: "ROLLOUT_EXCLUDED"
        }
      }
    }

    // Return default variant or value
    const evaluation = {
      flagKey,
      value: flag.variants
        ? this.selectVariant(flag.variants, context)
        : flag.defaultValue,
      reason: flag.variants ? "VARIANT_SELECTED" : "DEFAULT_VALUE"
    }

    this.cacheEvaluation(cacheKey, evaluation)
    return evaluation
  }

  private matchesRule(
    rule: FlagRule,
    context: EvaluationContext
  ): boolean {
    for (const condition of rule.conditions) {
      const contextValue = this.getContextValue(context, condition.field)

      switch (condition.operator) {
        case "equals":
          if (contextValue !== condition.value) return false
          break

        case "not_equals":
          if (contextValue === condition.value) return false
          break

        case "contains":
          if (!String(contextValue).includes(condition.value)) return false
          break

        case "in":
          if (!condition.values?.includes(contextValue)) return false
          break

        case "not_in":
          if (condition.values?.includes(contextValue)) return false
          break

        case "greater_than":
          if (!(contextValue > condition.value)) return false
          break

        case "less_than":
          if (!(contextValue < condition.value)) return false
          break

        case "regex":
          if (!new RegExp(condition.value).test(String(contextValue))) return false
          break
      }
    }

    return true
  }

  private selectVariant(
    variants: FlagVariant[],
    context: EvaluationContext
  ): any {
    // Calculate total weight
    const totalWeight = variants.reduce((sum, v) => sum + (v.weight || 1), 0)

    // Get consistent hash for user
    const hash = this.hashContext("variant", context)
    const bucket = hash % totalWeight

    // Select variant based on bucket
    let cumulative = 0
    for (const variant of variants) {
      cumulative += variant.weight || 1
      if (bucket < cumulative) {
        return variant.value
      }
    }

    return variants[0].value
  }

  async setRollout(
    flagKey: string,
    percentage: number
  ): Promise<void> {
    const flag = this.flags.get(flagKey)
    if (!flag) {
      throw new Error(`Flag ${flagKey} not found`)
    }

    flag.rolloutPercentage = Math.max(0, Math.min(100, percentage))
    flag.updatedAt = Date.now()

    // Clear cache for this flag
    this.clearFlagCache(flagKey)
  }

  async addRule(
    flagKey: string,
    rule: FlagRule
  ): Promise<FeatureFlag> {
    const flag = this.flags.get(flagKey)
    if (!flag) {
      throw new Error(`Flag ${flagKey} not found`)
    }

    rule.id = rule.id || `rule_${Date.now()}`
    flag.rules.push(rule)
    flag.updatedAt = Date.now()

    this.clearFlagCache(flagKey)

    return flag
  }

  private hashContext(seed: string, context: EvaluationContext): number {
    const str = seed + (context.userId || context.sessionId || "anonymous")
    let hash = 0

    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i)
      hash = ((hash << 5) - hash) + char
      hash = hash & hash
    }

    return Math.abs(hash)
  }
}
```

### 3. Environment Config Manager

Manage environment-specific configurations:

```typescript
class EnvironmentConfigManager {
  private environments: Map<string, EnvironmentConfig> = new Map()
  private activeEnvironment: string = "development"
  private overrides: Map<string, any> = new Map()

  async defineEnvironment(
    name: string,
    config: EnvironmentDefinition
  ): Promise<EnvironmentConfig> {
    const envConfig: EnvironmentConfig = {
      name,
      inheritsFrom: config.inheritsFrom,
      values: config.values || {},
      secrets: config.secrets || [],
      variables: config.variables || {},
      createdAt: Date.now()
    }

    this.environments.set(name, envConfig)
    return envConfig
  }

  async setActiveEnvironment(name: string): Promise<void> {
    if (!this.environments.has(name)) {
      throw new Error(`Environment ${name} not found`)
    }

    this.activeEnvironment = name
    this.overrides.clear()
  }

  async getConfig(key: string): Promise<any> {
    // Check overrides first
    if (this.overrides.has(key)) {
      return this.overrides.get(key)
    }

    // Get from active environment
    return this.resolveConfig(this.activeEnvironment, key)
  }

  private resolveConfig(envName: string, key: string): any {
    const env = this.environments.get(envName)
    if (!env) return undefined

    // Check direct value
    if (key in env.values) {
      return this.interpolate(env.values[key], env)
    }

    // Check inherited environments
    if (env.inheritsFrom) {
      return this.resolveConfig(env.inheritsFrom, key)
    }

    return undefined
  }

  private interpolate(value: any, env: EnvironmentConfig): any {
    if (typeof value !== "string") return value

    // Replace ${VAR} patterns
    return value.replace(/\$\{([^}]+)\}/g, (match, varName) => {
      // Check environment variables
      if (env.variables[varName] !== undefined) {
        return env.variables[varName]
      }

      // Check process environment
      if (process.env[varName] !== undefined) {
        return process.env[varName]
      }

      // Check other config values
      const resolved = this.resolveConfig(env.name, varName)
      if (resolved !== undefined) {
        return resolved
      }

      return match // Return original if not found
    })
  }

  async setOverride(key: string, value: any): Promise<void> {
    this.overrides.set(key, value)
  }

  async clearOverrides(): Promise<void> {
    this.overrides.clear()
  }

  async exportConfig(
    envName?: string,
    format: "json" | "env" | "yaml" = "json"
  ): Promise<string> {
    const env = this.environments.get(envName || this.activeEnvironment)
    if (!env) {
      throw new Error("Environment not found")
    }

    // Resolve all values
    const resolved: Record<string, any> = {}

    for (const key of Object.keys(env.values)) {
      resolved[key] = await this.getConfig(key)
    }

    // Add inherited values
    if (env.inheritsFrom) {
      const parent = this.environments.get(env.inheritsFrom)
      if (parent) {
        for (const key of Object.keys(parent.values)) {
          if (!(key in resolved)) {
            resolved[key] = await this.resolveConfig(parent.name, key)
          }
        }
      }
    }

    switch (format) {
      case "json":
        return JSON.stringify(resolved, null, 2)

      case "env":
        return Object.entries(resolved)
          .map(([k, v]) => `${k}=${JSON.stringify(v)}`)
          .join("\n")

      case "yaml":
        return this.toYaml(resolved)

      default:
        return JSON.stringify(resolved)
    }
  }

  async validateConfig(envName?: string): Promise<ValidationReport> {
    const env = this.environments.get(envName || this.activeEnvironment)
    if (!env) {
      throw new Error("Environment not found")
    }

    const issues: ValidationIssue[] = []

    // Check for unresolved variables
    for (const [key, value] of Object.entries(env.values)) {
      if (typeof value === "string" && value.includes("${")) {
        const resolved = this.interpolate(value, env)
        if (resolved.includes("${")) {
          issues.push({
            type: "unresolved_variable",
            key,
            message: `Unresolved variable in ${key}: ${resolved}`
          })
        }
      }
    }

    // Check required secrets
    for (const secret of env.secrets) {
      if (!process.env[secret]) {
        issues.push({
          type: "missing_secret",
          key: secret,
          message: `Required secret ${secret} not found in environment`
        })
      }
    }

    return {
      valid: issues.length === 0,
      environment: env.name,
      issues
    }
  }
}
```

## Best Practices

1. **Use namespaces** to organize related configurations
2. **Validate all config changes** against schemas
3. **Maintain version history** for rollback capability
4. **Implement gradual rollouts** for risky changes
5. **Use environment inheritance** to reduce duplication

## Related Skills

- [Secret Manager Agent](./secret-manager-agent.md) - Secure secrets
- [Upgrade Manager Agent](./upgrade-manager-agent.md) - Config upgrades
- [Alert Manager Agent](./alert-manager-agent.md) - Config change alerts
