import type { AIMessage } from 'types';
import { z } from 'zod';
import { zodFunction } from 'openai/helpers/zod';
import { getLocalAIByProvider } from '@src/ai';
import { enhanceSystemPrompt } from '@src/enhancements';

const models = ['llama3.3:70b', 'gpt-oss:120b'];

export const runLLM = async ({
  model = models[1],
  messages,
  temperature = 0.2,
  tools = [],
}: {
  model?: string;
  temperature?: number;
  messages: AIMessage[];
  tools?: { name: string; parameters: z.AnyZodObject }[];
}) => {
  const formattedTools = tools?.map((tool) => zodFunction(tool));

  // Extract user input for enhancement detection
  const userInput =
    messages.length > 0
      ? typeof messages[messages.length - 1]?.content === 'string'
        ? messages[messages.length - 1]?.content || ''
        : ''
      : '';

  // Generate enhanced system prompt with task-specific examples
  const enhancedPrompt = await enhanceSystemPrompt(messages, userInput);

  const response = await getLocalAIByProvider('ollama').chat.completions.create({
    model,
    temperature,
    messages: [
      {
        role: 'system',
        content: enhancedPrompt,
      },
      ...messages,
    ],
    tools: formattedTools,
    tool_choice: 'auto',
    parallel_tool_calls: false,
  });

  return response.choices[0].message;
};