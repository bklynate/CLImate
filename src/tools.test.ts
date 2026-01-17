/**
 * Tests for LangChain Tools
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { currentDateTimeTool } from './tools/dateTime';
import { currentLocationTool } from './tools/currentLocation';
import { currentWeatherTool } from './tools/weather';

describe('DateTime Tool', () => {
  it('should return current date and time', async () => {
    const result = await currentDateTimeTool.invoke({});
    const parsed = JSON.parse(result);
    
    expect(parsed).toHaveProperty('timestamp');
    expect(parsed).toHaveProperty('timezone');
    expect(parsed).toHaveProperty('utc_offset');
  });

  it('should return ISO format when requested', async () => {
    const result = await currentDateTimeTool.invoke({ format: 'iso' });
    const parsed = JSON.parse(result);
    
    expect(parsed).toHaveProperty('iso');
    expect(parsed.iso).toHaveProperty('datetime');
    expect(parsed.iso).toHaveProperty('date');
    expect(parsed.iso).toHaveProperty('time');
  });

  it('should return human format when requested', async () => {
    const result = await currentDateTimeTool.invoke({ format: 'human' });
    const parsed = JSON.parse(result);
    
    expect(parsed).toHaveProperty('human');
    expect(parsed.human).toHaveProperty('datetime');
    expect(parsed.human).toHaveProperty('weekday');
    expect(parsed.human).toHaveProperty('month');
  });

  it('should use specified timezone', async () => {
    const result = await currentDateTimeTool.invoke({ timezone: 'Asia/Tokyo' });
    const parsed = JSON.parse(result);
    
    expect(parsed.timezone).toBe('Asia/Tokyo');
  });

  it('should include calculated fields', async () => {
    const result = await currentDateTimeTool.invoke({});
    const parsed = JSON.parse(result);
    
    expect(parsed).toHaveProperty('calculated');
    expect(parsed.calculated).toHaveProperty('day_of_year');
    expect(parsed.calculated).toHaveProperty('week_of_year');
    expect(parsed.calculated).toHaveProperty('is_dst');
  });
});

describe('Location Tool', () => {
  it('should have correct metadata', () => {
    expect(currentLocationTool.name).toBe('current_location');
    expect(currentLocationTool.description).toContain('geospatial');
  });

  // Note: This test makes a real API call
  it('should return location data structure', async () => {
    const result = await currentLocationTool.invoke({});
    const parsed = JSON.parse(result);
    
    // Check structure (values may vary based on actual location)
    expect(parsed).toHaveProperty('city');
    expect(parsed).toHaveProperty('country');
    expect(parsed).toHaveProperty('latitude');
    expect(parsed).toHaveProperty('longitude');
    expect(parsed).toHaveProperty('timezone');
  }, 10000); // 10 second timeout for API call
});

describe('Weather Tool', () => {
  it('should have correct metadata', () => {
    expect(currentWeatherTool.name).toBe('current_weather');
    expect(currentWeatherTool.description).toContain('weather');
  });

  it('should require city parameter', async () => {
    // @ts-expect-error - Testing missing required parameter
    await expect(currentWeatherTool.invoke({})).rejects.toThrow();
  });

  // Note: This test requires TOMORROW_WEATHER_API_KEY to be set
  it('should fetch weather for a city when API key is set', async () => {
    if (!process.env.TOMORROW_WEATHER_API_KEY) {
      console.log('Skipping weather test - API key not set');
      return;
    }

    const result = await currentWeatherTool.invoke({ city: 'New York' });
    const parsed = JSON.parse(result);
    
    expect(parsed).toHaveProperty('data');
    expect(parsed).toHaveProperty('location');
  }, 15000); // 15 second timeout for API call
});

describe('Tool Schema Validation', () => {
  it('dateTime tool should have valid schema', () => {
    expect(currentDateTimeTool.schema).toBeDefined();
  });

  it('location tool should have valid schema', () => {
    expect(currentLocationTool.schema).toBeDefined();
  });

  it('weather tool should have valid schema', () => {
    expect(currentWeatherTool.schema).toBeDefined();
  });
});
