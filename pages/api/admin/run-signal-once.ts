import type { NextApiRequest, NextApiResponse } from 'next';
import { PrismaClient } from '@prisma/client';
import { bucket6hUtc } from '../../../lib/time-utils';

const prisma = new PrismaClient();

/**
 * Admin endpoint to trigger signal creation once for testing
 * 
 * This implements a minimal signal creation flow:
 * 1. Reads candidate ct_posts (is_signal_candidate=true)
 * 2. Gets latest market_indicators_6h
 * 3. Reads agent weights and linked agent_accounts
 * 4. Verifies venue availability in venues_status
 * 5. Inserts into signals only if no duplicate for (agent_id, token_symbol, 6h bucket)
 */
export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    console.log('[ADMIN] Running signal creation once...');

    // 1. Get candidate posts (is_signal_candidate=true)
    const candidatePosts = await prisma.ctPost.findMany({
      where: { isSignalCandidate: true },
      include: { ctAccount: true },
      orderBy: { tweetCreatedAt: 'desc' },
      take: 10,
    });

    if (candidatePosts.length === 0) {
      return res.status(200).json({ 
        message: 'No signal candidates found',
        signalsCreated: 0,
      });
    }

    const signalsCreated = [];
    
    // Stablecoins that should NOT be traded (they are the base currency)
    const EXCLUDED_TOKENS = ['USDC', 'USDT', 'DAI', 'USDC.E', 'BUSD', 'FRAX'];

    for (const post of candidatePosts) {
      // Extract tokens from the post
      for (const tokenSymbol of post.extractedTokens) {
        // Skip stablecoins - they are base currency, not trading assets
        if (EXCLUDED_TOKENS.includes(tokenSymbol.toUpperCase())) {
          console.log(`[SIGNAL] Skipping stablecoin ${tokenSymbol} - base currency only`);
          continue;
        }
        // 2. Get latest market indicators for this token
        const indicators = await prisma.marketIndicators6h.findFirst({
          where: { tokenSymbol },
          orderBy: { windowStart: 'desc' },
        });

        // 3. Find agents that monitor this CT account
        const agentLinks = await prisma.agentAccount.findMany({
          where: { ctAccountId: post.ctAccountId },
          include: { agent: true },
        });

        for (const link of agentLinks) {
          const agent = link.agent;

          // Skip non-ACTIVE agents
          if (agent.status !== 'ACTIVE') continue;

          // 4. Check venue availability
          const venueStatus = await prisma.venueStatus.findUnique({
            where: {
              venue_tokenSymbol: {
                venue: agent.venue,
                tokenSymbol,
              },
            },
          });

          if (!venueStatus) {
            console.log(`[SIGNAL] Skipping ${tokenSymbol} on ${agent.venue} - not available`);
            continue;
          }

          // 5. Check for duplicate (same agent, token, 6h bucket)
          const currentBucket = bucket6hUtc(new Date());
          const existing = await prisma.signal.findFirst({
            where: {
              agentId: agent.id,
              tokenSymbol,
              createdAt: {
                gte: currentBucket,
              },
            },
          });

          if (existing) {
            console.log(`[SIGNAL] Duplicate found for ${agent.name} - ${tokenSymbol}`);
            continue;
          }

          // Create signal with percentage-based sizing
          const signal = await prisma.signal.create({
            data: {
              agentId: agent.id,
              tokenSymbol,
              venue: agent.venue,
              side: 'LONG', // Simplified - would use sentiment analysis
              sizeModel: {
                type: 'balance-percentage',
                value: 5, // Use 5% of wallet balance per trade
                impactFactor: post.ctAccount.impactFactor,
              },
              riskModel: {
                stopLoss: 0.05,
                takeProfit: 0.15,
              },
              sourceTweets: [post.tweetId],
            },
          });

          signalsCreated.push(signal);
          console.log(`[SIGNAL] Created signal: ${agent.name} - ${tokenSymbol}`);
        }
      }
    }

    return res.status(200).json({
      message: 'Signal creation completed',
      signalsCreated: signalsCreated.length,
      signals: signalsCreated,
    });
  } catch (error: any) {
    console.error('[ADMIN] Signal creation error:', error.message);
    return res.status(500).json({ error: error.message || 'Internal server error' });
  }
}
