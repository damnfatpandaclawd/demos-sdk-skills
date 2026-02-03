# Agent Marketplace Agent Skill

Build agents that facilitate buying and selling of agent services.

## Overview

Agent Marketplace Agent enables decentralized service listings, pricing, payments, and service delivery for AI agents. Essential for agent monetization and service discovery.

## SDK Reference

```typescript
import { Demos } from "@kynesyslabs/demosdk/websdk"
import { StorageProgram } from "@kynesyslabs/demosdk/storage"

// Marketplace data and payments
const storage = await demos.storage.getProgram()
```

## Agent Use Cases

### 1. Service Listing Manager

Manage agent service listings:

```typescript
class ServiceListingManager {
  private demos: Demos
  private storage: StorageProgram

  async createListing(listing: ServiceListing): Promise<ListingResult> {
    const listingId = this.generateListingId()

    const fullListing: StoredListing = {
      id: listingId,
      agentId: listing.agentId,
      seller: await this.demos.wallet.getAddress(),
      title: listing.title,
      description: listing.description,
      category: listing.category,
      capabilities: listing.capabilities,
      pricing: listing.pricing,
      availability: listing.availability,
      sla: listing.sla,
      status: "active",
      createdAt: Date.now(),
      stats: {
        totalOrders: 0,
        completedOrders: 0,
        totalRevenue: 0n,
        avgRating: 0
      }
    }

    // Store listing
    await this.storage.set(
      `listing:${listingId}`,
      JSON.stringify(fullListing)
    )

    // Index by category
    await this.addToIndex("category", listing.category, listingId)

    // Index by capability
    for (const cap of listing.capabilities) {
      await this.addToIndex("capability", cap, listingId)
    }

    return {
      success: true,
      listingId,
      listing: fullListing
    }
  }

  async searchListings(query: ListingQuery): Promise<ListingSearchResult> {
    let listingIds: string[] = []

    // Get by category or capability
    if (query.category) {
      listingIds = await this.getFromIndex("category", query.category)
    } else if (query.capability) {
      listingIds = await this.getFromIndex("capability", query.capability)
    } else {
      listingIds = await this.getAllActiveListingIds()
    }

    // Fetch listings
    let listings = await Promise.all(
      listingIds.map(id => this.getListing(id))
    )

    // Filter nulls and inactive
    listings = listings.filter(
      (l): l is StoredListing => l !== null && l.status === "active"
    )

    // Apply filters
    if (query.maxPrice) {
      listings = listings.filter(l =>
        l.pricing.basePrice <= query.maxPrice!
      )
    }

    if (query.minRating) {
      listings = listings.filter(l =>
        l.stats.avgRating >= query.minRating!
      )
    }

    if (query.searchTerm) {
      const term = query.searchTerm.toLowerCase()
      listings = listings.filter(l =>
        l.title.toLowerCase().includes(term) ||
        l.description.toLowerCase().includes(term)
      )
    }

    // Sort
    switch (query.sortBy) {
      case "price_asc":
        listings.sort((a, b) =>
          Number(a.pricing.basePrice - b.pricing.basePrice)
        )
        break
      case "price_desc":
        listings.sort((a, b) =>
          Number(b.pricing.basePrice - a.pricing.basePrice)
        )
        break
      case "rating":
        listings.sort((a, b) => b.stats.avgRating - a.stats.avgRating)
        break
      case "popularity":
        listings.sort((a, b) => b.stats.totalOrders - a.stats.totalOrders)
        break
    }

    // Paginate
    const start = query.offset || 0
    const limit = query.limit || 20
    const paginated = listings.slice(start, start + limit)

    return {
      listings: paginated,
      total: listings.length,
      offset: start,
      limit
    }
  }

  async updateListing(
    listingId: string,
    updates: Partial<ServiceListing>
  ): Promise<boolean> {
    const listing = await this.getListing(listingId)
    if (!listing) throw new Error("Listing not found")

    // Verify ownership
    const caller = await this.demos.wallet.getAddress()
    if (listing.seller !== caller) {
      throw new Error("Not authorized")
    }

    const updated = {
      ...listing,
      ...updates,
      updatedAt: Date.now()
    }

    await this.storage.set(
      `listing:${listingId}`,
      JSON.stringify(updated)
    )

    return true
  }
}
```

### 2. Order Manager

Handle service orders and payments:

```typescript
class OrderManager {
  private demos: Demos
  private escrowAgent: EscrowAgent

  async createOrder(
    listingId: string,
    params: OrderParams
  ): Promise<OrderResult> {
    const listing = await this.getListing(listingId)
    if (!listing || listing.status !== "active") {
      throw new Error("Listing not available")
    }

    // Calculate total price
    const totalPrice = this.calculatePrice(listing.pricing, params)

    // Check buyer balance
    const buyer = await this.demos.wallet.getAddress()
    const balance = await this.demos.getBalance(buyer)

    if (balance < totalPrice) {
      throw new Error("Insufficient balance")
    }

    // Create order
    const orderId = this.generateOrderId()
    const order: ServiceOrder = {
      id: orderId,
      listingId,
      buyer,
      seller: listing.seller,
      agentId: listing.agentId,
      params,
      price: totalPrice,
      status: "pending_payment",
      createdAt: Date.now()
    }

    // Create escrow
    const escrow = await this.escrowAgent.createEscrow({
      orderId,
      buyer,
      seller: listing.seller,
      amount: totalPrice,
      conditions: this.buildEscrowConditions(listing, params)
    })

    order.escrowId = escrow.id
    order.status = "pending_deposit"

    await this.storage.set(`order:${orderId}`, JSON.stringify(order))

    return {
      success: true,
      orderId,
      order,
      escrow,
      paymentInstructions: {
        escrowAddress: escrow.address,
        amount: totalPrice,
        deadline: Date.now() + 3600000 // 1 hour
      }
    }
  }

  async confirmPayment(orderId: string): Promise<boolean> {
    const order = await this.getOrder(orderId)
    if (!order || order.status !== "pending_deposit") {
      throw new Error("Invalid order state")
    }

    // Verify escrow deposit
    const escrowStatus = await this.escrowAgent.getEscrowStatus(order.escrowId)
    if (!escrowStatus.funded) {
      throw new Error("Escrow not funded")
    }

    // Update order status
    order.status = "in_progress"
    order.startedAt = Date.now()

    await this.storage.set(`order:${orderId}`, JSON.stringify(order))

    // Notify agent to start service
    await this.notifyAgent(order.agentId, {
      type: "order_started",
      orderId,
      params: order.params
    })

    return true
  }

  async completeOrder(
    orderId: string,
    result: ServiceResult
  ): Promise<boolean> {
    const order = await this.getOrder(orderId)
    if (!order || order.status !== "in_progress") {
      throw new Error("Invalid order state")
    }

    // Verify caller is the agent
    const caller = await this.demos.wallet.getAddress()
    if (caller !== order.seller) {
      throw new Error("Not authorized")
    }

    // Store result
    order.result = result
    order.status = "pending_confirmation"
    order.completedAt = Date.now()

    await this.storage.set(`order:${orderId}`, JSON.stringify(order))

    // Notify buyer for confirmation
    await this.notifyBuyer(order.buyer, {
      type: "order_completed",
      orderId,
      result
    })

    return true
  }

  async confirmDelivery(orderId: string): Promise<boolean> {
    const order = await this.getOrder(orderId)
    if (!order || order.status !== "pending_confirmation") {
      throw new Error("Invalid order state")
    }

    // Verify caller is buyer
    const caller = await this.demos.wallet.getAddress()
    if (caller !== order.buyer) {
      throw new Error("Not authorized")
    }

    // Release escrow to seller
    await this.escrowAgent.releaseEscrow(order.escrowId)

    order.status = "completed"
    order.confirmedAt = Date.now()

    await this.storage.set(`order:${orderId}`, JSON.stringify(order))

    // Update listing stats
    await this.updateListingStats(order.listingId, {
      orderCompleted: true,
      revenue: order.price
    })

    return true
  }

  async disputeOrder(
    orderId: string,
    reason: string
  ): Promise<DisputeResult> {
    const order = await this.getOrder(orderId)
    if (!order || !["in_progress", "pending_confirmation"].includes(order.status)) {
      throw new Error("Cannot dispute this order")
    }

    const caller = await this.demos.wallet.getAddress()
    if (caller !== order.buyer && caller !== order.seller) {
      throw new Error("Not authorized")
    }

    // Create dispute
    const dispute: OrderDispute = {
      id: this.generateDisputeId(),
      orderId,
      initiator: caller,
      reason,
      status: "open",
      createdAt: Date.now()
    }

    order.status = "disputed"
    order.disputeId = dispute.id

    await this.storage.set(`order:${orderId}`, JSON.stringify(order))
    await this.storage.set(`dispute:${dispute.id}`, JSON.stringify(dispute))

    return { dispute, order }
  }
}
```

### 3. Dynamic Pricing Engine

Implement dynamic pricing for services:

```typescript
class DynamicPricingEngine {
  private basePrices: Map<string, bigint> = new Map()
  private demandHistory: Map<string, DemandPoint[]> = new Map()

  async calculateDynamicPrice(
    listingId: string,
    params: PricingParams
  ): Promise<DynamicPrice> {
    const listing = await this.getListing(listingId)
    const basePrice = listing.pricing.basePrice

    let multiplier = 1.0

    // Demand-based adjustment
    const demandMultiplier = await this.calculateDemandMultiplier(listingId)
    multiplier *= demandMultiplier

    // Time-based adjustment
    const timeMultiplier = this.calculateTimeMultiplier(params.urgency)
    multiplier *= timeMultiplier

    // Quantity discount
    if (params.quantity && params.quantity > 1) {
      const quantityMultiplier = this.calculateQuantityDiscount(
        listing.pricing,
        params.quantity
      )
      multiplier *= quantityMultiplier
    }

    // Loyalty discount
    if (params.buyerAddress) {
      const loyaltyMultiplier = await this.calculateLoyaltyDiscount(
        listingId,
        params.buyerAddress
      )
      multiplier *= loyaltyMultiplier
    }

    const finalPrice = BigInt(Math.floor(Number(basePrice) * multiplier))

    return {
      basePrice,
      finalPrice,
      multiplier,
      breakdown: {
        demandAdjustment: demandMultiplier,
        urgencyAdjustment: timeMultiplier,
        quantityDiscount: params.quantity ? this.calculateQuantityDiscount(
          listing.pricing, params.quantity
        ) : 1,
        loyaltyDiscount: params.buyerAddress
          ? await this.calculateLoyaltyDiscount(listingId, params.buyerAddress)
          : 1
      },
      validUntil: Date.now() + 300000 // 5 minutes
    }
  }

  private async calculateDemandMultiplier(listingId: string): Promise<number> {
    const history = this.demandHistory.get(listingId) || []

    if (history.length < 10) return 1.0

    // Calculate recent demand
    const recentWindow = 3600000 // 1 hour
    const recentDemand = history.filter(
      p => p.timestamp > Date.now() - recentWindow
    ).length

    // Calculate average demand
    const avgDemand = history.length / (
      (Date.now() - history[0].timestamp) / recentWindow
    )

    const demandRatio = recentDemand / avgDemand

    // Cap multiplier between 0.8 and 2.0
    return Math.min(2.0, Math.max(0.8, demandRatio))
  }

  private calculateTimeMultiplier(urgency?: "low" | "normal" | "high"): number {
    switch (urgency) {
      case "low":
        return 0.9 // 10% discount for low urgency
      case "high":
        return 1.5 // 50% premium for high urgency
      default:
        return 1.0
    }
  }

  private calculateQuantityDiscount(
    pricing: ListingPricing,
    quantity: number
  ): number {
    const tiers = pricing.quantityDiscounts || [
      { minQuantity: 5, discount: 0.05 },
      { minQuantity: 10, discount: 0.1 },
      { minQuantity: 50, discount: 0.2 }
    ]

    let discount = 0
    for (const tier of tiers.sort((a, b) => b.minQuantity - a.minQuantity)) {
      if (quantity >= tier.minQuantity) {
        discount = tier.discount
        break
      }
    }

    return 1 - discount
  }

  private async calculateLoyaltyDiscount(
    listingId: string,
    buyer: string
  ): Promise<number> {
    const orders = await this.getBuyerOrders(listingId, buyer)
    const completedOrders = orders.filter(o => o.status === "completed")

    if (completedOrders.length >= 10) return 0.85 // 15% discount
    if (completedOrders.length >= 5) return 0.9  // 10% discount
    if (completedOrders.length >= 2) return 0.95 // 5% discount

    return 1.0
  }

  recordDemand(listingId: string): void {
    if (!this.demandHistory.has(listingId)) {
      this.demandHistory.set(listingId, [])
    }

    this.demandHistory.get(listingId)!.push({
      timestamp: Date.now()
    })

    // Keep last 24 hours
    const cutoff = Date.now() - 24 * 60 * 60 * 1000
    const history = this.demandHistory.get(listingId)!
    while (history.length > 0 && history[0].timestamp < cutoff) {
      history.shift()
    }
  }
}
```

## Best Practices

1. **Use escrow** for payment protection
2. **Implement clear SLAs** in listings
3. **Allow dispute resolution** mechanisms
4. **Track service metrics** for quality
5. **Support dynamic pricing** for market efficiency

## Related Skills

- [Agent Registry Agent](./agent-registry-agent.md) - Agent discovery
- [Escrow Agent](./escrow-agent.md) - Payment protection
- [Agent Reputation Agent](./agent-reputation-agent.md) - Trust scoring
