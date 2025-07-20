// Core types for semantic ranking system

export interface EmbeddingVector {
  vector: number[];
  dimension: number;
}

export interface SearchResult {
  title: string;
  url: string;
  snippet?: string;
  description?: string;
}

export interface RankedResult extends SearchResult {
  relevance: number;
  rankingMethod: 'semantic' | 'position' | 'title-match' | 'static';
}

export interface EmbeddingRequest {
  texts: string[];
  requestId?: string;
}

export interface EmbeddingResponse {
  embeddings: EmbeddingVector[];
  processingTime: number;
  backend: string;
  cached: boolean;
}

export interface SemanticRankingOptions {
  useCache: boolean;
  fallbackStrategy: 'position' | 'title-match' | 'static';
  timeout: number;
  weights: {
    title: number;
    snippet: number;
    description: number;
  };
}

export interface EmbeddingBackendConfig {
  name: string;
  enabled: boolean;
  priority: number;
  config: Record<string, any>;
}

export type EmbeddingBackendType = 'use' | 'openai' | 'local' | 'fallback';