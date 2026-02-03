# ZK Interactive Proofs Agent Skill

> **⚠️ Prerequisites**: Complete [SDK Setup](./00-sdk-setup.md) first to configure your environment.

Build zero-knowledge proof agents using the interactive Prover/Verifier protocol on Demos Network.

## Overview

ZK Interactive Proofs enable agents to prove statements are true without revealing the underlying data - essential for privacy-preserving verification, authentication, and compliance.

## SDK Reference

```typescript
import { Prover, Verifier } from "@kynesyslabs/demosdk/encryption"

// Prover: Generate proofs
const prover = new Prover()
await prover.generateCommitment(secret)        // Commit to a value
await prover.respondToChallenge(challenge)     // Answer verifier's challenge
await prover.generateProof(statement, witness) // Full proof generation

// Verifier: Verify proofs
const verifier = new Verifier()
await verifier.generateChallenge(commitment)   // Create random challenge
await verifier.verify(proof, statement)        // Verify proof validity
```

## ZK Proof Types

| Type | Use Case | Interaction |
|------|----------|-------------|
| Interactive | Real-time verification | Multi-round challenge-response |
| Non-interactive | Async verification | Single proof, verify anytime |
| Sigma protocols | Simple statements | 3-round commit-challenge-response |

## Agent Use Cases

### 1. Private Age Verification Agent

Prove age threshold without revealing actual age:

```typescript
class AgeVerificationAgent {
  private prover: Prover
  private verifier: Verifier

  async proveAgeOver(birthdate: Date, threshold: number): Promise<ZKProof> {
    // Calculate actual age
    const age = this.calculateAge(birthdate)

    // Generate commitment to age
    const commitment = await this.prover.generateCommitment({
      value: age,
      randomness: crypto.getRandomValues(new Uint8Array(32))
    })

    // Prove age >= threshold without revealing exact age
    const proof = await this.prover.generateProof({
      statement: `age >= ${threshold}`,
      witness: { actualAge: age, birthdate },
      commitment
    })

    return {
      commitment,
      proof,
      threshold,
      // Proof reveals: "user is at least 21" but NOT "user is 25"
    }
  }

  async verifyAge(proof: ZKProof): Promise<boolean> {
    return await this.verifier.verify(proof.proof, {
      statement: `age >= ${proof.threshold}`,
      commitment: proof.commitment
    })
  }
}

// Usage for compliance
const ageAgent = new AgeVerificationAgent()
const proof = await ageAgent.proveAgeOver(new Date("1995-03-15"), 21)

// Service verifies without learning actual birthday
const isAdult = await ageAgent.verifyAge(proof) // true
```

### 2. Solvency Proof Agent

Prove sufficient balance without revealing exact amount:

```typescript
class SolvencyProofAgent {
  private prover: Prover

  async proveSolvency(
    actualBalance: bigint,
    requiredAmount: bigint,
    accountId: string
  ): Promise<SolvencyProof> {
    // Commit to balance
    const balanceCommitment = await this.prover.generateCommitment({
      value: actualBalance,
      blinding: crypto.getRandomValues(new Uint8Array(32))
    })

    // Prove balance >= required without revealing exact amount
    const proof = await this.prover.generateProof({
      statement: "balance_sufficient",
      publicInputs: {
        requiredAmount,
        accountCommitment: balanceCommitment.commitment
      },
      privateInputs: {
        actualBalance,
        blinding: balanceCommitment.blinding
      }
    })

    return {
      accountId,
      requiredAmount,
      commitment: balanceCommitment.commitment,
      proof,
      timestamp: Date.now()
    }
  }

  async generateRangeProof(
    balance: bigint,
    minRange: bigint,
    maxRange: bigint
  ): Promise<RangeProof> {
    // Prove balance is within range: min <= balance <= max
    const commitment = await this.prover.generateCommitment({ value: balance })

    const proof = await this.prover.generateProof({
      statement: "in_range",
      publicInputs: { min: minRange, max: maxRange },
      privateInputs: { value: balance }
    })

    return { commitment, proof, range: [minRange, maxRange] }
  }
}

// Prove you can afford 1000 DEMOS without revealing you have 50,000
const solvencyAgent = new SolvencyProofAgent()
const proof = await solvencyAgent.proveSolvency(
  50000n,  // Actual balance (private)
  1000n,   // Required amount (public)
  "account_123"
)
```

### 3. Credential Verification Agent

Prove credential attributes without revealing full credential:

```typescript
class CredentialVerificationAgent {
  private prover: Prover
  private verifier: Verifier

  async proveCredentialAttribute(
    credential: {
      issuer: string
      subject: string
      attributes: Record<string, any>
      signature: Uint8Array
    },
    attributeToProve: string,
    condition: { operator: string; value: any }
  ): Promise<AttributeProof> {
    // Commit to full credential
    const credentialCommitment = await this.prover.generateCommitment({
      value: JSON.stringify(credential),
      includeSignature: true
    })

    // Generate selective disclosure proof
    const proof = await this.prover.generateProof({
      statement: "valid_credential_with_attribute",
      publicInputs: {
        issuer: credential.issuer,
        attributeName: attributeToProve,
        condition
      },
      privateInputs: {
        fullCredential: credential,
        attributeValue: credential.attributes[attributeToProve]
      }
    })

    return {
      credentialCommitment,
      proof,
      revealedIssuer: credential.issuer,
      provenAttribute: attributeToProve,
      condition
      // Does NOT reveal: subject identity, other attributes, exact value
    }
  }

  async verifyCredentialProof(proof: AttributeProof): Promise<{
    valid: boolean
    issuerTrusted: boolean
    attributeSatisfied: boolean
  }> {
    const verificationResult = await this.verifier.verify(proof.proof, {
      statement: "valid_credential_with_attribute",
      publicInputs: {
        issuer: proof.revealedIssuer,
        attributeName: proof.provenAttribute,
        condition: proof.condition
      }
    })

    return {
      valid: verificationResult.valid,
      issuerTrusted: await this.checkIssuerTrust(proof.revealedIssuer),
      attributeSatisfied: verificationResult.attributeCheck
    }
  }
}

// Prove employment at Fortune 500 without revealing which company
const credAgent = new CredentialVerificationAgent()
const proof = await credAgent.proveCredentialAttribute(
  employmentCredential,
  "company_ranking",
  { operator: "<=", value: 500 }
)
```

### 4. Private Voting Eligibility Agent

Prove voting eligibility without revealing identity:

```typescript
class VotingEligibilityAgent {
  private prover: Prover

  async proveEligibility(
    voterData: {
      citizenshipDate: Date
      residenceAddress: string
      age: number
      registrationId: string
    },
    electionRequirements: {
      minAge: number
      requiredCitizenship: boolean
      residenceDistrict: string
    }
  ): Promise<EligibilityProof> {
    // Commit to voter identity
    const identityCommitment = await this.prover.generateCommitment({
      value: voterData.registrationId,
      blindingFactor: crypto.getRandomValues(new Uint8Array(32))
    })

    // Generate eligibility proof
    const eligibilityProof = await this.prover.generateProof({
      statement: "eligible_voter",
      publicInputs: {
        electionId: electionRequirements.residenceDistrict,
        minAge: electionRequirements.minAge
      },
      privateInputs: {
        age: voterData.age,
        isCitizen: voterData.citizenshipDate !== null,
        residenceDistrict: this.extractDistrict(voterData.residenceAddress),
        registrationId: voterData.registrationId
      }
    })

    // Generate nullifier to prevent double voting
    const nullifier = await this.generateNullifier(
      voterData.registrationId,
      electionRequirements.residenceDistrict
    )

    return {
      identityCommitment,
      eligibilityProof,
      nullifier, // Unique per voter per election, unlinkable
      electionId: electionRequirements.residenceDistrict
    }
  }

  private async generateNullifier(
    registrationId: string,
    electionId: string
  ): Promise<string> {
    // Deterministic but unlinkable identifier
    const hash = await crypto.subtle.digest(
      "SHA-256",
      new TextEncoder().encode(`${registrationId}:${electionId}`)
    )
    return Buffer.from(hash).toString("hex")
  }
}
```

### 5. Private Transaction Compliance Agent

Prove transaction compliance without revealing details:

```typescript
class ComplianceProofAgent {
  private prover: Prover

  async proveAMLCompliance(
    transaction: {
      sender: string
      receiver: string
      amount: bigint
      purpose: string
    },
    complianceRules: {
      maxSingleTransaction: bigint
      sanctionsList: string[]
      requiredKYCLevel: number
    }
  ): Promise<ComplianceProof> {
    // Generate proofs for each compliance requirement

    // 1. Amount within limits
    const amountProof = await this.prover.generateProof({
      statement: "amount_within_limit",
      publicInputs: { maxAmount: complianceRules.maxSingleTransaction },
      privateInputs: { actualAmount: transaction.amount }
    })

    // 2. Not on sanctions list (without revealing address)
    const sanctionsProof = await this.prover.generateProof({
      statement: "not_on_list",
      publicInputs: { listCommitment: this.commitToList(complianceRules.sanctionsList) },
      privateInputs: {
        sender: transaction.sender,
        receiver: transaction.receiver
      }
    })

    // 3. KYC level sufficient
    const kycProof = await this.prover.generateProof({
      statement: "kyc_level_sufficient",
      publicInputs: { requiredLevel: complianceRules.requiredKYCLevel },
      privateInputs: { actualKYCLevel: await this.getKYCLevel(transaction.sender) }
    })

    return {
      transactionCommitment: await this.commitToTransaction(transaction),
      amountProof,
      sanctionsProof,
      kycProof,
      timestamp: Date.now(),
      // Transaction details remain private
    }
  }

  async verifyCompliance(proof: ComplianceProof): Promise<{
    amountCompliant: boolean
    sanctionsClean: boolean
    kycSufficient: boolean
    overallCompliant: boolean
  }> {
    const verifier = new Verifier()

    const results = await Promise.all([
      verifier.verify(proof.amountProof, { statement: "amount_within_limit" }),
      verifier.verify(proof.sanctionsProof, { statement: "not_on_list" }),
      verifier.verify(proof.kycProof, { statement: "kyc_level_sufficient" })
    ])

    return {
      amountCompliant: results[0].valid,
      sanctionsClean: results[1].valid,
      kycSufficient: results[2].valid,
      overallCompliant: results.every(r => r.valid)
    }
  }
}
```

### 6. Private Set Membership Agent

Prove membership in a set without revealing which element:

```typescript
class SetMembershipAgent {
  private prover: Prover

  async proveMembership(
    element: string,
    set: string[],
    setName: string
  ): Promise<MembershipProof> {
    // Build Merkle tree from set
    const merkleTree = await this.buildMerkleTree(set)
    const merkleRoot = merkleTree.root

    // Find element's position and generate path
    const elementIndex = set.indexOf(element)
    const merklePath = merkleTree.getProof(elementIndex)

    // Generate ZK proof of membership
    const proof = await this.prover.generateProof({
      statement: "merkle_membership",
      publicInputs: {
        merkleRoot,
        setName
      },
      privateInputs: {
        element,
        merklePath,
        elementIndex
      }
    })

    return {
      merkleRoot,
      setName,
      proof,
      // Does NOT reveal: which element, position in set
    }
  }

  async proveNonMembership(
    element: string,
    set: string[]
  ): Promise<NonMembershipProof> {
    // Sort set for binary search proof
    const sortedSet = [...set].sort()

    // Find neighbors that prove element is not in set
    const { leftNeighbor, rightNeighbor } = this.findNeighbors(element, sortedSet)

    const proof = await this.prover.generateProof({
      statement: "not_in_sorted_set",
      publicInputs: {
        setCommitment: await this.commitToSet(sortedSet)
      },
      privateInputs: {
        element,
        leftNeighbor,
        rightNeighbor,
        leftProof: this.getMerkleProof(leftNeighbor, sortedSet),
        rightProof: this.getMerkleProof(rightNeighbor, sortedSet)
      }
    })

    return { proof, setCommitment: await this.commitToSet(sortedSet) }
  }
}

// Prove you're a verified user without revealing your user ID
const membershipAgent = new SetMembershipAgent()
const proof = await membershipAgent.proveMembership(
  "user_12345",           // Your ID (private)
  verifiedUsersList,      // Set of all verified users
  "verified_users_q4_2024"
)
```

## Interactive Protocol Example

```typescript
// Full interactive proof protocol
async function interactiveProof(statement: string, witness: any) {
  const prover = new Prover()
  const verifier = new Verifier()

  // Round 1: Prover commits
  const commitment = await prover.generateCommitment(witness)

  // Round 2: Verifier challenges
  const challenge = await verifier.generateChallenge(commitment)

  // Round 3: Prover responds
  const response = await prover.respondToChallenge(challenge)

  // Verification
  const isValid = await verifier.verify({
    commitment,
    challenge,
    response,
    statement
  })

  return isValid
}
```

## Performance Optimization

```typescript
// Batch verification for multiple proofs
const batchVerify = async (proofs: ZKProof[]) => {
  const verifier = new Verifier()

  // Batch verification is more efficient than individual
  return await verifier.verifyBatch(proofs)
}

// Recursive proofs for aggregation
const aggregateProofs = async (proofs: ZKProof[]) => {
  const prover = new Prover()

  // Prove "all these proofs are valid" as single proof
  return await prover.generateRecursiveProof(proofs)
}
```

## Best Practices

1. **Use non-interactive proofs** for async verification scenarios
2. **Implement nullifiers** for applications requiring "one-time" proofs
3. **Batch verify** when checking multiple proofs
4. **Consider proof size** vs verification time tradeoffs
5. **Secure randomness** is critical for commitment schemes

## Integration with DemosWork

```typescript
const zkWorkflow = new DemosWork()

// Step 1: Generate proof
zkWorkflow.push(new BaseOperation(
  new NativeWorkStep({
    method: "zk.generateProof",
    params: { statement, witness }
  })
))

// Step 2: Submit proof on-chain
zkWorkflow.push(new BaseOperation(
  new XmWorkStep({
    chain: "base-sepolia",
    method: "submitProof",
    params: { proof: "{{step1.result}}" }
  })
))
```

## Related Skills

- [FHE Privacy Agent](./fhe-privacy-agent.md) - Compute on encrypted data
- [Identity Resolution](./identity-resolution-agent.md) - Privacy-preserving identity
- [TLSNotary Oracle](./tlsnotary-oracle-agent.md) - Web proof attestation
