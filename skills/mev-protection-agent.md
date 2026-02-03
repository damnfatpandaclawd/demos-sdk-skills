# MEV Protection Agent Skill

> **⚠️ Prerequisites**: Complete [SDK Setup](./00-sdk-setup.md) first to configure your environment.

Build agents that protect transactions from MEV extraction and front-running.

## Overview

MEV Protection Agent enables private transaction submission, sandwich attack detection, and MEV-aware execution strategies. Essential for protecting users from value extraction.

## SDK Reference

```typescript
import { Demos } from "@kynesyslabs/demosdk/websdk"
import { EVM } from "@kynesyslabs/demosdk/xm-websdk"

// Demos network provides inherent MEV protection through its architecture
const tx = await evm.preparePay(recipient, amount)
```

## Agent Use Cases

### 1. Private Transaction Submitter

Submit transactions privately to avoid mempool exposure:

```typescript
class PrivateTransactionSubmitter {
  private flashbotsRelay: string = "https://relay.flashbots.net"
  private privateRelays: PrivateRelay[] = []

  async submitPrivate(
    tx: TransactionRequest,
    signer: Signer
  ): Promise<PrivateSubmissionResult> {
    // Sign the transaction
    const signedTx = await signer.signTransaction(tx)

    // Try multiple private relays
    const results = await Promise.allSettled(
      this.privateRelays.map(relay =>
        this.submitToRelay(relay, signedTx)
      )
    )

    // Check if any succeeded
    const success = results.find(
      r => r.status === "fulfilled" && r.value.success
    )

    if (success && success.status === "fulfilled") {
      return success.value
    }

    // Fallback: submit to Flashbots bundle
    return await this.submitToFlashbots(signedTx)
  }

  async submitToFlashbots(signedTx: string): Promise<PrivateSubmissionResult> {
    const bundle = {
      txs: [signedTx],
      blockNumber: await this.getTargetBlock()
    }

    const response = await fetch(this.flashbotsRelay, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        jsonrpc: "2.0",
        method: "eth_sendBundle",
        params: [bundle],
        id: 1
      })
    })

    const result = await response.json()

    return {
      success: !result.error,
      bundleHash: result.result?.bundleHash,
      error: result.error?.message
    }
  }

  async submitWithBackrunProtection(
    tx: TransactionRequest,
    signer: Signer
  ): Promise<PrivateSubmissionResult> {
    // Create a bundle with a backrun that captures any MEV
    const signedTx = await signer.signTransaction(tx)

    // Add a self-backrun to capture remaining value
    const backrunTx = await this.createBackrunTx(tx, signer)
    const signedBackrun = await signer.signTransaction(backrunTx)

    return await this.submitBundle([signedTx, signedBackrun])
  }
}
```

### 2. Sandwich Attack Detector

Detect and avoid sandwich attacks:

```typescript
class SandwichDetector {
  private mempoolMonitor: MempoolMonitor
  private suspiciousPatterns: Map<string, SuspiciousActivity> = new Map()

  async analyzeMempoolForSandwich(
    ourTx: TransactionRequest
  ): Promise<SandwichRisk> {
    // Get pending transactions in mempool
    const pendingTxs = await this.mempoolMonitor.getPending()

    // Look for front-run patterns
    const potentialFrontRuns = pendingTxs.filter(tx =>
      this.isSamePool(tx, ourTx) &&
      tx.gasPrice > ourTx.gasPrice &&
      this.isSwapTransaction(tx)
    )

    if (potentialFrontRuns.length === 0) {
      return { risk: "low", confidence: 0.9 }
    }

    // Analyze front-run transactions
    const analysis = await Promise.all(
      potentialFrontRuns.map(tx => this.analyzeTransaction(tx))
    )

    const sandwichBots = analysis.filter(a =>
      a.isKnownBot || a.patternMatch > 0.8
    )

    if (sandwichBots.length > 0) {
      return {
        risk: "high",
        confidence: 0.95,
        attackers: sandwichBots.map(b => b.address),
        recommendation: "Use private submission or increase slippage protection"
      }
    }

    return {
      risk: "medium",
      confidence: 0.7,
      recommendation: "Consider private submission"
    }
  }

  async detectOngoingSandwich(
    txHash: string
  ): Promise<SandwichDetection | null> {
    // Get our transaction
    const tx = await this.provider.getTransaction(txHash)
    if (!tx || !tx.blockNumber) return null

    // Get all transactions in the same block
    const block = await this.provider.getBlock(tx.blockNumber, true)
    const txIndex = block.transactions.findIndex(t => t.hash === txHash)

    // Look for sandwich pattern
    const prevTx = txIndex > 0 ? block.transactions[txIndex - 1] : null
    const nextTx = txIndex < block.transactions.length - 1
      ? block.transactions[txIndex + 1]
      : null

    if (!prevTx || !nextTx) return null

    // Check if same sender for prev and next (sandwich pattern)
    if (prevTx.from === nextTx.from &&
        this.isSamePool(prevTx, tx) &&
        this.isSamePool(nextTx, tx)) {
      // Calculate MEV extracted
      const mevExtracted = await this.calculateMEVExtracted(prevTx, tx, nextTx)

      return {
        detected: true,
        attacker: prevTx.from,
        frontRunTx: prevTx.hash,
        backRunTx: nextTx.hash,
        mevExtracted,
        block: tx.blockNumber
      }
    }

    return null
  }
}
```

### 3. MEV-Aware Execution Engine

Execute transactions with MEV awareness:

```typescript
class MEVAwareExecutor {
  private sandwichDetector: SandwichDetector
  private privateSubmitter: PrivateTransactionSubmitter
  private maxMEVExposure: bigint

  async executeWithMEVProtection(
    tx: TransactionRequest,
    signer: Signer,
    options: MEVProtectionOptions = {}
  ): Promise<ExecutionResult> {
    // Analyze MEV risk
    const risk = await this.sandwichDetector.analyzeMempoolForSandwich(tx)

    // Calculate potential MEV exposure
    const mevExposure = await this.estimateMEVExposure(tx)

    if (mevExposure > this.maxMEVExposure) {
      // High exposure - use private submission
      return await this.privateSubmitter.submitPrivate(tx, signer)
    }

    if (risk.risk === "high") {
      // Sandwich risk detected - use protection
      return await this.executeWithProtection(tx, signer, options)
    }

    if (risk.risk === "medium") {
      // Medium risk - add slippage protection
      const protectedTx = await this.addSlippageProtection(tx, 0.02)
      return await this.execute(protectedTx, signer)
    }

    // Low risk - normal execution with small buffer
    const bufferedTx = await this.addSlippageProtection(tx, 0.005)
    return await this.execute(bufferedTx, signer)
  }

  private async executeWithProtection(
    tx: TransactionRequest,
    signer: Signer,
    options: MEVProtectionOptions
  ): Promise<ExecutionResult> {
    const strategies: ProtectionStrategy[] = []

    // Strategy 1: Private submission
    strategies.push({
      name: "private",
      execute: () => this.privateSubmitter.submitPrivate(tx, signer)
    })

    // Strategy 2: Commit-reveal
    if (options.allowCommitReveal) {
      strategies.push({
        name: "commit-reveal",
        execute: () => this.executeCommitReveal(tx, signer)
      })
    }

    // Strategy 3: Time-delayed with randomness
    if (options.allowDelay) {
      strategies.push({
        name: "delayed",
        execute: () => this.executeDelayed(tx, signer)
      })
    }

    // Try strategies in order
    for (const strategy of strategies) {
      try {
        const result = await strategy.execute()
        if (result.success) {
          return { ...result, strategy: strategy.name }
        }
      } catch (error) {
        continue
      }
    }

    throw new Error("All MEV protection strategies failed")
  }

  private async executeCommitReveal(
    tx: TransactionRequest,
    signer: Signer
  ): Promise<ExecutionResult> {
    // Generate random salt
    const salt = ethers.randomBytes(32)

    // Create commitment
    const commitment = ethers.keccak256(
      ethers.AbiCoder.defaultAbiCoder().encode(
        ["bytes", "bytes32"],
        [tx.data, salt]
      )
    )

    // Submit commitment
    const commitTx = await this.submitCommitment(commitment, signer)
    await commitTx.wait()

    // Wait for commitment to be included
    await this.waitBlocks(2)

    // Reveal and execute
    const revealTx = await this.submitReveal(tx, salt, signer)

    return {
      success: true,
      txHash: revealTx.hash,
      strategy: "commit-reveal"
    }
  }
}
```

## Best Practices

1. **Analyze MEV exposure** before each transaction
2. **Use private submission** for high-value swaps
3. **Monitor for sandwich patterns** in real-time
4. **Implement multiple protection strategies**
5. **Track MEV extraction** for post-trade analysis

## Related Skills

- [Slippage Protection](./slippage-protection-agent.md) - Slippage management
- [Mempool Monitor](./mempool-monitor-agent.md) - Mempool analysis
- [Private Transaction](./l2ps-subnet-agent.md) - Private execution
