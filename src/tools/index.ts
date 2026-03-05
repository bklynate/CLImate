// LangChain Tools Index
// Export all tools for use with the agent

import { calculateTool } from './calculate';
import { currentDateTimeTool } from './dateTime';
import { currentLocationTool } from './currentLocation';
import { currentWeatherTool } from './weather';
import { queryDuckDuckGoTool } from './webSearch';

// Export individual tools
export {
  calculateTool,
  currentDateTimeTool,
  currentLocationTool,
  currentWeatherTool,
  queryDuckDuckGoTool,
};

// Export as array for use with createReactAgent
export const tools = [
  calculateTool,
  currentDateTimeTool,
  currentLocationTool,
  currentWeatherTool,
  queryDuckDuckGoTool,
];

export default tools;
