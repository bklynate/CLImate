import OpenAI from 'openai';
import dotenv from 'dotenv';

dotenv.config();

export const openai = new OpenAI();

export const localai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
  baseURL: 'http://localhost:11434/v1/',
});

export const getLocalAIByProvider = (provider?: 'ollama') => {
  const baseURL =
    provider === 'ollama'
      ? 'http://localhost:11434/v1/'
      : 'http://localhost:1234/v1/';

  return new OpenAI({
    apiKey: process.env.OPENAI_API_KEY,
    baseURL,
  });
};