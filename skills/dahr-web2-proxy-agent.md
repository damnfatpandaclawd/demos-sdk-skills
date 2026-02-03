# DAHR Web2 Proxy Agent Skill

Build agents that access Web2 APIs through Demos Network's attested HTTP proxy for verifiable external data.

## Overview

DAHR (Decentralized Attested HTTP Requests) enables agents to fetch data from Web2 APIs with cryptographic attestation, creating verifiable proofs of external data. Essential for oracle services, data verification, API aggregation, and bridging Web2 services to Web3.

## SDK Reference

```typescript
import { Demos } from "@kynesyslabs/demosdk/websdk"
import { Web2Proxy } from "@kynesyslabs/demosdk/web2"
import type { IStartProxyParams, IWeb2Result } from "@kynesyslabs/demosdk/types"

// Create DAHR proxy instance
const dahr = await demos.web2.createDahr()

// Proxy Methods
dahr.startProxy(params)    // Execute attested HTTP request
dahr.sessionId             // Get current session ID

// Request Parameters
interface IStartProxyParams {
  url: string              // Target URL
  method: string           // HTTP method (GET, POST, etc.)
  headers?: Record<string, string>
  body?: any               // Request body for POST/PUT
  timeout?: number         // Request timeout in ms
}
```

## Key Features

| Feature | Description |
|---------|-------------|
| Attested Requests | Cryptographic proof of HTTP responses |
| Session Management | Persistent sessions for multi-request flows |
| Standard HTTP | Support for all HTTP methods |
| Response Verification | Validate response authenticity |

## Agent Use Cases

### 1. Price Oracle Agent

Fetch and attest cryptocurrency prices:

```typescript
class PriceOracleAgent {
  private demos: Demos
  private priceCache: Map<string, PriceData> = new Map()

  async getAttestedPrice(
    symbol: string,
    sources: string[] = ["coingecko", "coinmarketcap", "binance"]
  ): Promise<AttestedPrice> {
    const prices: SourcePrice[] = []

    for (const source of sources) {
      const price = await this.fetchFromSource(source, symbol)
      if (price) {
        prices.push(price)
      }
    }

    // Aggregate prices (median for manipulation resistance)
    const aggregatedPrice = this.calculateMedian(prices.map(p => p.price))

    // Create attestation
    const attestation: AttestedPrice = {
      symbol,
      price: aggregatedPrice,
      sources: prices,
      timestamp: Date.now(),
      signature: await this.signAttestation({
        symbol,
        price: aggregatedPrice,
        sources: prices.map(p => p.source),
        timestamp: Date.now()
      })
    }

    return attestation
  }

  private async fetchFromSource(
    source: string,
    symbol: string
  ): Promise<SourcePrice | null> {
    const dahr = await this.demos.web2.createDahr()

    const endpoints: Record<string, string> = {
      coingecko: `https://api.coingecko.com/api/v3/simple/price?ids=${symbol}&vs_currencies=usd`,
      coinmarketcap: `https://pro-api.coinmarketcap.com/v1/cryptocurrency/quotes/latest?symbol=${symbol}`,
      binance: `https://api.binance.com/api/v3/ticker/price?symbol=${symbol}USDT`
    }

    try {
      const result = await dahr.startProxy({
        url: endpoints[source],
        method: "GET",
        headers: this.getHeaders(source)
      })

      return {
        source,
        price: this.parsePrice(source, result.data),
        timestamp: Date.now(),
        attestation: result.attestation
      }
    } catch (error) {
      console.error(`Failed to fetch from ${source}:`, error)
      return null
    }
  }

  async submitPriceOnChain(
    attestedPrice: AttestedPrice
  ): Promise<TransactionResult> {
    const tx: Transaction = {
      type: "oraclePrice",
      content: {
        symbol: attestedPrice.symbol,
        price: attestedPrice.price,
        sources: attestedPrice.sources.length,
        timestamp: attestedPrice.timestamp,
        attestation: attestedPrice.signature
      },
      hash: "",
      status: "pending"
    }

    return await this.demos.insertTransaction(tx)
  }
}
```

### 2. API Aggregator Agent

Aggregate data from multiple APIs:

```typescript
class APIAggregatorAgent {
  private demos: Demos

  async aggregateData(
    endpoints: APIEndpoint[],
    transform: (responses: any[]) => any
  ): Promise<AggregatedResult> {
    const results: EndpointResult[] = []

    // Fetch from all endpoints in parallel
    await Promise.all(
      endpoints.map(async (endpoint) => {
        const dahr = await this.demos.web2.createDahr()

        try {
          const result = await dahr.startProxy({
            url: endpoint.url,
            method: endpoint.method,
            headers: endpoint.headers,
            body: endpoint.body
          })

          results.push({
            endpoint: endpoint.name,
            data: result.data,
            attestation: result.attestation,
            success: true
          })
        } catch (error) {
          results.push({
            endpoint: endpoint.name,
            error: error.message,
            success: false
          })
        }
      })
    )

    // Transform aggregated data
    const successfulResults = results.filter(r => r.success)
    const aggregatedData = transform(successfulResults.map(r => r.data))

    return {
      data: aggregatedData,
      sources: successfulResults.map(r => ({
        endpoint: r.endpoint,
        attestation: r.attestation
      })),
      failedSources: results.filter(r => !r.success).map(r => r.endpoint),
      timestamp: Date.now()
    }
  }

  async createDataFeed(
    name: string,
    endpoints: APIEndpoint[],
    transform: (responses: any[]) => any,
    intervalMs: number
  ): Promise<DataFeed> {
    const feed: DataFeed = {
      id: this.generateFeedId(),
      name,
      endpoints,
      intervalMs,
      lastUpdate: 0,
      subscribers: []
    }

    // Start polling loop
    setInterval(async () => {
      const result = await this.aggregateData(endpoints, transform)
      feed.lastUpdate = Date.now()

      // Notify subscribers
      for (const subscriber of feed.subscribers) {
        await this.notifySubscriber(subscriber, result)
      }

      // Store on-chain if configured
      if (feed.storeOnChain) {
        await this.storeDataOnChain(feed.id, result)
      }
    }, intervalMs)

    return feed
  }
}
```

### 3. Identity Verification Agent

Verify external identities through OAuth/APIs:

```typescript
class IdentityVerificationAgent {
  private demos: Demos

  async verifyTwitterIdentity(
    accessToken: string,
    expectedHandle: string
  ): Promise<VerificationResult> {
    const dahr = await this.demos.web2.createDahr()

    // Fetch Twitter profile with attestation
    const result = await dahr.startProxy({
      url: "https://api.twitter.com/2/users/me",
      method: "GET",
      headers: {
        "Authorization": `Bearer ${accessToken}`
      }
    })

    const profile = result.data

    // Verify handle matches
    if (profile.data.username.toLowerCase() !== expectedHandle.toLowerCase()) {
      return {
        verified: false,
        reason: "Handle mismatch",
        expectedHandle,
        actualHandle: profile.data.username
      }
    }

    // Create verifiable credential
    const credential: VerifiableCredential = {
      type: "TwitterIdentityCredential",
      issuer: await this.demos.wallet.getPublicKey(),
      subject: {
        platform: "twitter",
        handle: profile.data.username,
        id: profile.data.id,
        name: profile.data.name
      },
      attestation: result.attestation,
      issuedAt: Date.now(),
      expiresAt: Date.now() + 30 * 24 * 60 * 60 * 1000 // 30 days
    }

    // Sign credential
    credential.proof = await this.demos.wallet.sign(
      JSON.stringify(credential)
    )

    return {
      verified: true,
      credential,
      attestation: result.attestation
    }
  }

  async verifyGitHubIdentity(
    accessToken: string,
    expectedUsername: string
  ): Promise<VerificationResult> {
    const dahr = await this.demos.web2.createDahr()

    // Fetch GitHub profile
    const result = await dahr.startProxy({
      url: "https://api.github.com/user",
      method: "GET",
      headers: {
        "Authorization": `token ${accessToken}`,
        "Accept": "application/vnd.github.v3+json"
      }
    })

    const profile = result.data

    if (profile.login.toLowerCase() !== expectedUsername.toLowerCase()) {
      return {
        verified: false,
        reason: "Username mismatch"
      }
    }

    // Fetch additional data for reputation
    const reposResult = await dahr.startProxy({
      url: `https://api.github.com/users/${profile.login}/repos?per_page=100`,
      method: "GET",
      headers: {
        "Authorization": `token ${accessToken}`,
        "Accept": "application/vnd.github.v3+json"
      }
    })

    const repos = reposResult.data
    const totalStars = repos.reduce((sum: number, repo: any) => sum + repo.stargazers_count, 0)

    const credential: VerifiableCredential = {
      type: "GitHubIdentityCredential",
      subject: {
        platform: "github",
        username: profile.login,
        id: profile.id,
        publicRepos: profile.public_repos,
        followers: profile.followers,
        totalStars,
        accountAge: this.calculateAge(profile.created_at)
      },
      attestation: result.attestation,
      issuedAt: Date.now()
    }

    credential.proof = await this.demos.wallet.sign(
      JSON.stringify(credential)
    )

    return {
      verified: true,
      credential
    }
  }
}
```

### 4. Web Scraping Agent

Scrape and attest web content:

```typescript
class WebScrapingAgent {
  private demos: Demos

  async scrapeWithAttestation(
    url: string,
    selectors: ScrapingSelector[]
  ): Promise<ScrapedData> {
    const dahr = await this.demos.web2.createDahr()

    // Fetch page content
    const result = await dahr.startProxy({
      url,
      method: "GET",
      headers: {
        "User-Agent": "Mozilla/5.0 (compatible; DemosBot/1.0)"
      }
    })

    // Parse and extract data
    const extractedData: Record<string, any> = {}

    for (const selector of selectors) {
      extractedData[selector.name] = this.extractWithSelector(
        result.data,
        selector
      )
    }

    return {
      url,
      data: extractedData,
      attestation: result.attestation,
      scrapedAt: Date.now()
    }
  }

  async monitorChanges(
    url: string,
    selectors: ScrapingSelector[],
    checkIntervalMs: number,
    onChange: (changes: DataChange[]) => void
  ): Promise<Monitor> {
    let previousData: Record<string, any> | null = null

    const monitor: Monitor = {
      id: this.generateMonitorId(),
      url,
      selectors,
      active: true
    }

    const checkLoop = async () => {
      if (!monitor.active) return

      const currentData = await this.scrapeWithAttestation(url, selectors)

      if (previousData) {
        const changes = this.detectChanges(previousData, currentData.data)
        if (changes.length > 0) {
          onChange(changes)

          // Store change event on-chain
          await this.recordChangeEvent(monitor.id, changes, currentData.attestation)
        }
      }

      previousData = currentData.data
      setTimeout(checkLoop, checkIntervalMs)
    }

    checkLoop()

    return monitor
  }
}
```

### 5. Payment Verification Agent

Verify off-chain payment events:

```typescript
class PaymentVerificationAgent {
  private demos: Demos

  async verifyStripePayment(
    paymentIntentId: string,
    apiKey: string
  ): Promise<PaymentVerification> {
    const dahr = await this.demos.web2.createDahr()

    const result = await dahr.startProxy({
      url: `https://api.stripe.com/v1/payment_intents/${paymentIntentId}`,
      method: "GET",
      headers: {
        "Authorization": `Bearer ${apiKey}`
      }
    })

    const payment = result.data

    const verification: PaymentVerification = {
      provider: "stripe",
      paymentId: paymentIntentId,
      amount: payment.amount,
      currency: payment.currency,
      status: payment.status,
      customer: payment.customer,
      metadata: payment.metadata,
      attestation: result.attestation,
      verifiedAt: Date.now()
    }

    // Create on-chain proof
    if (payment.status === "succeeded") {
      const proofTx: Transaction = {
        type: "paymentProof",
        content: {
          provider: "stripe",
          paymentId: paymentIntentId,
          amount: payment.amount,
          currency: payment.currency,
          attestationHash: this.hashAttestation(result.attestation)
        },
        hash: "",
        status: "pending"
      }

      verification.onChainProof = await this.demos.insertTransaction(proofTx)
    }

    return verification
  }

  async verifyPayPalPayment(
    orderId: string,
    accessToken: string
  ): Promise<PaymentVerification> {
    const dahr = await this.demos.web2.createDahr()

    const result = await dahr.startProxy({
      url: `https://api-m.paypal.com/v2/checkout/orders/${orderId}`,
      method: "GET",
      headers: {
        "Authorization": `Bearer ${accessToken}`,
        "Content-Type": "application/json"
      }
    })

    const order = result.data

    return {
      provider: "paypal",
      paymentId: orderId,
      amount: parseFloat(order.purchase_units[0].amount.value),
      currency: order.purchase_units[0].amount.currency_code,
      status: order.status,
      attestation: result.attestation,
      verifiedAt: Date.now()
    }
  }
}
```

### 6. Weather Oracle Agent

Provide attested weather data:

```typescript
class WeatherOracleAgent {
  private demos: Demos

  async getWeatherData(
    location: { lat: number; lon: number },
    providers: string[] = ["openweathermap", "weatherapi"]
  ): Promise<AttestedWeather> {
    const readings: WeatherReading[] = []

    for (const provider of providers) {
      const reading = await this.fetchFromProvider(provider, location)
      if (reading) {
        readings.push(reading)
      }
    }

    // Aggregate readings
    const aggregated: AttestedWeather = {
      location,
      temperature: this.calculateMedian(readings.map(r => r.temperature)),
      humidity: this.calculateMedian(readings.map(r => r.humidity)),
      conditions: this.mostCommon(readings.map(r => r.conditions)),
      sources: readings,
      timestamp: Date.now()
    }

    // Sign attestation
    aggregated.signature = await this.demos.wallet.sign(
      JSON.stringify({
        location,
        temperature: aggregated.temperature,
        humidity: aggregated.humidity,
        timestamp: aggregated.timestamp
      })
    )

    return aggregated
  }

  private async fetchFromProvider(
    provider: string,
    location: { lat: number; lon: number }
  ): Promise<WeatherReading | null> {
    const dahr = await this.demos.web2.createDahr()

    const endpoints: Record<string, string> = {
      openweathermap: `https://api.openweathermap.org/data/2.5/weather?lat=${location.lat}&lon=${location.lon}&appid=${process.env.OPENWEATHER_KEY}`,
      weatherapi: `https://api.weatherapi.com/v1/current.json?key=${process.env.WEATHER_API_KEY}&q=${location.lat},${location.lon}`
    }

    try {
      const result = await dahr.startProxy({
        url: endpoints[provider],
        method: "GET"
      })

      return {
        provider,
        temperature: this.parseTemperature(provider, result.data),
        humidity: this.parseHumidity(provider, result.data),
        conditions: this.parseConditions(provider, result.data),
        attestation: result.attestation
      }
    } catch {
      return null
    }
  }

  async createWeatherContract(
    location: { lat: number; lon: number },
    conditions: WeatherConditions,
    payout: bigint
  ): Promise<WeatherContract> {
    const contract: WeatherContract = {
      id: this.generateContractId(),
      location,
      conditions,
      payout,
      status: "active",
      createdAt: Date.now()
    }

    // Monitor weather and trigger payout if conditions met
    this.monitorForConditions(contract)

    return contract
  }
}
```

## Error Handling

```typescript
try {
  const result = await dahr.startProxy(params)
} catch (error) {
  switch (error.code) {
    case 'NETWORK_ERROR':
      // Failed to reach target URL
      break
    case 'TIMEOUT':
      // Request timed out
      break
    case 'ATTESTATION_FAILED':
      // Could not generate attestation
      break
    case 'INVALID_RESPONSE':
      // Response validation failed
      break
  }
}
```

## Best Practices

1. **Use multiple sources** for critical data
2. **Validate responses** before using data
3. **Cache attestations** for audit trails
4. **Handle rate limits** gracefully
5. **Rotate API keys** periodically

## Integration with DemosWork

```typescript
const oracleWorkflow = new DemosWork()

// Step 1: Fetch price from API
oracleWorkflow.push(new BaseOperation(
  new Web2WorkStep({
    url: "https://api.coingecko.com/api/v3/simple/price?ids=bitcoin&vs_currencies=usd",
    method: "GET"
  })
))

// Step 2: Validate and transform
oracleWorkflow.push(new BaseOperation(
  new NativeWorkStep({
    method: "transform",
    params: {
      input: "{{step1.result}}",
      transform: "price = data.bitcoin.usd"
    }
  })
))

// Step 3: Submit on-chain
oracleWorkflow.push(new BaseOperation(
  new NativeWorkStep({
    method: "oracle.submitPrice",
    params: {
      symbol: "BTC",
      price: "{{step2.result.price}}",
      attestation: "{{step1.result.attestation}}"
    }
  })
))
```

## Related Skills

- [Workflow Orchestration](./workflow-orchestration-agent.md) - Multi-step workflows
- [Social Identity Agent](./social-identity-agent.md) - Identity verification
- [Token Discovery Agent](./token-discovery-agent.md) - Price aggregation
