import { currentLocationToolDefinition } from './currentLocation';
import { currentWeatherToolDefinition } from './weather/currentWeather';
import { queryDuckDuckGoToolDefinition } from './webScraper/queryDuckDuckGo';
import { currentDateTimeToolDefinition } from './dateTime';

export const tools = [
  queryDuckDuckGoToolDefinition,
  currentWeatherToolDefinition,
  currentLocationToolDefinition,
  currentDateTimeToolDefinition,
];
