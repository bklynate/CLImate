/**
 * Sports Events Tool
 *
 * Lists upcoming and in-play events for a sport.
 * Uses GET /v4/sports/{sport}/events — FREE, no quota cost.
 *
 * The LLM should call this first to discover what games are available
 * before requesting odds or scores.
 */

import { tool } from '@langchain/core/tools';
import { z } from 'zod';
import { oddsApiFetch } from './client';
import { SPORT_KEYS, type OddsEvent, type SportKey } from './types';

const schema = z.object({
  sport: z.enum(SPORT_KEYS as [SportKey, ...SportKey[]])
    .describe('Sport key: basketball_nba, americanfootball_nfl, or baseball_mlb'),
  commenceTimeFrom: z.string().optional()
    .describe('Optional ISO 8601 start filter, e.g. 2026-03-06T00:00:00Z'),
  commenceTimeTo: z.string().optional()
    .describe('Optional ISO 8601 end filter, e.g. 2026-03-07T23:59:59Z'),
});

export const getSportsEventsTool = tool(
  async ({ sport, commenceTimeFrom, commenceTimeTo }) => {
    try {
      const params: Record<string, string> = {};
      if (commenceTimeFrom) params.commenceTimeFrom = commenceTimeFrom;
      if (commenceTimeTo) params.commenceTimeTo = commenceTimeTo;

      const { data: events, quota } = await oddsApiFetch<OddsEvent[]>(
        `/sports/${sport}/events`,
        params,
      );

      if (!events.length) {
        return JSON.stringify({
          sport,
          message: 'No upcoming events found for this sport.',
          events: [],
          quota,
        });
      }

      // Return a compact summary so the LLM can pick games for odds/scores
      const summary = events.map(e => ({
        id: e.id,
        home: e.home_team,
        away: e.away_team,
        start: e.commence_time,
      }));

      return JSON.stringify({
        sport,
        count: events.length,
        events: summary,
        quota,
      }, null, 2);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error fetching sports events';
      return JSON.stringify({ error: message });
    }
  },
  {
    name: 'get_sports_events',
    description:
      'List upcoming and live sports events (games) for NBA, NFL, or MLB. ' +
      'FREE — does not cost API quota. Call this first to see available games ' +
      'before requesting odds or scores. Returns game IDs, teams, and start times.',
    schema,
  },
);
