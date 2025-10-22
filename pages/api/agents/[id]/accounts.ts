import type { NextApiRequest, NextApiResponse } from 'next';
import { PrismaClient } from '@prisma/client';
import { z } from 'zod';

const prisma = new PrismaClient();

const addAccountSchema = z.object({
  ctAccountId: z.string().uuid(),
});

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  const { id } = req.query;

  if (!id || typeof id !== 'string') {
    return res.status(400).json({ error: 'Agent ID is required' });
  }

  try {
    switch (req.method) {
      case 'GET':
        return await handleGet(id, req, res);
      case 'POST':
        return await handlePost(id, req, res);
      default:
        return res.status(405).json({ error: 'Method not allowed' });
    }
  } catch (error: any) {
    console.error(`[API /agents/${id}/accounts] Error:`, error.message);
    return res.status(500).json({ error: error.message || 'Internal server error' });
  }
}

async function handleGet(agentId: string, req: NextApiRequest, res: NextApiResponse) {
  // Check if agent exists
  const agent = await prisma.agent.findUnique({
    where: { id: agentId },
  });

  if (!agent) {
    return res.status(404).json({ error: 'Agent not found' });
  }

  // Get linked accounts
  const agentAccounts = await prisma.agentAccount.findMany({
    where: { agentId },
    include: {
      ctAccount: true,
    },
  });

  return res.status(200).json(agentAccounts);
}

async function handlePost(agentId: string, req: NextApiRequest, res: NextApiResponse) {
  try {
    const validated = addAccountSchema.parse(req.body);

    // Check if agent exists
    const agent = await prisma.agent.findUnique({
      where: { id: agentId },
    });

    if (!agent) {
      return res.status(404).json({ error: 'Agent not found' });
    }

    // Check if CT account exists
    const ctAccount = await prisma.ctAccount.findUnique({
      where: { id: validated.ctAccountId },
    });

    if (!ctAccount) {
      return res.status(404).json({ error: 'CT account not found' });
    }

    // Upsert the link (create or ignore if exists)
    const agentAccount = await prisma.agentAccount.upsert({
      where: {
        agentId_ctAccountId: {
          agentId,
          ctAccountId: validated.ctAccountId,
        },
      },
      update: {},
      create: {
        agentId,
        ctAccountId: validated.ctAccountId,
      },
      include: {
        ctAccount: true,
      },
    });

    return res.status(201).json(agentAccount);
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
