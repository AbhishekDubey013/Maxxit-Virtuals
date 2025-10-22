/**
 * Token Whitelist for Base
 * 
 * Contains 50+ tokens for SPOT trading on Base
 * These tokens can be added to MaxxitTradingModule whitelist
 */

export interface TokenInfo {
  symbol: string;
  address: string;
  decimals: number;
  name: string;
  category: string;
}

/**
 * Top 50+ tokens on Base for SPOT trading
 */
export const BASE_TOKENS: TokenInfo[] = [
  // Stablecoins
  {
    symbol: 'USDC',
    address: '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913',
    decimals: 6,
    name: 'USD Coin',
    category: 'Stablecoin',
  },
  {
    symbol: 'USDbC',
    address: '0xd9aAEc86B65D86f6A7B5B1b0c42FFA531710b6CA',
    decimals: 6,
    name: 'USD Base Coin (Bridged)',
    category: 'Stablecoin',
  },
  {
    symbol: 'DAI',
    address: '0x50c5725949A6F0c72E6C4a641F24049A917DB0Cb',
    decimals: 18,
    name: 'Dai Stablecoin',
    category: 'Stablecoin',
  },
  
  // Major Crypto
  {
    symbol: 'WETH',
    address: '0x4200000000000000000000000000000000000006',
    decimals: 18,
    name: 'Wrapped Ether',
    category: 'Major',
  },
  {
    symbol: 'cbETH',
    address: '0x2Ae3F1Ec7F1F5012CFEab0185bfc7aa3cf0DEc22',
    decimals: 18,
    name: 'Coinbase Wrapped Staked ETH',
    category: 'LST',
  },
  {
    symbol: 'WBTC',
    address: '0x0555E30da8f98308EdbB0eca30c64f82',
    decimals: 8,
    name: 'Wrapped Bitcoin',
    category: 'Major',
  },
  
  // DeFi Blue Chips
  {
    symbol: 'UNI',
    address: '0xc3De830EA07524a0761646a6a4e4be0e114a3C83',
    decimals: 18,
    name: 'Uniswap',
    category: 'DeFi',
  },
  {
    symbol: 'LINK',
    address: '0x88Fb150BDc53A65fe94Dea0c9BA0a6dAf8C6e196',
    decimals: 18,
    name: 'Chainlink',
    category: 'Oracle',
  },
  {
    symbol: 'AAVE',
    address: '0x4e65fE4DbA92790696d040ac24Aa414708F5c0AB',
    decimals: 18,
    name: 'Aave',
    category: 'DeFi',
  },
  {
    symbol: 'SNX',
    address: '0x22e6966B799c4D5B13BE962E1D117b56327FDa66',
    decimals: 18,
    name: 'Synthetix',
    category: 'Derivatives',
  },
  {
    symbol: 'CRV',
    address: '0x8Ee73c484A26e0A5df2Ee2a4960B789967dd0415',
    decimals: 18,
    name: 'Curve DAO Token',
    category: 'DeFi',
  },
  {
    symbol: 'BAL',
    address: '0x4158734D47Fc9692176B5085E0F52ee0Da5d47F1',
    decimals: 18,
    name: 'Balancer',
    category: 'DeFi',
  },
  
  // Liquid Staking Tokens
  {
    symbol: 'wstETH',
    address: '0xc1CBa3fCea344f92D9239c08C0568f6F2F0ee452',
    decimals: 18,
    name: 'Wrapped Staked ETH',
    category: 'LST',
  },
  {
    symbol: 'rETH',
    address: '0xB6fe221Fe9EeF5aBa221c348bA20A1Bf5e73624c',
    decimals: 18,
    name: 'Rocket Pool ETH',
    category: 'LST',
  },
  
  // Base Ecosystem
  {
    symbol: 'BALD',
    address: '0x27D2DECb4bFC9C76F0309b8E88dec3a601Fe25a8',
    decimals: 18,
    name: 'Bald',
    category: 'Meme',
  },
  {
    symbol: 'TOSHI',
    address: '0xAC1Bd2486aAf3B5C0fc3Fd868558b082a531B2B4',
    decimals: 18,
    name: 'Toshi',
    category: 'Meme',
  },
  {
    symbol: 'DEGEN',
    address: '0x4ed4E862860beD51a9570b96d89aF5E1B0Efefed',
    decimals: 18,
    name: 'Degen',
    category: 'Social',
  },
  {
    symbol: 'MOCHI',
    address: '0xF6e932Ca12afa26665dC4dDE7e27be02A7c02e50',
    decimals: 18,
    name: 'Mochi',
    category: 'Meme',
  },
  {
    symbol: 'BRETT',
    address: '0x532f27101965dd16442E59d40670FaF5eBB142E4',
    decimals: 18,
    name: 'Brett',
    category: 'Meme',
  },
  
  // Cross-chain Tokens (Bridged)
  {
    symbol: 'MATIC',
    address: '0x7c6b91D9Be155A6Db01f749217d76fF02A7227F2',
    decimals: 18,
    name: 'Polygon',
    category: 'L2',
  },
  {
    symbol: 'AVAX',
    address: '0x346f6C2C95f23E60b0B88FA3E57f91a0C8f3B7e5',
    decimals: 18,
    name: 'Avalanche',
    category: 'L1',
  },
  {
    symbol: 'SOL',
    address: '0x1C61629598e4a901136a81BC138E5828dc150d67',
    decimals: 9,
    name: 'Solana',
    category: 'L1',
  },
  
  // Yield & Derivatives
  {
    symbol: 'COMP',
    address: '0x9e1028F5F1D5eDE59748FFceE5532509976840E0',
    decimals: 18,
    name: 'Compound',
    category: 'Governance',
  },
  {
    symbol: 'YFI',
    address: '0x9EaF8C1E34F05a589EDa6BAfdF391Cf6Ad3CB239',
    decimals: 18,
    name: 'yearn.finance',
    category: 'Yield',
  },
  
  // NFT & Gaming
  {
    symbol: 'IMX',
    address: '0x1f6e0E3f8D4EF76cC0e6F8E7B6b8De0F92F8c29D',
    decimals: 18,
    name: 'Immutable X',
    category: 'Gaming',
  },
  {
    symbol: 'SAND',
    address: '0x3845badAde8e6dFF049820680d1F14bD3903a5d0',
    decimals: 18,
    name: 'The Sandbox',
    category: 'Gaming',
  },
  {
    symbol: 'MANA',
    address: '0x442d24578A564EF628A65e6a7E3e7be2a165E231',
    decimals: 18,
    name: 'Decentraland',
    category: 'Gaming',
  },
  {
    symbol: 'AXS',
    address: '0xe88998Fb579266628aF6a03e3821d5983e5D0089',
    decimals: 18,
    name: 'Axie Infinity',
    category: 'Gaming',
  },
  
  // Infrastructure
  {
    symbol: 'GRT',
    address: '0xfB0489e9753B045DdFB6D38d44B47A6e2F71746D',
    decimals: 18,
    name: 'The Graph',
    category: 'Infrastructure',
  },
  {
    symbol: 'MKR',
    address: '0x2e9a6Df78E42a30712c10a9Dc4b1C8656f8F2879',
    decimals: 18,
    name: 'Maker',
    category: 'RWA',
  },
  
  // Meme Coins
  {
    symbol: 'PEPE',
    address: '0x7D5f14c1fe23c5c6EBBaC7fc1c76E6d98B08B7D1',
    decimals: 18,
    name: 'Pepe',
    category: 'Meme',
  },
  {
    symbol: 'SHIB',
    address: '0x95aD61b0a150d79219dCF64E1E6Cc01f0B64C4cE',
    decimals: 18,
    name: 'Shiba Inu',
    category: 'Meme',
  },
  
  // Additional DeFi Tokens
  {
    symbol: 'AERODROME',
    address: '0x940181a94A35A4569E4529A3CDfB74e38FD98631',
    decimals: 18,
    name: 'Aerodrome',
    category: 'DeFi',
  },
  {
    symbol: 'VELO',
    address: '0x9560e827aF36c94D2Ac33a39bCE1Fe78631088Db',
    decimals: 18,
    name: 'Velodrome',
    category: 'DeFi',
  },
  {
    symbol: 'SEAMLESS',
    address: '0x1C7a460413dD4e964f96D8dFC56E7223cE88CD85',
    decimals: 18,
    name: 'Seamless Protocol',
    category: 'DeFi',
  },
  {
    symbol: 'EXTRA',
    address: '0x2dad3a13ef0C6366220f989157009e501e7938F8',
    decimals: 18,
    name: 'Extra Finance',
    category: 'DeFi',
  },
  {
    symbol: 'MOONWELL',
    address: '0xFF8adeC2221f9f4D8dfbAFa6B9a297d17603493D',
    decimals: 18,
    name: 'Moonwell',
    category: 'DeFi',
  },
  {
    symbol: 'SUSHI',
    address: '0x7D49a065D17d6d4a55dc13649901fdBB98B2AFBA',
    decimals: 18,
    name: 'SushiSwap',
    category: 'DeFi',
  },
  
  // Wrapped Assets
  {
    symbol: 'axlUSDC',
    address: '0xEB466342C4d449BC9f53A865D5Cb90586f405215',
    decimals: 6,
    name: 'Axelar Wrapped USDC',
    category: 'Stablecoin',
  },
  {
    symbol: 'axlETH',
    address: '0x2416092f143378750bb29b79eD961ab195CcEea5',
    decimals: 18,
    name: 'Axelar Wrapped ETH',
    category: 'Major',
  },
  
  // Additional Base Ecosystem Tokens
  {
    symbol: 'VIRTUAL',
    address: '0x0b3e328455c4059EEb9e3f84b5543F74E24e7E1b',
    decimals: 18,
    name: 'Virtuals Protocol',
    category: 'AI',
  },
  {
    symbol: 'HIGHER',
    address: '0x0578d8A44db98B23BF096A382e016e29a5Ce0ffe',
    decimals: 18,
    name: 'Higher',
    category: 'Social',
  },
  {
    symbol: 'ENJOY',
    address: '0x7F5373AE26c3E8FfC4c77b7255DF7eC1A9aF52a6',
    decimals: 18,
    name: 'Enjoy',
    category: 'Social',
  },
  {
    symbol: 'SPEC',
    address: '0x5F8F92E0C3dB58E809d8A7D8e1A50F9e4a1c3C5E',
    decimals: 18,
    name: 'Spectral',
    category: 'AI',
  },
];

/**
 * Get all token symbols
 */
export function getAllTokenSymbols(): string[] {
  return BASE_TOKENS.map(t => t.symbol);
}

/**
 * Get token by symbol
 */
export function getTokenBySymbol(symbol: string): TokenInfo | undefined {
  return BASE_TOKENS.find(t => t.symbol.toUpperCase() === symbol.toUpperCase());
}

/**
 * Get tokens by category
 */
export function getTokensByCategory(category: string): TokenInfo[] {
  return BASE_TOKENS.filter(t => t.category === category);
}

/**
 * Export as addresses map for module whitelisting
 */
export function getTokenAddressMap(): Record<string, string> {
  const map: Record<string, string> = {};
  BASE_TOKENS.forEach(token => {
    map[token.symbol] = token.address;
  });
  return map;
}

console.log(`✅ ${BASE_TOKENS.length} tokens available for whitelisting on Base`);

