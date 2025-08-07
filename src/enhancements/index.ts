import type { AIMessage } from 'types';
import type { EnhancementResult } from './types';
import { detectTasks } from './taskDetector';
import { enhancementModules } from './enhancementModules';
import { systemPrompt } from '@src/systemPrompt';

/**
 * Enhances the system prompt with task-specific examples for one-shot prompting benefits
 * @param messages - Conversation history for context
 * @param userMessage - Current user input for task detection
 * @returns Enhanced system prompt with relevant examples
 */
export const enhanceSystemPrompt = async (
  messages: AIMessage[],
  userMessage: string = ''
): Promise<string> => {
  // Extract user input from messages if not provided directly
  let actualUserInput = userMessage;
  if (!actualUserInput && messages.length > 0) {
    const lastMessage = messages[messages.length - 1];
    if (lastMessage && typeof lastMessage.content === 'string') {
      actualUserInput = lastMessage.content;
    }
  }

  // Fast task detection (no LLM overhead)
  const detectedTasks = detectTasks(actualUserInput, messages);
  
  // If no specific tasks detected, return base prompt
  if (detectedTasks.length === 0) {
    return systemPrompt;
  }

  // Collect relevant enhancements
  const activeEnhancements: string[] = [];
  
  for (const taskType of detectedTasks) {
    const module = enhancementModules.find(mod => mod.name === taskType);
    if (module) {
      // Double-check with module's own detector for precision
      if (module.detect(actualUserInput, messages)) {
        activeEnhancements.push(module.enhance());
      }
    }
  }

  // If no enhancements triggered, return base prompt
  if (activeEnhancements.length === 0) {
    return systemPrompt;
  }

  // Compose enhanced prompt
  const enhancedPrompt = [
    systemPrompt,
    '',
    '**Task-Specific Examples**:',
    ...activeEnhancements,
  ].join('\\n');

  return enhancedPrompt;
};

/**
 * Enhanced version that returns detailed information about the enhancement process
 */
export const enhanceSystemPromptDetailed = async (
  messages: AIMessage[],
  userMessage: string = ''
): Promise<EnhancementResult> => {
  let actualUserInput = userMessage;
  if (!actualUserInput && messages.length > 0) {
    const lastMessage = messages[messages.length - 1];
    if (lastMessage && typeof lastMessage.content === 'string') {
      actualUserInput = lastMessage.content;
    }
  }

  const detectedTasks = detectTasks(actualUserInput, messages);
  const activeEnhancements: string[] = [];
  
  for (const taskType of detectedTasks) {
    const module = enhancementModules.find(mod => mod.name === taskType);
    if (module && module.detect(actualUserInput, messages)) {
      activeEnhancements.push(module.enhance());
    }
  }

  const enhanced = activeEnhancements.length > 0;
  const finalPrompt = enhanced 
    ? [systemPrompt, '', '**Task-Specific Examples**:', ...activeEnhancements].join('\\n')
    : systemPrompt;

  return {
    enhanced,
    basePrompt: systemPrompt,
    enhancements: activeEnhancements,
    finalPrompt,
  };
};

// Export task detection for external use
export { detectTasks } from './taskDetector';
export { enhancementModules } from './enhancementModules';
export type { EnhancementModule, EnhancementResult } from './types';