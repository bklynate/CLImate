import type { EnhancementModule } from '../types';

export const factualEnhancement: EnhancementModule = {
  name: 'factual',
  description: 'Enhances factual queries with precise tool usage examples',
  
  detect: (userInput: string) => {
    const input = userInput.toLowerCase();
    const factualIndicators = [
      'weather', 'time', 'location', 'where am i', 'what time',
      'temperature', 'forecast', 'current location', 'timezone'
    ];
    
    return factualIndicators.some(indicator => input.includes(indicator));
  },

  enhance: () => {
    return `
**Factual Query Examples**:
User: "What's the weather in Tokyo?"
\`\`\`json
{
  "tool_calls": [{
    "id": "weather-1",
    "function": {
      "name": "current_weather",
      "arguments": "{\\"city\\": \\"Tokyo\\", \\"reasoning\\": \\"User needs current weather conditions for Tokyo\\", \\"reflection\\": \\"Will verify data includes temperature, conditions, and any weather advisories\\"}"
    },
    "type": "function"
  }]
}
\`\`\`

User: "What time is it in London?"
\`\`\`json
{
  "tool_calls": [{
    "id": "time-1", 
    "function": {
      "name": "current_date_time",
      "arguments": "{\\"timezone\\": \\"Europe/London\\", \\"format\\": \\"both\\", \\"reasoning\\": \\"User needs current time in London timezone\\", \\"reflection\\": \\"Will ensure timezone conversion is accurate\\"}"
    },
    "type": "function"
  }]
}
\`\`\``;
  },
};