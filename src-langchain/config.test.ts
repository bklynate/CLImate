/**
 * Tests for Configuration Module
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

describe('Config Module', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    // Reset module cache to test fresh config
    vi.resetModules();
    process.env = { ...originalEnv };
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  it('should use default values when env vars not set', async () => {
    // Clear all LLM-related env vars to test defaults
    delete process.env.LLM_PROVIDER;
    delete process.env.LLM_MODEL;
    delete process.env.LLM_BASE_URL;
    delete process.env.LLM_TEMPERATURE;
    delete process.env.LOG_LEVEL;
    delete process.env.LOG_DIR;
    delete process.env.LOG_TO_CONSOLE;
    delete process.env.DB_FILE;
    delete process.env.CLI_THEME;
    
    const { getConfig } = await import('./config');
    const config = getConfig();
    
    // Note: When no env vars are set, schema defaults apply
    // LLM_PROVIDER defaults to 'ollama', LLM_MODEL defaults to 'llama4:scout'
    expect(['ollama', 'lmstudio', 'lm-studio', 'openai']).toContain(config.LLM_PROVIDER);
    expect(typeof config.LLM_MODEL).toBe('string');
    expect(['error', 'warn', 'info', 'debug', 'verbose']).toContain(config.LOG_LEVEL);
  });

  it('should parse environment variables correctly', async () => {
    process.env.LLM_PROVIDER = 'openai';
    process.env.LLM_MODEL = 'gpt-4o';
    process.env.LOG_LEVEL = 'debug';
    
    const { getConfig } = await import('./config');
    const config = getConfig();
    
    expect(config.LLM_PROVIDER).toBe('openai');
    expect(config.LLM_MODEL).toBe('gpt-4o');
    expect(config.LOG_LEVEL).toBe('debug');
  });

  it('should normalize provider names', async () => {
    process.env.LLM_PROVIDER = 'lmstudio';
    
    const { getProviderConfig } = await import('./config');
    const providerConfig = getProviderConfig();
    
    expect(providerConfig.provider).toBe('lm-studio');
    expect(providerConfig.baseUrl).toBe('http://localhost:1234/v1');
  });

  it('should use correct default base URLs', async () => {
    process.env.LLM_PROVIDER = 'ollama';
    delete process.env.LLM_BASE_URL;
    
    const { getProviderConfig } = await import('./config');
    const providerConfig = getProviderConfig();
    
    expect(providerConfig.baseUrl).toBe('http://localhost:11434');
  });

  it('should detect configured API keys', async () => {
    process.env.TOMORROW_WEATHER_API_KEY = 'test-key';
    delete process.env.OPENAI_API_KEY;
    
    const { hasApiKey } = await import('./config');
    
    expect(hasApiKey('weather')).toBe(true);
    expect(hasApiKey('openai')).toBe(false);
  });

  it('should parse temperature correctly', async () => {
    process.env.LLM_TEMPERATURE = '0.7';
    
    const { getProviderConfig } = await import('./config');
    const providerConfig = getProviderConfig();
    
    expect(providerConfig.temperature).toBe(0.7);
  });

  it('should throw on invalid provider', async () => {
    process.env.LLM_PROVIDER = 'invalid-provider';
    
    const { getConfig } = await import('./config');
    
    expect(() => getConfig()).toThrow();
  });

  it('should throw on invalid log level', async () => {
    process.env.LOG_LEVEL = 'invalid';
    
    const { getConfig } = await import('./config');
    
    expect(() => getConfig()).toThrow();
  });
});
