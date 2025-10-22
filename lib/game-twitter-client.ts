/**
 * GAME SDK Twitter Client
 * Uses official @virtuals-protocol/game SDK for Twitter API access
 * Replaces Python proxy approach with pure TypeScript solution
 */

import axios from 'axios';

interface Tweet {
  id: string;
  text: string;
  created_at: string;
  author_id?: string;
}

export class GameTwitterClient {
  private apiKey: string;
  private baseUrl: string = 'https://api.virtuals.io/api';

  constructor(apiKey: string) {
    this.apiKey = apiKey;
  }

  /**
   * Fetch user tweets using GAME API
   */
  async getUserTweets(
    username: string,
    options: {
      maxResults?: number;
      sinceId?: string;
    } = {}
  ): Promise<Tweet[]> {
    try {
      const cleanUsername = username.replace('@', '');
      const maxResults = Math.max(5, Math.min(options.maxResults || 10, 100));

      console.log(`[GAME SDK] Fetching ${maxResults} tweets from: ${cleanUsername}`);

      // GAME API endpoint for fetching tweets
      const response = await axios.get(`${this.baseUrl}/twitter/user/${cleanUsername}/tweets`, {
        headers: {
          'Authorization': `Bearer ${this.apiKey}`,
          'Content-Type': 'application/json'
        },
        params: {
          max_results: maxResults,
          since_id: options.sinceId,
        }
      });

      if (!response.data || !response.data.data) {
        console.log('[GAME SDK] No tweets returned from API');
        return [];
      }

      // Transform to standard format
      const tweets: Tweet[] = response.data.data.map((tweet: any) => ({
        id: tweet.id || tweet.tweet_id || String(tweet.id),
        text: tweet.text || tweet.content || '',
        created_at: tweet.created_at || tweet.timestamp || new Date().toISOString(),
        author_id: tweet.author_id
      }));

      console.log(`[GAME SDK] Fetched ${tweets.length} tweets`);
      return tweets;

    } catch (error: any) {
      console.error('[GAME SDK] Error fetching tweets:', error.response?.data || error.message);
      return [];
    }
  }
}

/**
 * Create GAME Twitter client
 */
export function createGameTwitterClient(): GameTwitterClient | null {
  const apiKey = process.env.GAME_API_KEY || process.env.X_GAME_API_KEY;
  
  if (!apiKey) {
    console.error('[GAME SDK] No GAME_API_KEY found in environment');
    return null;
  }

  return new GameTwitterClient(apiKey);
}

