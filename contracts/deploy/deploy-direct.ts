/**
 * Direct deployment script using ethers v5
 * No Hardhat required - just compile and deploy
 */

import { ethers } from "ethers";
import fs from "fs";
import path from "path";
import dotenv from "dotenv";

dotenv.config();

// Contract ABI and bytecode
const MAXXIT_TRADING_MODULE_JSON = {
  contractName: "MaxxitTradingModule",
  sourceName: "contracts/modules/MaxxitTradingModule.sol",
};

async function main() {
  // Get configuration from environment
  const rpcUrl = process.env.SEPOLIA_RPC || "https://ethereum-sepolia.publicnode.com";
  const privateKey = process.env.DEPLOYER_PRIVATE_KEY;
  const executorPrivateKey = process.env.EXECUTOR_PRIVATE_KEY;

  if (!privateKey) {
    throw new Error("DEPLOYER_PRIVATE_KEY not set in .env");
  }
  if (!executorPrivateKey) {
    throw new Error("EXECUTOR_PRIVATE_KEY not set in .env");
  }

  // Platform addresses
  // Fee receiver: Gets 0.2 USDC per trade (executor/platform account)
  // Profit receiver: Now passed per-trade! Each agent creator gets their own 20% profit
  // Module owner: Admin control (executor/platform)
  
  const executorWallet = new ethers.Wallet(executorPrivateKey);
  const platformFeeReceiver = executorWallet.address; // Executor gets trading fees (0.2 USDC/trade)
  const moduleOwner = executorWallet.address; // Executor is the admin

  // Connect to network
  console.log("\n🔌 Connecting to Ethereum Sepolia...");
  const provider = new ethers.providers.JsonRpcProvider(rpcUrl);
  const wallet = new ethers.Wallet(privateKey, provider);
  
  const balance = await wallet.getBalance();
  console.log(`   Deployer: ${wallet.address}`);
  console.log(`   Balance: ${ethers.utils.formatEther(balance)} ETH`);

  if (balance.lt(ethers.utils.parseEther("0.05"))) {
    console.log("\n⚠️  WARNING: Low balance! Get more Sepolia ETH from https://sepoliafaucet.com\n");
  }

  // USDC address for Sepolia
  const USDC_ADDRESS = "0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238";

  console.log("\n📋 Deployment Configuration:");
  console.log(`   Network: Ethereum Sepolia (Chain ID: 11155111)`);
  console.log(`   USDC: ${USDC_ADDRESS}`);
  console.log(`   Fee Receiver (0.2 USDC/trade): ${platformFeeReceiver}`);
  console.log(`   Profit Receiver: Dynamic per agent creator! ✨`);
  console.log(`   Module Owner (admin): ${moduleOwner}`);
  console.log(`   Executor (gas sponsor): ${executorWallet.address}`);

  // Manually compile contracts using solc
  console.log("\n🔨 Compiling contracts...");
  
  const solc = await import("solc");
  
  // Read contract source
  const contractPath = path.join(process.cwd(), "contracts/modules/MaxxitTradingModule.sol");
  const source = fs.readFileSync(contractPath, "utf8");

  // Read interface files
  const safeInterfacePath = path.join(process.cwd(), "contracts/interfaces/ISafe.sol");
  const erc20InterfacePath = path.join(process.cwd(), "contracts/interfaces/IERC20.sol");
  const safeInterfaceSource = fs.readFileSync(safeInterfacePath, "utf8");
  const erc20InterfaceSource = fs.readFileSync(erc20InterfacePath, "utf8");

  // Compile
  const input = {
    language: "Solidity",
    sources: {
      "contracts/modules/MaxxitTradingModule.sol": { content: source },
      "contracts/interfaces/ISafe.sol": { content: safeInterfaceSource },
      "contracts/interfaces/IERC20.sol": { content: erc20InterfaceSource },
    },
    settings: {
      optimizer: {
        enabled: true,
        runs: 200,
      },
      outputSelection: {
        "*": {
          "*": ["abi", "evm.bytecode"],
        },
      },
    },
  };

  const output = JSON.parse(solc.default.compile(JSON.stringify(input)));

  if (output.errors) {
    const errors = output.errors.filter((e: any) => e.severity === "error");
    if (errors.length > 0) {
      console.error("\n❌ Compilation errors:");
      errors.forEach((error: any) => console.error(error.formattedMessage));
      process.exit(1);
    }
  }

  const contract = output.contracts["contracts/modules/MaxxitTradingModule.sol"]["MaxxitTradingModule"];
  const abi = contract.abi;
  const bytecode = contract.evm.bytecode.object;

  console.log("   ✅ Contracts compiled successfully!");

  // Deploy
  console.log("\n🚀 Deploying MaxxitTradingModule...");
  
  const factory = new ethers.ContractFactory(abi, bytecode, wallet);
  
  const deploymentTx = factory.getDeployTransaction(
    platformFeeReceiver,
    USDC_ADDRESS,
    moduleOwner
  );

  // Estimate gas
  const gasEstimate = await provider.estimateGas({
    ...deploymentTx,
    from: wallet.address,
  });
  const gasPrice = await provider.getGasPrice();
  const deploymentCost = gasEstimate.mul(gasPrice);

  console.log(`   Estimated gas: ${gasEstimate.toString()}`);
  console.log(`   Gas price: ${ethers.utils.formatUnits(gasPrice, "gwei")} gwei`);
  console.log(`   Estimated cost: ${ethers.utils.formatEther(deploymentCost)} ETH`);

  console.log("\n   Sending transaction...");
  const tx = await wallet.sendTransaction(deploymentTx);
  console.log(`   TX hash: ${tx.hash}`);
  console.log(`   Waiting for confirmation...`);

  const receipt = await tx.wait();
  const moduleAddress = receipt.contractAddress;

  console.log("\n✅ DEPLOYMENT SUCCESSFUL!");
  console.log(`\n📍 MaxxitTradingModule deployed at: ${moduleAddress}`);
  console.log(`\n🔍 View on Etherscan: https://sepolia.etherscan.io/address/${moduleAddress}`);

  // Save deployment info
  const deploymentInfo = {
    network: "sepolia",
    chainId: 11155111,
    moduleAddress,
    deployer: wallet.address,
    txHash: tx.hash,
    blockNumber: receipt.blockNumber,
    gasUsed: receipt.gasUsed.toString(),
    timestamp: new Date().toISOString(),
    config: {
      usdc: USDC_ADDRESS,
      platformFeeReceiver,
      moduleOwner,
      profitReceiverNote: "Profit receiver is passed per-trade - each agent creator gets their 20% share",
    },
  };

  const deploymentsDir = path.join(process.cwd(), "deployments");
  if (!fs.existsSync(deploymentsDir)) {
    fs.mkdirSync(deploymentsDir, { recursive: true });
  }

  const deploymentFile = path.join(deploymentsDir, "sepolia-module.json");
  fs.writeFileSync(deploymentFile, JSON.stringify(deploymentInfo, null, 2));

  console.log(`\n💾 Deployment info saved to: ${deploymentFile}`);

  console.log("\n\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
  console.log("🎯 NEXT STEPS:");
  console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n");
  console.log(`1. Save the module address: ${moduleAddress}`);
  console.log(`\n2. Go to Safe UI: https://app.safe.global`);
  console.log(`   - Open your Safe: ${process.env.SAFE_WALLET_ADDRESS}`);
  console.log(`   - Apps → Transaction Builder`);
  console.log(`   - enableModule(${moduleAddress})`);
  console.log(`\n3. Update your .env file:`);
  console.log(`   MODULE_ADDRESS=${moduleAddress}`);
  console.log("\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n");
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error("\n❌ Deployment failed:");
    console.error(error);
    process.exit(1);
  });
