# Session Manager Agent Skill

> **⚠️ Prerequisites**: Complete [SDK Setup](./00-sdk-setup.md) first to configure your environment.

Build agents that manage user sessions and authentication state.

## Overview

Session Manager enables agents to create, validate, and manage user sessions with expiration and refresh capabilities. Essential for dApps, APIs, and multi-step workflows.

## SDK Reference

```typescript
import { Demos } from "@kynesyslabs/demosdk/websdk"

// Session Methods
demos.wallet.sign(message)           // Sign session data
demos.wallet.verify(message, sig)    // Verify session token
```

## Agent Use Cases

### 1. JWT-Like Session Agent

Create and validate sessions:

```typescript
class SessionManagerAgent {
  private demos: Demos
  private sessionDuration: number = 24 * 60 * 60 * 1000 // 24 hours

  async createSession(
    userAddress: string
  ): Promise<Session> {
    const session: SessionData = {
      id: this.generateSessionId(),
      userAddress,
      issuedAt: Date.now(),
      expiresAt: Date.now() + this.sessionDuration,
      nonce: this.generateNonce()
    }

    // Sign session
    const signature = await this.demos.wallet.sign(
      JSON.stringify(session)
    )

    const token = Buffer.from(JSON.stringify({
      ...session,
      signature
    })).toString("base64")

    return {
      token,
      expiresAt: session.expiresAt
    }
  }

  async validateSession(token: string): Promise<ValidationResult> {
    try {
      const decoded = JSON.parse(
        Buffer.from(token, "base64").toString()
      )

      // Check expiration
      if (Date.now() > decoded.expiresAt) {
        return { valid: false, reason: "Session expired" }
      }

      // Verify signature
      const { signature, ...sessionData } = decoded
      const isValid = await this.demos.wallet.verify(
        JSON.stringify(sessionData),
        signature,
        await this.demos.wallet.getPublicKey()
      )

      if (!isValid) {
        return { valid: false, reason: "Invalid signature" }
      }

      return {
        valid: true,
        session: sessionData
      }
    } catch {
      return { valid: false, reason: "Invalid token format" }
    }
  }

  async refreshSession(token: string): Promise<Session | null> {
    const validation = await this.validateSession(token)
    if (!validation.valid) return null

    // Create new session
    return await this.createSession(validation.session.userAddress)
  }
}
```

### 2. Stateful Session Agent

Server-side session management:

```typescript
class StatefulSessionAgent {
  private demos: Demos
  private sessions: Map<string, ServerSession> = new Map()

  async createSession(
    userAddress: string,
    metadata?: any
  ): Promise<string> {
    const sessionId = this.generateSessionId()

    this.sessions.set(sessionId, {
      id: sessionId,
      userAddress,
      metadata,
      createdAt: Date.now(),
      lastActive: Date.now(),
      expiresAt: Date.now() + this.sessionDuration
    })

    return sessionId
  }

  async getSession(sessionId: string): Promise<ServerSession | null> {
    const session = this.sessions.get(sessionId)

    if (!session) return null
    if (Date.now() > session.expiresAt) {
      this.sessions.delete(sessionId)
      return null
    }

    // Update last active
    session.lastActive = Date.now()
    return session
  }

  async destroySession(sessionId: string): Promise<void> {
    this.sessions.delete(sessionId)
  }

  async cleanupExpiredSessions(): Promise<number> {
    const now = Date.now()
    let cleaned = 0

    for (const [id, session] of this.sessions) {
      if (now > session.expiresAt) {
        this.sessions.delete(id)
        cleaned++
      }
    }

    return cleaned
  }
}
```

## Best Practices

1. **Use short session durations** for sensitive operations
2. **Implement session refresh** for better UX
3. **Clean up expired sessions** periodically
4. **Store minimal data** in session tokens
5. **Log session events** for security

## Related Skills

- [Wallet Operations](./wallet-operations-agent.md) - Authentication
- [Permission Manager](./permission-manager-agent.md) - Access control
