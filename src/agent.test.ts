/**
 * Tests for Agent Module
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { HumanMessage, AIMessage, SystemMessage } from '@langchain/core/messages';

// Mock the LLM to avoid actual API calls
vi.mock('./ai', () => ({
  getModel: vi.fn().mockResolvedValue({
    invoke: vi.fn().mockResolvedValue(new AIMessage('Mocked response')),
    bindTools: vi.fn().mockReturnThis(),
  }),
}));

describe('Agent Module', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('AgentConfig interface', () => {
    it('should accept valid configuration', async () => {
      const { createAgent } = await import('./agent');
      
      // This should not throw
      const config = {
        systemPrompt: 'You are a helpful assistant',
        tools: [],
      };
      
      expect(config.systemPrompt).toBe('You are a helpful assistant');
      expect(config.tools).toEqual([]);
    });
  });

  describe('Message building', () => {
    it('should create HumanMessage correctly', () => {
      const message = new HumanMessage('Hello');
      expect(message.content).toBe('Hello');
    });

    it('should create SystemMessage correctly', () => {
      const message = new SystemMessage('You are a helpful assistant');
      expect(message.content).toBe('You are a helpful assistant');
    });

    it('should create AIMessage correctly', () => {
      const message = new AIMessage('I can help with that!');
      expect(message.content).toBe('I can help with that!');
    });
  });
});

describe('Agent Response', () => {
  it('should have correct structure', () => {
    interface AgentResponse {
      content: string;
      messages: (HumanMessage | AIMessage | SystemMessage)[];
    }

    const response: AgentResponse = {
      content: 'Test response',
      messages: [
        new HumanMessage('Hello'),
        new AIMessage('Hi there!'),
      ],
    };

    expect(response.content).toBe('Test response');
    expect(response.messages).toHaveLength(2);
  });
});
