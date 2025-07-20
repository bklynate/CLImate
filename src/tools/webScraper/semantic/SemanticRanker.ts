import { getEmbeddingService } from './EmbeddingServiceFactory';
import { cosineSimilarity } from './EmbeddingService';
import type { SearchResult, RankedResult, SemanticRankingOptions } from './types';
import logger from '@utils/logger';

/**
 * Circuit breaker states
 */
enum CircuitState {
  CLOSED = 'CLOSED',     // Normal operation
  OPEN = 'OPEN',         // Failing, bypass embedding
  HALF_OPEN = 'HALF_OPEN' // Testing recovery
}

/**
 * Circuit breaker for embedding service failures
 */
class EmbeddingCircuitBreaker {
  private state: CircuitState = CircuitState.CLOSED;
  private failureCount: number = 0;
  private lastFailureTime: number = 0;
  private readonly failureThreshold: number = 5;
  private readonly timeout: number = 60000; // 1 minute
  private readonly resetTimeout: number = 300000; // 5 minutes

  async execute<T>(operation: () => Promise<T>): Promise<T> {
    if (this.state === CircuitState.OPEN) {
      if (Date.now() - this.lastFailureTime > this.resetTimeout) {
        this.state = CircuitState.HALF_OPEN;
        logger.info('Circuit breaker transitioning to HALF_OPEN');
      } else {
        throw new Error('Circuit breaker is OPEN - embedding service unavailable');
      }
    }

    try {
      const result = await Promise.race([
        operation(),
        new Promise<never>((_, reject) => 
          setTimeout(() => reject(new Error('Operation timeout')), this.timeout)
        )
      ]);

      // Success - reset circuit breaker
      if (this.state === CircuitState.HALF_OPEN) {
        this.state = CircuitState.CLOSED;
        this.failureCount = 0;
        logger.info('Circuit breaker reset to CLOSED');
      }

      return result;
    } catch (error) {
      this.recordFailure();
      throw error;
    }
  }

  private recordFailure(): void {
    this.failureCount++;
    this.lastFailureTime = Date.now();

    if (this.failureCount >= this.failureThreshold) {
      this.state = CircuitState.OPEN;
      logger.warn(`Circuit breaker OPENED after ${this.failureCount} failures`);
    }
  }

  getState(): CircuitState {
    return this.state;
  }

  isOpen(): boolean {
    return this.state === CircuitState.OPEN;
  }
}

/**
 * Semantic ranking service with robust error handling
 */
export class SemanticRanker {
  private circuitBreaker = new EmbeddingCircuitBreaker();
  private cache = new Map<string, number[]>();
  private readonly cacheTimeout = 3600000; // 1 hour

  /**
   * Rank search results using semantic similarity
   */
  async rankResults(
    query: string,
    results: SearchResult[],
    options: SemanticRankingOptions = this.getDefaultOptions()
  ): Promise<RankedResult[]> {
    try {
      return await this.trySemanticRanking(query, results, options);
    } catch (error) {
      logger.error('Semantic ranking failed, falling back:', error);
      return this.applyFallbackRanking(query, results, options);
    }
  }

  /**
   * Attempt semantic ranking with circuit breaker protection
   */
  private async trySemanticRanking(
    query: string,
    results: SearchResult[],
    options: SemanticRankingOptions
  ): Promise<RankedResult[]> {
    return await this.circuitBreaker.execute(async () => {
      const embeddingService = await getEmbeddingService();
      
      // Prepare texts for embedding
      const textsToEmbed = [query, ...this.extractTextsForEmbedding(results, options)];
      
      // Generate embeddings
      const embeddingResponse = await embeddingService.embed({
        texts: textsToEmbed,
        requestId: `rank_${Date.now()}`
      });

      const embeddings = embeddingResponse.embeddings.map(e => e.vector);
      const queryEmbedding = embeddings[0];
      const resultEmbeddings = embeddings.slice(1);

      // Calculate relevance scores
      const rankedResults: RankedResult[] = results.map((result, index) => {
        const relevance = cosineSimilarity(queryEmbedding, resultEmbeddings[index]);
        return {
          ...result,
          relevance,
          rankingMethod: 'semantic'
        };
      });

      // Sort by relevance (highest first)
      rankedResults.sort((a, b) => b.relevance - a.relevance);

      logger.info(`Semantic ranking completed using ${embeddingResponse.backend} backend`);
      return rankedResults;
    });
  }

  /**
   * Apply fallback ranking when semantic ranking fails
   */
  private applyFallbackRanking(
    query: string,
    results: SearchResult[],
    options: SemanticRankingOptions
  ): RankedResult[] {
    switch (options.fallbackStrategy) {
      case 'title-match':
        return this.rankByTitleMatch(query, results);
      case 'position':
        return this.rankByPosition(results);
      case 'static':
      default:
        return this.rankStatic(results);
    }
  }

  /**
   * Rank by title keyword matching
   */
  private rankByTitleMatch(query: string, results: SearchResult[]): RankedResult[] {
    const queryWords = query.toLowerCase().split(/\s+/);
    
    return results.map((result, index) => {
      const titleWords = result.title.toLowerCase().split(/\s+/);
      const matchCount = queryWords.filter(qw => titleWords.some(tw => tw.includes(qw))).length;
      const relevance = matchCount / queryWords.length;
      
      return {
        ...result,
        relevance,
        rankingMethod: 'title-match'
      };
    }).sort((a, b) => b.relevance - a.relevance);
  }

  /**
   * Rank by original position (decreasing relevance)
   */
  private rankByPosition(results: SearchResult[]): RankedResult[] {
    return results.map((result, index) => ({
      ...result,
      relevance: 1.0 - (index * 0.1),
      rankingMethod: 'position'
    }));
  }

  /**
   * Static ranking (all equal relevance)
   */
  private rankStatic(results: SearchResult[]): RankedResult[] {
    return results.map((result, index) => ({
      ...result,
      relevance: 0.5,
      rankingMethod: 'static'
    }));
  }

  /**
   * Extract texts for embedding based on options
   */
  private extractTextsForEmbedding(
    results: SearchResult[],
    options: SemanticRankingOptions
  ): string[] {
    return results.map(result => {
      const parts: string[] = [];
      
      if (result.title) {
        parts.push(result.title);
      }
      
      if (result.snippet && options.weights.snippet > 0) {
        parts.push(result.snippet);
      }
      
      if (result.description && options.weights.description > 0) {
        parts.push(result.description);
      }
      
      return parts.join(' ');
    });
  }

  /**
   * Get default ranking options
   */
  private getDefaultOptions(): SemanticRankingOptions {
    return {
      useCache: true,
      fallbackStrategy: 'position',
      timeout: 30000,
      weights: {
        title: 0.6,
        snippet: 0.3,
        description: 0.1
      }
    };
  }

  /**
   * Get circuit breaker status
   */
  getCircuitBreakerStatus(): {
    state: string;
    isOpen: boolean;
  } {
    return {
      state: this.circuitBreaker.getState(),
      isOpen: this.circuitBreaker.isOpen()
    };
  }

  /**
   * Force reset circuit breaker (for testing/recovery)
   */
  resetCircuitBreaker(): void {
    (this.circuitBreaker as any).state = CircuitState.CLOSED;
    (this.circuitBreaker as any).failureCount = 0;
    logger.info('Circuit breaker manually reset');
  }
}