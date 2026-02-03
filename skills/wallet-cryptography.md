# Wallet & Cryptography

Learn to manage wallets, keys, and cryptographic operations.

## Overview

The Demos SDK provides cryptographic utilities:

- **Key Generation** - Create new keypairs from seeds or randomly
- **Signing** - Sign messages and transactions (Ed25519)
- **Verification** - Verify signatures
- **Hashing** - SHA-256 hashing

> **Note**: Some cryptographic functions require specific environments. Key storage functions work in Node.js, while some operations require browser environment.

## Key Generation

### From Mnemonic (Seed Phrase)

```typescript
import { Cryptography } from "@kynesyslabs/demosdk/encryption";

// Generate keypair from 12-word mnemonic
const mnemonic = "abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about";
const keypair = Cryptography.newFromSeed(mnemonic);

console.log("Public Key:", keypair.publicKey);
console.log("Private Key:", keypair.privateKey);  // Keep secret!
```

### Random Generation

```typescript
// Generate completely random keypair
const keypair = Cryptography.new();
```

## Message Signing

### Basic Signing (Ed25519)

```typescript
const message = "Hello, Demos!";

// Sign message
const signature = Cryptography.sign(message, keypair.privateKey);

// Verify signature
const isValid = Cryptography.verify(message, signature, keypair.publicKey);
console.log("Signature valid:", isValid);  // true
```

### Ed25519 Explicit API

```typescript
// Ed25519 is the default signing algorithm
const signature = Cryptography.ed25519.sign(message, keypair.privateKey);
const isValid = Cryptography.ed25519.verify(message, signature, keypair.publicKey);
```

## Hashing

```typescript
import { Hashing } from "@kynesyslabs/demosdk/encryption";

// SHA-256 hash (primary supported hash function)
const hash = Hashing.sha256("data to hash");
console.log("SHA-256:", hash);
```

> **Note**: Only `sha256` is currently available in the SDK. Use external libraries for other hash functions if needed.

## Demos Wallet Connection

```typescript
import { Demos } from "@kynesyslabs/demosdk/websdk";

async function connectDemosWallet() {
  const demos = new Demos();
  await demos.connect("https://demosnode.discus.sh/");
  
  // Connect using mnemonic
  await demos.connectWallet(
    "abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about"
  );
  
  // Get wallet info using Demos instance methods
  const address = demos.getAddress();
  const publicKey = demos.getPublicKey();
  
  console.log("Address:", address);
  console.log("Public Key:", publicKey);
  
  return demos;
}
```

## Signing with Demos Wallet

```typescript
async function signMessage(demos: Demos, message: string) {
  // Sign using connected wallet
  const signature = await demos.sign(message);
  
  return {
    message,
    signature,
    address: demos.getAddress()
  };
}
```

## Common Patterns

### Sign-In With Demos (SIWD)

```typescript
function generateNonce() {
  return Math.random().toString(36).substring(2, 15);
}

async function signInWithDemos(demos: Demos, domain: string) {
  const nonce = generateNonce();
  const timestamp = Date.now();
  
  const message = `Sign in to ${domain}
Nonce: ${nonce}
Timestamp: ${timestamp}`;
  
  const signature = await demos.sign(message);
  
  return {
    address: demos.getAddress(),
    message,
    signature,
    nonce,
    timestamp
  };
}

// Verify on server
function verifySignIn(signInData: { message: string; signature: string; address: string; timestamp: number }) {
  const isValid = Cryptography.verify(
    signInData.message,
    signInData.signature,
    signInData.address  // Demos address is the public key
  );
  
  const isRecent = Date.now() - signInData.timestamp < 5 * 60 * 1000;  // 5 min
  
  return isValid && isRecent;
}
```

### Transaction Signing

```typescript
async function signTransaction(demos: Demos, txData: any) {
  // Serialize transaction data
  const txString = JSON.stringify(txData);
  
  // Sign the serialized transaction
  const signature = await demos.sign(txString);
  
  return {
    tx: txData,
    signature,
    signer: demos.getAddress()
  };
}
```

## Error Handling

```typescript
try {
  const signature = Cryptography.sign(message, privateKey);
} catch (error) {
  if (error.message.includes("Invalid private key")) {
    console.error("Private key format is incorrect");
  } else if (error.message.includes("Invalid seed")) {
    console.error("Mnemonic phrase is invalid");
  }
}
```

## Security Best Practices

1. **Never expose private keys** - Keep them in secure storage
2. **Use environment variables** - Store mnemonics in env vars, not code
3. **Verify signatures** - Always verify before trusting signed data
4. **Check timestamps** - Prevent replay attacks with timestamp verification
5. **Use HTTPS** - All network operations should use secure connections

## Important Notes

> **ESM Required**: Use `.mjs` files or add `"type": "module"` to your package.json.

> **Wallet Methods**: Use `demos.getAddress()`, `demos.getPublicKey()`, and `demos.sign()` directly on the Demos instance.

> **Hashing**: Only `Hashing.sha256()` is available. For other hash functions, use external libraries like `crypto` or `ethers`.
