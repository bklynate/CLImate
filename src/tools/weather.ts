import { tool } from '@langchain/core/tools';
import { z } from 'zod';

const weatherSchema = z.object({
  city: z
    .string()
    .describe('The name of the city to fetch current weather data for.'),
});

export const currentWeatherTool = tool(
  async ({ city }) => {
    const apiKey = process.env.TOMORROW_WEATHER_API_KEY;

    if (!apiKey) {
      throw new Error('API key for Tomorrow.io is missing. Please configure TOMORROW_WEATHER_API_KEY.');
    }

    const url = `https://api.tomorrow.io/v4/weather/realtime?location=${encodeURIComponent(city)}&apikey=${apiKey}&units=imperial`;

    try {
      const response = await fetch(url, {
        method: 'GET',
        headers: { 
          'accept': 'application/json',
          'accept-encoding': 'deflate, gzip, br'
        },
      });

      if (!response.ok) {
        throw new Error(`Failed to fetch weather data: ${response.status}`);
      }

      const data = await response.json();
      console.log(`[Weather] Data fetched successfully for city: ${city}`);

      return JSON.stringify(data, null, 2);
    } catch (error) {
      if (error instanceof Error) {
        console.error(`[Weather] Error fetching data for city: ${city}`, error);
        throw new Error(`Unable to fetch weather data: ${error.message}`);
      } else {
        console.error(`[Weather] Unknown error for ${city}:`, error);
        throw new Error('An unknown error occurred while fetching weather data.');
      }
    }
  },
  {
    name: 'current_weather',
    description: 'Fetches current weather information for a given city and returns detailed weather data in JSON format.',
    schema: weatherSchema,
  }
);
