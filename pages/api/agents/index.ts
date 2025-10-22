import type { NextApiRequest, NextApiResponse } from 'next';
import { PrismaClient } from '@prisma/client';
import { insertAgentSchema } from '@shared/schema';
import { z } from 'zod';

const prisma = new PrismaClient();

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
    console.error('[API /agents] Error:', error.message);
    return res.status(500).json({ error: error.message || 'Internal server error' });
  }
}

async function handleGet(req: NextApiRequest, res: NextApiResponse) {
  const { status, venue, order, limit = '20', offset = '0' } = req.query;

  const where: any = {};
  if (status) where.status = status;
  if (venue) where.venue = venue;

  const orderBy: any = {};
  if (order) {
    const [field, direction] = (order as string).split('.');
    orderBy[field === 'apr_30d' ? 'apr30d' : field] = direction === 'desc' ? 'desc' : 'asc';
  } else {
    orderBy.apr30d = 'desc'; // Default sort
  }

  const agents = await prisma.agent.findMany({
    where,
    orderBy,
    take: parseInt(limit as string),
    skip: parseInt(offset as string),
  });

  return res.status(200).json(agents);
}

async function handlePost(req: NextApiRequest, res: NextApiResponse) {
  // Validate request body
  try {
    const validated = insertAgentSchema.parse(req.body);
    
    // Create agent
    const agent = await prisma.agent.create({
      data: validated,
    });

    return res.status(201).json(agent);
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
