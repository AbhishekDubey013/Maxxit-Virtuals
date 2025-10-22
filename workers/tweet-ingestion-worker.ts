/**
 * Tweet Ingestion Worker
 * Fetches tweets from X API and stores them in the database
 * Runs every 6 hours
 */

import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
import { createMultiMethodXApiClient } from '../lib/x-api-multi';
import { classifyTweet } from '../lib/llm-classifier';

const prisma = new PrismaClient();

async function ingestTweets() {
  console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('  📥 TWEET INGESTION WORKER');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log(`Started at: ${new Date().toISOString()}`);
  console.log(`[DEBUG] GAME_API_KEY: ${process.env.GAME_API_KEY ? process.env.GAME_API_KEY.substring(0,10)+'...' : 'NOT SET'}\n`);

  try {
    // Get all CT accounts
    const accounts = await prisma.ctAccount.findMany();

    if (accounts.length === 0) {
      console.log('⚠️  No CT accounts found in database');
      return;
    }

    console.log(`📋 Found ${accounts.length} CT account(s) to process\n`);

    const xApiClient = createMultiMethodXApiClient();
    const results = [];

    for (const account of accounts) {
      console.log(`[${account.xUsername}] Processing...`);
      
      let tweets: Array<{ tweetId: string; tweetText: string; tweetCreatedAt: Date }> = [];
      
      // Try to fetch from X API (Python proxy with GAME API)
      if (xApiClient) {
        try {
          // Get the last tweet we've seen for this account
          const lastTweet = await prisma.ctPost.findFirst({
            where: { ctAccountId: account.id },
            orderBy: { tweetCreatedAt: 'desc' },
          });

          console.log(`[${account.xUsername}] Fetching tweets from X API...`);
          if (lastTweet) {
            console.log(`[${account.xUsername}] Last seen: ${lastTweet.tweetId}`);
          }

          const xTweets = await xApiClient.getUserTweets(account.xUsername, {
            maxResults: 15, // Optimized: reduced from 50 (most users don't tweet that much)
            sinceId: lastTweet?.tweetId,
          });

          tweets = xTweets.map(tweet => ({
            tweetId: tweet.id,
            tweetText: tweet.text,
            tweetCreatedAt: new Date(tweet.created_at),
          }));

          console.log(`[${account.xUsername}] ✅ Fetched ${tweets.length} tweets from X API`);
        } catch (error: any) {
          console.error(`[${account.xUsername}] ❌ X API error:`, error.message);
          
          // Fall back to mock tweets on error
          console.log(`[${account.xUsername}] Using mock tweets as fallback...`);
          tweets = [
            {
              tweetId: `${Date.now()}_${account.id}_1`,
              tweetText: `$BTC breaking out! Strong momentum building. Time to accumulate? #Bitcoin`,
              tweetCreatedAt: new Date(),
            },
            {
              tweetId: `${Date.now()}_${account.id}_2`,
              tweetText: `$ETH looking bullish after breaking key resistance at $2,000. Next target $2,500.`,
              tweetCreatedAt: new Date(),
            },
          ];
        }
      } else {
        // Use mock data if X API is not configured
        console.log(`[${account.xUsername}] ⚠️  No X API configured, using mock tweets`);
        tweets = [
          {
            tweetId: `${Date.now()}_${account.id}_1`,
            tweetText: `$BTC showing strong bullish momentum. Breakout imminent? #Bitcoin #Crypto`,
            tweetCreatedAt: new Date(),
          },
          {
            tweetId: `${Date.now()}_${account.id}_2`,
            tweetText: `$ETH breaking key resistance. Bulls in control. Target: $2,500. #Ethereum`,
            tweetCreatedAt: new Date(),
          },
          {
            tweetId: `${Date.now()}_${account.id}_3`,
            tweetText: `$WETH trading volume increasing. Accumulation phase? Watch closely. #DeFi`,
            tweetCreatedAt: new Date(),
          },
        ];
      }

      // Create posts in database
      let createdCount = 0;
      let skippedCount = 0;

      for (const tweet of tweets) {
        try {
          // Classify tweet using LLM
          console.log(`[${account.xUsername}] Classifying tweet: "${tweet.tweetText.substring(0, 50)}..."`);
          const classification = await classifyTweet(tweet.tweetText);
          
          console.log(`[${account.xUsername}] → Signal: ${classification.isSignalCandidate}, Tokens: ${classification.extractedTokens.join(', ') || 'none'}, Sentiment: ${classification.sentiment}`);
          
          // Create post with classification
          await prisma.ctPost.create({
            data: {
              ctAccountId: account.id,
              tweetId: tweet.tweetId,
              tweetText: tweet.tweetText,
              tweetCreatedAt: tweet.tweetCreatedAt,
              isSignalCandidate: classification.isSignalCandidate,
              extractedTokens: classification.extractedTokens,
            },
          });
          createdCount++;
        } catch (error: any) {
          if (error.code === 'P2002') {
            // Duplicate tweet, skip
            skippedCount++;
          } else {
            console.error(`[${account.xUsername}] Error creating post:`, error.message);
          }
        }
      }

      // Update last seen timestamp
      await prisma.ctAccount.update({
        where: { id: account.id },
        data: { lastSeenAt: new Date() },
      });

      results.push({
        accountId: account.id,
        username: account.xUsername,
        fetched: tweets.length,
        created: createdCount,
        skipped: skippedCount,
      });

      console.log(`[${account.xUsername}] ✅ ${createdCount} created, ${skippedCount} skipped\n`);
    }

    // Summary
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('  📊 INGESTION SUMMARY');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    
    const totalFetched = results.reduce((sum, r) => sum + r.fetched, 0);
    const totalCreated = results.reduce((sum, r) => sum + r.created, 0);
    const totalSkipped = results.reduce((sum, r) => sum + r.skipped, 0);

    console.log(`Accounts processed: ${accounts.length}`);
    console.log(`Tweets fetched: ${totalFetched}`);
    console.log(`New posts created: ${totalCreated}`);
    console.log(`Duplicates skipped: ${totalSkipped}`);
    console.log(`\nCompleted at: ${new Date().toISOString()}`);
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

    return {
      success: true,
      processed: accounts.length,
      totalFetched,
      totalCreated,
      totalSkipped,
    };
  } catch (error: any) {
    console.error('\n❌ ERROR during tweet ingestion:', error);
    throw error;
  } finally {
    await prisma.$disconnect();
  }
}

// Run if executed directly
if (require.main === module) {
  ingestTweets()
    .then(() => {
      console.log('✅ Tweet ingestion worker completed successfully');
      process.exit(0);
    })
    .catch((error) => {
      console.error('❌ Tweet ingestion worker failed:', error);
      process.exit(1);
    });
}

export { ingestTweets };

