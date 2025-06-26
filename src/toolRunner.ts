import type OpenAI from 'openai';
import { queryDuckDuckGo } from './tools/webScraper/queryDuckDuckGo';
import { currentWeather } from '@tools/weather';
import { currentLocationTool } from '@src/tools/currentLocation';
import logger from '@utils/logger';

// Map of tool functions
const toolFunctions: Record<string, Function> = {
  query_duckduckgo: queryDuckDuckGo,
  current_weather: currentWeather,
  current_location: currentLocationTool,
};

export const runTool = async (
  toolCall: OpenAI.Chat.Completions.ChatCompletionMessageToolCall,
  userMessage: string
) => {
  const input = {
    userMessage,
    toolArgs: JSON.parse(toolCall.function.arguments || '{}'),
  };

  const toolFunction = toolFunctions[toolCall.function.name];
  if (!toolFunction) {
    throw new Error(`Tool ${toolCall.function.name} not found`);
  }

  logger.info(`Running tool: ${toolCall.function.name}`);

  try {
    const response = await toolFunction(input);
    return response;
  } catch (error: any) {
    console.error(`Error in tool ${toolCall.function.name}:`, error);
    throw new Error(
      `Error running tool ${toolCall.function.name}: ${error.message}`
    );
  }
};
