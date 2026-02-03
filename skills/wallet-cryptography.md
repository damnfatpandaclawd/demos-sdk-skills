# Wallet & Cryptography

Learn to manage wallets, keys, and cryptographic operations.

## Overview

The Demos SDK provides comprehensive cryptographic utilities:

- **Key Generation** - Create new keypairs from seeds or randomly
- **Key Storage** - Save/load keys with optional encryption
- **Signing** - Sign messages and transactions
- **Verification** - Verify signatures
- **Encryption** - RSA and Ed25519 operations

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

## Key Storage

### Save to File (Hex Format)

```typescript
// Save as hex (unencrypted)
await Cryptography.save(keypair, "./wallet.key", "hex");

// Load back
const loaded = await Cryptography.load("./wallet.key");
```

### Encrypted Storage

```typescript
// Save with password encryption
await Cryptography.saveEncrypted(keypair, "./wallet.enc", "myPassword123");

// Load with password
const loaded = await Cryptography.loadEncrypted("./wallet.enc", "myPassword123");
```

### In-Memory Serialization

```typescript
// Convert to hex string (for storage)
const hexKey = Cryptography.saveToHex(keypair.privateKey);

// Load from hex
const restored = Cryptography.loadFromHex(hexKey);
```

## Message Signing

### Basic Signing

```typescript
const message = "Hello, Demos!";

// Sign message
const signature = Cryptography.sign(message, keypair.privateKey);

// Verify signature
const isValid = Cryptography.verify(message, signature, keypair.publicKey);
console.log("Signature valid:", isValid);  // true
```

### Ed25519 Signing

```typescript
// Ed25519 is default and recommended
const signature = Cryptography.ed25519.sign(message, keypair.privateKey);
const isValid = Cryptography.ed25519.verify(message, signature, keypair.publicKey);
```

## Encryption (RSA)

```typescript
// Encrypt with public key (anyone can encrypt)
const [success, encrypted] = Cryptography.rsa.encrypt(
  "Secret message",
  recipientPublicKey
);

if (!success) {
  throw new Error("Encryption failed");
}

// Decrypt with private key (only recipient can decrypt)
const [success2, decrypted] = Cryptography.rsa.decrypt(
  encrypted,
  recipientPrivateKey
);

console.log("Decrypted:", decrypted);  // "Secret message"
```

## Hashing

```typescript
import { Hashing } from "@kynesyslabs/demosdk/encryption";

// SHA-256 hash
const hash = Hashing.sha256("data to hash");

// SHA-512 hash
const hash512 = Hashing.sha512("data to hash");

// Keccak-256 (Ethereum compatible)
const keccak = Hashing.keccak256("data to hash");
```

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
  
  // Get wallet info
  const address = demos.wallet.getAddress();
  const publicKey = demos.wallet.getPublicKey();
  
  console.log("Address:", address);
  console.log("Public Key:", publicKey);
  
  // Sign a message
  const signature = await demos.wallet.sign("Hello");
  
  return { address, publicKey, signature };
}
```

## EVM Wallet Integration

```typescript
import { EVM } from "@kynesyslabs/demosdk/xm-websdk";

async function evmWalletOperations() {
  const evm = await EVM.create("https://mainnet.base.org");
  
  // Connect with private key or mnemonic
  await evm.connectWallet(privateKeyOrMnemonic);
  
  // Get addresses
  const address = evm.getAddress();
  const publicKey = evm.getPublicKey();
  
  // Sign message
  const signature = await evm.signMessage("Message to sign");
  
  // Verify message
  const isValid = await evm.verifyMessage(
    "Message to sign",
    signature,
    publicKey
  );
  
  await evm.disconnect();
  return { address, publicKey, signature, isValid };
}
```

## Unified Crypto Operations

```typescript
import { UnifiedCrypto } from "@kynesyslabs/demosdk/encryption";

// Cross-platform signing
const signature = await UnifiedCrypto.sign(message, privateKey);

// Cross-platform verification
const isValid = await UnifiedCrypto.verify(message, signature, publicKey);

// Cross-platform encryption
const encrypted = await UnifiedCrypto.encrypt(data, publicKey);
const decrypted = await UnifiedCrypto.decrypt(encrypted, privateKey);
```

## Address Derivation

### Multi-Account Support

```typescript
import { EVM } from "@kynesyslabs/demosdk/xm-websdk";

async function deriveMultipleAccounts(mnemonic: string) {
  const accounts = [];
  
  for (let i = 0; i < 5; i++) {
    const evm = await EVM.create("https://eth.llamarpc.com");
    await evm.connectWallet(mnemonic, i);  // Account index
    
    accounts.push({
      index: i,
      address: evm.getAddress()
    });
    
    await evm.disconnect();
  }
  
  return accounts;
}
```

## Security Best Practices

### Key Storage

```typescript
// ❌ BAD: Storing private key in plain text
localStorage.setItem("privateKey", privateKey);

// ✅ GOOD: Encrypted storage
const encrypted = await encryptWithPassword(privateKey, userPassword);
localStorage.setItem("encryptedKey", encrypted);

// Even better: Use hardware wallets or secure enclaves
```

### Memory Security

```typescript
// Clear sensitive data from memory when done
function clearSensitiveData(keypair: KeyPair) {
  // Overwrite with zeros
  if (keypair.privateKey instanceof Uint8Array) {
    keypair.privateKey.fill(0);
  }
  // Set to null
  keypair.privateKey = null;
}
```

### Environment Variables

```typescript
// ❌ BAD: Hardcoded keys
const privateKey = "0x1234...";

// ✅ GOOD: Environment variables
const privateKey = process.env.PRIVATE_KEY;
if (!privateKey) {
  throw new Error("PRIVATE_KEY not set");
}
```

## Common Patterns

### Sign-In With Demos (SIWD)

```typescript
async function signInWithDemos(demos: Demos, domain: string) {
  const nonce = generateNonce();
  const timestamp = Date.now();
  
  const message = `Sign in to ${domain}
Nonce: ${nonce}
Timestamp: ${timestamp}`;
  
  const signature = await demos.wallet.sign(message);
  
  return {
    address: demos.wallet.getAddress(),
    message,
    signature,
    nonce,
    timestamp
  };
}

// Verify on server
function verifySignIn(signInData: SignInData) {
  const isValid = Cryptography.verify(
    signInData.message,
    signInData.signature,
    signInData.address  // Demos address is the public key
  );
  
  const isRecent = Date.now() - signInData.timestamp < 5 * 60 * 1000;  // 5 min
  
  return isValid && isRecent;
}
```

### Encrypted Messaging

```typescript
async function sendEncryptedMessage(
  senderPrivateKey: string,
  recipientPublicKey: string,
  message: string
) {
  // 1. Encrypt message
  const [_, encrypted] = Cryptography.rsa.encrypt(message, recipientPublicKey);
  
  // 2. Sign the encrypted message
  const signature = Cryptography.sign(encrypted, senderPrivateKey);
  
  return {
    encrypted,
    signature,
    sender: getPublicKey(senderPrivateKey)
  };
}

async function receiveEncryptedMessage(
  recipientPrivateKey: string,
  message: { encrypted: string; signature: string; sender: string }
) {
  // 1. Verify signature
  const isValid = Cryptography.verify(
    message.encrypted,
    message.signature,
    message.sender
  );
  
  if (!isValid) {
    throw new Error("Invalid signature");
  }
  
  // 2. Decrypt
  const [_, decrypted] = Cryptography.rsa.decrypt(
    message.encrypted,
    recipientPrivateKey
  );
  
  return decrypted;
}
```

## Error Handling

```typescript
try {
  const signature = Cryptography.sign(message, privateKey);
} catch (error) {
  if (error.message.includes("Invalid private key")) {
    console.error("Private key format is incorrect");
  } else if (error.message.includes("Key not found")) {
    console.error("Key file does not exist");
  } else if (error.message.includes("Wrong password")) {
    console.error("Decryption password is incorrect");
  }
}
```
