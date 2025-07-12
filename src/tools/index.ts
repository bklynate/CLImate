import { currentLocationToolDefinition } from './currentLocation';
import { currentWeatherToolDefinition } from './weather/currentWeather';
import { queryDuckDuckGoToolDefinition } from './webScraper/queryDuckDuckGo';
// import {
//   getOddsUSADefinition,
//   fetchTrackedSportsDefinition,
// } from './bettingOdds';

export const tools = [
  queryDuckDuckGoToolDefinition,
  currentWeatherToolDefinition,
  currentLocationToolDefinition,
  // fetchTrackedSportsDefinition,
  // getOddsUSADefinition,
];
