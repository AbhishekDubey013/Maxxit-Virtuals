/**
 * Sync all agent deployments with on-chain module status
 * This ensures database reflects actual on-chain state
 */

import { PrismaClient } from '@prisma/client';
import { ethers } from 'ethers';

const prisma = new PrismaClient();

const RPC_URL = process.env.ARBITRUM_RPC || 'https://arb1.arbitrum.io/rpc';
const MODULE_ADDRESS = process.env.TRADING_MODULE_ADDRESS || '0x74437d894C8E8A5ACf371E10919c688ae79E89FA';

const SAFE_ABI = [
  'function isModuleEnabled(address module) external view returns (bool)',
];

export async function syncAllDeployments() {
  console.log('[SyncDeployments] Syncing all deployments with on-chain status...');
  
  try {
    const provider = new ethers.providers.JsonRpcProvider(RPC_URL);
    
    // Get all deployments that have a Safe wallet
    const deployments = await prisma.agentDeployment.findMany({
      where: {
        safeWallet: { not: '' },
      },
      include: {
        agent: true,
      },
    });

    if (deployments.length === 0) {
      console.log('[SyncDeployments] No deployments to sync');
      return { synced: 0, updated: 0 };
    }

    console.log(`[SyncDeployments] Found ${deployments.length} deployment(s) to check`);

    let syncedCount = 0;
    let updatedCount = 0;

    for (const deployment of deployments) {
      if (!deployment.safeWallet) continue;

      try {
        // Check on-chain status
        const safe = new ethers.Contract(deployment.safeWallet, SAFE_ABI, provider);
        const isEnabledOnChain = await safe.isModuleEnabled(MODULE_ADDRESS);

        syncedCount++;

        // Update if status differs
        if (deployment.moduleEnabled !== isEnabledOnChain) {
          console.log(`[SyncDeployments] ${deployment.agent.name}: DB=${deployment.moduleEnabled} OnChain=${isEnabledOnChain} - Updating...`);
          
          await prisma.agentDeployment.update({
            where: { id: deployment.id },
            data: { moduleEnabled: isEnabledOnChain },
          });

          updatedCount++;
        }
      } catch (error: any) {
        console.error(`[SyncDeployments] Error checking ${deployment.safeWallet}:`, error.message);
      }
    }

    console.log(`[SyncDeployments] ✅ Complete: ${syncedCount} checked, ${updatedCount} updated\n`);

    return { synced: syncedCount, updated: updatedCount };

  } catch (error: any) {
    console.error('[SyncDeployments] Fatal error:', error);
    throw error;
  }
}

// Run if executed directly
if (require.main === module) {
  syncAllDeployments()
    .then(result => {
      console.log(`Result:`, result);
      process.exit(0);
    })
    .catch(error => {
      console.error('Fatal error:', error);
      process.exit(1);
    })
    .finally(() => {
      prisma.$disconnect();
    });
}

