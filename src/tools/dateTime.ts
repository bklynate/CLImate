import { tool } from '@langchain/core/tools';
import { z } from 'zod';
import { DateTime } from 'luxon';

const dateTimeSchema = z.object({
  include_location: z
    .boolean()
    .nullable()
    .optional()
    .default(false)
    .describe('Whether to include location information (IP-based geolocation)'),
  timezone: z
    .string()
    .nullable()
    .optional()
    .describe('Specific timezone to get the time for (e.g., "America/New_York", "Europe/London")'),
  format: z
    .enum(['iso', 'human', 'both'])
    .nullable()
    .optional()
    .default('both')
    .describe('Format for the datetime output: iso (ISO 8601), human (readable), or both'),
});

interface LocationInfo {
  ip?: string;
  city?: string;
  region?: string;
  country?: string;
  latitude?: number;
  longitude?: number;
  timezone?: string;
  utc_offset?: string;
}

async function getLocationInfo(): Promise<LocationInfo> {
  try {
    const response = await fetch('http://ip-api.com/json/', {
      method: 'GET',
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; DateTime Tool)',
      },
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }

    const data = await response.json() as any;
    
    return {
      ip: data.query,
      city: data.city,
      region: data.regionName,
      country: data.country,
      latitude: data.lat,
      longitude: data.lon,
      timezone: data.timezone,
      utc_offset: data.offset ? `${data.offset > 0 ? '+' : ''}${data.offset / 3600}` : undefined,
    };
  } catch (error) {
    console.warn('Failed to get location info:', error);
    return {};
  }
}

export const currentDateTimeTool = tool(
  async ({ include_location, timezone, format }) => {
    try {
      let locationInfo: LocationInfo = {};
      
      // Get location if requested
      if (include_location) {
        locationInfo = await getLocationInfo();
      }

      // Determine timezone to use
      let targetTimezone = timezone;
      if (!targetTimezone && locationInfo.timezone) {
        targetTimezone = locationInfo.timezone;
      }
      if (!targetTimezone) {
        targetTimezone = 'America/New_York'; // Default fallback
      }

      // Get current date/time
      const now = DateTime.now().setZone(targetTimezone);
      
      // Format the output
      const result: Record<string, any> = {
        timestamp: now.toISO(),
        timezone: targetTimezone,
        utc_offset: now.offsetNameShort,
      };

      if (format === 'iso' || format === 'both') {
        result.iso = {
          datetime: now.toISO(),
          date: now.toISODate(),
          time: now.toISOTime(),
        };
      }

      if (format === 'human' || format === 'both') {
        result.human = {
          datetime: now.toLocaleString(DateTime.DATETIME_FULL),
          date: now.toLocaleString(DateTime.DATE_FULL),
          time: now.toLocaleString(DateTime.TIME_WITH_SECONDS),
          weekday: now.weekdayLong,
          month: now.monthLong,
          day: now.day,
          year: now.year,
          unix_timestamp: now.toUnixInteger(),
        };
      }

      // Add location info if requested
      if (include_location && Object.keys(locationInfo).length > 0) {
        result.location = locationInfo;
      }

      // Add useful calculated fields
      result.calculated = {
        day_of_year: now.ordinal,
        week_of_year: now.weekNumber,
        is_dst: now.isInDST,
        quarter: now.quarter,
        days_in_month: now.daysInMonth,
        is_leap_year: now.isInLeapYear,
      };

      return JSON.stringify(result, null, 2);

    } catch (error) {
      // Fallback to basic DateTime
      const fallbackTime = DateTime.now();
      const fallbackResult = {
        error: 'Partial information available due to error',
        timestamp: fallbackTime.toISO(),
        human_readable: fallbackTime.toLocaleString(DateTime.DATETIME_FULL),
        timezone: fallbackTime.zoneName,
        error_details: error instanceof Error ? error.message : 'Unknown error'
      };
      
      return JSON.stringify(fallbackResult, null, 2);
    }
  },
  {
    name: 'current_date_time',
    description: 'Gets the current date, time, and optionally location information. Returns formatted date/time in multiple formats and timezone information.',
    schema: dateTimeSchema,
  }
);
