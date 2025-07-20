import type { EmbeddingRequest, EmbeddingResponse, EmbeddingBackendConfig } from './types';

/**
 * Abstract base class for embedding services
 */
export abstract class EmbeddingService {
  protected config: EmbeddingBackendConfig;
  protected isInitialized: boolean = false;

  constructor(config: EmbeddingBackendConfig) {
    this.config = config;
  }

  /**
   * Initialize the embedding service
   */
  abstract initialize(): Promise<void>;

  /**
   * Generate embeddings for the given texts
   */
  abstract embed(request: EmbeddingRequest): Promise<EmbeddingResponse>;

  /**
   * Check if the service is healthy and available
   */
  abstract healthCheck(): Promise<boolean>;

  /**
   * Get the service name
   */
  getName(): string {
    return this.config.name;
  }

  /**
   * Get the service priority (higher = preferred)
   */
  getPriority(): number {
    return this.config.priority;
  }

  /**
   * Check if the service is enabled
   */
  isEnabled(): boolean {
    return this.config.enabled;
  }

  /**
   * Check if the service is initialized
   */
  getInitialized(): boolean {
    return this.isInitialized;
  }
}

/**
 * Calculate cosine similarity between two vectors
 */
export const cosineSimilarity = (vecA: number[], vecB: number[]): number => {
  if (vecA.length !== vecB.length) {
    throw new Error('Vectors must have the same length');
  }

  const dotProduct = vecA.reduce((sum, val, i) => sum + val * vecB[i], 0);
  const magnitudeA = Math.sqrt(vecA.reduce((sum, val) => sum + val * val, 0));
  const magnitudeB = Math.sqrt(vecB.reduce((sum, val) => sum + val * val, 0));
  
  if (magnitudeA === 0 || magnitudeB === 0) {
    return 0;
  }
  
  return dotProduct / (magnitudeA * magnitudeB);
};