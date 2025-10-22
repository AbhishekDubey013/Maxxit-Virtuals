import type { NextApiRequest, NextApiResponse } from 'next';
import { PrismaClient } from '@prisma/client';
import { classifyTweet } from '../../../lib/llm-classifier';

const prisma = new PrismaClient();

/**
 * Admin endpoint to classify all unclassified tweets
 * POST /api/admin/classify-all-tweets
 */
export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    // Get all unclassified tweets (or force re-classify all)
    const { forceAll } = req.query;
    
    const where = forceAll === 'true' 
      ? {} 
      : { isSignalCandidate: false };

    const unclassifiedTweets = await prisma.ctPost.findMany({
      where,
      orderBy: { tweetCreatedAt: 'desc' },
      take: 100, // Process up to 100 at a time
    });

    console.log(`[ClassifyAll] Found ${unclassifiedTweets.length} tweets to classify`);

    const results = [];
    let signalCount = 0;
    let nonSignalCount = 0;
    let errorCount = 0;

    for (const post of unclassifiedTweets) {
      try {
        console.log(`[ClassifyAll] Classifying: "${post.tweetText.substring(0, 60)}..."`);
        
        const classification = await classifyTweet(post.tweetText);
        
        await prisma.ctPost.update({
          where: { id: post.id },
          data: {
            isSignalCandidate: classification.isSignalCandidate,
            extractedTokens: classification.extractedTokens,
          },
        });

        if (classification.isSignalCandidate) {
          signalCount++;
          console.log(`[ClassifyAll] ✅ SIGNAL: ${classification.extractedTokens.join(', ')} - ${classification.sentiment} (${classification.confidence.toFixed(2)})`);
        } else {
          nonSignalCount++;
          console.log(`[ClassifyAll] ❌ Not a signal`);
        }

        results.push({
          tweetId: post.tweetId,
          tweetText: post.tweetText.substring(0, 80),
          isSignalCandidate: classification.isSignalCandidate,
          extractedTokens: classification.extractedTokens,
          sentiment: classification.sentiment,
          confidence: classification.confidence,
        });

        // Small delay to avoid rate limiting
        await new Promise(resolve => setTimeout(resolve, 100));
      } catch (error: any) {
        console.error(`[ClassifyAll] Error classifying ${post.id}:`, error);
        errorCount++;
      }
    }

    return res.status(200).json({
      success: true,
      processed: unclassifiedTweets.length,
      signalCount,
      nonSignalCount,
      errorCount,
      results,
      message: `Classified ${unclassifiedTweets.length} tweets: ${signalCount} signals, ${nonSignalCount} non-signals`,
    });
  } catch (error: any) {
    console.error('[ClassifyAll] Error:', error);
    return res.status(500).json({ 
      error: error.message || 'Failed to classify tweets',
    });
  }
}
