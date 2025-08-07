import type { EnhancementModule } from '../types';

export const analysisEnhancement: EnhancementModule = {
  name: 'analysis',
  description: 'Enhances analytical and comparison tasks with structured examples',
  
  detect: (userInput: string) => {
    const input = userInput.toLowerCase();
    const analysisIndicators = [
      'analyze', 'compare', 'breakdown', 'evaluate', 'assess', 'examine',
      'pros and cons', 'advantages', 'disadvantages', 'differences', 'similarities'
    ];
    
    return analysisIndicators.some(indicator => input.includes(indicator));
  },

  enhance: () => {
    return `
**Analysis Task Example**:
User: "Compare the advantages of solar vs wind energy"

Step 1: Research current data
\`\`\`json
{
  "tool_calls": [{
    "id": "analysis-research-1",
    "function": {
      "name": "query_duckduckgo", 
      "arguments": "{\\"query\\": \\"solar energy advantages disadvantages 2025\\", \\"numOfResults\\": 3, \\"reasoning\\": \\"Need current data on solar energy for accurate comparison\\", \\"reflection\\": \\"Will evaluate for technical accuracy and recent cost/efficiency data\\"}"
    },
    "type": "function"
  }]
}
\`\`\`

Step 2: Research comparison data  
\`\`\`json
{
  "tool_calls": [{
    "id": "analysis-research-2", 
    "function": {
      "name": "query_duckduckgo",
      "arguments": "{\\"query\\": \\"wind energy advantages disadvantages 2025\\", \\"numOfResults\\": 3, \\"reasoning\\": \\"Need current wind energy data to complete comparison\\", \\"reflection\\": \\"Will compare efficiency, costs, and environmental impact metrics\\"}"
    },
    "type": "function"
  }]
}
\`\`\``;
  },
};