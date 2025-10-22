import type { NextApiRequest, NextApiResponse } from 'next';
import { PrismaClient } from '@prisma/client';
import { createACPService, isACPEnabled } from '@/lib/acp-service';

const prisma = new PrismaClient();

/**
 * GET /api/acp/agent-stats?agentId=xxx
 * Get ACP statistics for an agent
 */
export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { agentId } = req.query;

    if (!agentId || typeof agentId !== 'string') {
      return res.status(400).json({ error: 'agentId query parameter is required' });
    }

    // Get agent details
    const agent = await prisma.agent.findUnique({
      where: { id: agentId },
      include: {
        deployments: {
          select: {
            id: true,
            userWallet: true,
            status: true,
          },
        },
      },
    });

    if (!agent) {
      return res.status(404).json({ error: 'Agent not found' });
    }

    // Get billing stats from DB
    const billingStats = await prisma.billingEvent.groupBy({
      by: ['kind'],
      where: {
        deployment: {
          agentId: agentId,
        },
        status: 'CHARGED',
      },
      _sum: {
        amount: true,
      },
      _count: true,
    });

    const stats = {
      acpEnabled: agent.acpEnabled,
      acpServiceId: agent.acpServiceId,
      subscriptionFee: Number(agent.subscriptionFee) || 20,
      profitShareBps: agent.profitShareBps || 1000,
      totalSubscribers: agent.deployments.filter(d => d.status === 'ACTIVE').length,
      totalRevenue: billingStats.reduce((sum, stat) => sum + Number(stat._sum.amount || 0), 0),
      revenueBreakdown: billingStats.map(stat => ({
        kind: stat.kind,
        total: Number(stat._sum.amount || 0),
        count: stat._count,
      })),
    };

    // Get on-chain stats if ACP is enabled
    if (isACPEnabled() && agent.acpServiceId) {
      const acpService = createACPService();
      const onChainStats = await acpService.getServiceDetails(agent.acpServiceId);
      
      if (onChainStats) {
        return res.status(200).json({
          ...stats,
          onChain: onChainStats,
        });
      }
    }

    return res.status(200).json(stats);
  } catch (error: any) {
    console.error('[API /acp/agent-stats] Error:', error);
    return res.status(500).json({ error: error.message || 'Internal server error' });
  }
}

