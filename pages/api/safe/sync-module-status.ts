import type { NextApiRequest, NextApiResponse } from 'next';
import { PrismaClient } from '@prisma/client';
import { ethers } from 'ethers';

const prisma = new PrismaClient();

// RPC URLs for different chains
const RPC_URLS: { [chainId: number]: string } = {
  11155111: process.env.SEPOLIA_RPC || 'https://ethereum-sepolia.publicnode.com',
  42161: process.env.ARBITRUM_RPC || 'https://arb1.arbitrum.io/rpc',
  8453: process.env.BASE_RPC_URL || 'https://mainnet.base.org',
};

// Use the NEW V2 module with profit calculation fix
const MODULE_ADDRESS = process.env.TRADING_MODULE_ADDRESS || '0x2218dD82E2bbFe759BDe741Fa419Bb8A9F658A46';

const SAFE_ABI = [
  'function isModuleEnabled(address module) external view returns (bool)',
  'function getModules() external view returns (address[])',
];

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { safeAddress, chainId } = req.body;

    if (!safeAddress || !ethers.utils.isAddress(safeAddress)) {
      return res.status(400).json({
        error: 'Invalid Safe address',
      });
    }

    // Default to Arbitrum if no chainId provided
    const chain = chainId || 42161;
    const rpcUrl = RPC_URLS[chain];

    if (!rpcUrl) {
      return res.status(400).json({
        error: `Unsupported chainId: ${chain}`,
      });
    }

    console.log('[SyncModuleStatus] Checking module status for Safe:', safeAddress, 'on chain:', chain);

    // Connect to the specified chain
    const provider = new ethers.providers.JsonRpcProvider(rpcUrl);
    
    // Check if Safe exists
    const code = await provider.getCode(safeAddress);
    if (code === '0x') {
      const chainName = chain === 11155111 ? 'Sepolia' : chain === 42161 ? 'Arbitrum' : 'Base';
      return res.status(400).json({
        error: `Safe wallet not found on ${chainName}`,
        safeAddress,
        chainId: chain,
      });
    }

    // Create Safe contract instance
    const safe = new ethers.Contract(safeAddress, SAFE_ABI, provider);

    // Check if module is enabled on-chain
    let isEnabledOnChain = false;
    try {
      isEnabledOnChain = await safe.isModuleEnabled(MODULE_ADDRESS);
    } catch (error) {
      console.error('[SyncModuleStatus] Error checking module status:', error);
      return res.status(500).json({
        error: 'Failed to check module status on-chain',
      });
    }

    console.log('[SyncModuleStatus] On-chain status:', isEnabledOnChain ? 'Enabled' : 'Disabled');

    // Find deployment in database
    const deployment = await prisma.agentDeployment.findFirst({
      where: { safeWallet: safeAddress },
      include: { agent: true },
    });

    if (!deployment) {
      return res.status(404).json({
        error: 'Deployment not found for this Safe address',
        safeAddress,
        moduleEnabledOnChain: isEnabledOnChain,
      });
    }

    console.log('[SyncModuleStatus] Database status:', deployment.moduleEnabled ? 'Enabled' : 'Disabled');

    // Update database if status differs
    let updated = false;
    if (deployment.moduleEnabled !== isEnabledOnChain) {
      console.log('[SyncModuleStatus] Mismatch detected! Updating database...');
      
      await prisma.agentDeployment.update({
        where: { id: deployment.id },
        data: { moduleEnabled: isEnabledOnChain },
      });

      // Log the sync event
      await prisma.auditLog.create({
        data: {
          eventName: 'MODULE_STATUS_SYNCED',
          subjectType: 'AgentDeployment',
          subjectId: deployment.id,
          payload: {
            safeWallet: safeAddress,
            previousStatus: deployment.moduleEnabled,
            newStatus: isEnabledOnChain,
            syncedAt: new Date().toISOString(),
          },
        },
      });

      updated = true;
      console.log('[SyncModuleStatus] Database updated successfully');
    } else {
      console.log('[SyncModuleStatus] Database and blockchain already in sync');
    }

    return res.status(200).json({
      success: true,
      safeAddress,
      moduleEnabled: isEnabledOnChain,
      wasUpdated: updated,
      deployment: {
        id: deployment.id,
        agentName: deployment.agent.name,
        status: deployment.status,
      },
    });

  } catch (error: any) {
    console.error('[SyncModuleStatus] Error:', error);
    return res.status(500).json({
      error: error.message || 'Failed to sync module status',
    });
  } finally {
    await prisma.$disconnect();
  }
}
