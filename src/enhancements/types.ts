import type { AIMessage } from 'types';

export interface EnhancementModule {
  name: string;
  description: string;
  detect: (userInput: string, context: AIMessage[]) => boolean;
  enhance: () => string;
}

export interface TaskContext {
  userInput: string;
  messages: AIMessage[];
  detectedTasks: string[];
}

export type EnhancementResult = {
  enhanced: boolean;
  basePrompt: string;
  enhancements: string[];
  finalPrompt: string;
};