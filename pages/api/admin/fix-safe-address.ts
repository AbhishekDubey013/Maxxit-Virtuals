import type { NextApiRequest, NextApiResponse } from 'next';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const deploymentId = '35c4f2d1-318c-420a-b3b0-abbd8bf847ff';
    const correctSafeAddress = '0x9A85f7140776477F1A79Ea29b7A32495636f5e20';
    const correctModuleAddress = '0x74437d894C8E8A5ACf371E10919c688ae79E89FA';

    const updated = await prisma.agentDeployment.update({
      where: { id: deploymentId },
      data: {
        safeWallet: correctSafeAddress,
        moduleAddress: correctModuleAddress,
      },
      include: {
        agent: true,
      },
    });

    return res.status(200).json({
      success: true,
      message: 'Safe address updated successfully',
      deployment: {
        id: updated.id,
        agent: updated.agent.name,
        oldSafe: '0xE9ECBddB6308036f5470826A1fdfc734cFE866b1',
        newSafe: updated.safeWallet,
        module: updated.moduleAddress,
      },
    });
  } catch (error: any) {
    console.error('[API] Fix Safe address error:', error);
    return res.status(500).json({ error: error.message });
  } finally {
    await prisma.$disconnect();
  }
}

