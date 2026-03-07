/**
 * Sports Odds Tool
 *
 * Fetches betting odds from US bookmakers for upcoming/live events.
 * Uses GET /v4/sports/{sport}/odds
 *
 * Quota cost: 1 credit per market × per region (default: 1 market, 1 region = 1 credit)
 */

import { tool } from '@langchain/core/tools';
import { z } from 'zod';
import { oddsApiFetch } from './client';
import { SPORT_KEYS, type OddsGame, type SportKey } from './types';

const schema = z.object({
  sport: z.enum(SPORT_KEYS as [SportKey, ...SportKey[]])
    .describe('Sport key: basketball_nba, americanfootball_nfl, or baseball_mlb'),
  markets: z.string().optional().default('h2h')
    .describe(
      'Comma-separated betting markets. Options: h2h (moneyline), spreads (point spread), totals (over/under). ' +
      'Default: h2h. Each additional market costs 1 extra quota credit.',
    ),
  eventIds: z.string().optional()
    .describe('Optional comma-separated event IDs to filter specific games (from get_sports_events).'),
});

export const getSportsOddsTool = tool(
  async ({ sport, markets, eventIds }) => {
    try {
      const params: Record<string, string> = {
        regions: 'us',
        oddsFormat: 'american',
        markets: markets ?? 'h2h',
      };
      if (eventIds) params.eventIds = eventIds;

      const { data: games, quota } = await oddsApiFetch<OddsGame[]>(
        `/sports/${sport}/odds`,
        params,
      );

      if (!games.length) {
        return JSON.stringify({
          sport,
          markets: params.markets,
          message: 'No odds available for this sport right now.',
          games: [],
          quota,
        });
      }

      // Flatten to a more LLM-friendly structure
      const summary = games.map(game => {
        const bookmakerOdds = game.bookmakers.map(bk => ({
          bookmaker: bk.title,
          markets: bk.markets.map(m => ({
            market: m.key,
            outcomes: m.outcomes.map(o => ({
              name: o.name,
              price: o.price,
              ...(o.point !== undefined ? { point: o.point } : {}),
            })),
          })),
        }));

        return {
          id: game.id,
          home: game.home_team,
          away: game.away_team,
          start: game.commence_time,
          odds: bookmakerOdds,
        };
      });

      return JSON.stringify({
        sport,
        markets: params.markets,
        count: games.length,
        games: summary,
        quota,
      }, null, 2);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error fetching odds';
      return JSON.stringify({ error: message });
    }
  },
  {
    name: 'get_sports_odds',
    description:
      'Get betting odds from US bookmakers (FanDuel, DraftKings, BetMGM, etc.) for NBA, NFL, or MLB games. ' +
      'Returns moneyline (h2h), spreads, and/or totals in American odds format. ' +
      'Costs 1 API credit per market requested. Use get_sports_events first to identify games.',
    schema,
  },
);
