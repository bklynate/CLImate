import type { AIMessage } from 'types';

export interface TaskPattern {
  name: string;
  keywords: string[];
  patterns: RegExp[];
  contextClues: string[];
}

// Fast pattern-based task detection (no LLM overhead)
const taskPatterns: TaskPattern[] = [
  {
    name: 'research',
    keywords: ['latest', 'current', 'news', 'recent', 'happening', 'updates', 'developments'],
    patterns: [
      /what'?s (the )?latest/i,
      /current (state|status|situation)/i,
      /recent (news|developments|updates)/i,
      /happening (now|today|recently)/i,
    ],
    contextClues: ['?', 'find', 'search', 'look up', 'information about'],
  },
  {
    name: 'analysis',
    keywords: ['analyze', 'compare', 'breakdown', 'evaluate', 'assess', 'examine', 'review'],
    patterns: [
      /analyze (this|the|these)/i,
      /compare .+ (to|with|vs)/i,
      /break down/i,
      /what are the (pros|cons|advantages|disadvantages)/i,
    ],
    contextClues: ['data', 'report', 'document', 'table', 'chart'],
  },
  {
    name: 'factual',
    keywords: ['weather', 'time', 'location', 'temperature', 'where am i', 'what time'],
    patterns: [
      /weather in/i,
      /time in/i,
      /where am i/i,
      /what time is it/i,
      /current (weather|temperature|location|time)/i,
    ],
    contextClues: ['forecast', 'celsius', 'fahrenheit', 'timezone', 'coordinates'],
  },
];

export const detectTasks = (
  userInput: string,
  context: AIMessage[] = []
): string[] => {
  const input = userInput.toLowerCase();
  const detectedTasks: string[] = [];

  for (const pattern of taskPatterns) {
    let score = 0;

    // Check keywords
    for (const keyword of pattern.keywords) {
      if (input.includes(keyword.toLowerCase())) {
        score += 2;
      }
    }

    // Check regex patterns
    for (const regex of pattern.patterns) {
      if (regex.test(userInput)) {
        score += 3;
      }
    }

    // Check context clues
    for (const clue of pattern.contextClues) {
      if (input.includes(clue.toLowerCase())) {
        score += 1;
      }
    }

    // Boost score based on conversation context
    if (context.length > 0) {
      const lastMessage = context[context.length - 1];
      if (lastMessage?.content && pattern.name === 'research') {
        // If previous response used web search, likely continuing research
        if (lastMessage.content.includes('search') || lastMessage.tool_calls?.some(call => 
          call.function.name === 'query_duckduckgo'
        )) {
          score += 1;
        }
      }
    }

    // Threshold for task detection
    if (score >= 3) {
      detectedTasks.push(pattern.name);
    }
  }

  return [...new Set(detectedTasks)]; // Remove duplicates
};

export const getTaskContext = (
  userInput: string,
  messages: AIMessage[]
): { userInput: string; messages: AIMessage[]; detectedTasks: string[] } => {
  return {
    userInput,
    messages,
    detectedTasks: detectTasks(userInput, messages),
  };
};