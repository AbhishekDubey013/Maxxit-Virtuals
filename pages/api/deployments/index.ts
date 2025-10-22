import type { NextApiRequest, NextApiResponse } from 'next';
import { PrismaClient } from '@prisma/client';
import { insertAgentDeploymentSchema } from '@shared/schema';
import { z } from 'zod';
import { relayerService } from '../../../lib/relayer';
import { ethers } from 'ethers';

const prisma = new PrismaClient();

const RPC_URLS: Record<number, string> = {
  8453: process.env.BASE_RPC_URL || 'https://mainnet.base.org',
  42161: process.env.ARBITRUM_RPC || 'https://arb1.arbitrum.io/rpc',
};

const MODULE_ADDRESS = process.env.TRADING_MODULE_ADDRESS || '0x2218dD82E2bbFe759BDe741Fa419Bb8A9F658A46';

const SAFE_ABI = [
  'function isModuleEnabled(address module) view returns (bool)',
];

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  try {
    switch (req.method) {
      case 'GET':
        return await handleGet(req, res);
      case 'POST':
        return await handlePost(req, res);
      default:
        return res.status(405).json({ error: 'Method not allowed' });
    }
  } catch (error: any) {
    console.error('[API /deployments] Error:', error.message);
    return res.status(500).json({ error: error.message || 'Internal server error' });
  }
}

async function handleGet(req: NextApiRequest, res: NextApiResponse) {
  const { agentId, userWallet } = req.query;

  // Build where clause with case-insensitive wallet matching
  const where: any = {};
  if (agentId) where.agentId = agentId;
  
  // Case-insensitive wallet matching (Ethereum addresses can be checksummed)
  if (userWallet) {
    where.userWallet = {
      equals: userWallet as string,
      mode: 'insensitive'
    };
  }

  const deployments = await prisma.agentDeployment.findMany({
    where,
    include: {
      agent: true,
      telegramUsers: {
        where: { isActive: true }
      }
    },
    orderBy: {
      subStartedAt: 'desc',
    },
  });

  // PERMANENT FIX: Check on-chain module status and auto-sync database
  const deploymentsWithStatus = await Promise.all(
    deployments.map(async (deployment) => {
      try {
        // Get correct RPC for this deployment's chain
        const chainId = deployment.chainId || 8453; // Default to Base
        const rpcUrl = RPC_URLS[chainId] || RPC_URLS[8453];
        const provider = new ethers.providers.JsonRpcProvider(rpcUrl);
        
        // Check on-chain module status
        const safeContract = new ethers.Contract(
          deployment.safeWallet,
          SAFE_ABI,
          provider
        );
        const isModuleEnabledOnChain = await safeContract.isModuleEnabled(MODULE_ADDRESS);
        
        // If database is out of sync, update it
        if (deployment.moduleEnabled !== isModuleEnabledOnChain) {
          console.log(`[Deployments API] Syncing module status for ${deployment.safeWallet}: DB=${deployment.moduleEnabled} → OnChain=${isModuleEnabledOnChain}`);
          await prisma.agentDeployment.update({
            where: { id: deployment.id },
            data: {
              moduleEnabled: isModuleEnabledOnChain,
              moduleAddress: MODULE_ADDRESS, // Ensure correct module address
            },
          });
          // Update local object
          deployment.moduleEnabled = isModuleEnabledOnChain;
          deployment.moduleAddress = MODULE_ADDRESS;
        }
        
        return {
          ...deployment,
          telegramLinked: deployment.telegramUsers.length > 0,
          moduleEnabled: isModuleEnabledOnChain, // Always use on-chain truth
        };
      } catch (error: any) {
        console.error(`[Deployments API] Error checking module status for ${deployment.safeWallet}:`, error.message);
        // Return deployment as-is if check fails
        return {
          ...deployment,
          telegramLinked: deployment.telegramUsers.length > 0,
        };
      }
    })
  );

  return res.status(200).json(deploymentsWithStatus);
}

async function handlePost(req: NextApiRequest, res: NextApiResponse) {
  try {
    const validated = insertAgentDeploymentSchema.parse(req.body);

    // Check if agent exists
    const agent = await prisma.agent.findUnique({
      where: { id: validated.agentId },
    });

    if (!agent) {
      return res.status(404).json({ error: 'Agent not found' });
    }

    // Check if agent is ACTIVE
    if (agent.status !== 'ACTIVE') {
      return res.status(400).json({ error: 'Agent must be ACTIVE to deploy' });
    }

    // Check if already deployed by this user
    const existing = await prisma.agentDeployment.findUnique({
      where: {
        userWallet_agentId: {
          userWallet: validated.userWallet,
          agentId: validated.agentId,
        },
      },
    });

    if (existing) {
      return res.status(400).json({ error: 'Agent already deployed by this user' });
    }

    // Install module on Safe wallet (stub)
    const moduleResult = await relayerService.installModule(validated.safeWallet);
    
    // Create deployment
    const deployment = await prisma.agentDeployment.create({
      data: {
        ...validated,
        status: 'ACTIVE',
        subActive: true,
      },
      include: {
        agent: true,
      },
    });

    // Log module installation to audit
    await prisma.auditLog.create({
      data: {
        eventName: 'MODULE_INSTALLED',
        subjectType: 'AgentDeployment',
        subjectId: deployment.id,
        payload: {
          safeWallet: validated.safeWallet,
          txHash: moduleResult.txHash,
        },
      },
    });

    return res.status(201).json(deployment);
  } catch (error: any) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ 
        error: 'Validation failed',
        details: error.errors,
      });
    }
    throw error;
  }
}
