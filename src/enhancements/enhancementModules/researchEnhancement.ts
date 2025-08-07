import type { EnhancementModule } from '../types';

export const researchEnhancement: EnhancementModule = {
  name: 'research',
  description: 'Enhances research and information gathering tasks with proven examples',
  
  detect: (userInput: string) => {
    const input = userInput.toLowerCase();
    const researchIndicators = [
      'latest', 'current', 'recent', 'news', 'updates', 'developments',
      'what\'s happening', 'find information', 'research', 'look up'
    ];
    
    return researchIndicators.some(indicator => input.includes(indicator));
  },

  enhance: () => {
    return `
**Research Task Example**:
User: "What are the latest developments in renewable energy?"

\`\`\`json
{
  "tool_calls": [{
    "id": "research-1",
    "function": {
      "name": "query_duckduckgo",
      "arguments": "{\\"query\\": \\"renewable energy developments 2025\\", \\"numOfResults\\": 5, \\"reasoning\\": \\"User needs current information about renewable energy progress that may not be in my training data\\", \\"reflection\\": \\"I'll evaluate results for recency, credibility of sources, and relevance to energy developments\\"}"
    },
    "type": "function"
  }]
}
\`\`\``;
  },
};