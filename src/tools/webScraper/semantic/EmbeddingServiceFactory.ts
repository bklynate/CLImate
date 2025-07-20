import { EmbeddingService } from './EmbeddingService';
import { UniversalSentenceEncoderBackend } from './UniversalSentenceEncoderBackend';
import { FallbackStaticBackend } from './FallbackStaticBackend';
import type { EmbeddingBackendConfig, EmbeddingBackendType } from './types';
import logger from '@utils/logger';

/**
 * Factory for creating and managing embedding service backends
 */
export class EmbeddingServiceFactory {
  private static instance: EmbeddingServiceFactory | null = null;
  private backends: Map<string, EmbeddingService> = new Map();
  private activeBackend: EmbeddingService | null = null;
  private initializationPromise: Promise<void> | null = null;

  private constructor() {}

  static getInstance(): EmbeddingServiceFactory {
    if (!EmbeddingServiceFactory.instance) {
      EmbeddingServiceFactory.instance = new EmbeddingServiceFactory();
    }
    return EmbeddingServiceFactory.instance;
  }

  /**
   * Initialize the factory and auto-detect the best available backend
   */
  async initialize(): Promise<void> {
    if (this.initializationPromise) {
      return this.initializationPromise;
    }

    this.initializationPromise = this.doInitialize();
    return this.initializationPromise;
  }

  private async doInitialize(): Promise<void> {
    logger.info('Initializing EmbeddingServiceFactory...');

    // Define backend configurations in priority order
    const backendConfigs: EmbeddingBackendConfig[] = [
      {
        name: 'universal-sentence-encoder',
        enabled: true,
        priority: 100,
        config: {
          // Add any specific USE configuration
        }
      },
      {
        name: 'fallback-static',
        enabled: true,
        priority: 1,
        config: {}
      }
    ];

    // Create and register backends
    for (const config of backendConfigs) {
      try {
        const backend = this.createBackend(config);
        this.backends.set(config.name, backend);
        logger.info(`Registered backend: ${config.name}`);
      } catch (error) {
        logger.error(`Failed to create backend ${config.name}:`, error);
      }
    }

    // Auto-detect and initialize the best available backend
    await this.detectBestBackend();
  }

  /**
   * Create a backend instance based on configuration
   */
  private createBackend(config: EmbeddingBackendConfig): EmbeddingService {
    switch (config.name) {
      case 'universal-sentence-encoder':
        return new UniversalSentenceEncoderBackend(config);
      case 'fallback-static':
        return new FallbackStaticBackend(config);
      default:
        throw new Error(`Unknown backend type: ${config.name}`);
    }
  }

  /**
   * Auto-detect the best available backend by trying to initialize them in priority order
   */
  private async detectBestBackend(): Promise<void> {
    const sortedBackends = Array.from(this.backends.entries())
      .map(([name, backend]) => ({ name, backend }))
      .sort((a, b) => b.backend.getPriority() - a.backend.getPriority());

    for (const { name, backend } of sortedBackends) {
      if (!backend.isEnabled()) {
        logger.info(`Skipping disabled backend: ${name}`);
        continue;
      }

      try {
        logger.info(`Attempting to initialize backend: ${name}`);
        await backend.initialize();
        
        const isHealthy = await backend.healthCheck();
        if (isHealthy) {
          this.activeBackend = backend;
          logger.info(`Successfully initialized and selected backend: ${name}`);
          return;
        } else {
          logger.warn(`Backend ${name} initialized but failed health check`);
        }
      } catch (error) {
        logger.error(`Backend ${name} initialization failed:`, error);
      }
    }

    throw new Error('No embedding backend could be initialized');
  }

  /**
   * Get the currently active backend
   */
  getActiveBackend(): EmbeddingService {
    if (!this.activeBackend) {
      throw new Error('No active embedding backend available. Call initialize() first.');
    }
    return this.activeBackend;
  }

  /**
   * Get a specific backend by name
   */
  getBackend(name: string): EmbeddingService | undefined {
    return this.backends.get(name);
  }

  /**
   * Get all registered backends
   */
  getAllBackends(): EmbeddingService[] {
    return Array.from(this.backends.values());
  }

  /**
   * Force switch to a specific backend
   */
  async switchBackend(name: string): Promise<void> {
    const backend = this.backends.get(name);
    if (!backend) {
      throw new Error(`Backend not found: ${name}`);
    }

    if (!backend.getInitialized()) {
      await backend.initialize();
    }

    const isHealthy = await backend.healthCheck();
    if (!isHealthy) {
      throw new Error(`Backend ${name} is not healthy`);
    }

    this.activeBackend = backend;
    logger.info(`Switched to backend: ${name}`);
  }

  /**
   * Get status of all backends
   */
  async getBackendStatus(): Promise<Array<{
    name: string;
    enabled: boolean;
    initialized: boolean;
    healthy: boolean;
    priority: number;
    isActive: boolean;
  }>> {
    const status = [];
    
    for (const [name, backend] of this.backends) {
      const healthy = backend.getInitialized() ? await backend.healthCheck() : false;
      
      status.push({
        name,
        enabled: backend.isEnabled(),
        initialized: backend.getInitialized(),
        healthy,
        priority: backend.getPriority(),
        isActive: this.activeBackend === backend
      });
    }

    return status.sort((a, b) => b.priority - a.priority);
  }

  /**
   * Attempt to recover from backend failures
   */
  async recover(): Promise<void> {
    logger.info('Attempting to recover embedding service...');
    
    // Reset initialization state
    this.initializationPromise = null;
    this.activeBackend = null;
    
    // Clear initialization state of backends
    for (const backend of this.backends.values()) {
      // Reset backend state if possible
      (backend as any).isInitialized = false;
      (backend as any).initializationPromise = null;
    }
    
    // Re-initialize
    await this.initialize();
  }
}

/**
 * Convenience function to get initialized embedding service
 */
export async function getEmbeddingService(): Promise<EmbeddingService> {
  const factory = EmbeddingServiceFactory.getInstance();
  await factory.initialize();
  return factory.getActiveBackend();
}