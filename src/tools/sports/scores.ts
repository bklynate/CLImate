/**
 * Sports Scores Tool
 *
 * Fetches live, upcoming, and recently completed game scores.
 * Uses GET /v4/sports/{sport}/scores
 *
 * Quota cost: 1 credit (or 2 if daysFrom is specified for completed games)
 *
 * NOTE: The `daysFrom` parameter uses UTC-based day boundaries on the
 * Odds API server side — we cannot control this.  For timezone-accurate
 * date filtering, the recommended workflow is:
 *   1. Call `get_sports_events` with `dateLocal` + `timezone` to get game IDs
 *   2. Then use those IDs (or the returned commence_times) to cross-reference
 *      with scores from this endpoint.
 * This avoids the UTC boundary edge case where a late-night US game falls
 * on the next UTC calendar day.
 */

import { tool } from '@langchain/core/tools';
import { z } from 'zod';
import { oddsApiFetch } from './client';
import { SPORT_KEYS, type ScoreGame, type SportKey } from './types';

const schema = z.object({
  sport: z.enum(SPORT_KEYS as [SportKey, ...SportKey[]])
    .describe('Sport key: basketball_nba, americanfootball_nfl, or baseball_mlb'),
  daysFrom: z.number().min(1).max(3).optional()
    .describe(
      'Include completed games from this many days ago (1-3). ' +
      'Omit to get only live/upcoming games (costs 1 credit). ' +
      'Specifying daysFrom costs 2 credits.',
    ),
});

export const getSportsScoresTool = tool(
  async ({ sport, daysFrom }) => {
    try {
      const params: Record<string, string> = {};
      if (daysFrom) params.daysFrom = String(daysFrom);

      const { data: games, quota } = await oddsApiFetch<ScoreGame[]>(
        `/sports/${sport}/scores`,
        params,
      );

      if (!games.length) {
        return JSON.stringify({
          sport,
          message: 'No scores available for this sport right now.',
          games: [],
          quota,
        });
      }

      const summary = games.map(game => ({
        id: game.id,
        home: game.home_team,
        away: game.away_team,
        start: game.commence_time,
        completed: game.completed,
        scores: game.scores
          ? game.scores.map(s => ({ team: s.name, score: s.score }))
          : null,
        lastUpdate: game.last_update,
      }));

      return JSON.stringify({
        sport,
        count: games.length,
        games: summary,
        quota,
      }, null, 2);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error fetching scores';
      return JSON.stringify({ error: message });
    }
  },
  {
    name: 'get_sports_scores',
    description:
      'Get live scores, upcoming games, and recently completed game scores for NBA, NFL, or MLB. ' +
      'Live scores update approximately every 30 seconds. ' +
      'Costs 1 API credit (2 if requesting completed games with daysFrom).',
    schema,
  },
);
