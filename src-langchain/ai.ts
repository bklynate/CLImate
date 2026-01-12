import { ChatOllama } from '@langchain/ollama';
import { ChatOpenAI } from '@langchain/openai';
import type { BaseChatModel } from '@langchain/core/language_models/chat_models';
import 'dotenv/config';

/**
 * Supported LLM providers
 */
export type Provider = 'ollama' | 'lm-studio' | 'lmstudio' | 'openai';

/**
 * Model configuration options
 */
export interface ModelConfig {
  provider: Provider;
  model: string;
  baseUrl?: string;
  temperature?: number;
  apiKey?: string;
}

/**
 * Normalize provider name to handle variations
 */
const normalizeProvider = (provider: string): 'ollama' | 'lm-studio' | 'openai' => {
  const normalized = provider.toLowerCase().trim();
  if (normalized === 'lmstudio' || normalized === 'lm-studio') {
    return 'lm-studio';
  }
  if (normalized === 'ollama') {
    return 'ollama';
  }
  if (normalized === 'openai') {
    return 'openai';
  }
  throw new Error(`Unknown provider: ${provider}. Supported providers: ollama, lm-studio, openai`);
};

/**
 * Default configuration values
 */
const defaults: ModelConfig = {
  provider: (process.env.LLM_PROVIDER as Provider) ?? 'ollama',
  model: process.env.LLM_MODEL ?? 'llama4:scout',
  baseUrl: process.env.LLM_BASE_URL,
  temperature: 0.1,
};

/**
 * Creates and returns a chat model based on the specified provider.
 * 
 * Supports:
 * - Ollama: Native Ollama integration via @langchain/ollama
 * - LM Studio: OpenAI-compatible API at localhost:1234
 * - OpenAI: Direct OpenAI API
 * 
 * @param config - Optional configuration overrides
 * @returns A configured chat model instance
 * 
 * @example
 * // Use default Ollama configuration
 * const model = await getModel();
 * 
 * @example
 * // Use LM Studio with custom model
 * const model = await getModel({ 
 *   provider: 'lm-studio', 
 *   model: 'qwen3:32b' 
 * });
 * 
 * @example
 * // Use OpenAI
 * const model = await getModel({ 
 *   provider: 'openai', 
 *   model: 'gpt-4o' 
 * });
 */
export const getModel = async (
  config?: Partial<ModelConfig>
): Promise<BaseChatModel> => {
  const rawProvider = config?.provider ?? defaults.provider;
  const provider = normalizeProvider(rawProvider);
  const modelName = config?.model ?? defaults.model;
  const temperature = config?.temperature ?? defaults.temperature;
  const baseUrl = config?.baseUrl ?? defaults.baseUrl;

  switch (provider) {
    case 'ollama': {
      // Native Ollama support with tool calling
      const ollamaBaseUrl = baseUrl ?? 'http://localhost:11434';
      console.log(`[AI] Using Ollama at ${ollamaBaseUrl} with model: ${modelName}`);
      
      return new ChatOllama({
        model: modelName,
        baseUrl: ollamaBaseUrl,
        temperature,
      });
    }

    case 'lm-studio': {
      // LM Studio via OpenAI-compatible API
      const lmStudioBaseUrl = baseUrl ?? 'http://localhost:1234/v1';
      console.log(`[AI] Using LM Studio at ${lmStudioBaseUrl} with model: ${modelName}`);
      
      return new ChatOpenAI({
        model: modelName,
        temperature,
        configuration: {
          baseURL: lmStudioBaseUrl,
          apiKey: 'not-needed', // LM Studio doesn't require API key
        },
      });
    }

    case 'openai': {
      // Direct OpenAI API
      const apiKey = config?.apiKey ?? process.env.OPENAI_API_KEY;
      
      if (!apiKey) {
        throw new Error('OpenAI API key is required. Set OPENAI_API_KEY environment variable.');
      }
      
      console.log(`[AI] Using OpenAI with model: ${modelName}`);
      
      return new ChatOpenAI({
        model: modelName,
        temperature,
        apiKey,
      });
    }

    default:
      throw new Error(`Unknown provider: ${provider}. Supported providers: ollama, lm-studio, openai`);
  }
};

/**
 * Get a model instance configured for the current environment.
 * This is a convenience function that uses environment variables for configuration.
 */
export const getDefaultModel = () => getModel();
