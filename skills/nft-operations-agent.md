# NFT Operations Agent Skill

Build NFT management agents for minting, trading, and portfolio management across EVM and Solana chains using Demos Network.

## Overview

NFT Operations enable agents to mint, transfer, list, buy, and manage NFT collections across multiple chains - essential for NFT marketplaces, automated trading, and collection management.

## SDK Reference

```typescript
import { EVM, Solana } from "@kynesyslabs/demosdk/xm-websdk"

// EVM NFT Operations
const evm = await EVM.create(rpcUrl)
await evm.prepareNFTTransfer(contractAddress, tokenId, recipient)
await evm.prepareNFTMint(contractAddress, tokenURI, recipient)
await evm.prepareNFTApprove(contractAddress, tokenId, operator)
await evm.prepareNFTSetApprovalForAll(contractAddress, operator, approved)

// Solana NFT Operations (Metaplex)
const sol = await Solana.create(rpcUrl)
await sol.prepareNFTMint(metadata, collectionMint)
await sol.prepareNFTTransfer(mint, recipient)
```

## Supported Standards

| Chain | Standard | Description |
|-------|----------|-------------|
| EVM | ERC-721 | Standard NFTs |
| EVM | ERC-1155 | Multi-token standard |
| Solana | Metaplex | Solana NFT standard |
| Solana | Compressed NFTs | State-compressed NFTs |

## Agent Use Cases

### 1. NFT Minting Agent

Automated minting with metadata management:

```typescript
class NFTMintingAgent {
  private demos: Demos
  private ipfs: IPFSOperations

  async mintNFT(
    collection: CollectionConfig,
    metadata: NFTMetadata,
    recipient: string
  ): Promise<MintResult> {
    // Upload metadata to IPFS
    const metadataUri = await this.uploadMetadata(metadata)

    // Prepare mint transaction based on chain
    let mintPayload
    if (collection.chain === "solana") {
      const sol = await Solana.create(collection.rpcUrl)
      mintPayload = await sol.prepareNFTMint({
        name: metadata.name,
        symbol: metadata.symbol,
        uri: metadataUri,
        sellerFeeBasisPoints: collection.royaltyBps,
        creators: collection.creators
      }, collection.address)
      await sol.disconnect()
    } else {
      const evm = await EVM.create(collection.rpcUrl)
      mintPayload = await evm.prepareNFTMint(
        collection.address,
        metadataUri,
        recipient
      )
      await evm.disconnect()
    }

    // Execute through Demos
    const xmPayload = await prepareXMPayload(mintPayload, this.demos)
    const result = await this.demos.broadcastTransaction(xmPayload)

    return {
      success: true,
      txHash: result.hash,
      tokenId: await this.extractTokenId(result),
      metadataUri,
      recipient
    }
  }

  async batchMint(
    collection: CollectionConfig,
    mintRequests: MintRequest[]
  ): Promise<BatchMintResult> {
    const results: MintResult[] = []

    for (const request of mintRequests) {
      try {
        const result = await this.mintNFT(collection, request.metadata, request.recipient)
        results.push(result)
      } catch (error) {
        results.push({
          success: false,
          error: error.message,
          request
        })
      }
    }

    return {
      total: mintRequests.length,
      successful: results.filter(r => r.success).length,
      failed: results.filter(r => !r.success).length,
      results
    }
  }

  private async uploadMetadata(metadata: NFTMetadata): Promise<string> {
    // Upload image first
    if (metadata.image && !metadata.image.startsWith("ipfs://")) {
      const imageHash = await this.ipfs.upload(metadata.image)
      metadata.image = `ipfs://${imageHash}`
    }

    // Upload metadata JSON
    const metadataJson = JSON.stringify(metadata)
    const hash = await this.ipfs.upload(metadataJson)

    return `ipfs://${hash}`
  }
}
```

### 2. NFT Trading Agent

Automated buying and listing:

```typescript
class NFTTradingAgent {
  private demos: Demos
  private marketplaces: Map<string, Marketplace>

  async listNFT(
    nft: NFTIdentifier,
    price: bigint,
    marketplace: string
  ): Promise<ListingResult> {
    const market = this.marketplaces.get(marketplace)
    if (!market) throw new Error(`Unknown marketplace: ${marketplace}`)

    // Approve marketplace to transfer NFT
    const approvalTx = await this.approveForMarketplace(nft, market.address)
    await this.executeTx(approvalTx)

    // Create listing
    const listingTx = await market.createListing(nft, price)
    const result = await this.executeTx(listingTx)

    return {
      success: true,
      listingId: await this.extractListingId(result),
      nft,
      price,
      marketplace,
      txHash: result.hash
    }
  }

  async buyNFT(
    listing: Listing,
    maxPrice?: bigint
  ): Promise<PurchaseResult> {
    // Check price is acceptable
    if (maxPrice && listing.price > maxPrice) {
      throw new Error(`Price ${listing.price} exceeds max ${maxPrice}`)
    }

    const market = this.marketplaces.get(listing.marketplace)

    // Execute purchase
    const purchaseTx = await market.executeBuy(listing.id, listing.price)
    const result = await this.executeTx(purchaseTx)

    return {
      success: true,
      nft: listing.nft,
      price: listing.price,
      txHash: result.hash
    }
  }

  async sweepFloor(
    collection: string,
    budget: bigint,
    maxCount: number
  ): Promise<SweepResult> {
    // Get floor listings
    const listings = await this.getFloorListings(collection, maxCount)

    const purchased: PurchaseResult[] = []
    let spent = 0n

    for (const listing of listings) {
      if (spent + listing.price > budget) break
      if (purchased.length >= maxCount) break

      try {
        const result = await this.buyNFT(listing)
        purchased.push(result)
        spent += listing.price
      } catch (error) {
        console.error(`Failed to buy ${listing.nft.tokenId}:`, error.message)
      }
    }

    return {
      totalPurchased: purchased.length,
      totalSpent: spent,
      remainingBudget: budget - spent,
      purchases: purchased
    }
  }

  async snipeRareListing(
    collection: string,
    maxPrice: bigint,
    rarityThreshold: number
  ): Promise<SnipeResult | null> {
    // Monitor new listings
    return new Promise((resolve) => {
      this.onNewListing(collection, async (listing) => {
        // Check price
        if (listing.price > maxPrice) return

        // Check rarity
        const rarity = await this.getRarityScore(listing.nft)
        if (rarity < rarityThreshold) return

        // Attempt to buy
        try {
          const result = await this.buyNFT(listing, maxPrice)
          resolve({
            success: true,
            listing,
            rarity,
            purchase: result
          })
        } catch (error) {
          // Listing was taken
        }
      })
    })
  }
}
```

### 3. NFT Portfolio Manager Agent

Track and manage NFT holdings:

```typescript
class NFTPortfolioAgent {
  private demos: Demos

  async getPortfolio(addresses: WalletAddress[]): Promise<NFTPortfolio> {
    const holdings: NFTHolding[] = []

    for (const { chain, address } of addresses) {
      const nfts = await this.fetchNFTs(chain, address)
      holdings.push(...nfts.map(nft => ({
        ...nft,
        chain,
        owner: address
      })))
    }

    // Enrich with market data
    const enriched = await Promise.all(
      holdings.map(async (holding) => ({
        ...holding,
        floorPrice: await this.getFloorPrice(holding.collection),
        lastSale: await this.getLastSale(holding),
        rarity: await this.getRarityScore(holding)
      }))
    )

    // Calculate portfolio metrics
    const totalFloorValue = enriched.reduce((acc, h) => acc + h.floorPrice, 0n)

    return {
      holdings: enriched,
      totalItems: holdings.length,
      totalFloorValue,
      byCollection: this.groupByCollection(enriched),
      byChain: this.groupByChain(enriched),
      rarestItems: this.getTopByRarity(enriched, 10)
    }
  }

  async analyzePortfolio(portfolio: NFTPortfolio): Promise<PortfolioAnalysis> {
    // Concentration analysis
    const collectionConcentration = this.calculateConcentration(portfolio.byCollection)

    // Chain diversification
    const chainDiversity = Object.keys(portfolio.byChain).length

    // Liquidity analysis
    const liquidityScores = await Promise.all(
      portfolio.holdings.map(h => this.assessLiquidity(h))
    )

    // Value at risk
    const valueAtRisk = this.calculateVaR(portfolio, 0.95)

    return {
      totalValue: portfolio.totalFloorValue,
      collectionConcentration,
      chainDiversity,
      averageLiquidity: liquidityScores.reduce((a, b) => a + b, 0) / liquidityScores.length,
      valueAtRisk,
      recommendations: this.generateRecommendations(portfolio)
    }
  }

  async rebalancePortfolio(
    currentPortfolio: NFTPortfolio,
    targetAllocation: AllocationTarget[]
  ): Promise<RebalancePlan> {
    const plan: RebalanceAction[] = []

    for (const target of targetAllocation) {
      const current = currentPortfolio.byCollection[target.collection]
      const currentValue = current?.reduce((acc, h) => acc + h.floorPrice, 0n) || 0n
      const targetValue = (currentPortfolio.totalFloorValue * BigInt(target.percentage)) / 100n

      if (currentValue < targetValue * 95n / 100n) {
        // Need to buy
        const deficit = targetValue - currentValue
        plan.push({
          action: "buy",
          collection: target.collection,
          amount: deficit,
          items: await this.selectItemsToBuy(target.collection, deficit)
        })
      } else if (currentValue > targetValue * 105n / 100n) {
        // Need to sell
        const surplus = currentValue - targetValue
        plan.push({
          action: "sell",
          collection: target.collection,
          amount: surplus,
          items: this.selectItemsToSell(current, surplus)
        })
      }
    }

    return {
      actions: plan,
      estimatedCost: plan.filter(a => a.action === "buy").reduce((acc, a) => acc + a.amount, 0n),
      estimatedProceeds: plan.filter(a => a.action === "sell").reduce((acc, a) => acc + a.amount, 0n)
    }
  }
}
```

### 4. Collection Analytics Agent

Analyze NFT collections:

```typescript
class CollectionAnalyticsAgent {
  async analyzeCollection(
    collectionAddress: string,
    chain: string
  ): Promise<CollectionAnalysis> {
    // Fetch collection data
    const collection = await this.fetchCollectionData(collectionAddress, chain)
    const sales = await this.fetchSalesHistory(collectionAddress, chain)
    const listings = await this.fetchActiveListings(collectionAddress, chain)

    // Calculate metrics
    const floorPrice = this.calculateFloor(listings)
    const volume24h = this.calculateVolume(sales, 24)
    const volume7d = this.calculateVolume(sales, 168)
    const holders = await this.getUniqueHolders(collectionAddress, chain)

    // Trend analysis
    const priceHistory = this.buildPriceHistory(sales)
    const trend = this.analyzeTrend(priceHistory)

    // Holder distribution
    const holderDistribution = await this.analyzeHolderDistribution(collectionAddress, chain)

    // Rarity analysis
    const rarityDistribution = await this.analyzeRarityDistribution(collectionAddress, chain)

    return {
      address: collectionAddress,
      chain,
      name: collection.name,
      totalSupply: collection.totalSupply,
      floorPrice,
      volume24h,
      volume7d,
      holders: holders.length,
      trend,
      priceHistory,
      holderDistribution,
      rarityDistribution,
      score: this.calculateCollectionScore({
        floorPrice, volume7d, holders, trend, holderDistribution
      })
    }
  }

  async findUndervaluedNFTs(
    collection: string,
    count: number = 10
  ): Promise<UndervaluedNFT[]> {
    // Get all listings
    const listings = await this.fetchActiveListings(collection)

    // Calculate expected value based on traits
    const valuations = await Promise.all(
      listings.map(async (listing) => {
        const traits = await this.getTraits(listing.nft)
        const expectedValue = await this.calculateTraitBasedValue(traits)
        const discount = (expectedValue - listing.price) / expectedValue

        return {
          listing,
          expectedValue,
          discount,
          traits
        }
      })
    )

    // Return most undervalued
    return valuations
      .filter(v => v.discount > 0)
      .sort((a, b) => b.discount - a.discount)
      .slice(0, count)
  }

  async trackWhaleActivity(
    collections: string[]
  ): Promise<WhaleActivity[]> {
    const activities: WhaleActivity[] = []

    for (const collection of collections) {
      // Get recent large purchases
      const sales = await this.fetchSalesHistory(collection, 24)
      const largeSales = sales.filter(s => s.price > this.getWhaleThreshold(collection))

      for (const sale of largeSales) {
        // Analyze buyer
        const buyerProfile = await this.analyzeBuyer(sale.buyer)

        activities.push({
          collection,
          type: "purchase",
          buyer: sale.buyer,
          buyerProfile,
          price: sale.price,
          tokenId: sale.tokenId,
          timestamp: sale.timestamp
        })
      }
    }

    return activities.sort((a, b) => b.timestamp - a.timestamp)
  }
}
```

### 5. NFT Rarity Agent

Calculate and analyze NFT rarity:

```typescript
class NFTRarityAgent {
  async calculateRarity(
    collection: string,
    tokenId: string
  ): Promise<RarityResult> {
    // Get all traits for collection
    const collectionTraits = await this.getCollectionTraits(collection)
    const totalSupply = await this.getTotalSupply(collection)

    // Get this NFT's traits
    const nftTraits = await this.getNFTTraits(collection, tokenId)

    // Calculate trait rarity scores
    const traitScores = nftTraits.map(trait => {
      const traitCount = collectionTraits[trait.type]?.[trait.value] || 0
      const frequency = traitCount / totalSupply
      const rarityScore = 1 / frequency

      return {
        trait,
        count: traitCount,
        frequency,
        rarityScore
      }
    })

    // Calculate overall rarity
    const totalRarityScore = traitScores.reduce((acc, t) => acc + t.rarityScore, 0)
    const rank = await this.calculateRank(collection, totalRarityScore)

    return {
      tokenId,
      collection,
      traits: traitScores,
      totalScore: totalRarityScore,
      rank,
      percentile: (1 - rank / totalSupply) * 100
    }
  }

  async findRareListings(
    collection: string,
    minPercentile: number = 90
  ): Promise<RareListing[]> {
    const listings = await this.fetchActiveListings(collection)

    const rareListings: RareListing[] = []

    for (const listing of listings) {
      const rarity = await this.calculateRarity(collection, listing.tokenId)

      if (rarity.percentile >= minPercentile) {
        rareListings.push({
          listing,
          rarity,
          valueScore: this.calculateValueScore(listing.price, rarity)
        })
      }
    }

    return rareListings.sort((a, b) => b.valueScore - a.valueScore)
  }

  async getTraitFloors(collection: string): Promise<TraitFloors> {
    const listings = await this.fetchActiveListings(collection)
    const traitFloors: TraitFloors = {}

    for (const listing of listings) {
      const traits = await this.getNFTTraits(collection, listing.tokenId)

      for (const trait of traits) {
        const key = `${trait.type}:${trait.value}`
        if (!traitFloors[key] || listing.price < traitFloors[key].price) {
          traitFloors[key] = {
            trait,
            price: listing.price,
            listing
          }
        }
      }
    }

    return traitFloors
  }
}
```

### 6. NFT Royalty Agent

Manage and track royalties:

```typescript
class NFTRoyaltyAgent {
  async trackRoyalties(
    creatorAddress: string,
    collections: string[]
  ): Promise<RoyaltyReport> {
    const royalties: RoyaltyPayment[] = []

    for (const collection of collections) {
      // Get sales where royalties were paid
      const sales = await this.fetchSalesWithRoyalties(collection)

      for (const sale of sales) {
        if (sale.royalties?.recipient === creatorAddress) {
          royalties.push({
            collection,
            tokenId: sale.tokenId,
            salePrice: sale.price,
            royaltyAmount: sale.royalties.amount,
            royaltyPercent: (sale.royalties.amount * 10000n / sale.price) / 100,
            txHash: sale.txHash,
            timestamp: sale.timestamp
          })
        }
      }
    }

    // Calculate totals
    const totalEarned = royalties.reduce((acc, r) => acc + r.royaltyAmount, 0n)
    const totalVolume = royalties.reduce((acc, r) => acc + r.salePrice, 0n)

    return {
      creator: creatorAddress,
      totalEarned,
      totalVolume,
      effectiveRate: totalVolume > 0n ? (totalEarned * 10000n / totalVolume) / 100 : 0,
      payments: royalties,
      byCollection: this.groupByCollection(royalties),
      byMonth: this.groupByMonth(royalties)
    }
  }

  async setRoyalties(
    collection: string,
    royaltyBps: number,
    recipient: string
  ): Promise<SetRoyaltyResult> {
    const evm = await EVM.create(this.getRpcUrl(collection))

    // ERC-2981 royalty info
    const payload = await evm.prepareContractCall(
      collection,
      "setDefaultRoyalty",
      [recipient, royaltyBps]
    )

    await evm.disconnect()

    const result = await this.executeTx(payload)

    return {
      success: true,
      collection,
      royaltyBps,
      recipient,
      txHash: result.hash
    }
  }
}
```

## NFT Metadata Standard

```typescript
interface NFTMetadata {
  name: string
  description: string
  image: string // IPFS URI
  external_url?: string
  animation_url?: string
  attributes: {
    trait_type: string
    value: string | number
    display_type?: "number" | "date" | "boost_percentage"
  }[]
}
```

## Best Practices

1. **Validate metadata** before minting
2. **Use IPFS** for decentralized storage
3. **Check royalty enforcement** on marketplaces
4. **Consider gas costs** for batch operations
5. **Verify collection** authenticity before trading

## Integration with DemosWork

```typescript
const nftWorkflow = new DemosWork()

// Step 1: Upload metadata
nftWorkflow.push(new BaseOperation(
  new NativeWorkStep({
    method: "ipfs.upload",
    params: { metadata }
  })
))

// Step 2: Mint NFT
nftWorkflow.push(new BaseOperation(
  new XmWorkStep({
    chain: "ethereum",
    method: "nft.mint",
    params: {
      collection: collectionAddress,
      uri: "{{step1.result}}",
      recipient
    }
  })
))
```

## Related Skills

- [Token Discovery](./token-discovery-agent.md) - Find tokens across chains
- [Transaction Builder](./transaction-builder-agent.md) - Build complex NFT transactions
- [IPFS Storage](./ipfs-storage-agent.md) - Decentralized metadata storage
