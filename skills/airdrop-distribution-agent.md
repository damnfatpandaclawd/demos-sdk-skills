# Airdrop Distribution Agent Skill

Build agents that efficiently distribute tokens to large numbers of recipients.

## Overview

Airdrop Distribution enables agents to plan, verify eligibility, and execute mass token distributions with gas optimization and tracking. Essential for token launches, community rewards, and retroactive distributions.

## SDK Reference

```typescript
import { Demos } from "@kynesyslabs/demosdk/websdk"

// Airdrop Methods
demos.prepareBatchTransactions(transactions)  // Batch transfers
demos.verifyMerkleProof(root, proof, leaf)    // Verify eligibility
demos.createMerkleTree(recipients)            // Create distribution tree
```

## Agent Use Cases

### 1. Merkle Airdrop Agent

Efficient merkle-based distribution:

```typescript
class MerkleAirdropAgent {
  private demos: Demos

  async createAirdrop(
    recipients: AirdropRecipient[]
  ): Promise<AirdropConfig> {
    // Create merkle tree
    const leaves = recipients.map(r =>
      this.hashRecipient(r.address, r.amount)
    )
    const tree = await this.demos.createMerkleTree(leaves)

    // Store airdrop config
    const config: AirdropConfig = {
      id: this.generateAirdropId(),
      merkleRoot: tree.root,
      totalRecipients: recipients.length,
      totalAmount: recipients.reduce((sum, r) => sum + r.amount, 0n),
      createdAt: Date.now(),
      claimed: 0
    }

    return config
  }

  async claim(
    airdropId: string,
    address: string,
    amount: bigint,
    proof: string[]
  ): Promise<ClaimResult> {
    const config = await this.getAirdropConfig(airdropId)

    // Verify proof
    const leaf = this.hashRecipient(address, amount)
    const isValid = await this.demos.verifyMerkleProof(
      config.merkleRoot,
      proof,
      leaf
    )

    if (!isValid) {
      return { success: false, error: "Invalid proof" }
    }

    // Check not already claimed
    if (await this.hasClaimed(airdropId, address)) {
      return { success: false, error: "Already claimed" }
    }

    // Execute transfer
    const tx = await this.demos.preparePay(address, amount.toString())
    const result = await this.demos.insertTransaction(tx)

    // Mark as claimed
    await this.markClaimed(airdropId, address)

    return {
      success: true,
      txHash: result.hash,
      amount
    }
  }
}
```

### 2. Direct Distribution Agent

Push-based distribution:

```typescript
class DirectDistributionAgent {
  private demos: Demos

  async distributeToAll(
    recipients: AirdropRecipient[],
    batchSize: number = 100
  ): Promise<DistributionResult> {
    const batches: AirdropRecipient[][] = []
    for (let i = 0; i < recipients.length; i += batchSize) {
      batches.push(recipients.slice(i, i + batchSize))
    }

    const results: BatchResult[] = []
    let totalDistributed = 0n

    for (let i = 0; i < batches.length; i++) {
      const batch = batches[i]
      const transactions = batch.map(r => ({
        type: "transfer",
        content: { to: r.address, amount: r.amount.toString() }
      }))

      const batchTx = await this.demos.prepareBatchTransactions(transactions)
      const result = await this.demos.insertBatchTransactions(batchTx)

      results.push({
        batchIndex: i,
        count: batch.length,
        txHash: result.hash
      })

      totalDistributed += batch.reduce((sum, r) => sum + r.amount, 0n)

      // Rate limiting
      await new Promise(r => setTimeout(r, 1000))
    }

    return {
      totalRecipients: recipients.length,
      totalDistributed,
      batches: results,
      completedAt: Date.now()
    }
  }
}
```

## Best Practices

1. **Use merkle trees** for large airdrops (gas-efficient)
2. **Verify eligibility** before distribution
3. **Batch transactions** to reduce costs
4. **Track claims** to prevent double-claiming
5. **Handle failed transfers** gracefully

## Related Skills

- [Batch Transaction](./batch-transaction-agent.md) - Efficient batching
