// LangChain Tools Index
// Export all tools for use with the agent

import { currentDateTimeTool } from './dateTime';
import { currentLocationTool } from './currentLocation';
import { currentWeatherTool } from './weather';
import { queryDuckDuckGoTool } from './webSearch';

// Export individual tools
export {
  currentDateTimeTool,
  currentLocationTool,
  currentWeatherTool,
  queryDuckDuckGoTool,
};

// Export as array for use with createReactAgent
export const tools = [
  currentDateTimeTool,
  currentLocationTool,
  currentWeatherTool,
  queryDuckDuckGoTool,
];

export default tools;
