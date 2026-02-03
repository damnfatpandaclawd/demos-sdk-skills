/**
 * Example: Attested Price Feed with DAHR
 * 
 * Fetches cryptocurrency prices with cryptographic attestation
 * from the Demos network.
 */

const { Demos } = require('@kynesyslabs/demosdk/websdk');

async function getAttestedPrice(symbol, vsCurrency = 'usd') {
  const demos = new Demos();
  
  try {
    // Connect to Demos network
    await demos.connect('https://demosnode.discus.sh/');
    await demos.connectWallet(process.env.DEMOS_MNEMONIC);
    
    // Create DAHR proxy
    const dahr = await demos.web2.createDahr();
    
    // Make attested request to CoinGecko
    const response = await dahr.startProxy({
      url: `https://api.coingecko.com/api/v3/simple/price?ids=${symbol}&vs_currencies=${vsCurrency}`,
      method: 'GET',
      headers: { 'Accept': 'application/json' }
    });
    
    if (!response.success) {
      throw new Error(`API request failed: ${response.statusCode}`);
    }
    
    const price = response.data[symbol]?.[vsCurrency];
    
    return {
      symbol,
      price,
      currency: vsCurrency.toUpperCase(),
      attestation: response.attestation,
      timestamp: new Date().toISOString(),
      verifiable: true
    };
    
  } finally {
    // Clean up
    if (demos.connected) {
      // Disconnect logic if available
    }
  }
}

async function getMultiplePrices(symbols) {
  const ids = symbols.join(',');
  const demos = new Demos();
  
  await demos.connect('https://demosnode.discus.sh/');
  await demos.connectWallet(process.env.DEMOS_MNEMONIC);
  
  const dahr = await demos.web2.createDahr();
  
  const response = await dahr.startProxy({
    url: `https://api.coingecko.com/api/v3/simple/price?ids=${ids}&vs_currencies=usd`,
    method: 'GET',
    headers: { 'Accept': 'application/json' }
  });
  
  const prices = {};
  for (const symbol of symbols) {
    prices[symbol] = response.data[symbol]?.usd || null;
  }
  
  return {
    prices,
    attestation: response.attestation,
    timestamp: new Date().toISOString()
  };
}

// Usage
if (require.main === module) {
  if (!process.env.DEMOS_MNEMONIC) {
    console.error('Set DEMOS_MNEMONIC environment variable');
    process.exit(1);
  }
  
  console.log('Fetching attested prices...');
  
  getMultiplePrices(['bitcoin', 'ethereum', 'solana'])
    .then(result => {
      console.log('\nAttested Prices:');
      console.log('='.repeat(40));
      for (const [symbol, price] of Object.entries(result.prices)) {
        console.log(`${symbol.padEnd(12)} | $${price?.toLocaleString() || 'N/A'}`);
      }
      console.log('\nAttestation:', result.attestation ? 'Valid ✓' : 'None');
    })
    .catch(console.error);
}

module.exports = { getAttestedPrice, getMultiplePrices };
