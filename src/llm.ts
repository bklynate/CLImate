import type { AIMessage } from 'types';
import { z } from 'zod';
import { zodFunction } from 'openai/helpers/zod';
import { getLocalAIByProvider } from '@src/ai';
import { systemPrompt } from '@src/systemPrompt';

const models = [
  'llama4:scout',
  'qwen3:32b',
];

export const runLLM = async ({
  model = models[0],
  messages,
  temperature = 0.1,
  tools = [],
}: {
  model?: string;
  temperature?: number;
  messages: AIMessage[];
  tools?: { name: string; parameters: z.AnyZodObject }[];
}) => {
  const formattedTools = tools?.map((tool) => zodFunction(tool));

  const response = await getLocalAIByProvider().chat.completions.create({
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
