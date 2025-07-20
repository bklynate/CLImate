import '@tensorflow/tfjs-node';
import * as use from '@tensorflow-models/universal-sentence-encoder';
import { EmbeddingService } from './EmbeddingService';
import type { EmbeddingRequest, EmbeddingResponse, EmbeddingBackendConfig } from './types';
import logger from '@utils/logger';

export class UniversalSentenceEncoderBackend extends EmbeddingService {
  private model: use.UniversalSentenceEncoder | null = null;
  private initializationPromise: Promise<void> | null = null;

  constructor(config: EmbeddingBackendConfig) {
    super(config);
  }

  async initialize(): Promise<void> {
    if (this.isInitialized) {
      return;
    }

    if (this.initializationPromise) {
      return this.initializationPromise;
    }

    this.initializationPromise = this.doInitialize();
    return this.initializationPromise;
  }

  private async doInitialize(): Promise<void> {
    try {
      logger.info('Initializing Universal Sentence Encoder...');
      
      // Attempt to fix ONNX issues with specific configurations
      const modelConfig = {
        modelUrl: this.config.config.modelUrl || undefined,
        // Add potential ONNX workarounds
        ...this.config.config
      };

      // Try loading with error handling for ONNX issues
      this.model = await use.load(modelConfig.modelUrl);
      
      logger.info('Universal Sentence Encoder initialized successfully');
      this.isInitialized = true;
    } catch (error) {
      logger.error('Failed to initialize Universal Sentence Encoder:', error);
      
      // Try alternative initialization approaches
      await this.tryAlternativeInitialization();
    }
  }

  private async tryAlternativeInitialization(): Promise<void> {
    try {
      logger.info('Attempting alternative USE initialization...');
      
      // Try loading without custom config
      this.model = await use.load();
      
      logger.info('Alternative USE initialization successful');
      this.isInitialized = true;
    } catch (error) {
      logger.error('Alternative USE initialization also failed:', error);
      throw new Error(`Failed to initialize Universal Sentence Encoder: ${error}`);
    }
  }

  async embed(request: EmbeddingRequest): Promise<EmbeddingResponse> {
    const startTime = Date.now();

    if (!this.isInitialized || !this.model) {
      throw new Error('Universal Sentence Encoder not initialized');
    }

    try {
      // Generate embeddings
      const embeddings = await this.model.embed(request.texts);
      const embeddingArrays = embeddings.arraySync() as number[][];
      
      const processingTime = Date.now() - startTime;
      
      return {
        embeddings: embeddingArrays.map(vector => ({
          vector,
          dimension: vector.length
        })),
        processingTime,
        backend: 'universal-sentence-encoder',
        cached: false
      };
    } catch (error) {
      logger.error('Error generating embeddings with USE:', error);
      throw new Error(`Embedding generation failed: ${error}`);
    }
  }

  async healthCheck(): Promise<boolean> {
    try {
      if (!this.isInitialized || !this.model) {
        return false;
      }

      // Test with a simple embedding
      const testEmbedding = await this.model.embed(['test']);
      const result = testEmbedding.arraySync();
      
      return Array.isArray(result) && result.length > 0;
    } catch (error) {
      logger.error('USE health check failed:', error);
      return false;
    }
  }
}