/**
 * Configuration Module for LangChain Agent
 * 
 * Centralized, type-safe configuration with environment validation.
 * All settings are validated at startup to fail fast on misconfiguration.
 */

import 'dotenv/config';
import { z } from 'zod';
import { configLogger } from './logger';

/**
 * Environment variable schema with validation
 */
const envSchema = z.object({
  // LLM Provider Configuration
  LLM_PROVIDER: z.enum(['ollama', 'lmstudio', 'lm-studio', 'openai'])
    .default('ollama')
    .describe('The LLM provider to use'),
  LLM_MODEL: z.string()
    .default('llama4:scout')
    .describe('The model name to use'),
  LLM_BASE_URL: z.string()
    .optional()
    .describe('Custom base URL for the LLM API'),
  LLM_TEMPERATURE: z.string()
    .transform(val => parseFloat(val))
    .pipe(z.number().min(0).max(2))
    .optional()
    .default('0.1')
    .describe('Temperature for LLM responses'),

  // API Keys
  OPENAI_API_KEY: z.string()
    .optional()
    .describe('OpenAI API key (required for openai provider)'),
  TOMORROW_WEATHER_API_KEY: z.string()
    .optional()
    .describe('Tomorrow.io API key for weather tool'),

  // Logging Configuration
  LOG_LEVEL: z.enum(['error', 'warn', 'info', 'debug', 'verbose'])
    .default('info')
    .describe('Logging level'),
  LOG_DIR: z.string()
    .default('.')
    .describe('Directory for log files'),
  LOG_TO_CONSOLE: z.string()
    .transform(val => val !== 'false')
    .default('true')
    .describe('Whether to log to console'),

  // Memory/Persistence Configuration
  DB_FILE: z.string()
    .default('db-langchain.json')
    .describe('Database file path for conversation persistence'),

  // CLI Configuration
  CLI_THEME: z.enum(['default', 'minimal', 'verbose'])
    .default('default')
    .describe('CLI output theme'),
});

type EnvConfig = z.infer<typeof envSchema>;

/**
 * Validated environment configuration
 */
let _config: EnvConfig | null = null;

/**
 * Get the validated configuration
 * Throws on first access if environment is invalid
 */
export const getConfig = (): EnvConfig => {
  if (_config) return _config;

  const result = envSchema.safeParse(process.env);

  if (!result.success) {
    const errors = result.error.issues.map(issue => 
      `  - ${issue.path.join('.')}: ${issue.message}`
    ).join('\n');
    
    configLogger.error('Configuration validation failed:\n' + errors);
    throw new Error(`Invalid configuration:\n${errors}`);
  }

  _config = result.data;
  configLogger.debug('Configuration loaded successfully', { 
    provider: _config.LLM_PROVIDER,
    model: _config.LLM_MODEL,
  });

  return _config;
};

/**
 * Normalized provider configuration
 */
export interface ProviderConfig {
  provider: 'ollama' | 'lm-studio' | 'openai';
  model: string;
  baseUrl: string;
  temperature: number;
  apiKey?: string;
}

/**
 * Get normalized provider configuration
 */
export const getProviderConfig = (): ProviderConfig => {
  const config = getConfig();
  
  // Normalize provider name
  let provider: 'ollama' | 'lm-studio' | 'openai';
  if (config.LLM_PROVIDER === 'lmstudio' || config.LLM_PROVIDER === 'lm-studio') {
    provider = 'lm-studio';
  } else {
    provider = config.LLM_PROVIDER as 'ollama' | 'openai';
  }

  // Determine base URL
  let baseUrl: string;
  if (config.LLM_BASE_URL) {
    baseUrl = config.LLM_BASE_URL;
  } else {
    switch (provider) {
      case 'ollama':
        baseUrl = 'http://localhost:11434';
        break;
      case 'lm-studio':
        baseUrl = 'http://localhost:1234/v1';
        break;
      case 'openai':
        baseUrl = 'https://api.openai.com/v1';
        break;
    }
  }

  return {
    provider,
    model: config.LLM_MODEL,
    baseUrl,
    temperature: config.LLM_TEMPERATURE ?? 0.1,
    apiKey: config.OPENAI_API_KEY,
  };
};

/**
 * Check if a specific tool's API key is configured
 */
export const hasApiKey = (keyName: 'weather' | 'openai'): boolean => {
  const config = getConfig();
  switch (keyName) {
    case 'weather':
      return !!config.TOMORROW_WEATHER_API_KEY;
    case 'openai':
      return !!config.OPENAI_API_KEY;
    default:
      return false;
  }
};

/**
 * Get API key for a specific service
 */
export const getApiKey = (keyName: 'weather' | 'openai'): string | undefined => {
  const config = getConfig();
  switch (keyName) {
    case 'weather':
      return config.TOMORROW_WEATHER_API_KEY;
    case 'openai':
      return config.OPENAI_API_KEY;
    default:
      return undefined;
  }
};

/**
 * Logging configuration
 */
export interface LogConfig {
  level: 'error' | 'warn' | 'info' | 'debug' | 'verbose';
  dir: string;
  toConsole: boolean;
}

export const getLogConfig = (): LogConfig => {
  const config = getConfig();
  return {
    level: config.LOG_LEVEL,
    dir: config.LOG_DIR,
    toConsole: config.LOG_TO_CONSOLE,
  };
};

/**
 * Memory/persistence configuration
 */
export const getDbFile = (): string => {
  return getConfig().DB_FILE;
};

/**
 * Print configuration summary (for debugging)
 */
export const printConfigSummary = (): void => {
  const config = getConfig();
  const providerConfig = getProviderConfig();
  
  console.log('\n📋 Configuration Summary:');
  console.log(`  Provider: ${providerConfig.provider}`);
  console.log(`  Model: ${providerConfig.model}`);
  console.log(`  Base URL: ${providerConfig.baseUrl}`);
  console.log(`  Temperature: ${providerConfig.temperature}`);
  console.log(`  Log Level: ${config.LOG_LEVEL}`);
  console.log(`  DB File: ${config.DB_FILE}`);
  console.log(`  Weather API: ${hasApiKey('weather') ? '✓ configured' : '✗ not set'}`);
  console.log(`  OpenAI API: ${hasApiKey('openai') ? '✓ configured' : '✗ not set'}`);
  console.log();
};

export default getConfig;
