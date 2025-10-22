/**
 * X (Twitter) API Integration - Multiple Authentication Methods
 * Supports: Bearer Token, GAME API, and other alternatives
 */

interface Tweet {
  id: string;
  text: string;
  created_at: string;
  author_id?: string;
  public_metrics?: {
    retweet_count: number;
    reply_count: number;
    like_count: number;
    quote_count: number;
  };
}

/**
 * GAME API Client for X/Twitter
 * Uses virtuals protocol API with simple API key authentication
 * Based on: https://github.com/abxglia/tweets-fetcher/blob/main/twitter_api.py
 */
export class GameApiClient {
  private apiKey: string;
  private baseUrl: string;

  constructor(apiKey: string, baseUrl?: string) {
    this.apiKey = apiKey;
    // Default to local Python proxy server (run with: bash run-twitter-proxy.sh)
    // Or set GAME_API_URL in .env to a deployed proxy server
    this.baseUrl = baseUrl || 'http://localhost:8001';
  }

  /**
   * Fetch tweets using GAME API via Python proxy
   * The proxy handles virtuals_tweepy authentication
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
      // GAME API requires max_results between 5-100
      const maxResults = Math.max(5, Math.min(options.maxResults || 10, 100));

      // Python proxy endpoint
      const params = new URLSearchParams({
        max_results: maxResults.toString(),
      });

      if (options.sinceId) {
        params.append('since_id', options.sinceId);
      }

      const url = `${this.baseUrl}/tweets/${cleanUsername}?${params}`;

      console.log(`[GAME API] Fetching ${maxResults} tweets from: ${cleanUsername} via proxy`);

      const response = await fetch(url);

      if (!response.ok) {
        const errorText = await response.text();
        console.error(`[GAME API Proxy] Error: ${response.status} - ${errorText}`);
        return [];
      }

      const data = await response.json();
      
      // Transform response to standard format
      return this.transformResponse(data);
    } catch (error) {
      console.error('[GAME API] Error fetching tweets:', error);
      return [];
    }
  }

  /**
   * Transform GAME API response to standard Tweet format
   */
  private transformResponse(data: any): Tweet[] {
    // Handle different response formats from virtuals API
    let tweets: any[] = [];

    if (Array.isArray(data)) {
      tweets = data;
    } else if (data.tweets && Array.isArray(data.tweets)) {
      tweets = data.tweets;
    } else if (data.data && Array.isArray(data.data)) {
      tweets = data.data;
    }

    return tweets.map((tweet: any) => ({
      id: tweet.id || tweet.tweet_id || String(tweet.id),
      text: tweet.text || tweet.content || '',
      created_at: tweet.created_at || tweet.timestamp || new Date().toISOString(),
      author_id: tweet.author_id || tweet.user_id || '',
      public_metrics: tweet.public_metrics || tweet.metrics || {
        retweet_count: tweet.retweets || 0,
        reply_count: tweet.comments || tweet.replies || 0,
        like_count: tweet.likes || 0,
        quote_count: tweet.quotes || 0,
      },
    }));
  }
}

/**
 * Multi-method X API Client
 * Tries different authentication methods automatically
 */
export class MultiMethodXApiClient {
  private bearerToken?: string;
  private gameApiKey?: string;
  private gameApiUrl?: string;

  constructor(config: {
    bearerToken?: string;
    gameApiKey?: string;
    gameApiUrl?: string;
  }) {
    this.bearerToken = config.bearerToken;
    this.gameApiKey = config.gameApiKey;
    this.gameApiUrl = config.gameApiUrl;
  }

  /**
   * Fetch tweets using best available method
   */
  async getUserTweets(
    username: string,
    options: {
      maxResults?: number;
      sinceId?: string;
    } = {}
  ): Promise<Tweet[]> {
    // Try GAME API proxy first (check if it's running)
    try {
      const proxyUrl = this.gameApiUrl || 'http://localhost:8001';
      const healthCheck = await fetch(`${proxyUrl}/health`, { 
        signal: AbortSignal.timeout(1000) 
      });
      
      if (healthCheck.ok) {
        console.log('[X API] Using GAME API proxy');
        const gameClient = new GameApiClient(this.gameApiKey || '', proxyUrl);
        const tweets = await gameClient.getUserTweets(username, options);
        if (tweets.length > 0) {
          return tweets;
        }
      }
    } catch (error) {
      // Proxy not available, continue to next method
    }

    // Try GAME API direct if key is provided
    if (this.gameApiKey && this.gameApiUrl && this.gameApiUrl !== 'http://localhost:8001') {
      console.log('[X API] Using GAME API direct');
      try {
        const gameClient = new GameApiClient(this.gameApiKey, this.gameApiUrl);
        const tweets = await gameClient.getUserTweets(username, options);
        if (tweets.length > 0) {
          return tweets;
        }
      } catch (error) {
        console.error('[X API] GAME API failed, trying bearer token method');
      }
    }

    // Fallback to standard bearer token method
    if (this.bearerToken) {
      console.log('[X API] Using standard bearer token method');
      return this.fetchWithBearerToken(username, options);
    }

    console.warn('[X API] No authentication method available');
    return [];
  }

  /**
   * Standard bearer token method (existing implementation)
   */
  private async fetchWithBearerToken(
    username: string,
    options: {
      maxResults?: number;
      sinceId?: string;
    }
  ): Promise<Tweet[]> {
    try {
      const cleanUsername = username.replace('@', '');
      
      // Get user ID
      const userUrl = `https://api.twitter.com/2/users/by/username/${cleanUsername}`;
      const userResponse = await fetch(userUrl, {
        headers: { 'Authorization': `Bearer ${this.bearerToken}` },
      });

      if (!userResponse.ok) {
        throw new Error(`User fetch failed: ${userResponse.status}`);
      }

      const userData = await userResponse.json();
      const userId = userData.data?.id;

      if (!userId) {
        throw new Error('User ID not found');
      }

      // Get tweets
      const maxResults = Math.min(options.maxResults || 10, 100);
      const params = new URLSearchParams({
        'max_results': maxResults.toString(),
        'tweet.fields': 'created_at,public_metrics',
        'exclude': 'retweets,replies',
      });

      if (options.sinceId) {
        params.append('since_id', options.sinceId);
      }

      const tweetsUrl = `https://api.twitter.com/2/users/${userId}/tweets?${params}`;
      const tweetsResponse = await fetch(tweetsUrl, {
        headers: { 'Authorization': `Bearer ${this.bearerToken}` },
      });

      if (!tweetsResponse.ok) {
        throw new Error(`Tweets fetch failed: ${tweetsResponse.status}`);
      }

      const tweetsData = await tweetsResponse.json();
      return tweetsData.data || [];
    } catch (error) {
      console.error('[X API] Bearer token method error:', error);
      return [];
    }
  }
}

/**
 * Create X API client with auto-detection of available methods
 */
export function createMultiMethodXApiClient(): MultiMethodXApiClient | null {
  const bearerToken = process.env.X_API_BEARER_TOKEN || process.env.X_API_KEY || process.env.TWITTER_BEARER_TOKEN;
  const gameApiKey = process.env.GAME_API_KEY || process.env.X_GAME_API_KEY;
  const gameApiUrl = process.env.GAME_API_URL;

  if (!bearerToken && !gameApiKey) {
    console.warn('[X API] No authentication credentials found');
    return null;
  }

  return new MultiMethodXApiClient({
    bearerToken,
    gameApiKey,
    gameApiUrl,
  });
}

