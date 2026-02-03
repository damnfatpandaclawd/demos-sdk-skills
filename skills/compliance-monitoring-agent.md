# Compliance Monitoring Agent Skill

Build agents that monitor transactions for regulatory compliance and AML/KYC requirements.

## Overview

Compliance Monitoring enables agents to screen transactions, detect suspicious patterns, and maintain audit trails for regulatory requirements. Essential for exchanges, custody services, and regulated DeFi protocols.

## SDK Reference

```typescript
import { Demos } from "@kynesyslabs/demosdk/websdk"

// Compliance Methods
demos.screenAddress(address)               // Check address risk
demos.getTransactionRisk(txHash)           // Assess transaction risk
demos.flagTransaction(txHash, reason)      // Flag suspicious tx
demos.getComplianceReport(address, period) // Generate report
```

## Agent Use Cases

### 1. Transaction Screening Agent

Screen transactions in real-time:

```typescript
class TransactionScreeningAgent {
  private demos: Demos
  private riskThreshold: number = 0.7
  private flaggedAddresses: Set<string> = new Set()

  async screenTransaction(
    from: string,
    to: string,
    amount: bigint
  ): Promise<ScreeningResult> {
    // Check both addresses
    const [fromRisk, toRisk] = await Promise.all([
      this.demos.screenAddress(from),
      this.demos.screenAddress(to)
    ])

    const issues: ComplianceIssue[] = []

    // Check for sanctioned addresses
    if (fromRisk.sanctioned || toRisk.sanctioned) {
      issues.push({
        type: "SANCTIONED_ADDRESS",
        severity: "critical",
        address: fromRisk.sanctioned ? from : to
      })
    }

    // Check for high-risk addresses
    if (fromRisk.riskScore > this.riskThreshold) {
      issues.push({
        type: "HIGH_RISK_SENDER",
        severity: "high",
        details: fromRisk.riskFactors
      })
    }

    if (toRisk.riskScore > this.riskThreshold) {
      issues.push({
        type: "HIGH_RISK_RECIPIENT",
        severity: "high",
        details: toRisk.riskFactors
      })
    }

    // Check amount thresholds
    if (amount > 10000n * 10n ** 18n) { // 10,000 tokens
      issues.push({
        type: "LARGE_TRANSACTION",
        severity: "medium",
        amount: amount.toString()
      })
    }

    return {
      approved: issues.filter(i => i.severity === "critical").length === 0,
      issues,
      riskScore: Math.max(fromRisk.riskScore, toRisk.riskScore),
      timestamp: Date.now()
    }
  }

  async monitorAddressActivity(
    address: string,
    callback: (alert: ComplianceAlert) => void
  ): Promise<void> {
    await this.demos.subscribeToAddress(address, async (event) => {
      const screening = await this.screenTransaction(
        event.from,
        event.to,
        BigInt(event.amount)
      )

      if (!screening.approved || screening.issues.length > 0) {
        callback({
          address,
          event,
          screening,
          timestamp: Date.now()
        })
      }
    })
  }
}
```

### 2. Pattern Detection Agent

Detect suspicious transaction patterns:

```typescript
class PatternDetectionAgent {
  private demos: Demos

  async analyzeTransactionPatterns(
    address: string,
    days: number = 30
  ): Promise<PatternAnalysis> {
    const history = await this.demos.getTransactionHistory(address, {
      since: Date.now() - days * 24 * 60 * 60 * 1000
    })

    const patterns: SuspiciousPattern[] = []

    // Check for structuring (splitting transactions to avoid thresholds)
    const structuring = this.detectStructuring(history)
    if (structuring.detected) {
      patterns.push({
        type: "STRUCTURING",
        confidence: structuring.confidence,
        transactions: structuring.relatedTxs
      })
    }

    // Check for rapid movement (layering)
    const layering = this.detectLayering(history)
    if (layering.detected) {
      patterns.push({
        type: "LAYERING",
        confidence: layering.confidence,
        transactions: layering.relatedTxs
      })
    }

    // Check for round-trip transactions
    const roundTrip = this.detectRoundTrip(history)
    if (roundTrip.detected) {
      patterns.push({
        type: "ROUND_TRIP",
        confidence: roundTrip.confidence,
        transactions: roundTrip.relatedTxs
      })
    }

    // Check for unusual timing patterns
    const timing = this.analyzeTimingPatterns(history)
    if (timing.suspicious) {
      patterns.push({
        type: "UNUSUAL_TIMING",
        confidence: timing.confidence,
        details: timing.analysis
      })
    }

    return {
      address,
      period: days,
      totalTransactions: history.length,
      suspiciousPatterns: patterns,
      overallRisk: this.calculateOverallRisk(patterns)
    }
  }

  private detectStructuring(transactions: Transaction[]): PatternResult {
    // Look for multiple transactions just under reporting thresholds
    const threshold = 10000n * 10n ** 18n
    const nearThreshold = transactions.filter(
      tx => BigInt(tx.amount) > threshold * 9n / 10n &&
            BigInt(tx.amount) < threshold
    )

    const detected = nearThreshold.length >= 3
    return {
      detected,
      confidence: detected ? nearThreshold.length / 10 : 0,
      relatedTxs: nearThreshold.map(tx => tx.hash)
    }
  }

  private detectLayering(transactions: Transaction[]): PatternResult {
    // Look for rapid sequential transactions through multiple addresses
    const sortedTxs = transactions.sort((a, b) => a.timestamp - b.timestamp)
    const rapidSequences: Transaction[][] = []
    let currentSequence: Transaction[] = []

    for (let i = 1; i < sortedTxs.length; i++) {
      const timeDiff = sortedTxs[i].timestamp - sortedTxs[i-1].timestamp

      if (timeDiff < 300000) { // 5 minutes
        if (currentSequence.length === 0) {
          currentSequence.push(sortedTxs[i-1])
        }
        currentSequence.push(sortedTxs[i])
      } else if (currentSequence.length > 0) {
        rapidSequences.push(currentSequence)
        currentSequence = []
      }
    }

    const detected = rapidSequences.some(seq => seq.length >= 5)
    return {
      detected,
      confidence: detected ? 0.8 : 0,
      relatedTxs: rapidSequences.flat().map(tx => tx.hash)
    }
  }
}
```

### 3. Reporting Agent

Generate compliance reports:

```typescript
class ComplianceReportingAgent {
  private demos: Demos

  async generateSAR(
    address: string,
    suspiciousActivity: SuspiciousActivity
  ): Promise<SuspiciousActivityReport> {
    const addressInfo = await this.demos.getAddressInfo(address)
    const history = await this.demos.getTransactionHistory(address)

    const sar: SuspiciousActivityReport = {
      reportId: this.generateReportId(),
      subjectAddress: address,
      reportDate: new Date().toISOString(),
      activityType: suspiciousActivity.type,
      narrative: this.generateNarrative(suspiciousActivity),
      transactionsSummary: {
        total: history.length,
        totalValue: history.reduce((sum, tx) => sum + BigInt(tx.amount), 0n),
        dateRange: {
          from: new Date(Math.min(...history.map(tx => tx.timestamp))).toISOString(),
          to: new Date(Math.max(...history.map(tx => tx.timestamp))).toISOString()
        }
      },
      relatedTransactions: suspiciousActivity.transactions.map(txHash => ({
        hash: txHash,
        details: history.find(tx => tx.hash === txHash)
      })),
      riskAssessment: suspiciousActivity.riskScore,
      recommendedAction: this.getRecommendedAction(suspiciousActivity.riskScore)
    }

    // Store report
    await this.storeReport(sar)

    return sar
  }

  async generatePeriodicReport(
    addresses: string[],
    period: ReportPeriod
  ): Promise<PeriodicComplianceReport> {
    const report: PeriodicComplianceReport = {
      reportId: this.generateReportId(),
      period,
      generatedAt: new Date().toISOString(),
      summary: {
        totalAddresses: addresses.length,
        totalTransactions: 0,
        totalVolume: 0n,
        highRiskTransactions: 0,
        flaggedAddresses: 0
      },
      addressDetails: []
    }

    for (const address of addresses) {
      const analysis = await this.analyzeAddress(address, period)
      report.addressDetails.push(analysis)

      report.summary.totalTransactions += analysis.transactionCount
      report.summary.totalVolume += analysis.totalVolume
      report.summary.highRiskTransactions += analysis.highRiskCount

      if (analysis.flagged) {
        report.summary.flaggedAddresses++
      }
    }

    return report
  }

  private getRecommendedAction(riskScore: number): string {
    if (riskScore >= 0.9) return "IMMEDIATE_REVIEW_REQUIRED"
    if (riskScore >= 0.7) return "ENHANCED_MONITORING"
    if (riskScore >= 0.5) return "STANDARD_REVIEW"
    return "NO_ACTION_REQUIRED"
  }
}
```

## Best Practices

1. **Screen all transactions** before processing
2. **Maintain audit trails** for all decisions
3. **Update risk models** regularly
4. **Handle false positives** carefully
5. **Stay updated** on regulatory requirements

## Related Skills

- [Address Monitoring](./address-monitoring-agent.md) - Transaction tracking
- [TLSNotary Attestation](./tlsnotary-attestation-agent.md) - External data verification
