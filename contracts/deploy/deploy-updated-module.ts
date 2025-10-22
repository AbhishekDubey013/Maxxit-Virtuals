#!/usr/bin/env tsx
/**
 * Deploy Updated MaxxitTradingModule with approveTokenForDex function
 */

import { ethers } from 'ethers';
import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';
import dotenv from 'dotenv';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

async function deployModule() {
  console.log('🚀 Deploying Updated MaxxitTradingModule\n');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

  const privateKey = process.env.EXECUTOR_PRIVATE_KEY;
  if (!privateKey) {
    console.log('❌ EXECUTOR_PRIVATE_KEY not found');
    return;
  }

  const rpcUrl = process.env.SEPOLIA_RPC_URL || 'https://ethereum-sepolia.publicnode.com';
  const provider = new ethers.providers.JsonRpcProvider(rpcUrl);
  const deployer = new ethers.Wallet(privateKey, provider);

  console.log('Deployer:', deployer.address);
  console.log('Network: Sepolia (11155111)\n');

  // Configuration
  const USDC = '0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238';
  const PLATFORM_FEE_RECEIVER = deployer.address;
  const MODULE_OWNER = deployer.address;

  console.log('Config:');
  console.log('  USDC:', USDC);
  console.log('  Platform Fee Receiver:', PLATFORM_FEE_RECEIVER);
  console.log('  Module Owner:', MODULE_OWNER);
  console.log('');

  try {
    // Read the compiled contract
    // Note: We need to compile the contract first
    console.log('ℹ️  Contract needs to be compiled first');
    console.log('');
    console.log('Steps to deploy:');
    console.log('1. The contract has been updated with approveTokenForDex()');
    console.log('2. Compile with: npx hardhat compile (or use Remix)');
    console.log('3. Deploy manually via Remix or Hardhat');
    console.log('4. Or use the old module and manually approve USDC');
    console.log('');
    console.log('🎯 Alternative: Use Safe UI to approve USDC (faster!)');
    
  } catch (error: any) {
    console.log('❌ Error:', error.message);
  }
}

deployModule().catch(console.error);
