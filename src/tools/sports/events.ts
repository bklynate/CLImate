/**
 * Sports Events Tool
 *
 * Lists upcoming and in-play events for a sport.
 * Uses GET /v4/sports/{sport}/events — FREE, no quota cost.
 *
 * The LLM should call this first to discover what games are available
 * before requesting odds or scores.
 *
 * Supports `dateLocal` + `timezone` parameters so the LLM never has to
 * do manual UTC conversion — Luxon computes the correct UTC window from
 * local calendar dates.  On DST transition days this produces a 23-hour
 * or 25-hour window, which is correct (it represents the full local day).
 */

import { tool } from '@langchain/core/tools';
import { z } from 'zod';
import { DateTime, IANAZone } from 'luxon';
import { oddsApiFetch } from './client';
import { SPORT_KEYS, type OddsEvent, type SportKey } from './types';

const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

const schema = z.object({
  sport: z.enum(SPORT_KEYS as [SportKey, ...SportKey[]])
    .describe('Sport key: basketball_nba, americanfootball_nfl, or baseball_mlb'),

  // ── Local-date filtering (preferred) ─────────────────────────────────
  dateLocal: z.string().regex(ISO_DATE_RE, 'Must be YYYY-MM-DD').optional()
    .describe(
      'Local date to filter games for, in YYYY-MM-DD format (e.g. "2026-03-07"). ' +
      'The tool converts this to the correct UTC window using timezone. ' +
      'Prefer this over commenceTimeFrom/commenceTimeTo.',
    ),
  dateLocalEnd: z.string().regex(ISO_DATE_RE, 'Must be YYYY-MM-DD').optional()
    .describe(
      'Optional end date for a multi-day range, in YYYY-MM-DD format. ' +
      'Defaults to dateLocal when omitted. Use for "this weekend" style queries.',
    ),
  timezone: z.string().optional()
    .describe(
      'IANA timezone for interpreting dateLocal (e.g. "America/New_York"). ' +
      'Defaults to "America/New_York" if omitted.',
    ),

  // ── Raw UTC filtering (fallback) ─────────────────────────────────────
  commenceTimeFrom: z.string().optional()
    .describe('Raw ISO 8601 UTC start filter. Prefer dateLocal + timezone instead.'),
  commenceTimeTo: z.string().optional()
    .describe('Raw ISO 8601 UTC end filter. Prefer dateLocal + timezone instead.'),
}).refine(
  (d) => !(d.dateLocal && (d.commenceTimeFrom || d.commenceTimeTo)),
  {
    message:
      'Cannot specify both dateLocal and commenceTimeFrom/commenceTimeTo. ' +
      'Use dateLocal + timezone (preferred) OR raw UTC params, not both.',
  },
);

export const getSportsEventsTool = tool(
  async ({ sport, dateLocal, dateLocalEnd, timezone, commenceTimeFrom, commenceTimeTo }) => {
    try {
      const params: Record<string, string> = {};

      if (dateLocal) {
        // ── Validate timezone ──────────────────────────────────────────
        const tz = timezone || 'America/New_York';
        if (!IANAZone.isValidZone(tz)) {
          return JSON.stringify({
            error: `Invalid timezone "${tz}". Provide a valid IANA timezone (e.g. "America/New_York").`,
          });
        }

        // ── Validate dateLocal ─────────────────────────────────────────
        const startDt = DateTime.fromISO(dateLocal, { zone: tz });
        if (!startDt.isValid) {
          return JSON.stringify({
            error: `Invalid dateLocal "${dateLocal}": ${startDt.invalidReason}`,
          });
        }

        // ── Validate dateLocalEnd (defaults to dateLocal) ──────────────
        const endDateStr = dateLocalEnd || dateLocal;
        const endDt = DateTime.fromISO(endDateStr, { zone: tz });
        if (!endDt.isValid) {
          return JSON.stringify({
            error: `Invalid dateLocalEnd "${endDateStr}": ${endDt.invalidReason}`,
          });
        }

        // Compute the full UTC window for the local date range.
        // On DST transition days this may be 23h or 25h — that's correct.
        params.commenceTimeFrom = startDt.startOf('day').toUTC().toISO()!;
        params.commenceTimeTo = endDt.endOf('day').toUTC().toISO()!;
      } else {
        // Fall back to raw UTC params if provided
        if (commenceTimeFrom) params.commenceTimeFrom = commenceTimeFrom;
        if (commenceTimeTo) params.commenceTimeTo = commenceTimeTo;
      }

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
      'before requesting odds or scores. Returns game IDs, teams, and start times. ' +
      'Use dateLocal + timezone to filter by local date (handles UTC conversion automatically). ' +
      'For multi-day queries use dateLocal + dateLocalEnd.',
    schema,
  },
);
