import { z } from 'zod';
import { runLLM } from '@src/llm';
import { runTool } from '@src/toolRunner';
import { addMessages, getMessages, saveToolResponse } from '@src/memory';
import { showLoader } from '@src/ui';

export const runAgent = async ({
  turns = true,
  userMessage,
  tools,
}: {
  turns?: boolean | number;
  userMessage: string;
  tools: { name: string; parameters: z.AnyZodObject }[];
}) => {
  await addMessages([{ role: 'user', content: userMessage }]);

  const loader = showLoader('Thinking...');

  const tries = turns === true ? true : turns;

  while (tries) {
    const messages = await getMessages();
    const response = await runLLM({
      messages,
      tools,
    });

    await addMessages([response]);

    if (response.content) {
      loader.stop();
      const messages = await getMessages();
      return messages;
    }

    if (response.tool_calls) {
      const toolCall = response.tool_calls[0];
      loader.update(`Running tool: ${toolCall.function.name}`);
      const toolResponse = await runTool(toolCall, userMessage);
      await saveToolResponse(toolCall.id, toolResponse);
      loader.update(`Tool ${toolCall.function.name} finished running...`);
    }
  }
};
