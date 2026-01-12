import { tool } from '@langchain/core/tools';
import { z } from 'zod';
import https from 'https';

const locationSchema = z.object({
  // No required parameters
});

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

export const currentLocationTool = tool(
  async () => {
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
  },
  {
    name: 'current_location',
    description: 'Provides approximate geospatial information, including city, region, country, and coordinates, based on the server\'s IP address.',
    schema: locationSchema,
  }
);
