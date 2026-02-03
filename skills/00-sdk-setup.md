# Demos SDK Environment Setup

> **Purpose**: This skill sets up the correct environment for all Demos SDK operations. Run this FIRST before any other skill.

## Overview

The Demos SDK v2.9.1 requires specific environment configuration due to ESM module resolution issues in Node.js. This skill ensures your environment is correctly configured.

## Prerequisites

- Node.js 18.x or 20.x (recommended: 18.20.x)
- npm or yarn
- A Demos wallet (mnemonic) or ability to create one

## Step 1: Install Node.js (if needed)

```bash
# Using nvm (recommended)
curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.39.7/install.sh | bash
source ~/.bashrc  # or ~/.zshrc

# Install Node.js 18 LTS
nvm install 18
nvm use 18
node --version  # Should show v18.x.x
```

## Step 2: Create Project & Install SDK

```bash
# Create project directory
mkdir my-demos-project && cd my-demos-project

# Initialize npm project
npm init -y

# Add "type": "module" to package.json for ESM
npm pkg set type=module

# Install Demos SDK
npm install @kynesyslabs/demosdk@2.9.1
```

## Step 3: Create the Polyfill Wrapper

The SDK requires a crypto polyfill for Node.js. Create this file:

**`demos-polyfill.mjs`**
```javascript
// demos-polyfill.mjs
// Required polyfill for Demos SDK in Node.js

import { webcrypto } from "crypto";

// Polyfill globalThis.crypto for Node.js
if (!globalThis.crypto) {
  globalThis.crypto = webcrypto;
}

export { webcrypto };
```

## Step 4: Create the SDK Helper Module

This module handles connection with automatic failover:

**`demos-helper.mjs`**
```javascript
// demos-helper.mjs
// Demos SDK helper with connection failover and correct imports

// MUST import polyfill first
import "./demos-polyfill.mjs";

// Correct import paths for Demos SDK v2.9.1
import { Demos } from "@kynesyslabs/demosdk/websdk";
import { Identities } from "@kynesyslabs/demosdk/abstraction";
import { Hashing, PQC, Cryptography, getUnifiedCryptoInstance } from "@kynesyslabs/demosdk/encryption";

// Available Demos nodes (with failover)
const DEMOS_NODES = [
  "https://demosnode.discus.sh/",
  "https://dev.node2.demos.sh/",
  "https://node2.demos.sh/"
];

/**
 * Create and connect a Demos instance with automatic failover
 * @param {string} [mnemonic] - Optional mnemonic to connect wallet
 * @returns {Promise<Demos>} Connected Demos instance
 */
export async function createDemos(mnemonic = null) {
  const demos = new Demos();

  // Try each node until one works
  let connected = false;
  let lastError = null;

  for (const nodeUrl of DEMOS_NODES) {
    try {
      console.log(`Connecting to ${nodeUrl}...`);
      await demos.connect(nodeUrl);
      console.log(`✅ Connected to ${nodeUrl}`);
      connected = true;
      break;
    } catch (e) {
      console.log(`❌ Failed: ${e.message}`);
      lastError = e;
    }
  }

  if (!connected) {
    throw new Error(`Could not connect to any Demos node. Last error: ${lastError?.message}`);
  }

  // Connect wallet if mnemonic provided
  if (mnemonic) {
    await demos.connectWallet(mnemonic);
    console.log(`✅ Wallet connected: ${demos.getAddress().slice(0, 20)}...`);
  }

  return demos;
}

/**
 * Create a new Demos wallet
 * @returns {Promise<{demos: Demos, mnemonic: string, address: string}>}
 */
export async function createNewWallet() {
  const demos = new Demos();
  const mnemonic = demos.newMnemonic();

  // Connect to network
  await createDemos(); // This connects demos internally
  await demos.connectWallet(mnemonic);

  return {
    demos,
    mnemonic,
    address: demos.getAddress()
  };
}

// Export SDK modules for convenience
export { Demos, Identities, Hashing, PQC, Cryptography, getUnifiedCryptoInstance };
export { DEMOS_NODES };
```

## Step 5: Running Scripts

**CRITICAL**: Always run with the experimental flag:

```bash
node --experimental-specifier-resolution=node your-script.mjs
```

Or create an npm script in `package.json`:

```json
{
  "scripts": {
    "start": "node --experimental-specifier-resolution=node index.mjs",
    "test": "node --experimental-specifier-resolution=node test.mjs"
  }
}
```

## Step 6: Health Check Script

Create this script to verify your setup:

**`health-check.mjs`**
```javascript
// health-check.mjs
// Verify Demos SDK environment is correctly configured

import "./demos-polyfill.mjs";
import { createDemos, Hashing, Demos } from "./demos-helper.mjs";

console.log("╔════════════════════════════════════════════════════════╗");
console.log("║        DEMOS SDK ENVIRONMENT HEALTH CHECK              ║");
console.log("╚════════════════════════════════════════════════════════╝\n");

const checks = [];

function check(name, passed, details = "") {
  const icon = passed ? "✅" : "❌";
  console.log(`${icon} ${name} ${details}`);
  checks.push({ name, passed });
}

try {
  // Check 1: Crypto polyfill
  check("Crypto polyfill", globalThis.crypto !== undefined);

  // Check 2: Wallet creation (offline)
  const demos = new Demos();
  const mnemonic = demos.newMnemonic();
  check("Wallet creation", mnemonic.split(" ").length === 12, "(12 words)");

  // Check 3: Hashing
  const hash = Hashing.sha256("test");
  check("Hashing", hash.length === 64, "(SHA256)");

  // Check 4: Network connection
  try {
    await createDemos();
    check("Network connection", true);
  } catch (e) {
    check("Network connection", false, `(${e.message})`);
  }

  // Summary
  const passed = checks.filter(c => c.passed).length;
  console.log("\n" + "═".repeat(50));
  console.log(`RESULT: ${passed}/${checks.length} checks passed`);

  if (passed === checks.length) {
    console.log("\n🎉 Environment is ready! You can now run any Demos SDK skill.");
  } else {
    console.log("\n⚠️  Some checks failed. Review the errors above.");
  }

} catch (e) {
  console.error("\n❌ FATAL ERROR:", e.message);
  console.error(e.stack);
}

process.exit(0);
```

Run it:
```bash
node --experimental-specifier-resolution=node health-check.mjs
```

## Quick Start Template

Use this template for any new Demos SDK script:

**`template.mjs`**
```javascript
// template.mjs - Demos SDK Script Template
import "./demos-polyfill.mjs";
import { createDemos, Hashing, Identities } from "./demos-helper.mjs";

async function main() {
  // Create connected Demos instance
  const demos = await createDemos();

  // Or with existing wallet:
  // const demos = await createDemos("your twelve word mnemonic here");

  // Your code here...
  const blockNumber = await demos.getLastBlockNumber();
  console.log("Current block:", blockNumber);
}

main().catch(console.error);
```

## File Structure

After setup, your project should look like:

```
my-demos-project/
├── package.json          # With "type": "module"
├── demos-polyfill.mjs    # Crypto polyfill
├── demos-helper.mjs      # SDK helper with failover
├── health-check.mjs      # Environment verification
├── template.mjs          # Script template
└── node_modules/
    └── @kynesyslabs/demosdk/
```

## Troubleshooting

### Error: `ERR_UNSUPPORTED_DIR_IMPORT`
**Cause**: Node.js ESM doesn't support directory imports in the SDK
**Fix**: Always use `--experimental-specifier-resolution=node` flag

### Error: `crypto.getRandomValues must be defined`
**Cause**: Missing crypto polyfill
**Fix**: Import `demos-polyfill.mjs` at the top of your script

### Error: `Cannot find module '@kynesyslabs/demosdk/websdk'`
**Cause**: SDK not installed or wrong import path
**Fix**:
```bash
npm install @kynesyslabs/demosdk@2.9.1
```

### Error: `Request failed with status code 502`
**Cause**: Demos network nodes are down
**Fix**: Wait for network to recover, or check https://demos.sh/ for status

## Correct Import Reference

| Module | Correct Import |
|--------|----------------|
| Core SDK | `import { Demos } from "@kynesyslabs/demosdk/websdk"` |
| Identities | `import { Identities } from "@kynesyslabs/demosdk/abstraction"` |
| Hashing | `import { Hashing } from "@kynesyslabs/demosdk/encryption"` |
| PQC | `import { PQC } from "@kynesyslabs/demosdk/encryption"` |
| Cryptography | `import { Cryptography } from "@kynesyslabs/demosdk/encryption"` |
| UnifiedCrypto | `import { getUnifiedCryptoInstance } from "@kynesyslabs/demosdk/encryption"` |
| XM SDK (EVM) | `import { EVM } from "@kynesyslabs/demosdk/xm-websdk"` |
| XM SDK (Solana) | `import { Solana } from "@kynesyslabs/demosdk/xm-websdk"` |
| Bridge | `import { RubicService } from "@kynesyslabs/demosdk/bridge"` |
| DemosWork | `import { DemosWork, WorkStep, BaseOperation } from "@kynesyslabs/demosdk/demoswork"` |

## Next Steps

Once your environment passes the health check, you can proceed to any other skill:

- [Cross-Chain Transfers](./cross-chain-transfers.md)
- [DAHR Web2 Attestation](./dahr-web2-attestation.md)
- [DemosWork Workflows](./demoswork-workflows.md)
- [Unified Crypto](./unified-crypto.md)
- [PQC Enigma](./pqc-enigma.md)
- And more...

---

**Version**: 1.0.0
**SDK Version**: @kynesyslabs/demosdk@2.9.1
**Last Updated**: 2024-02-03
