# Risk Assessment Agent Skill

> **⚠️ Prerequisites**: Complete [SDK Setup](./00-sdk-setup.md) first to configure your environment.

Build agents that evaluate and score risks across DeFi protocols and tokens.

## Overview

Risk Assessment Agent enables comprehensive risk scoring, vulnerability detection, and portfolio risk management. Essential for investment decisions, protocol selection, and risk-adjusted trading.

## SDK Reference

```typescript
import { Demos } from "@kynesyslabs/demosdk/websdk"
import { EVM } from "@kynesyslabs/demosdk/xm-websdk"

// Risk data collection
const protocolInfo = await this.fetchProtocolData(address)
```

## Agent Use Cases

### 1. Protocol Risk Assessor

Evaluate DeFi protocol risks:

```typescript
class ProtocolRiskAssessor {
  async assessProtocol(protocolAddress: string): Promise<ProtocolRiskAssessment> {
    const [
      smartContractRisk,
      liquidityRisk,
      oracleRisk,
      governanceRisk,
      economicRisk
    ] = await Promise.all([
      this.assessSmartContractRisk(protocolAddress),
      this.assessLiquidityRisk(protocolAddress),
      this.assessOracleRisk(protocolAddress),
      this.assessGovernanceRisk(protocolAddress),
      this.assessEconomicRisk(protocolAddress)
    ])

    const weights = {
      smartContract: 0.30,
      liquidity: 0.20,
      oracle: 0.15,
      governance: 0.15,
      economic: 0.20
    }

    const overallScore =
      smartContractRisk.score * weights.smartContract +
      liquidityRisk.score * weights.liquidity +
      oracleRisk.score * weights.oracle +
      governanceRisk.score * weights.governance +
      economicRisk.score * weights.economic

    return {
      protocol: protocolAddress,
      overallScore,
      grade: this.scoreToGrade(overallScore),
      components: {
        smartContract: smartContractRisk,
        liquidity: liquidityRisk,
        oracle: oracleRisk,
        governance: governanceRisk,
        economic: economicRisk
      },
      recommendations: this.generateRecommendations(overallScore, {
        smartContractRisk,
        liquidityRisk,
        oracleRisk,
        governanceRisk,
        economicRisk
      })
    }
  }

  private async assessSmartContractRisk(address: string): Promise<RiskComponent> {
    const factors: RiskFactor[] = []

    // Check audit status
    const audits = await this.getAuditInfo(address)
    factors.push({
      name: "Audit Coverage",
      score: audits.length > 0 ? Math.min(100, audits.length * 25) : 0,
      weight: 0.3,
      details: `${audits.length} audits found`
    })

    // Check code verification
    const verified = await this.checkVerification(address)
    factors.push({
      name: "Code Verification",
      score: verified ? 100 : 0,
      weight: 0.2,
      details: verified ? "Source code verified" : "Unverified"
    })

    // Check for known vulnerabilities
    const vulns = await this.checkVulnerabilities(address)
    factors.push({
      name: "Known Vulnerabilities",
      score: Math.max(0, 100 - vulns.length * 25),
      weight: 0.3,
      details: `${vulns.length} vulnerabilities found`
    })

    // Check upgrade pattern
    const isUpgradeable = await this.checkUpgradeable(address)
    factors.push({
      name: "Upgrade Risk",
      score: isUpgradeable ? 50 : 100,
      weight: 0.2,
      details: isUpgradeable ? "Upgradeable contract" : "Immutable"
    })

    const totalScore = factors.reduce(
      (sum, f) => sum + f.score * f.weight, 0
    )

    return {
      score: totalScore,
      factors,
      level: this.scoreToLevel(totalScore)
    }
  }

  private async assessLiquidityRisk(address: string): Promise<RiskComponent> {
    const factors: RiskFactor[] = []

    // TVL stability
    const tvlHistory = await this.getTVLHistory(address, 30)
    const tvlVolatility = this.calculateVolatility(tvlHistory)
    factors.push({
      name: "TVL Stability",
      score: Math.max(0, 100 - tvlVolatility * 200),
      weight: 0.3,
      details: `${(tvlVolatility * 100).toFixed(1)}% volatility`
    })

    // Liquidity depth
    const liquidityDepth = await this.getLiquidityDepth(address)
    factors.push({
      name: "Liquidity Depth",
      score: Math.min(100, liquidityDepth.score),
      weight: 0.3,
      details: `$${(liquidityDepth.depth / 1e6).toFixed(1)}M depth`
    })

    // Concentration risk
    const concentration = await this.getLiquidityConcentration(address)
    factors.push({
      name: "Concentration",
      score: Math.max(0, 100 - concentration.top10Percent),
      weight: 0.4,
      details: `Top 10 hold ${concentration.top10Percent.toFixed(1)}%`
    })

    const totalScore = factors.reduce(
      (sum, f) => sum + f.score * f.weight, 0
    )

    return { score: totalScore, factors, level: this.scoreToLevel(totalScore) }
  }

  private async assessOracleRisk(address: string): Promise<RiskComponent> {
    const factors: RiskFactor[] = []

    // Oracle type
    const oracleInfo = await this.getOracleInfo(address)
    const oracleTypeScore = {
      "chainlink": 90,
      "uniswap_twap": 70,
      "custom": 40,
      "centralized": 20,
      "none": 100 // No oracle needed
    }[oracleInfo.type] || 50

    factors.push({
      name: "Oracle Type",
      score: oracleTypeScore,
      weight: 0.4,
      details: `Using ${oracleInfo.type}`
    })

    // Update frequency
    if (oracleInfo.type !== "none") {
      factors.push({
        name: "Update Frequency",
        score: Math.min(100, oracleInfo.updateFrequency / 60 * 100),
        weight: 0.3,
        details: `Updates every ${oracleInfo.updateFrequency}s`
      })

      // Deviation threshold
      factors.push({
        name: "Deviation Threshold",
        score: Math.min(100, (1 - oracleInfo.deviationThreshold) * 100),
        weight: 0.3,
        details: `${(oracleInfo.deviationThreshold * 100).toFixed(1)}% threshold`
      })
    }

    const totalScore = factors.reduce(
      (sum, f) => sum + f.score * f.weight, 0
    )

    return { score: totalScore, factors, level: this.scoreToLevel(totalScore) }
  }

  private scoreToGrade(score: number): string {
    if (score >= 90) return "A+"
    if (score >= 80) return "A"
    if (score >= 70) return "B"
    if (score >= 60) return "C"
    if (score >= 50) return "D"
    return "F"
  }
}
```

### 2. Portfolio Risk Manager

Manage portfolio-level risks:

```typescript
class PortfolioRiskManager {
  async assessPortfolioRisk(
    holdings: PortfolioHolding[]
  ): Promise<PortfolioRiskAssessment> {
    // Assess individual holdings
    const holdingRisks = await Promise.all(
      holdings.map(h => this.assessHoldingRisk(h))
    )

    // Calculate portfolio metrics
    const concentrationRisk = this.calculateConcentrationRisk(holdings)
    const correlationRisk = await this.calculateCorrelationRisk(holdings)
    const liquidityRisk = this.calculatePortfolioLiquidityRisk(holdings, holdingRisks)

    // Value at Risk calculation
    const var95 = await this.calculateVaR(holdings, 0.95)
    const var99 = await this.calculateVaR(holdings, 0.99)

    return {
      totalValue: holdings.reduce((sum, h) => sum + h.value, 0n),
      holdingRisks,
      portfolioMetrics: {
        concentration: concentrationRisk,
        correlation: correlationRisk,
        liquidity: liquidityRisk
      },
      valueAtRisk: {
        var95,
        var99,
        expectedShortfall: await this.calculateExpectedShortfall(holdings)
      },
      recommendations: this.generatePortfolioRecommendations({
        holdings,
        holdingRisks,
        concentrationRisk,
        correlationRisk,
        liquidityRisk
      })
    }
  }

  private calculateConcentrationRisk(
    holdings: PortfolioHolding[]
  ): ConcentrationRisk {
    const totalValue = holdings.reduce((sum, h) => sum + Number(h.value), 0)
    const sorted = [...holdings].sort((a, b) => Number(b.value - a.value))

    const herfindahlIndex = holdings.reduce((sum, h) => {
      const share = Number(h.value) / totalValue
      return sum + share * share
    }, 0)

    return {
      herfindahlIndex,
      topHoldingPercent: Number(sorted[0]?.value || 0n) / totalValue,
      top3HoldingsPercent: sorted.slice(0, 3)
        .reduce((sum, h) => sum + Number(h.value), 0) / totalValue,
      effectiveHoldings: 1 / herfindahlIndex,
      level: herfindahlIndex > 0.25 ? "high" :
             herfindahlIndex > 0.15 ? "medium" : "low"
    }
  }

  private async calculateVaR(
    holdings: PortfolioHolding[],
    confidenceLevel: number
  ): Promise<bigint> {
    // Historical simulation VaR
    const portfolioReturns = await this.calculateHistoricalReturns(holdings, 252)

    if (portfolioReturns.length < 30) {
      throw new Error("Insufficient history for VaR calculation")
    }

    // Sort returns
    const sortedReturns = [...portfolioReturns].sort((a, b) => a - b)

    // Find percentile
    const index = Math.floor((1 - confidenceLevel) * sortedReturns.length)
    const varReturn = sortedReturns[index]

    // Convert to value
    const totalValue = holdings.reduce((sum, h) => sum + h.value, 0n)
    return BigInt(Math.floor(Number(totalValue) * Math.abs(varReturn)))
  }

  private generatePortfolioRecommendations(params: {
    holdings: PortfolioHolding[]
    holdingRisks: HoldingRisk[]
    concentrationRisk: ConcentrationRisk
    correlationRisk: CorrelationRisk
    liquidityRisk: LiquidityRisk
  }): PortfolioRecommendation[] {
    const recommendations: PortfolioRecommendation[] = []

    // Concentration recommendations
    if (params.concentrationRisk.level === "high") {
      recommendations.push({
        type: "diversification",
        priority: "high",
        action: "Reduce concentration in top holdings",
        details: `Top holding represents ${(params.concentrationRisk.topHoldingPercent * 100).toFixed(1)}% of portfolio`
      })
    }

    // High-risk holding recommendations
    const highRiskHoldings = params.holdingRisks.filter(h => h.score < 50)
    for (const holding of highRiskHoldings) {
      recommendations.push({
        type: "risk_reduction",
        priority: "medium",
        action: `Review position in ${holding.symbol}`,
        details: `Risk score: ${holding.score.toFixed(0)}/100`
      })
    }

    // Liquidity recommendations
    if (params.liquidityRisk.level === "high") {
      recommendations.push({
        type: "liquidity",
        priority: "high",
        action: "Increase liquid positions",
        details: "Portfolio has high illiquidity risk"
      })
    }

    return recommendations
  }
}
```

### 3. Real-Time Risk Monitor

Monitor risks in real-time:

```typescript
class RealTimeRiskMonitor {
  private alerts: RiskAlert[] = []
  private thresholds: RiskThresholds

  async startMonitoring(portfolio: PortfolioHolding[]): Promise<void> {
    // Monitor each holding
    for (const holding of portfolio) {
      this.monitorHolding(holding)
    }

    // Monitor portfolio-level metrics
    this.monitorPortfolioMetrics(portfolio)
  }

  private async monitorHolding(holding: PortfolioHolding): Promise<void> {
    // Price monitoring
    await this.demos.subscribeToAddress(holding.address, async event => {
      if (event.type === "price_update") {
        await this.checkPriceRisk(holding, event.price)
      }
    })

    // Liquidity monitoring
    setInterval(async () => {
      const liquidity = await this.getLiquidity(holding.address)
      await this.checkLiquidityRisk(holding, liquidity)
    }, 60000) // Every minute
  }

  private async checkPriceRisk(
    holding: PortfolioHolding,
    currentPrice: number
  ): Promise<void> {
    const priceChange = (currentPrice - holding.entryPrice) / holding.entryPrice

    // Check for significant drops
    if (priceChange < -this.thresholds.priceDropAlert) {
      this.emitAlert({
        type: "price_drop",
        severity: priceChange < -this.thresholds.priceDropCritical ? "critical" : "warning",
        holding: holding.symbol,
        message: `Price dropped ${(priceChange * 100).toFixed(1)}%`,
        value: priceChange,
        timestamp: Date.now()
      })
    }

    // Check for volatility spike
    const volatility = await this.calculateRecentVolatility(holding.address)
    if (volatility > this.thresholds.volatilitySpike) {
      this.emitAlert({
        type: "volatility_spike",
        severity: "warning",
        holding: holding.symbol,
        message: `Volatility spiked to ${(volatility * 100).toFixed(1)}%`,
        value: volatility,
        timestamp: Date.now()
      })
    }
  }

  private async checkLiquidityRisk(
    holding: PortfolioHolding,
    liquidity: LiquidityInfo
  ): Promise<void> {
    const positionToLiquidity = Number(holding.value) / liquidity.totalUSD

    // Check if position is too large relative to liquidity
    if (positionToLiquidity > this.thresholds.liquidityWarning) {
      this.emitAlert({
        type: "liquidity_risk",
        severity: positionToLiquidity > this.thresholds.liquidityCritical
          ? "critical" : "warning",
        holding: holding.symbol,
        message: `Position is ${(positionToLiquidity * 100).toFixed(1)}% of available liquidity`,
        value: positionToLiquidity,
        timestamp: Date.now()
      })
    }
  }

  getActiveAlerts(severity?: AlertSeverity): RiskAlert[] {
    let alerts = this.alerts.filter(a =>
      Date.now() - a.timestamp < 24 * 60 * 60 * 1000
    )

    if (severity) {
      alerts = alerts.filter(a => a.severity === severity)
    }

    return alerts.sort((a, b) => b.timestamp - a.timestamp)
  }
}
```

## Best Practices

1. **Use multiple risk factors** for comprehensive assessment
2. **Weight factors appropriately** for your use case
3. **Monitor risks in real-time** for active positions
4. **Set appropriate thresholds** for alerts
5. **Regularly recalibrate** risk models

## Related Skills

- [Contract Analyzer](./contract-analyzer-agent.md) - Contract security
- [Token Metrics Agent](./token-metrics-agent.md) - Token analysis
- [Compliance Monitoring](./compliance-monitoring-agent.md) - Compliance
