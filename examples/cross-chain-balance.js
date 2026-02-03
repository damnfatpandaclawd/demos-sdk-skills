/**
 * Example: Check balances across multiple EVM chains
 * 
 * This demonstrates using the XM SDK to query wallet balances
 * on multiple chains simultaneously.
 */

const { EVM } = require('@kynesyslabs/demosdk/xm-websdk');

// RPC endpoints for different chains
const CHAINS = {
  ethereum: 'https://eth.llamarpc.com',
  base: 'https://mainnet.base.org',
  polygon: 'https://polygon-rpc.com',
  arbitrum: 'https://arb1.arbitrum.io/rpc',
  optimism: 'https://mainnet.optimism.io'
};

async function getMultiChainBalances(privateKey) {
  const balances = {};
  
  for (const [chain, rpc] of Object.entries(CHAINS)) {
    try {
      const evm = await EVM.create(rpc);
      await evm.connectWallet(privateKey);
      
      const address = evm.getAddress();
      const balance = await evm.getBalance(address);
      
      balances[chain] = {
        address,
        balance: balance + ' ETH',
        connected: true
      };
      
      await evm.disconnect();
    } catch (error) {
      balances[chain] = {
        connected: false,
        error: error.message
      };
    }
  }
  
  return balances;
}

// Usage (if running directly)
if (require.main === module) {
  const privateKey = process.env.PRIVATE_KEY;
  if (!privateKey) {
    console.error('Set PRIVATE_KEY environment variable');
    process.exit(1);
  }
  
  getMultiChainBalances(privateKey)
    .then(balances => {
      console.log('\nMulti-Chain Balances:');
      console.log('='.repeat(50));
      for (const [chain, data] of Object.entries(balances)) {
        if (data.connected) {
          console.log(`${chain.padEnd(12)} | ${data.balance}`);
        } else {
          console.log(`${chain.padEnd(12)} | ERROR: ${data.error}`);
        }
      }
    })
    .catch(console.error);
}

module.exports = { getMultiChainBalances, CHAINS };
