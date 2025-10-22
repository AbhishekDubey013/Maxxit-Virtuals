import type { NextApiRequest, NextApiResponse } from 'next';
import { PrismaClient } from '@prisma/client';
import { createACPService, isACPEnabled } from '@/lib/acp-service';

const prisma = new PrismaClient();

/**
 * POST /api/acp/subscribe
 * Subscribe a user to an agent via ACP
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

    const { deploymentId, userWallet } = req.body;

    if (!deploymentId || !userWallet) {
      return res.status(400).json({ error: 'deploymentId and userWallet are required' });
    }

    // Get deployment details
    const deployment = await prisma.agentDeployment.findUnique({
      where: { id: deploymentId },
      include: { agent: true },
    });

    if (!deployment) {
      return res.status(404).json({ error: 'Deployment not found' });
    }

    if (!deployment.agent.acpEnabled) {
      return res.status(400).json({ 
        error: 'Agent does not have ACP enabled',
      });
    }

    if (!deployment.agent.acpServiceId) {
      return res.status(400).json({ 
        error: 'Agent is not registered with ACP. Please register first.',
      });
    }

    // Subscribe via ACP
    const acpService = createACPService();
    const result = await acpService.subscribeToAgent({
      serviceId: deployment.agent.acpServiceId,
      userWallet,
      deploymentId,
    });

    if (!result.success) {
      return res.status(500).json({ 
        error: 'Failed to subscribe via ACP',
        details: result.error,
      });
    }

    return res.status(200).json({
      success: true,
      message: 'Subscription successful',
      txHash: result.txHash,
    });
  } catch (error: any) {
    console.error('[API /acp/subscribe] Error:', error);
    return res.status(500).json({ error: error.message || 'Internal server error' });
  }
}

