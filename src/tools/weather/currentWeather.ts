import type { ToolFn } from 'types';
import fetch from 'node-fetch';
import { z } from 'zod';
import logger from '@utils/logger';

export const currentWeatherToolDefinition = {
  name: 'current_weather',
  description:
    'Fetches current weather information for a given city and returns detailed weather data in JSON format.',
  parameters: z
    .object({
      city: z
        .string()
        .describe('The name of the city to fetch current weather data for.'),
      reasoning: z
        .string()
        .optional()
        .describe(
          '(Optional) request to explain the reasoning behind the output. Example: "Explain the factors that led to this conclusion."'
        ),
      reflection: z
        .string()
        .optional()
        .describe(
          '(Optional) request to evaluate your process and output. Example: "Check for missing or inconsistent data."'
        ),
    })
    .describe('Input parameters for retrieving weather data.'),
  strict: true,
};

type Args = z.infer<typeof currentWeatherToolDefinition.parameters>;

export const currentWeather: ToolFn<Args, string> = async ({
  toolArgs,
}: {
  toolArgs: Args;
}) => {
  const { city } = toolArgs;
  const apiKey = process.env.TOMORROW_WEATHER_API_KEY;

  if (!apiKey) {
    throw new Error('API key for Tomorrow.io is missing. Please configure it.');
  }

  const url = `https://api.tomorrow.io/v4/weather/realtime?location=${encodeURIComponent(
    city
  )}&apikey=${apiKey}`;

  try {
    // Fetch weather data
    const response = await fetch(url, {
      method: 'GET',
      headers: { accept: 'application/json' },
    });

    if (!response.ok) {
      throw new Error(`Failed to fetch weather data: ${response.status}`);
    }

    // Parse JSON response
    const data = await response.json();
    logger.info(`Weather data fetched successfully for city: ${city}.`);

    // Return data as a stringified JSON
    return JSON.stringify(data, null, 2);
  } catch (error) {
    if (error instanceof Error) {
      logger.error(`Error fetching weather data for city: ${city}`, error);
      throw new Error(`Unable to fetch weather data: ${error.message}`);
    } else {
      logger.error(
        `An unknown error occurred fetching data for ${city}:`,
        error
      );
      throw new Error('An unknown error occurred while fetching weather data.');
    }
  }
};
