# Agent Payment Agent Skill

> **⚠️ Prerequisites**: Complete [SDK Setup](./00-sdk-setup.md) first to configure your environment.

Build agents that handle payments between agents for services and tasks.

## Overview

Agent Payment Agent enables automated micropayments, escrow services, and payment channels for agent-to-agent commerce. Essential for agent marketplaces, service fees, and decentralized task economies.

## SDK Reference

```typescript
import { Demos } from "@kynesyslabs/demosdk/websdk"
import { EVM } from "@kynesyslabs/demosdk/xm-websdk"
import { DemosWork, BaseOperation } from "@kynesyslabs/demoswork"

// Payment processing
const evm = await EVM.create("https://rpc.ankr.com/eth")
```

## Agent Use Cases

### 1. Micropayment Channel Manager

Manage payment channels for frequent small payments:

```typescript
class MicropaymentChannelManager {
  private demos: Demos
  private channels: Map<string, PaymentChannel> = new Map()
  private pendingPayments: Map<string, Payment[]> = new Map()

  async openChannel(
    counterparty: string,
    deposit: bigint,
    duration: number
  ): Promise<PaymentChannel> {
    const channelId = this.generateChannelId(counterparty)

    // Create on-chain channel
    const tx = await this.demos.nodeCall("createPaymentChannel", {
      counterparty,
      deposit,
      duration,
      channelId
    })

    const channel: PaymentChannel = {
      id: channelId,
      counterparty,
      deposit,
      balance: deposit,
      nonce: 0,
      expiresAt: Date.now() + duration,
      state: "open",
      createdAt: Date.now(),
      txHash: tx.hash
    }

    this.channels.set(channelId, channel)

    return channel
  }

  async sendPayment(
    channelId: string,
    amount: bigint,
    reference?: string
  ): Promise<PaymentVoucher> {
    const channel = this.channels.get(channelId)

    if (!channel) {
      throw new Error("Channel not found")
    }

    if (channel.state !== "open") {
      throw new Error("Channel not open")
    }

    if (amount > channel.balance) {
      throw new Error("Insufficient channel balance")
    }

    // Create payment voucher
    channel.nonce++
    channel.balance -= amount

    const voucher: PaymentVoucher = {
      channelId,
      amount,
      nonce: channel.nonce,
      cumulativeAmount: channel.deposit - channel.balance,
      reference,
      timestamp: Date.now()
    }

    // Sign voucher
    voucher.signature = await this.signVoucher(voucher)

    // Track pending payment
    if (!this.pendingPayments.has(channelId)) {
      this.pendingPayments.set(channelId, [])
    }
    this.pendingPayments.get(channelId)!.push({
      voucher,
      status: "pending"
    })

    return voucher
  }

  async receivePayment(voucher: PaymentVoucher): Promise<boolean> {
    // Verify signature
    if (!await this.verifyVoucher(voucher)) {
      throw new Error("Invalid voucher signature")
    }

    const channel = this.channels.get(voucher.channelId)

    if (!channel) {
      throw new Error("Channel not found")
    }

    // Verify nonce is newer
    if (voucher.nonce <= channel.nonce) {
      throw new Error("Stale voucher")
    }

    // Update channel state
    channel.nonce = voucher.nonce
    channel.balance = channel.deposit - voucher.cumulativeAmount

    return true
  }

  async closeChannel(channelId: string): Promise<CloseResult> {
    const channel = this.channels.get(channelId)

    if (!channel) {
      throw new Error("Channel not found")
    }

    // Get latest voucher
    const payments = this.pendingPayments.get(channelId) || []
    const latestVoucher = payments
      .map(p => p.voucher)
      .sort((a, b) => b.nonce - a.nonce)[0]

    // Submit close transaction
    const tx = await this.demos.nodeCall("closePaymentChannel", {
      channelId,
      finalNonce: latestVoucher?.nonce || 0,
      finalAmount: latestVoucher?.cumulativeAmount || 0n,
      signature: latestVoucher?.signature
    })

    channel.state = "closing"

    return {
      channelId,
      finalBalance: channel.balance,
      txHash: tx.hash,
      settlementTime: Date.now() + 3600000 // 1 hour dispute period
    }
  }

  async disputeChannel(
    channelId: string,
    voucher: PaymentVoucher
  ): Promise<DisputeResult> {
    // Submit newer voucher as dispute evidence
    const tx = await this.demos.nodeCall("disputePaymentChannel", {
      channelId,
      nonce: voucher.nonce,
      amount: voucher.cumulativeAmount,
      signature: voucher.signature
    })

    return {
      channelId,
      disputedNonce: voucher.nonce,
      txHash: tx.hash
    }
  }
}
```

### 2. Escrow Service

Manage escrow for agent transactions:

```typescript
class EscrowService {
  private demos: Demos
  private escrows: Map<string, Escrow> = new Map()
  private arbitrators: string[] = []

  async createEscrow(params: EscrowParams): Promise<Escrow> {
    const escrowId = this.generateEscrowId()

    const escrow: Escrow = {
      id: escrowId,
      buyer: params.buyer,
      seller: params.seller,
      amount: params.amount,
      conditions: params.conditions,
      arbitrator: this.selectArbitrator(),
      status: "created",
      createdAt: Date.now(),
      expiresAt: params.deadline || Date.now() + 86400000 // 24 hours default
    }

    // Lock funds on-chain
    const tx = await this.demos.nodeCall("createEscrow", {
      escrowId,
      seller: escrow.seller,
      amount: escrow.amount,
      arbitrator: escrow.arbitrator,
      deadline: escrow.expiresAt
    })

    escrow.txHash = tx.hash
    this.escrows.set(escrowId, escrow)

    return escrow
  }

  async fundEscrow(
    escrowId: string,
    txHash: string
  ): Promise<boolean> {
    const escrow = this.escrows.get(escrowId)

    if (!escrow) {
      throw new Error("Escrow not found")
    }

    // Verify funding transaction
    const verified = await this.verifyFundingTx(escrowId, txHash)

    if (verified) {
      escrow.status = "funded"
      escrow.fundedAt = Date.now()
      escrow.fundingTx = txHash
      return true
    }

    return false
  }

  async confirmDelivery(
    escrowId: string,
    deliveryProof?: DeliveryProof
  ): Promise<ReleaseResult> {
    const escrow = this.escrows.get(escrowId)

    if (!escrow || escrow.status !== "funded") {
      throw new Error("Invalid escrow state")
    }

    // Verify caller is buyer
    const caller = await this.demos.wallet.getAddress()
    if (caller !== escrow.buyer) {
      throw new Error("Only buyer can confirm delivery")
    }

    // Check conditions if specified
    if (escrow.conditions.length > 0) {
      const conditionsMet = await this.verifyConditions(
        escrow.conditions,
        deliveryProof
      )

      if (!conditionsMet) {
        throw new Error("Delivery conditions not met")
      }
    }

    // Release funds to seller
    const tx = await this.demos.nodeCall("releaseEscrow", {
      escrowId,
      releaseType: "buyer_confirmation"
    })

    escrow.status = "released"
    escrow.releasedAt = Date.now()
    escrow.releaseTx = tx.hash

    return {
      escrowId,
      recipient: escrow.seller,
      amount: escrow.amount,
      txHash: tx.hash
    }
  }

  async initiateDispute(
    escrowId: string,
    reason: string,
    evidence?: Evidence[]
  ): Promise<Dispute> {
    const escrow = this.escrows.get(escrowId)

    if (!escrow || escrow.status !== "funded") {
      throw new Error("Invalid escrow state")
    }

    const dispute: Dispute = {
      id: this.generateDisputeId(),
      escrowId,
      initiator: await this.demos.wallet.getAddress(),
      reason,
      evidence: evidence || [],
      status: "open",
      createdAt: Date.now()
    }

    escrow.status = "disputed"
    escrow.dispute = dispute

    // Notify arbitrator
    await this.notifyArbitrator(escrow.arbitrator, dispute)

    return dispute
  }

  async resolveDispute(
    escrowId: string,
    resolution: DisputeResolution
  ): Promise<ResolveResult> {
    const escrow = this.escrows.get(escrowId)

    if (!escrow || escrow.status !== "disputed") {
      throw new Error("Invalid escrow state")
    }

    // Verify caller is arbitrator
    const caller = await this.demos.wallet.getAddress()
    if (caller !== escrow.arbitrator) {
      throw new Error("Only arbitrator can resolve")
    }

    // Execute resolution
    const tx = await this.demos.nodeCall("resolveEscrow", {
      escrowId,
      buyerAmount: resolution.buyerAmount,
      sellerAmount: resolution.sellerAmount,
      arbitratorFee: resolution.arbitratorFee
    })

    escrow.status = "resolved"
    escrow.dispute!.resolution = resolution
    escrow.dispute!.status = "resolved"

    return {
      escrowId,
      resolution,
      txHash: tx.hash
    }
  }
}
```

### 3. Automated Payment Scheduler

Schedule recurring payments between agents:

```typescript
class PaymentScheduler {
  private demos: Demos
  private schedules: Map<string, PaymentSchedule> = new Map()
  private paymentHistory: Map<string, PaymentRecord[]> = new Map()

  async createSchedule(params: ScheduleParams): Promise<PaymentSchedule> {
    const scheduleId = this.generateScheduleId()

    const schedule: PaymentSchedule = {
      id: scheduleId,
      payer: await this.demos.wallet.getAddress(),
      payee: params.payee,
      amount: params.amount,
      frequency: params.frequency, // "hourly" | "daily" | "weekly" | "monthly"
      startDate: params.startDate || Date.now(),
      endDate: params.endDate,
      maxPayments: params.maxPayments,
      paymentsMade: 0,
      status: "active",
      conditions: params.conditions || []
    }

    schedule.nextPaymentDue = this.calculateNextPayment(schedule)

    // Verify sufficient balance
    const balance = await this.demos.getBalance(schedule.payer)
    const estimatedTotal = schedule.amount * BigInt(schedule.maxPayments || 12)

    if (balance < estimatedTotal) {
      throw new Error("Insufficient balance for scheduled payments")
    }

    this.schedules.set(scheduleId, schedule)

    // Start monitoring
    this.startScheduleMonitor(scheduleId)

    return schedule
  }

  private startScheduleMonitor(scheduleId: string): void {
    const checkInterval = setInterval(async () => {
      const schedule = this.schedules.get(scheduleId)

      if (!schedule || schedule.status !== "active") {
        clearInterval(checkInterval)
        return
      }

      if (Date.now() >= schedule.nextPaymentDue) {
        await this.executePayment(scheduleId)
      }
    }, 60000) // Check every minute
  }

  private async executePayment(scheduleId: string): Promise<void> {
    const schedule = this.schedules.get(scheduleId)

    if (!schedule) return

    // Check conditions
    if (schedule.conditions.length > 0) {
      const conditionsMet = await this.evaluateConditions(schedule.conditions)
      if (!conditionsMet) {
        this.logPaymentSkipped(scheduleId, "conditions_not_met")
        schedule.nextPaymentDue = this.calculateNextPayment(schedule)
        return
      }
    }

    try {
      // Execute payment
      const tx = await this.demos.nodeCall("transfer", {
        to: schedule.payee,
        amount: schedule.amount,
        memo: `Scheduled payment ${schedule.paymentsMade + 1} - ${scheduleId}`
      })

      // Record payment
      const record: PaymentRecord = {
        scheduleId,
        amount: schedule.amount,
        txHash: tx.hash,
        timestamp: Date.now(),
        status: "completed"
      }

      if (!this.paymentHistory.has(scheduleId)) {
        this.paymentHistory.set(scheduleId, [])
      }
      this.paymentHistory.get(scheduleId)!.push(record)

      schedule.paymentsMade++
      schedule.lastPayment = Date.now()
      schedule.nextPaymentDue = this.calculateNextPayment(schedule)

      // Check if schedule is complete
      if (schedule.maxPayments && schedule.paymentsMade >= schedule.maxPayments) {
        schedule.status = "completed"
      }

      if (schedule.endDate && Date.now() >= schedule.endDate) {
        schedule.status = "completed"
      }

    } catch (error) {
      // Log failure and retry later
      this.logPaymentFailed(scheduleId, (error as Error).message)

      // Pause after 3 consecutive failures
      const recentFailures = this.getRecentFailures(scheduleId)
      if (recentFailures >= 3) {
        schedule.status = "paused"
        await this.notifyPaymentFailure(schedule)
      }
    }
  }

  private calculateNextPayment(schedule: PaymentSchedule): number {
    const base = schedule.lastPayment || schedule.startDate

    switch (schedule.frequency) {
      case "hourly":
        return base + 3600000
      case "daily":
        return base + 86400000
      case "weekly":
        return base + 604800000
      case "monthly":
        return base + 2592000000
      default:
        return base + 86400000
    }
  }

  async pauseSchedule(scheduleId: string): Promise<boolean> {
    const schedule = this.schedules.get(scheduleId)
    if (schedule && schedule.status === "active") {
      schedule.status = "paused"
      return true
    }
    return false
  }

  async resumeSchedule(scheduleId: string): Promise<boolean> {
    const schedule = this.schedules.get(scheduleId)
    if (schedule && schedule.status === "paused") {
      schedule.status = "active"
      schedule.nextPaymentDue = this.calculateNextPayment(schedule)
      this.startScheduleMonitor(scheduleId)
      return true
    }
    return false
  }

  getPaymentHistory(scheduleId: string): PaymentRecord[] {
    return this.paymentHistory.get(scheduleId) || []
  }
}
```

## Best Practices

1. **Use payment channels** for frequent micropayments
2. **Implement escrow** for high-value transactions
3. **Set reasonable timeouts** for payment confirmations
4. **Include dispute resolution** mechanisms
5. **Monitor scheduled payments** for failures

## Related Skills

- [Escrow Agent](./escrow-agent.md) - Advanced escrow patterns
- [Agent Marketplace Agent](./agent-marketplace-agent.md) - Service commerce
- [Agent Reputation Agent](./agent-reputation-agent.md) - Payment history tracking
