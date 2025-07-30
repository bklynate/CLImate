import OpenAI from 'openai';
import { EmbeddingService } from './EmbeddingService';
import type { EmbeddingRequest, EmbeddingResponse, EmbeddingBackendConfig } from './types';
import logger from '@utils/logger';

interface LMStudioConfig {
  baseURL: string;
  apiKey: string;
  model: string;
  timeout: number;
  maxRetries: number;
}

/**
 * LM Studio embedding backend using OpenAI-compatible API
 */
export class LMStudioEmbeddingBackend extends EmbeddingService {
  private client: OpenAI | null = null;
  private lmConfig: LMStudioConfig;
  private initializationPromise: Promise<void> | null = null;

  constructor(config: EmbeddingBackendConfig) {
    super(config);
    
    this.lmConfig = {
      baseURL: config.config.baseURL || process.env.LM_STUDIO_BASE_URL || 'http://localhost:1234/v1',
      apiKey: config.config.apiKey || process.env.LM_STUDIO_API_KEY || 'lm-studio',
      model: config.config.model || process.env.LM_STUDIO_EMBEDDING_MODEL || 'nomic-ai/nomic-embed-text-v1.5-GGUF',
      timeout: config.config.timeout || 30000,
      maxRetries: config.config.maxRetries || 3
    };
  }

  async initialize(): Promise<void> {
    if (this.initializationPromise) {
      return this.initializationPromise;
    }

    this.initializationPromise = this.doInitialize();
    return this.initializationPromise;
  }

  private async doInitialize(): Promise<void> {
    try {
      logger.info('Initializing LM Studio embedding backend...');
      
      this.client = new OpenAI({
        baseURL: this.lmConfig.baseURL,
        apiKey: this.lmConfig.apiKey,
        timeout: this.lmConfig.timeout,
        maxRetries: this.lmConfig.maxRetries
      });

      // Test the connection with a simple embedding request
      await this.testConnection();
      
      this.isInitialized = true;
      logger.info(`LM Studio backend initialized successfully with model: ${this.lmConfig.model}`);
      
    } catch (error) {
      this.isInitialized = false;
      logger.error('Failed to initialize LM Studio backend:', error);
      throw new Error(`LM Studio initialization failed: ${error.message}`);
    }
  }

  async embed(request: EmbeddingRequest): Promise<EmbeddingResponse> {
    if (!this.isInitialized || !this.client) {
      throw new Error('LM Studio backend not initialized');
    }

    const startTime = Date.now();
    
    try {
      logger.debug(`Generating embeddings for ${request.texts.length} texts using LM Studio`);
      
      // LM Studio/OpenAI API supports batch embedding
      const response = await this.client.embeddings.create({
        model: this.lmConfig.model,
        input: request.texts,
        encoding_format: 'float'
      });

      const embeddings = response.data.map(item => ({
        vector: item.embedding,
        dimension: item.embedding.length
      }));

      const processingTime = Date.now() - startTime;
      
      logger.debug(`LM Studio embeddings generated in ${processingTime}ms`);
      
      return {
        embeddings,
        processingTime,
        backend: this.getName(),
        cached: false
      };

    } catch (error) {
      logger.error('LM Studio embedding request failed:', error);
      throw new Error(`LM Studio embedding failed: ${error.message}`);
    }
  }

  async healthCheck(): Promise<boolean> {
    if (!this.isInitialized || !this.client) {
      return false;
    }

    try {
      await this.testConnection();
      return true;
    } catch (error) {
      logger.warn('LM Studio health check failed:', error);
      return false;
    }
  }

  private async testConnection(): Promise<void> {
    if (!this.client) {
      throw new Error('Client not initialized');
    }

    try {
      // Test with a simple embedding request
      const testResponse = await this.client.embeddings.create({
        model: this.lmConfig.model,
        input: 'test',
        encoding_format: 'float'
      });

      if (!testResponse.data || testResponse.data.length === 0) {
        throw new Error('Invalid response from LM Studio');
      }

      const embedding = testResponse.data[0].embedding;
      if (!Array.isArray(embedding) || embedding.length === 0) {
        throw new Error('Invalid embedding format from LM Studio');
      }

      logger.debug(`LM Studio connection test successful, embedding dimension: ${embedding.length}`);
      
    } catch (error) {
      if (error.message?.includes('ECONNREFUSED') || error.message?.includes('fetch failed')) {
        throw new Error('Cannot connect to LM Studio server. Make sure LM Studio is running and the server is started.');
      }
      if (error.message?.includes('model not found') || error.message?.includes('404')) {
        throw new Error(`Model '${this.lmConfig.model}' not found in LM Studio. Please check the model name.`);
      }
      throw error;
    }
  }

  /**
   * Get current configuration
   */
  getConfig(): LMStudioConfig {
    return { ...this.lmConfig };
  }

  /**
   * Update model configuration (requires re-initialization)
   */
  updateModel(model: string): void {
    this.lmConfig.model = model;
    this.isInitialized = false;
    this.initializationPromise = null;
    this.client = null;
  }
}