import type { AIMessage } from 'types';
import { z } from 'zod';
import { zodFunction } from 'openai/helpers/zod';
import { getLocalAIByProvider } from '@src/ai';
import { systemPrompt } from '@src/systemPrompt';

const models = [
  'llama4:16x17b',
  'deepseek-r1:70b',
  'qwen3:32b',
  'llama3.3:70b',
];

export const runLLM = async ({
  model = models[3],
  messages,
  temperature = 0.8,
  tools = [],
}: {
  model?: string;
  temperature?: number;
  messages: AIMessage[];
  tools?: { name: string; parameters: z.AnyZodObject }[];
}) => {
  const formattedTools = tools?.map((tool) => zodFunction(tool));

  const response = await getLocalAIByProvider('ollama').chat.completions.create({
    model,
    temperature,
    messages: [
      {
        role: 'system',
        content: systemPrompt,
      },
      ...messages,
    ],
    tools: formattedTools,
    tool_choice: 'auto',
    parallel_tool_calls: false,
  });

  return response.choices[0].message;
};
