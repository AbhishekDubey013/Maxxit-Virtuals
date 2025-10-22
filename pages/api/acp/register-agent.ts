import type { NextApiRequest, NextApiResponse } from 'next';
import { PrismaClient } from '@prisma/client';
import { createACPService, isACPEnabled } from '@/lib/acp-service';

const prisma = new PrismaClient();

/**
 * POST /api/acp/register-agent
 * Register an agent with ACP for monetization
 */
export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    if (!isACPEnabled()) {
      return res.status(503).json({ 
        error: 'ACP is not enabled. Please configure ACP_CONTRACT_ADDRESS in environment variables.' 
      });
    }

    const { agentId } = req.body;

    if (!agentId) {
      return res.status(400).json({ error: 'agentId is required' });
    }

    // Get agent details
    const agent = await prisma.agent.findUnique({
      where: { id: agentId },
    });

    if (!agent) {
      return res.status(404).json({ error: 'Agent not found' });
    }

    if (agent.acpEnabled) {
      return res.status(400).json({ 
        error: 'Agent is already registered with ACP',
        acpServiceId: agent.acpServiceId,
      });
    }

    // Register with ACP
    const acpService = createACPService();
    const result = await acpService.registerAgent({
      agentId: agent.id,
      creatorWallet: agent.creatorWallet,
      subscriptionFee: Number(agent.subscriptionFee) || 20,
      profitShareBps: agent.profitShareBps || 1000,
    });

    if (!result.success) {
      return res.status(500).json({ 
        error: 'Failed to register agent with ACP',
        details: result.error,
      });
    }

    return res.status(200).json({
      success: true,
      message: 'Agent registered with ACP successfully',
      acpServiceId: result.serviceId,
      txHash: result.txHash,
    });
  } catch (error: any) {
    console.error('[API /acp/register-agent] Error:', error);
    return res.status(500).json({ error: error.message || 'Internal server error' });
  }
}

