const hre = require("hardhat");
const fs = require("fs");
const path = require("path");

/**
 * Deploy MaxxitTradingModule to Base
 */
async function main() {
  const [deployer] = await hre.ethers.getSigners();
  
  console.log("Deploying MaxxitTradingModule with account:", deployer.address);
  console.log("Account balance:", (await deployer.getBalance()).toString());
  
  // Configuration
  const EXECUTOR = process.env.EXECUTOR_WALLET_ADDRESS || deployer.address;
  const PLATFORM_FEE_RECEIVER = process.env.PLATFORM_FEE_RECEIVER || process.env.EXECUTOR_WALLET_ADDRESS || deployer.address;
  
  const chainId = (await hre.ethers.provider.getNetwork()).chainId;
  
  console.log("\nDeployment Configuration:");
  console.log("========================");
  console.log("Executor Address:", EXECUTOR);
  console.log("Platform Fee Receiver:", PLATFORM_FEE_RECEIVER);
  console.log("Module Owner:", deployer.address);
  console.log("Chain ID:", chainId);
  
  // Deploy
  console.log("\nDeploying MaxxitTradingModule...");
  
  const MaxxitTradingModule = await hre.ethers.getContractFactory("MaxxitTradingModule");
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
    tradeFee: "0.2 USDC per trade",
    profitShare: "20% to agent creator",
    proofOfIntent: "Enabled (gas-optimized)",
    deployedAt: new Date().toISOString(),
  };
  
  console.log("\nDeployment Info:");
  console.log(JSON.stringify(deploymentInfo, null, 2));
  
  // Wait for confirmations
  console.log("\nWaiting for 5 block confirmations...");
  await module.deployTransaction.wait(5);
  
  console.log("\n✅ Deployment complete!");
  console.log("\nNext steps:");
  console.log("1. Update .env:");
  console.log(`   TRADING_MODULE_ADDRESS=${module.address}`);
  console.log("   NEXT_PUBLIC_TRADING_MODULE_ADDRESS=${module.address}");
  console.log("\n2. Verify contract on BaseScan:");
  console.log(`   npx hardhat verify --network base ${module.address} ${EXECUTOR} ${PLATFORM_FEE_RECEIVER}`);
  
  // Save to file
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

