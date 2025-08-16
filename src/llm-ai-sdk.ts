import { z } from 'zod';
import { generateText, tool, type CoreMessage } from 'ai';
import { createOpenAICompatible}  from '@ai-sdk/openai-compatible';
import { enhanceSystemPrompt } from '@src/enhancements';
import { getLocalAIByProvider } from '@src/ai';
import type { AIMessage } from 'types';

// Adapter: Use AI SDK with an OpenAI-compatible endpoint (Ollama by default)
// while keeping the same runLLM API shape as src/llm.ts.

const models = ['llama3.3:70b', 'gpt-oss:120b'] as const;

// Map stored OpenAI-style messages to AI SDK CoreMessage[]
function toCoreMessages(messages: AIMessage[], systemOverride?: string): CoreMessage[] {
  const core: CoreMessage[] = [];
  if (systemOverride && systemOverride.trim()) {
    core.push({ role: 'system', content: systemOverride });
  }

  for (const m of messages) {
    if (m.role === 'user') {
      core.push({ role: 'user', content: typeof m.content === 'string' ? m.content : '' });
      continue;
    }

    if (m.role === 'assistant') {
      // Preserve assistant-visible content; ignore tool_calls history here,
      // as AI SDK will re-handle tools via execute() when needed.
      const content = (m as any).content ?? '';
      if (content) core.push({ role: 'assistant', content });
      continue;
    }

    if (m.role === 'tool') {
      // Represent prior tool output as user-visible context to keep things simple.
      const toolCallId = (m as any).tool_call_id || 'tool';
      const content = typeof m.content === 'string' ? m.content : JSON.stringify(m.content);
      core.push({ role: 'user', content: `Tool result (${toolCallId}):\n${content}` });
      continue;
    }
  }
  return core;
}

export const runLLM = async ({
  model = models[0],
  messages,
  temperature = 0.2,
  tools = [],
}: {
  model?: string;
  temperature?: number;
  messages: AIMessage[];
  tools?: { name: string; parameters: z.AnyZodObject }[];
}) => {
  // Build an OpenAI-compatible provider pointing to the same baseURL as getLocalAIByProvider('ollama')
  const localOpenAI = getLocalAIByProvider('ollama');
  const baseURL = (localOpenAI as any).baseURL || 'http://localhost:11434/v1/';

  const openaiCompat = createOpenAICompatible({
    apiKey: process.env.OPENAI_API_KEY || 'nokey',
    baseURL,
  });

  // Extract user input for enhancement detection
  const userInput =
    messages.length > 0
      ? typeof messages[messages.length - 1]?.content === 'string'
        ? (messages[messages.length - 1]?.content as string) || ''
        : ''
      : '';

  // Generate enhanced system prompt with task-specific examples
  const enhancedPrompt = await enhanceSystemPrompt(messages, userInput);

  // Define tool schemas only; we'll map tool calls back to your toolRunner via the agent loop
  const toolsRecord = Object.fromEntries(
    (tools || []).map((t) => [
      t.name,
      tool({ description: t.name, parameters: t.parameters }),
    ])
  );

  // Build CoreMessage[] including the enhanced system message
  const coreMessages = toCoreMessages(messages, enhancedPrompt);

  // Let the SDK manage tool calls and return the final assistant text
  const result = await generateText({
    model: openaiCompat(model),
    messages: coreMessages,
    tools: toolsRecord,
    temperature,
  });

  // If the model requested tool calls, return them in OpenAI-compatible shape
  const toolCalls: any[] = Array.isArray((result as any).toolCalls)
    ? (result as any).toolCalls.map((c: any) => ({
        id: c.id || c.toolCallId || crypto.randomUUID(),
        type: 'function',
        function: {
          name: c.toolName || c.name || c.tool || 'unknown_tool',
          arguments: JSON.stringify(c.args ?? c.arguments ?? {}),
        },
      }))
    : [];

  if (toolCalls.length > 0) {
    return {
      role: 'assistant' as const,
      content: null as any,
      tool_calls: toolCalls,
    } as any;
  }

  // Otherwise return assistant content
  return {
    role: 'assistant' as const,
    content: result.text,
  } as any;
};
