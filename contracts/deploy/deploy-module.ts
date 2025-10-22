import { ethers } from "hardhat";

/**
 * Deploy MaxxitTradingModule to Base
 * 
 * ARCHITECTURE:
 * - This contract handles ALL payments (fees + profit sharing)
 * - Virtuals Protocol ACP used for agent discovery (separate)
 * - Clean separation: payments (this) vs discovery (ACP)
 * 
 * Required env vars:
 * - DEPLOYER_PRIVATE_KEY or EXECUTOR_PRIVATE_KEY: Private key for deployment
 * - EXECUTOR_WALLET_ADDRESS: Address that can execute trades
 * - PLATFORM_FEE_RECEIVER: Address to receive trade fees (0.2 USDC per trade)
 */
async function main() {
  const [deployer] = await ethers.getSigners();
  
  console.log("Deploying MaxxitTradingModule with account:", deployer.address);
  console.log("Account balance:", (await deployer.getBalance()).toString());
  
  // Configuration
  const EXECUTOR = process.env.EXECUTOR_WALLET_ADDRESS || deployer.address;
  const PLATFORM_FEE_RECEIVER = process.env.PLATFORM_FEE_RECEIVER || process.env.EXECUTOR_WALLET_ADDRESS || deployer.address;
  
  // USDC addresses
  const USDC_ADDRESSES: { [chainId: number]: string } = {
    11155111: "0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238", // Ethereum Sepolia
    8453: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913", // Base mainnet
    42161: "0xaf88d065e77c8cC2239327C5EDb3A432268e5831", // Arbitrum mainnet
    421614: "0x75faf114eafb1BDbe2F0316DF893fd58CE46AA4d", // Arbitrum Sepolia
  };
  
  const chainId = (await ethers.provider.getNetwork()).chainId;
  const USDC = USDC_ADDRESSES[Number(chainId)];
  
  if (!USDC) {
    throw new Error(`USDC address not configured for chain ID ${chainId}`);
  }
  
  console.log("\nDeployment Configuration:");
  console.log("========================");
  console.log("Executor Address:", EXECUTOR);
  console.log("Platform Fee Receiver:", PLATFORM_FEE_RECEIVER);
  console.log("Module Owner:", deployer.address);
  console.log("USDC Address:", USDC);
  console.log("Chain ID:", chainId);
  console.log("\nNOTE: This contract handles ALL payments.");
  console.log("ACP integration is for agent discovery only (off-chain).");
  
  // Deploy
  console.log("\nDeploying MaxxitTradingModule...");
  
  const MaxxitTradingModule = await ethers.getContractFactory("MaxxitTradingModule");
  const module = await MaxxitTradingModule.deploy(
    EXECUTOR,
    PLATFORM_FEE_RECEIVER
  );
  
  await module.deployed();
  
  console.log("\n✅ MaxxitTradingModule deployed to:", module.address);
  
  // Save deployment info
  const deploymentInfo = {
    address: module.address,
    chainId: Number(chainId),
    network: chainId === 8453 ? 'base' : chainId === 42161 ? 'arbitrum' : 'sepolia',
    deployer: deployer.address,
    executor: EXECUTOR,
    platformFeeReceiver: PLATFORM_FEE_RECEIVER,
    moduleOwner: deployer.address,
    usdc: USDC,
    uniswapRouter: chainId === 8453 ? '0x2626664c2603336E57B271c5C0b26F421741e481' : 'N/A',
    tradeFee: "0.2 USDC per trade",
    profitShare: "20% to agent creator",
    paymentLayer: "This contract (on-chain, trustless)",
    discoveryLayer: "Virtuals Protocol ACP (optional, off-chain)",
    deployedAt: new Date().toISOString(),
  };
  
  console.log("\nDeployment Info:");
  console.log(JSON.stringify(deploymentInfo, null, 2));
  
  // Wait for verification
  console.log("\nWaiting for block confirmations...");
  await module.deployTransaction.wait(5);
  
  console.log("\n✅ Deployment complete!");
  console.log("\nNext steps:");
  console.log("1. Verify contract on block explorer:");
  console.log(`   npx hardhat verify --network ${chainId === 8453 ? 'base' : chainId === 42161 ? 'arbitrum' : 'sepolia'} ${module.address} ${EXECUTOR} ${PLATFORM_FEE_RECEIVER}`);
  console.log("\n2. Whitelist tokens for trading:");
  console.log(`   Call: module.setTokenWhitelist(SAFE_ADDRESS, TOKEN_ADDRESS, true)`);
  console.log("\n3. Update .env with module address:");
  console.log(`   TRADING_MODULE_ADDRESS=${module.address}`);
  console.log("\n4. For ACP integration (discovery only):");
  console.log(`   Agents will be registered with Virtuals Protocol ACP`);
  console.log(`   ACP handles discovery, this contract handles payments`);
  
  // Save to file
  const fs = require('fs');
  const path = require('path');
  const deploymentsDir = path.join(__dirname, '../../deployments');
  if (!fs.existsSync(deploymentsDir)) {
    fs.mkdirSync(deploymentsDir, { recursive: true });
  }
  const filename = `base-module-${Date.now()}.json`;
  fs.writeFileSync(
    path.join(deploymentsDir, filename),
    JSON.stringify(deploymentInfo, null, 2)
  );
  console.log(`\nDeployment info saved to: deployments/${filename}`);
  
  return deploymentInfo;
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
