# Contract Analyzer Agent Skill

Build agents that analyze smart contract code and behavior.

## Overview

Contract Analyzer Agent enables automated smart contract analysis for security, functionality, and risk assessment. Essential for due diligence, security research, and automated trading safeguards.

## SDK Reference

```typescript
import { Demos } from "@kynesyslabs/demosdk/websdk"
import { EVM } from "@kynesyslabs/demosdk/xm-websdk"

// Contract interaction
const code = await evm.provider.getCode(contractAddress)
```

## Agent Use Cases

### 1. Token Contract Analyzer

Analyze ERC20 token contracts:

```typescript
class TokenContractAnalyzer {
  private demos: Demos

  async analyzeToken(tokenAddress: string): Promise<TokenAnalysis> {
    const [
      code,
      isVerified,
      basicInfo,
      securityChecks,
      ownershipInfo
    ] = await Promise.all([
      this.getContractCode(tokenAddress),
      this.checkVerification(tokenAddress),
      this.getBasicTokenInfo(tokenAddress),
      this.runSecurityChecks(tokenAddress),
      this.analyzeOwnership(tokenAddress)
    ])

    return {
      address: tokenAddress,
      ...basicInfo,
      verified: isVerified,
      codeSize: code.length,
      security: securityChecks,
      ownership: ownershipInfo,
      riskScore: this.calculateRiskScore(securityChecks, ownershipInfo),
      flags: this.generateFlags(securityChecks, ownershipInfo)
    }
  }

  private async runSecurityChecks(address: string): Promise<SecurityChecks> {
    return {
      hasMintFunction: await this.checkMintFunction(address),
      hasPauseFunction: await this.checkPauseFunction(address),
      hasBlacklist: await this.checkBlacklist(address),
      hasFeeOnTransfer: await this.checkFeeOnTransfer(address),
      hasMaxTxLimit: await this.checkMaxTxLimit(address),
      hasMaxWalletLimit: await this.checkMaxWalletLimit(address),
      canRenounceOwnership: await this.checkRenounceOwnership(address),
      isProxy: await this.checkIsProxy(address),
      hasHiddenOwner: await this.checkHiddenOwner(address)
    }
  }

  private async checkFeeOnTransfer(address: string): Promise<FeeCheck> {
    try {
      // Simulate transfer and check amounts
      const testAmount = BigInt(1e18)

      const balanceBefore = await this.getBalance(address, this.testWallet)

      // Simulate transfer
      const transferResult = await this.simulateTransfer(
        address,
        this.testWallet,
        this.testRecipient,
        testAmount
      )

      if (!transferResult.success) {
        return { hasFee: false, error: transferResult.error }
      }

      const balanceAfter = await this.getBalance(address, this.testRecipient)
      const received = balanceAfter - balanceBefore

      const feePercent = Number(testAmount - received) / Number(testAmount)

      return {
        hasFee: feePercent > 0.001,
        feePercent,
        buyFee: await this.checkBuyFee(address),
        sellFee: await this.checkSellFee(address)
      }
    } catch {
      return { hasFee: false, error: "Could not determine" }
    }
  }

  private async analyzeOwnership(address: string): Promise<OwnershipInfo> {
    const owner = await this.getOwner(address)

    if (!owner || owner === "0x0000000000000000000000000000000000000000") {
      return { renounced: true, owner: null }
    }

    const ownerCode = await this.getContractCode(owner)
    const isMultisig = ownerCode.length > 0 && await this.checkIsMultisig(owner)

    return {
      renounced: false,
      owner,
      isMultisig,
      isEOA: ownerCode.length === 0,
      ownerBalance: await this.getBalance(address, owner),
      ownerPercent: await this.calculateOwnerPercent(address, owner)
    }
  }

  private calculateRiskScore(
    security: SecurityChecks,
    ownership: OwnershipInfo
  ): number {
    let risk = 0

    // Ownership risks
    if (!ownership.renounced) {
      risk += 10
      if (!ownership.isMultisig) risk += 10
      if (ownership.ownerPercent > 0.1) risk += 20
    }

    // Function risks
    if (security.hasMintFunction) risk += 20
    if (security.hasBlacklist) risk += 15
    if (security.hasFeeOnTransfer.hasFee) {
      const fee = security.hasFeeOnTransfer.feePercent || 0
      risk += Math.min(30, fee * 100)
    }
    if (security.hasMaxTxLimit) risk += 5
    if (security.isProxy) risk += 15
    if (security.hasHiddenOwner) risk += 25

    return Math.min(100, risk)
  }

  private generateFlags(
    security: SecurityChecks,
    ownership: OwnershipInfo
  ): SecurityFlag[] {
    const flags: SecurityFlag[] = []

    if (security.hasMintFunction && !ownership.renounced) {
      flags.push({
        severity: "high",
        type: "unlimited_mint",
        description: "Owner can mint unlimited tokens"
      })
    }

    if (security.hasBlacklist) {
      flags.push({
        severity: "medium",
        type: "blacklist",
        description: "Contract has blacklist functionality"
      })
    }

    if (security.hasFeeOnTransfer.hasFee) {
      const fee = security.hasFeeOnTransfer.feePercent || 0
      flags.push({
        severity: fee > 0.1 ? "high" : "medium",
        type: "transfer_fee",
        description: `${(fee * 100).toFixed(2)}% fee on transfers`
      })
    }

    if (security.isProxy) {
      flags.push({
        severity: "medium",
        type: "upgradeable",
        description: "Contract is upgradeable proxy"
      })
    }

    return flags
  }
}
```

### 2. Contract Function Analyzer

Analyze contract functions and access control:

```typescript
class ContractFunctionAnalyzer {
  async analyzeFunctions(contractAddress: string): Promise<FunctionAnalysis> {
    const abi = await this.getContractABI(contractAddress)

    if (!abi) {
      return { analyzed: false, reason: "ABI not available" }
    }

    const functions = abi.filter(item => item.type === "function")

    const analyzed = await Promise.all(
      functions.map(fn => this.analyzeFunction(contractAddress, fn))
    )

    return {
      analyzed: true,
      totalFunctions: functions.length,
      publicFunctions: analyzed.filter(f => f.visibility === "public").length,
      externalFunctions: analyzed.filter(f => f.visibility === "external").length,
      adminFunctions: analyzed.filter(f => f.isAdmin),
      dangerousFunctions: analyzed.filter(f => f.dangerLevel > 0.5),
      functions: analyzed
    }
  }

  private async analyzeFunction(
    address: string,
    fn: ABIFunction
  ): Promise<AnalyzedFunction> {
    const selector = this.getFunctionSelector(fn)

    return {
      name: fn.name,
      selector,
      inputs: fn.inputs,
      outputs: fn.outputs,
      visibility: fn.stateMutability === "view" || fn.stateMutability === "pure"
        ? "view"
        : "external",
      isAdmin: this.isAdminFunction(fn),
      isPayable: fn.stateMutability === "payable",
      dangerLevel: this.assessDangerLevel(fn),
      accessControl: await this.checkAccessControl(address, selector)
    }
  }

  private isAdminFunction(fn: ABIFunction): boolean {
    const adminPatterns = [
      "owner", "admin", "set", "update", "change", "modify",
      "pause", "unpause", "mint", "burn", "blacklist", "whitelist",
      "withdraw", "transfer_ownership", "renounce"
    ]

    return adminPatterns.some(p =>
      fn.name.toLowerCase().includes(p)
    )
  }

  private assessDangerLevel(fn: ABIFunction): number {
    let danger = 0

    const highRiskPatterns = ["selfdestruct", "delegatecall", "suicide"]
    const mediumRiskPatterns = ["mint", "burn", "transfer", "withdraw"]
    const lowRiskPatterns = ["pause", "set", "update"]

    const nameLower = fn.name.toLowerCase()

    if (highRiskPatterns.some(p => nameLower.includes(p))) danger += 0.8
    else if (mediumRiskPatterns.some(p => nameLower.includes(p))) danger += 0.5
    else if (lowRiskPatterns.some(p => nameLower.includes(p))) danger += 0.2

    if (fn.stateMutability === "payable") danger += 0.1

    return Math.min(1, danger)
  }

  async checkAccessControl(
    address: string,
    selector: string
  ): Promise<AccessControl> {
    // Try calling function without being owner
    try {
      const result = await this.simulateCall(address, selector, [], {
        from: this.randomAddress
      })

      return {
        restricted: !result.success,
        errorMessage: result.error
      }
    } catch (error) {
      return {
        restricted: true,
        errorMessage: error.message
      }
    }
  }
}
```

### 3. Liquidity Pool Analyzer

Analyze DEX liquidity pools:

```typescript
class LiquidityPoolAnalyzer {
  async analyzePool(poolAddress: string): Promise<PoolAnalysis> {
    const poolType = await this.identifyPoolType(poolAddress)

    const [
      reserves,
      tokenInfo,
      lpInfo,
      locks
    ] = await Promise.all([
      this.getReserves(poolAddress),
      this.getPoolTokens(poolAddress),
      this.getLPInfo(poolAddress),
      this.checkLiquidityLocks(poolAddress)
    ])

    return {
      address: poolAddress,
      type: poolType,
      token0: tokenInfo.token0,
      token1: tokenInfo.token1,
      reserves: {
        reserve0: reserves[0],
        reserve1: reserves[1],
        totalValueUSD: await this.calculateTVL(reserves, tokenInfo)
      },
      liquidity: {
        totalSupply: lpInfo.totalSupply,
        locked: locks.totalLocked,
        lockedPercent: Number(locks.totalLocked) / Number(lpInfo.totalSupply),
        locks: locks.details
      },
      safety: this.assessPoolSafety(reserves, locks, tokenInfo),
      priceImpact: await this.calculatePriceImpact(poolAddress, reserves)
    }
  }

  private async checkLiquidityLocks(poolAddress: string): Promise<LockInfo> {
    const lockContracts = [
      "0x663A5C229c09b049E36dCc11a9B0d4a8Eb9db214", // Unicrypt
      "0xDba68f07d1b7Ca219f78ae8582C213d975c25cAf", // Team Finance
      "0xC77aab3c6D7dAb46248F3CC3033C856171878BD5"  // PinkLock
    ]

    let totalLocked = 0n
    const details: LockDetail[] = []

    for (const lockContract of lockContracts) {
      const locked = await this.checkLockContract(lockContract, poolAddress)
      if (locked.amount > 0n) {
        totalLocked += locked.amount
        details.push(locked)
      }
    }

    // Check direct burns to dead address
    const burnedLP = await this.checkBurnedLP(poolAddress)
    if (burnedLP > 0n) {
      totalLocked += burnedLP
      details.push({
        amount: burnedLP,
        unlockDate: null,
        permanent: true,
        type: "burned"
      })
    }

    return { totalLocked, details }
  }

  private assessPoolSafety(
    reserves: [bigint, bigint],
    locks: LockInfo,
    tokenInfo: TokenPairInfo
  ): PoolSafety {
    let score = 50

    // Liquidity lock assessment
    const lockedPercent = Number(locks.totalLocked) /
      Number(reserves[0] + reserves[1])

    if (lockedPercent > 0.95) score += 30
    else if (lockedPercent > 0.8) score += 20
    else if (lockedPercent > 0.5) score += 10
    else score -= 20

    // Reserve balance assessment
    const ratio = Number(reserves[0]) / Number(reserves[1])
    if (ratio < 0.01 || ratio > 100) score -= 20

    // Token assessments
    if (tokenInfo.token0.verified) score += 5
    if (tokenInfo.token1.verified) score += 5

    return {
      score: Math.max(0, Math.min(100, score)),
      grade: score >= 80 ? "A" : score >= 60 ? "B" : score >= 40 ? "C" : "F",
      warnings: this.generatePoolWarnings(reserves, locks, tokenInfo)
    }
  }

  private generatePoolWarnings(
    reserves: [bigint, bigint],
    locks: LockInfo,
    tokenInfo: TokenPairInfo
  ): string[] {
    const warnings: string[] = []

    const lockedPercent = Number(locks.totalLocked) /
      Number(reserves[0] + reserves[1])

    if (lockedPercent < 0.5) {
      warnings.push("Less than 50% of liquidity is locked")
    }

    if (locks.details.some(l => !l.permanent && l.unlockDate &&
        l.unlockDate < Date.now() + 30 * 24 * 60 * 60 * 1000)) {
      warnings.push("Liquidity unlock within 30 days")
    }

    if (!tokenInfo.token0.verified || !tokenInfo.token1.verified) {
      warnings.push("One or more tokens are not verified")
    }

    return warnings
  }
}
```

## Best Practices

1. **Verify contract source code** before analysis
2. **Check for proxy patterns** that may hide functionality
3. **Simulate transactions** to verify behavior
4. **Monitor for contract upgrades**
5. **Cross-reference multiple data sources**

## Related Skills

- [Token Metrics Agent](./token-metrics-agent.md) - Token analysis
- [Compliance Monitoring](./compliance-monitoring-agent.md) - Risk assessment
- [Smart Contract Agent](./smart-contract-agent.md) - Contract interaction
