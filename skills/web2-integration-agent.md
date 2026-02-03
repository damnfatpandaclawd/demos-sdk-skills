# Web2 Integration Agent

Build autonomous agents that interact with Web2 APIs through Demos DAHR (Decentralized Attested HTTP Requests) proxy for verifiable off-chain data access.

## Agent Use Cases

| Use Case | Description |
|----------|-------------|
| **API Aggregator Agent** | Fetch data from multiple APIs, aggregate on-chain |
| **Social Media Bot** | Post to Twitter/Discord with verifiable actions |
| **Price Feed Agent** | Fetch prices from exchanges for DeFi protocols |
| **Email/SMS Agent** | Send notifications via Twilio/SendGrid |
| **Webhook Listener** | React to external events via webhooks |
| **Payment Processor** | Integrate with Stripe/PayPal for fiat operations |

## DAHR vs TLSNotary

| Feature | DAHR (Web2Proxy) | TLSNotary |
|---------|------------------|-----------|
| **Purpose** | Make HTTP requests through network | Create cryptographic proofs |
| **Speed** | Fast, standard HTTP | Slower, MPC-TLS overhead |
| **Proof** | Network attestation | Full cryptographic proof |
| **Use Case** | General API calls | Dispute resolution, oracles |
| **Cost** | Lower | Higher (1 DEM + storage) |

**Use DAHR when**: You need to make API calls and trust the Demos network
**Use TLSNotary when**: You need cryptographic proof that survives disputes

## Import

```typescript
import { Web2Proxy, web2Calls } from '@kynesyslabs/demosdk/web2'
import { Demos } from '@kynesyslabs/demosdk/websdk'
```

## Core Classes

### Web2Proxy

| Property/Method | Purpose |
|-----------------|---------|
| `sessionId` | Get the proxy session ID |
| `startProxy(params)` | Execute HTTP request through DAHR |

### IStartProxyParams

```typescript
interface IStartProxyParams {
  url: string           // Target URL
  method: 'GET' | 'POST' | 'PUT' | 'DELETE'
  headers?: Record<string, string>
  body?: any
}
```

## Basic Web2 Integration

```typescript
import { Demos } from '@kynesyslabs/demosdk/websdk'

class Web2Agent {
  private demos: Demos

  async initialize(nodeUrl: string, privateKey: string) {
    this.demos = new Demos()
    await this.demos.connect(nodeUrl)
    await this.demos.connectWallet(privateKey)
  }

  async makeRequest(
    url: string,
    method: 'GET' | 'POST' = 'GET',
    body?: any,
    headers?: Record<string, string>
  ): Promise<any> {
    // Create DAHR proxy instance
    const dahr = await this.demos.web2.createDahr()
    
    // Execute request through Demos network
    const response = await dahr.startProxy({
      url,
      method,
      headers: {
        'Content-Type': 'application/json',
        ...headers
      },
      body
    })
    
    return response.data
  }
}
```

## API Aggregator Agent

Agent that fetches and aggregates data from multiple APIs.

```typescript
class APIAggregatorAgent extends Web2Agent {
  
  async aggregatePrices(assets: string[]): Promise<{
    asset: string
    prices: { source: string; price: number }[]
    average: number
  }[]> {
    const results = []
    
    for (const asset of assets) {
      // Fetch from multiple sources in parallel
      const [coingecko, binance, coinbase] = await Promise.all([
        this.fetchCoinGecko(asset),
        this.fetchBinance(asset),
        this.fetchCoinbase(asset)
      ])
      
      const prices = [
        { source: 'coingecko', price: coingecko },
        { source: 'binance', price: binance },
        { source: 'coinbase', price: coinbase }
      ].filter(p => p.price > 0)
      
      const average = prices.reduce((sum, p) => sum + p.price, 0) / prices.length
      
      results.push({ asset, prices, average })
    }
    
    return results
  }

  private async fetchCoinGecko(asset: string): Promise<number> {
    try {
      const data = await this.makeRequest(
        `https://api.coingecko.com/api/v3/simple/price?ids=${asset}&vs_currencies=usd`
      )
      return data[asset]?.usd || 0
    } catch {
      return 0
    }
  }

  private async fetchBinance(asset: string): Promise<number> {
    try {
      const symbol = `${asset.toUpperCase()}USDT`
      const data = await this.makeRequest(
        `https://api.binance.com/api/v3/ticker/price?symbol=${symbol}`
      )
      return parseFloat(data.price) || 0
    } catch {
      return 0
    }
  }

  private async fetchCoinbase(asset: string): Promise<number> {
    try {
      const data = await this.makeRequest(
        `https://api.coinbase.com/v2/prices/${asset}-USD/spot`
      )
      return parseFloat(data.data?.amount) || 0
    } catch {
      return 0
    }
  }
}
```

## Social Media Agent

Agent that posts to social platforms.

```typescript
class SocialMediaAgent extends Web2Agent {
  
  async postToTwitter(
    text: string,
    bearerToken: string
  ): Promise<{ tweetId: string }> {
    const response = await this.makeRequest(
      'https://api.twitter.com/2/tweets',
      'POST',
      { text },
      { 'Authorization': `Bearer ${bearerToken}` }
    )
    
    return { tweetId: response.data.id }
  }

  async postToDiscord(
    webhookUrl: string,
    content: string,
    embeds?: any[]
  ): Promise<void> {
    await this.makeRequest(
      webhookUrl,
      'POST',
      { content, embeds }
    )
  }

  async postToTelegram(
    botToken: string,
    chatId: string,
    text: string
  ): Promise<{ messageId: number }> {
    const response = await this.makeRequest(
      `https://api.telegram.org/bot${botToken}/sendMessage`,
      'POST',
      {
        chat_id: chatId,
        text,
        parse_mode: 'HTML'
      }
    )
    
    return { messageId: response.result.message_id }
  }

  async crossPost(
    message: string,
    platforms: {
      twitter?: { bearerToken: string }
      discord?: { webhookUrl: string }
      telegram?: { botToken: string; chatId: string }
    }
  ): Promise<Record<string, any>> {
    const results: Record<string, any> = {}
    
    if (platforms.twitter) {
      results.twitter = await this.postToTwitter(
        message,
        platforms.twitter.bearerToken
      )
    }
    
    if (platforms.discord) {
      await this.postToDiscord(platforms.discord.webhookUrl, message)
      results.discord = { success: true }
    }
    
    if (platforms.telegram) {
      results.telegram = await this.postToTelegram(
        platforms.telegram.botToken,
        platforms.telegram.chatId,
        message
      )
    }
    
    return results
  }
}
```

## Notification Agent

Agent for sending alerts and notifications.

```typescript
class NotificationAgent extends Web2Agent {
  
  async sendSMS(
    twilioAccountSid: string,
    twilioAuthToken: string,
    from: string,
    to: string,
    body: string
  ): Promise<{ messageSid: string }> {
    const auth = Buffer.from(`${twilioAccountSid}:${twilioAuthToken}`).toString('base64')
    
    const response = await this.makeRequest(
      `https://api.twilio.com/2010-04-01/Accounts/${twilioAccountSid}/Messages.json`,
      'POST',
      new URLSearchParams({ From: from, To: to, Body: body }).toString(),
      {
        'Authorization': `Basic ${auth}`,
        'Content-Type': 'application/x-www-form-urlencoded'
      }
    )
    
    return { messageSid: response.sid }
  }

  async sendEmail(
    sendgridApiKey: string,
    from: string,
    to: string,
    subject: string,
    html: string
  ): Promise<void> {
    await this.makeRequest(
      'https://api.sendgrid.com/v3/mail/send',
      'POST',
      {
        personalizations: [{ to: [{ email: to }] }],
        from: { email: from },
        subject,
        content: [{ type: 'text/html', value: html }]
      },
      { 'Authorization': `Bearer ${sendgridApiKey}` }
    )
  }

  async sendSlackMessage(
    webhookUrl: string,
    message: string,
    channel?: string
  ): Promise<void> {
    await this.makeRequest(
      webhookUrl,
      'POST',
      {
        text: message,
        channel
      }
    )
  }

  async sendPushNotification(
    pushoverToken: string,
    userKey: string,
    message: string,
    title?: string,
    priority?: number
  ): Promise<void> {
    await this.makeRequest(
      'https://api.pushover.net/1/messages.json',
      'POST',
      {
        token: pushoverToken,
        user: userKey,
        message,
        title,
        priority
      }
    )
  }
}
```

## Webhook Handler Agent

Agent that processes incoming webhooks.

```typescript
class WebhookHandlerAgent extends Web2Agent {
  private handlers: Map<string, (payload: any) => Promise<void>> = new Map()

  registerHandler(eventType: string, handler: (payload: any) => Promise<void>) {
    this.handlers.set(eventType, handler)
  }

  async processWebhook(eventType: string, payload: any): Promise<void> {
    const handler = this.handlers.get(eventType)
    
    if (!handler) {
      console.warn(`No handler for event type: ${eventType}`)
      return
    }
    
    await handler(payload)
  }

  // Example: GitHub webhook handler
  async handleGitHubPush(payload: any): Promise<void> {
    const { repository, commits, pusher } = payload
    
    // Notify Discord about new commits
    await this.makeRequest(
      process.env.DISCORD_WEBHOOK!,
      'POST',
      {
        embeds: [{
          title: `New push to ${repository.full_name}`,
          description: `${commits.length} commits by ${pusher.name}`,
          fields: commits.slice(0, 5).map((c: any) => ({
            name: c.id.slice(0, 7),
            value: c.message.slice(0, 100)
          }))
        }]
      }
    )
  }

  // Example: Stripe webhook handler
  async handleStripePayment(payload: any): Promise<void> {
    const { type, data } = payload
    
    if (type === 'payment_intent.succeeded') {
      const amount = data.object.amount / 100
      const currency = data.object.currency.toUpperCase()
      
      // Trigger on-chain action based on payment
      console.log(`Payment received: ${amount} ${currency}`)
      // ... mint NFT, unlock access, etc.
    }
  }
}
```

## Payment Integration Agent

Agent for fiat payment integrations.

```typescript
class PaymentAgent extends Web2Agent {
  
  async createStripePaymentIntent(
    stripeSecretKey: string,
    amount: number,
    currency: string
  ): Promise<{ clientSecret: string; paymentIntentId: string }> {
    const response = await this.makeRequest(
      'https://api.stripe.com/v1/payment_intents',
      'POST',
      new URLSearchParams({
        amount: amount.toString(),
        currency,
        automatic_payment_methods: JSON.stringify({ enabled: true })
      }).toString(),
      {
        'Authorization': `Bearer ${stripeSecretKey}`,
        'Content-Type': 'application/x-www-form-urlencoded'
      }
    )
    
    return {
      clientSecret: response.client_secret,
      paymentIntentId: response.id
    }
  }

  async checkPaymentStatus(
    stripeSecretKey: string,
    paymentIntentId: string
  ): Promise<{ status: string; amount: number }> {
    const response = await this.makeRequest(
      `https://api.stripe.com/v1/payment_intents/${paymentIntentId}`,
      'GET',
      undefined,
      { 'Authorization': `Bearer ${stripeSecretKey}` }
    )
    
    return {
      status: response.status,
      amount: response.amount
    }
  }
}
```

## Data Fetching Patterns

```typescript
class DataFetchAgent extends Web2Agent {
  
  // Retry with exponential backoff
  async fetchWithRetry<T>(
    url: string,
    maxRetries = 3
  ): Promise<T> {
    for (let i = 0; i < maxRetries; i++) {
      try {
        return await this.makeRequest(url)
      } catch (error) {
        if (i === maxRetries - 1) throw error
        await this.delay(Math.pow(2, i) * 1000)
      }
    }
    throw new Error('Max retries exceeded')
  }

  // Parallel fetch with error handling
  async fetchMultiple<T>(urls: string[]): Promise<{
    success: { url: string; data: T }[]
    failed: { url: string; error: string }[]
  }> {
    const results = await Promise.allSettled(
      urls.map(async url => ({
        url,
        data: await this.makeRequest(url)
      }))
    )
    
    return {
      success: results
        .filter((r): r is PromiseFulfilledResult<any> => r.status === 'fulfilled')
        .map(r => r.value),
      failed: results
        .filter((r): r is PromiseRejectedResult => r.status === 'rejected')
        .map((r, i) => ({ url: urls[i], error: r.reason.message }))
    }
  }

  // Rate-limited fetch
  async fetchWithRateLimit<T>(
    urls: string[],
    requestsPerSecond = 10
  ): Promise<T[]> {
    const results: T[] = []
    const delay = 1000 / requestsPerSecond
    
    for (const url of urls) {
      results.push(await this.makeRequest(url))
      await this.delay(delay)
    }
    
    return results
  }

  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms))
  }
}
```

## Quick Reference

| Task | Pattern |
|------|---------|
| Create DAHR | `demos.web2.createDahr()` |
| GET request | `dahr.startProxy({ url, method: 'GET' })` |
| POST request | `dahr.startProxy({ url, method: 'POST', body })` |
| With auth | `{ headers: { 'Authorization': 'Bearer ...' } }` |
| Discord webhook | `POST to webhook URL with { content }` |
| Telegram | `POST to api.telegram.org/bot{token}/sendMessage` |
| Twitter | `POST to api.twitter.com/2/tweets with auth` |

## Security Best Practices

1. **Never expose API keys** in code - use environment variables
2. **Validate responses** before processing
3. **Implement rate limiting** to avoid API bans
4. **Use HTTPS only** for all external requests
5. **Handle errors gracefully** with retries for transient failures
