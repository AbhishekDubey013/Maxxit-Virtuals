/**
 * LLM-based Tweet Classification Service
 * Supports OpenAI, Anthropic, and Perplexity APIs
 */

interface ClassificationResult {
  isSignalCandidate: boolean;
  extractedTokens: string[];
  sentiment: 'bullish' | 'bearish' | 'neutral';
  confidence: number; // 0-1
  reasoning?: string;
}

interface LLMConfig {
  provider: 'openai' | 'anthropic' | 'perplexity';
  apiKey: string;
  model?: string;
}

/**
 * Tweet Classifier using LLM
 */
export class LLMTweetClassifier {
  private provider: 'openai' | 'anthropic' | 'perplexity';
  private apiKey: string;
  private model: string;

  constructor(config: LLMConfig) {
    this.provider = config.provider;
    this.apiKey = config.apiKey;
    
    // Default models
    if (config.model) {
      this.model = config.model;
    } else if (this.provider === 'openai') {
      this.model = 'gpt-4o-mini';
    } else if (this.provider === 'perplexity') {
      this.model = 'sonar';
    } else {
      this.model = 'claude-3-haiku-20240307';
    }
  }

  /**
   * Classify a tweet and extract trading signals
   */
  async classifyTweet(tweetText: string): Promise<ClassificationResult> {
    const prompt = this.buildPrompt(tweetText);
    
    try {
      let response: string;
      
      if (this.provider === 'openai') {
        response = await this.callOpenAI(prompt);
      } else if (this.provider === 'perplexity') {
        response = await this.callPerplexity(prompt);
      } else {
        response = await this.callAnthropic(prompt);
      }
      
      return this.parseResponse(response, tweetText);
    } catch (error) {
      console.error('[LLM Classifier] Error:', error);
      // Fallback to regex-based classification
      return this.fallbackClassification(tweetText);
    }
  }

  /**
   * Build the classification prompt
   */
  private buildPrompt(tweetText: string): string {
    return `You are an expert crypto trading signal analyst. Analyze the following tweet and determine if it contains a trading signal.

Tweet: "${tweetText}"

Analyze this tweet and respond with a JSON object containing:
{
  "isSignalCandidate": boolean,
  "extractedTokens": string[], // Array of token symbols (e.g., ["BTC", "ETH"])
  "sentiment": "bullish" | "bearish" | "neutral",
  "confidence": number, // 0.0 to 1.0
  "reasoning": string // Brief explanation
}

Rules:
1. Only mark as signal candidate if the tweet explicitly suggests a trading action or price prediction
2. Extract ALL mentioned crypto token symbols (without $ prefix)
3. Sentiment should be:
   - "bullish" if suggesting price increase, buying, or positive outlook
   - "bearish" if suggesting price decrease, selling, or negative outlook
   - "neutral" if just sharing information without directional bias
4. Confidence should reflect how clear and actionable the signal is
5. Common tokens to recognize: BTC, ETH, SOL, AVAX, ARB, OP, MATIC, LINK, UNI, AAVE, etc.

Examples:
- "$BTC breaking out! Target $50k" → isSignalCandidate=true, tokens=["BTC"], sentiment=bullish, confidence=0.8
- "Just bought some $ETH at $2000" → isSignalCandidate=true, tokens=["ETH"], sentiment=bullish, confidence=0.7
- "$SOL looking weak, might dump" → isSignalCandidate=true, tokens=["SOL"], sentiment=bearish, confidence=0.6
- "GM everyone! Great day in crypto" → isSignalCandidate=false, tokens=[], sentiment=neutral, confidence=0.0

Respond ONLY with the JSON object, no other text.`;
  }

  /**
   * Call OpenAI API
   */
  private async callOpenAI(prompt: string): Promise<string> {
    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${this.apiKey}`,
      },
      body: JSON.stringify({
        model: this.model,
        messages: [
          {
            role: 'system',
            content: 'You are a crypto trading signal analyst. Always respond with valid JSON only.',
          },
          {
            role: 'user',
            content: prompt,
          },
        ],
        temperature: 0.3,
        max_tokens: 500,
        response_format: { type: 'json_object' },
      }),
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`OpenAI API error: ${response.status} ${error}`);
    }

    const data = await response.json();
    return data.choices[0].message.content;
  }

  /**
   * Call Perplexity API (OpenAI-compatible format)
   */
  private async callPerplexity(prompt: string): Promise<string> {
    const response = await fetch('https://api.perplexity.ai/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${this.apiKey}`,
      },
      body: JSON.stringify({
        model: this.model,
        messages: [
          {
            role: 'system',
            content: 'You are a crypto trading signal analyst. Always respond with valid JSON only.',
          },
          {
            role: 'user',
            content: prompt,
          },
        ],
        temperature: 0.3,
        max_tokens: 500,
      }),
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Perplexity API error: ${response.status} ${error}`);
    }

    const data = await response.json();
    return data.choices[0].message.content;
  }

  /**
   * Call Anthropic API
   */
  private async callAnthropic(prompt: string): Promise<string> {
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': this.apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: this.model,
        max_tokens: 500,
        temperature: 0.3,
        messages: [
          {
            role: 'user',
            content: prompt,
          },
        ],
      }),
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Anthropic API error: ${response.status} ${error}`);
    }

    const data = await response.json();
    return data.content[0].text;
  }

  /**
   * Parse LLM response
   */
  private parseResponse(response: string, originalTweet: string): ClassificationResult {
    try {
      // Extract JSON from response (in case there's extra text)
      const jsonMatch = response.match(/\{[\s\S]*\}/);
      if (!jsonMatch) {
        throw new Error('No JSON found in response');
      }

      const parsed = JSON.parse(jsonMatch[0]);
      
      return {
        isSignalCandidate: Boolean(parsed.isSignalCandidate),
        extractedTokens: Array.isArray(parsed.extractedTokens) 
          ? parsed.extractedTokens.map((t: string) => t.toUpperCase()) 
          : [],
        sentiment: parsed.sentiment || 'neutral',
        confidence: Math.max(0, Math.min(1, Number(parsed.confidence) || 0)),
        reasoning: parsed.reasoning || '',
      };
    } catch (error) {
      console.error('[LLM Classifier] Failed to parse response:', error);
      console.error('[LLM Classifier] Response was:', response);
      // Fallback to regex
      return this.fallbackClassification(originalTweet);
    }
  }

  /**
   * Fallback classification using regex (when LLM fails)
   */
  private fallbackClassification(tweetText: string): ClassificationResult {
    console.log('[LLM Classifier] Using fallback regex-based classification');
    
    // Extract token symbols
    const tokenRegex = /\$([A-Z]{2,10})\b/g;
    const matches = tweetText.match(tokenRegex);
    const extractedTokens = matches 
      ? [...new Set(matches.map(token => token.substring(1).toUpperCase()))]
      : [];
    
    // Determine sentiment based on keywords
    const lowerText = tweetText.toLowerCase();
    const bullishKeywords = ['bullish', 'buy', 'long', 'moon', 'pump', 'breakout', 'target', 'accumulate', 'strong', 'rally'];
    const bearishKeywords = ['bearish', 'sell', 'short', 'dump', 'drop', 'breakdown', 'weak', 'crash'];
    
    const hasBullish = bullishKeywords.some(kw => lowerText.includes(kw));
    const hasBearish = bearishKeywords.some(kw => lowerText.includes(kw));
    
    let sentiment: 'bullish' | 'bearish' | 'neutral' = 'neutral';
    if (hasBullish && !hasBearish) sentiment = 'bullish';
    if (hasBearish && !hasBullish) sentiment = 'bearish';
    
    // Check if it's a signal candidate
    const isSignalCandidate = 
      extractedTokens.length > 0 && 
      (hasBullish || hasBearish);
    
    const confidence = isSignalCandidate ? 0.5 : 0.0;
    
    return {
      isSignalCandidate,
      extractedTokens,
      sentiment,
      confidence,
      reasoning: 'Fallback regex-based classification',
    };
  }
}

/**
 * Create an LLM classifier instance based on environment variables
 */
export function createLLMClassifier(): LLMTweetClassifier | null {
  // Try Perplexity first (user's preference)
  const perplexityKey = process.env.PERPLEXITY_API_KEY;
  if (perplexityKey) {
    console.log('[LLM Classifier] Using Perplexity AI');
    return new LLMTweetClassifier({
      provider: 'perplexity',
      apiKey: perplexityKey,
      model: process.env.PERPLEXITY_MODEL || 'sonar',
    });
  }
  
  // Try OpenAI
  const openaiKey = process.env.OPENAI_API_KEY;
  if (openaiKey) {
    console.log('[LLM Classifier] Using OpenAI');
    return new LLMTweetClassifier({
      provider: 'openai',
      apiKey: openaiKey,
      model: process.env.OPENAI_MODEL || 'gpt-4o-mini',
    });
  }
  
  // Try Anthropic
  const anthropicKey = process.env.ANTHROPIC_API_KEY;
  if (anthropicKey) {
    console.log('[LLM Classifier] Using Anthropic Claude');
    return new LLMTweetClassifier({
      provider: 'anthropic',
      apiKey: anthropicKey,
      model: process.env.ANTHROPIC_MODEL || 'claude-3-haiku-20240307',
    });
  }
  
  console.warn('[LLM Classifier] No API key found. Set PERPLEXITY_API_KEY, OPENAI_API_KEY, or ANTHROPIC_API_KEY environment variable.');
  return null;
}

/**
 * Classify a single tweet (convenience function)
 */
export async function classifyTweet(tweetText: string): Promise<ClassificationResult> {
  const classifier = createLLMClassifier();
  
  if (!classifier) {
    // Use fallback
    console.log('[LLM Classifier] Using fallback classification (no API key)');
    return new LLMTweetClassifier({ provider: 'perplexity', apiKey: 'dummy' }).fallbackClassification(tweetText);
  }
  
  return classifier.classifyTweet(tweetText);
}

