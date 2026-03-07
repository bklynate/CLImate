// LangChain Tools Index
// Export all tools for use with the agent

import { calculateTool } from './calculate';
import { currentDateTimeTool } from './dateTime';
import { currentLocationTool } from './currentLocation';
import { currentWeatherTool } from './weather';
import { queryDuckDuckGoTool } from './webSearch';
import {
  getSportsEventsTool,
  getSportsOddsTool,
  getSportsScoresTool,
  getStandingsTool,
} from './sports';

// Export individual tools
export {
  calculateTool,
  currentDateTimeTool,
  currentLocationTool,
  currentWeatherTool,
  queryDuckDuckGoTool,
  getSportsEventsTool,
  getSportsOddsTool,
  getSportsScoresTool,
  getStandingsTool,
};

// Export as array for use with createReactAgent
export const tools = [
  calculateTool,
  currentDateTimeTool,
  currentLocationTool,
  currentWeatherTool,
  queryDuckDuckGoTool,
  getSportsEventsTool,
  getSportsOddsTool,
  getSportsScoresTool,
  getStandingsTool,
];

export default tools;
