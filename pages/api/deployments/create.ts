/**
 * Create Agent Deployment
 * Deploy an agent for a user with their Safe wallet
 */

import type { NextApiRequest, NextApiResponse } from 'next';
import { PrismaClient } from '@prisma/client';
import { createSafeWallet, getChainIdForVenue } from '../../../lib/safe-wallet';
import { ethers } from 'ethers';

const prisma = new PrismaClient();

const SEPOLIA_RPC = process.env.SEPOLIA_RPC_URL || 'https://ethereum-sepolia.publicnode.com';
const MODULE_ADDRESS = process.env.TRADING_MODULE_ADDRESS || '0x2218dD82E2bbFe759BDe741Fa419Bb8A9F658A46';

const SAFE_ABI = [
  'function isModuleEnabled(address module) external view returns (bool)',
];

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const {
      agentId,
      userWallet,
      safeWallet,
    } = req.body;

    // Validate required fields
    if (!agentId || !userWallet || !safeWallet) {
      return res.status(400).json({
        error: 'Missing required fields: agentId, userWallet, safeWallet',
      });
    }

    // Validate Ethereum addresses
    if (!isValidAddress(userWallet) || !isValidAddress(safeWallet)) {
      return res.status(400).json({
        error: 'Invalid Ethereum address format',
      });
    }

    // Check if agent exists
    const agent = await prisma.agent.findUnique({
      where: { id: agentId },
    });

    if (!agent) {
      return res.status(404).json({
        error: 'Agent not found',
      });
    }

    // Validate Safe wallet
    const chainId = getChainIdForVenue(agent.venue);
    const safeService = createSafeWallet(safeWallet, chainId);
    
    const safeValidation = await safeService.validateSafe();
    if (!safeValidation.valid) {
      return res.status(400).json({
        error: 'Safe wallet validation failed',
        reason: safeValidation.error,
      });
    }

    // Get Safe wallet info
    const safeInfo = await safeService.getSafeInfo();
    const usdcBalance = await safeService.getUSDCBalance();
    const ethBalance = await safeService.getETHBalance();

    // Check for existing deployment
    const existing = await prisma.agentDeployment.findUnique({
      where: {
        userWallet_agentId: {
          userWallet,
          agentId,
        },
      },
    });

    if (existing) {
      return res.status(400).json({
        error: 'Deployment already exists for this user and agent',
        deploymentId: existing.id,
      });
    }

    // Check module status on-chain before creating deployment
    let moduleEnabled = false;
    try {
      const provider = new ethers.providers.JsonRpcProvider(SEPOLIA_RPC);
      const safe = new ethers.Contract(safeWallet, SAFE_ABI, provider);
      moduleEnabled = await safe.isModuleEnabled(MODULE_ADDRESS);
      console.log('[CreateDeployment] Module enabled on-chain:', moduleEnabled);
    } catch (error) {
      console.error('[CreateDeployment] Error checking module status:', error);
      // Continue with deployment but moduleEnabled will be false
    }

    // Create deployment with correct module status and moduleAddress
    const deployment = await prisma.agentDeployment.create({
      data: {
        agentId,
        userWallet,
        safeWallet,
        moduleAddress: MODULE_ADDRESS, // Save module address
        moduleEnabled, // Set based on on-chain status
        status: 'ACTIVE',
        subActive: true,
        subStartedAt: new Date(),
      },
      include: {
        agent: true,
      },
    });

    return res.status(201).json({
      success: true,
      deployment: {
        id: deployment.id,
        agentId: deployment.agentId,
        agentName: deployment.agent.name,
        venue: deployment.agent.venue,
        userWallet: deployment.userWallet,
        safeWallet: deployment.safeWallet,
        status: deployment.status,
        createdAt: deployment.subStartedAt,
      },
      safeInfo: {
        address: safeInfo.address,
        owners: safeInfo.owners,
        threshold: safeInfo.threshold,
        balances: {
          usdc: usdcBalance,
          eth: ethBalance,
        },
      },
      message: 'Agent deployed successfully',
      nextSteps: [
        `Ensure your Safe wallet (${safeWallet}) has USDC for trading`,
        'Agent will automatically execute signals based on subscribed CT accounts',
        `Trading venue: ${deployment.agent.venue}`,
      ],
    });
  } catch (error: any) {
    console.error('[CreateDeployment] Error:', error);
    return res.status(500).json({
      error: error.message || 'Failed to create deployment',
    });
  }
}

function isValidAddress(address: string): boolean {
  return /^0x[a-fA-F0-9]{40}$/.test(address);
}
