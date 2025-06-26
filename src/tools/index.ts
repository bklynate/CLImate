import { currentLocationToolDefinition } from './currentLocation';
import { currentWeatherToolDefinition } from './weather/currentWeather';
import { queryDuckDuckGoToolDefinition } from './webScraper/queryDuckDuckGo';

export const tools = [
  queryDuckDuckGoToolDefinition,
  currentWeatherToolDefinition,
  currentLocationToolDefinition,
];
