# Smart Contract Agent Skill

> **⚠️ Prerequisites**: Complete [SDK Setup](./00-sdk-setup.md) first to configure your environment.

Build agents that interact with and manage smart contracts on Demos Network.

## Overview

Smart Contract operations enable agents to deploy, call, and manage on-chain programs. Essential for DeFi integrations, automated contract interactions, and building programmable agents.

## SDK Reference

```typescript
import { Demos } from "@kynesyslabs/demosdk/websdk"

// Contract Methods
demos.deployContract(bytecode, constructorArgs)   // Deploy contract
demos.callContract(address, method, args)         // Call contract method
demos.estimateContractGas(address, method, args)  // Estimate gas
demos.getContractState(address)                   // Read contract state
demos.encodeContractCall(abi, method, args)       // Encode call data
demos.decodeContractResult(abi, method, data)     // Decode result
```

## Agent Use Cases

### 1. Contract Deployer Agent

Deploy and initialize contracts:

```typescript
class ContractDeployerAgent {
  private demos: Demos

  async deployContract(
    bytecode: string,
    abi: ContractABI,
    constructorArgs: any[]
  ): Promise<DeploymentResult> {
    // Encode constructor arguments
    const initData = this.encodeConstructorArgs(abi, constructorArgs)

    // Estimate deployment cost
    const gasEstimate = await this.demos.estimateContractGas(
      null, // No address for deployment
      "constructor",
      { bytecode, initData }
    )

    // Deploy contract
    const tx = await this.demos.deployContract(bytecode + initData)
    const result = await this.demos.insertTransaction(tx)

    // Wait for deployment
    const receipt = await this.waitForReceipt(result.hash)

    return {
      contractAddress: receipt.contractAddress,
      deploymentTxHash: result.hash,
      gasUsed: receipt.gasUsed,
      deployer: await this.demos.wallet.getAddress()
    }
  }

  async deployWithProxy(
    implementationBytecode: string,
    proxyBytecode: string,
    initArgs: any[]
  ): Promise<ProxyDeployment> {
    // Deploy implementation
    const impl = await this.deployContract(implementationBytecode, [], [])

    // Deploy proxy pointing to implementation
    const proxy = await this.deployContract(
      proxyBytecode,
      [],
      [impl.contractAddress, this.encodeInitCall(initArgs)]
    )

    return {
      proxyAddress: proxy.contractAddress,
      implementationAddress: impl.contractAddress,
      adminAddress: await this.demos.wallet.getAddress()
    }
  }
}
```

### 2. Contract Interaction Agent

Execute contract methods:

```typescript
class ContractInteractionAgent {
  private demos: Demos
  private contracts: Map<string, ContractInstance> = new Map()

  async loadContract(
    address: string,
    abi: ContractABI
  ): Promise<ContractInstance> {
    const instance: ContractInstance = {
      address,
      abi,
      read: {},
      write: {}
    }

    // Generate read methods
    for (const method of abi.filter(m => m.stateMutability === "view")) {
      instance.read[method.name] = async (...args: any[]) => {
        return await this.callReadMethod(address, abi, method.name, args)
      }
    }

    // Generate write methods
    for (const method of abi.filter(m => m.stateMutability !== "view")) {
      instance.write[method.name] = async (...args: any[]) => {
        return await this.callWriteMethod(address, abi, method.name, args)
      }
    }

    this.contracts.set(address, instance)
    return instance
  }

  private async callReadMethod(
    address: string,
    abi: ContractABI,
    method: string,
    args: any[]
  ): Promise<any> {
    const encoded = this.demos.encodeContractCall(abi, method, args)
    const result = await this.demos.callContract(address, encoded)
    return this.demos.decodeContractResult(abi, method, result)
  }

  private async callWriteMethod(
    address: string,
    abi: ContractABI,
    method: string,
    args: any[]
  ): Promise<TransactionResult> {
    const encoded = this.demos.encodeContractCall(abi, method, args)
    const tx = await this.demos.prepareContractCall(address, encoded)
    return await this.demos.insertTransaction(tx)
  }

  async batchContractCalls(
    calls: ContractCall[]
  ): Promise<BatchCallResult[]> {
    const results: BatchCallResult[] = []

    for (const call of calls) {
      const contract = this.contracts.get(call.contractAddress)
      if (!contract) {
        results.push({ success: false, error: "Contract not loaded" })
        continue
      }

      try {
        const result = call.isRead
          ? await contract.read[call.method](...call.args)
          : await contract.write[call.method](...call.args)
        results.push({ success: true, result })
      } catch (error) {
        results.push({ success: false, error: error.message })
      }
    }

    return results
  }
}
```

### 3. Contract Monitor Agent

Monitor contract events and state:

```typescript
class ContractMonitorAgent {
  private demos: Demos

  async monitorEvents(
    contractAddress: string,
    eventName: string,
    callback: (event: ContractEvent) => void
  ): Promise<string> {
    return await this.demos.subscribeToContractEvents(
      contractAddress,
      eventName,
      (event) => {
        callback({
          name: event.name,
          args: event.args,
          blockNumber: event.blockNumber,
          txHash: event.transactionHash,
          timestamp: Date.now()
        })
      }
    )
  }

  async watchStateChanges(
    contractAddress: string,
    stateKey: string,
    interval: number = 10000
  ): Promise<StateWatcher> {
    let previousValue: any = null

    const watcher = setInterval(async () => {
      const currentValue = await this.demos.getContractState(contractAddress, stateKey)

      if (previousValue !== null && currentValue !== previousValue) {
        this.emit("stateChange", {
          contract: contractAddress,
          key: stateKey,
          previousValue,
          currentValue,
          timestamp: Date.now()
        })
      }

      previousValue = currentValue
    }, interval)

    return {
      stop: () => clearInterval(watcher)
    }
  }
}
```

## Best Practices

1. **Verify contracts** before interacting
2. **Estimate gas** before write operations
3. **Handle reverts** gracefully
4. **Cache ABIs** for frequently used contracts
5. **Use events** for state change detection

## Related Skills

- [Transaction Builder](./transaction-builder-agent.md) - Transaction construction
- [Event Monitoring](./event-monitoring-agent.md) - Event tracking
