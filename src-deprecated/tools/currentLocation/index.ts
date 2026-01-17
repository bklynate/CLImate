import { z } from 'zod';
import type { ToolFn } from 'types';
import https from 'https';

// Tool definition
export const currentLocationToolDefinition = {
  name: 'current_location',
  description:
    'Provides approximate geospatial information, including city, region, country, and coordinates, based on the server’s IP address.',
  parameters: z
    .object({
      reasoning: z
        .string()
        .optional()
        .describe(
          'Why the AI wants this location info or how it will be used.'
        ),
    })
    .describe('No required parameters.'),
  strict: true,
};

type Args = z.infer<typeof currentLocationToolDefinition.parameters>;

// Helper function for HTTPS request
const fetchLocation = (): Promise<any> => {
  const options = {
    path: '/json/',
    host: 'ipapi.co',
    port: 443,
    headers: { 'User-Agent': 'nodejs-ipapi-v1.02' },
  };

  return new Promise((resolve, reject) => {
    const req = https.get(options, (resp) => {
      let body = '';
      resp.on('data', (chunk) => {
        body += chunk;
      });
      resp.on('end', () => {
        try {
          const loc = JSON.parse(body);
          resolve(loc);
        } catch (error) {
          reject(new Error('Failed to parse location response'));
        }
      });
    });

    req.on('error', (error) => {
      reject(new Error(`HTTPS request failed: ${error.message}`));
    });

    req.end();
  });
};

// Tool function
export const currentLocationTool: ToolFn<Args, string> = async ({
  toolArgs,
}) => {
  try {
    const data = await fetchLocation();

    const result = {
      ip: data.ip || null,
      city: data.city || null,
      region: data.region || null,
      country: data.country_name || null,
      latitude: data.latitude || null,
      longitude: data.longitude || null,
      timezone: data.timezone || null,
      utc_offset: data.utc_offset || null,
      org: data.org || null,
    };

    return JSON.stringify(result, null, 2);
  } catch (error) {
    throw new Error(
      `Unable to retrieve geospatial information. Error: ${
        error instanceof Error ? error.message : String(error)
      }`
    );
  }
};
