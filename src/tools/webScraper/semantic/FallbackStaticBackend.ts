import { EmbeddingService } from './EmbeddingService';
import type { EmbeddingRequest, EmbeddingResponse, EmbeddingBackendConfig } from './types';
import logger from '@utils/logger';

/**
 * Fallback backend that provides static/deterministic "embeddings" when real embeddings fail
 * Uses simple text analysis features as pseudo-embeddings
 */
export class FallbackStaticBackend extends EmbeddingService {
  
  constructor(config: EmbeddingBackendConfig) {
    super(config);
  }

  async initialize(): Promise<void> {
    logger.info('Initializing Fallback Static Backend...');
    this.isInitialized = true;
    logger.info('Fallback Static Backend initialized');
  }

  async embed(request: EmbeddingRequest): Promise<EmbeddingResponse> {
    const startTime = Date.now();

    const embeddings = request.texts.map(text => ({
      vector: this.generateStaticEmbedding(text),
      dimension: 50 // Fixed dimension for consistency
    }));

    const processingTime = Date.now() - startTime;

    return {
      embeddings,
      processingTime,
      backend: 'fallback-static',
      cached: false
    };
  }

  async healthCheck(): Promise<boolean> {
    return true; // Fallback is always available
  }

  /**
   * Generate a pseudo-embedding based on text features
   * This creates a simple but deterministic vector representation
   */
  private generateStaticEmbedding(text: string): number[] {
    const normalized = text.toLowerCase().trim();
    const words = normalized.split(/\s+/);
    
    // Create a 50-dimensional vector based on text features
    const vector = new Array(50).fill(0);
    
    // Feature 1-10: Character-based features
    vector[0] = Math.min(normalized.length / 100, 1); // Text length (normalized)
    vector[1] = (normalized.match(/[aeiou]/g) || []).length / normalized.length; // Vowel ratio
    vector[2] = (normalized.match(/[bcdfghjklmnpqrstvwxyz]/g) || []).length / normalized.length; // Consonant ratio
    vector[3] = (normalized.match(/\d/g) || []).length / normalized.length; // Digit ratio
    vector[4] = (normalized.match(/[.,!?;:]/g) || []).length / normalized.length; // Punctuation ratio
    vector[5] = words.length / 20; // Word count (normalized)
    vector[6] = words.reduce((sum, word) => sum + word.length, 0) / words.length / 10; // Avg word length
    vector[7] = (normalized.match(/[A-Z]/g) || []).length / normalized.length; // Uppercase ratio
    vector[8] = (normalized.match(/\s/g) || []).length / normalized.length; // Whitespace ratio
    vector[9] = this.calculateTextEntropy(normalized); // Text entropy
    
    // Feature 11-25: Word-based features
    const uniqueWords = new Set(words);
    vector[10] = uniqueWords.size / words.length; // Vocabulary diversity
    vector[11] = this.hasCommonWords(words, ['the', 'and', 'or', 'but', 'in', 'on', 'at']) ? 1 : 0;
    vector[12] = this.hasCommonWords(words, ['how', 'what', 'when', 'where', 'why', 'who']) ? 1 : 0;
    vector[13] = this.hasCommonWords(words, ['technology', 'tech', 'computer', 'software']) ? 1 : 0;
    vector[14] = this.hasCommonWords(words, ['news', 'report', 'article', 'story']) ? 1 : 0;
    vector[15] = this.hasCommonWords(words, ['business', 'market', 'financial', 'economy']) ? 1 : 0;
    vector[16] = this.hasCommonWords(words, ['sports', 'game', 'team', 'player']) ? 1 : 0;
    vector[17] = this.hasCommonWords(words, ['health', 'medical', 'doctor', 'medicine']) ? 1 : 0;
    vector[18] = this.hasCommonWords(words, ['science', 'research', 'study', 'analysis']) ? 1 : 0;
    vector[19] = this.hasCommonWords(words, ['education', 'school', 'university', 'learning']) ? 1 : 0;
    vector[20] = this.hasCommonWords(words, ['travel', 'trip', 'vacation', 'destination']) ? 1 : 0;
    vector[21] = this.hasCommonWords(words, ['food', 'recipe', 'cooking', 'restaurant']) ? 1 : 0;
    vector[22] = this.hasCommonWords(words, ['music', 'song', 'artist', 'album']) ? 1 : 0;
    vector[23] = this.hasCommonWords(words, ['movie', 'film', 'cinema', 'actor']) ? 1 : 0;
    vector[24] = this.hasCommonWords(words, ['book', 'author', 'novel', 'literature']) ? 1 : 0;
    
    // Feature 26-35: N-gram based features (bigrams)
    const bigrams = this.generateBigrams(words);
    for (let i = 0; i < 10; i++) {
      vector[25 + i] = this.hashFeature(bigrams.join(' '), i) / 1000;
    }
    
    // Feature 36-45: Character n-gram features
    const charBigrams = this.generateCharBigrams(normalized);
    for (let i = 0; i < 10; i++) {
      vector[35 + i] = this.hashFeature(charBigrams.join(''), i) / 1000;
    }
    
    // Feature 46-50: Text structure features
    vector[45] = (normalized.match(/^[A-Z]/g) || []).length > 0 ? 1 : 0; // Starts with capital
    vector[46] = (normalized.match(/[.!?]$/g) || []).length > 0 ? 1 : 0; // Ends with punctuation
    vector[47] = (normalized.match(/https?:\/\//g) || []).length / normalized.length; // URL presence
    vector[48] = (normalized.match(/@\w+/g) || []).length / normalized.length; // Mention-like patterns
    vector[49] = (normalized.match(/#\w+/g) || []).length / normalized.length; // Hashtag-like patterns
    
    return vector;
  }

  private calculateTextEntropy(text: string): number {
    const freq: Record<string, number> = {};
    for (const char of text) {
      freq[char] = (freq[char] || 0) + 1;
    }
    
    let entropy = 0;
    for (const count of Object.values(freq)) {
      const p = count / text.length;
      entropy -= p * Math.log2(p);
    }
    
    return Math.min(entropy / 8, 1); // Normalized to 0-1
  }

  private hasCommonWords(words: string[], keywords: string[]): boolean {
    return words.some(word => keywords.includes(word));
  }

  private generateBigrams(words: string[]): string[] {
    const bigrams = [];
    for (let i = 0; i < words.length - 1; i++) {
      bigrams.push(`${words[i]} ${words[i + 1]}`);
    }
    return bigrams;
  }

  private generateCharBigrams(text: string): string[] {
    const bigrams = [];
    for (let i = 0; i < text.length - 1; i++) {
      bigrams.push(text.substring(i, i + 2));
    }
    return bigrams;
  }

  private hashFeature(text: string, seed: number): number {
    let hash = seed;
    for (let i = 0; i < text.length; i++) {
      hash = ((hash << 5) - hash + text.charCodeAt(i)) & 0xffffffff;
    }
    return Math.abs(hash);
  }
}