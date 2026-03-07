/**
 * Sports Standings Tool
 *
 * Fetches current standings from ESPN's public API.
 * FREE — no API key needed, no quota cost.
 */

import { tool } from '@langchain/core/tools';
import { z } from 'zod';
import { fetchEspnStandings } from './espnClient';
import { SPORT_KEYS, SUPPORTED_SPORTS, type SportKey } from './types';

const schema = z.object({
  sport: z.enum(SPORT_KEYS as [SportKey, ...SportKey[]])
    .describe('Sport key: basketball_nba, americanfootball_nfl, or baseball_mlb'),
});

export const getStandingsTool = tool(
  async ({ sport }) => {
    try {
      const groups = await fetchEspnStandings(sport);

      if (!groups.length) {
        return JSON.stringify({
          sport,
          label: SUPPORTED_SPORTS[sport].label,
          message: 'No standings data available. The season may not have started yet.',
          standings: [],
        });
      }

      // Format standings into an LLM-friendly structure
      const formatted = groups.map(group => ({
        group: group.name,
        teams: group.entries.map((e, i) => ({
          rank: e.rank || i + 1,
          team: e.team,
          abbr: e.abbreviation,
          wins: e.wins,
          losses: e.losses,
          winPct: e.winPercent,
          gamesBack: e.gamesBack,
          streak: e.streak,
        })),
      }));

      return JSON.stringify({
        sport,
        label: SUPPORTED_SPORTS[sport].label,
        source: 'ESPN',
        standings: formatted,
      }, null, 2);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error fetching standings';
      return JSON.stringify({ error: message });
    }
  },
  {
    name: 'get_standings',
    description:
      'Get current league standings for NBA, NFL, or MLB from ESPN. ' +
      'Returns wins, losses, win%, games back, and streak for each team grouped by conference/division. ' +
      'FREE — no API key or quota cost.',
    schema,
  },
);
