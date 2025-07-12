import { z } from 'zod';
import type { ToolFn } from 'types';
import fetch from 'node-fetch';
import json2md from 'json2md';
import logger from '@utils/logger';

/* -------------------------------------------------------------------------- */
/*  Config                                                                    */
/* -------------------------------------------------------------------------- */
const API_KEY  = process.env.THE_ODDS_API_KEY!;
const BASE     = 'https://api.the-odds-api.com/v4';
const REGION   = 'us';
const FORMAT   = 'american';
const MARKETS  = 'h2h,spreads,totals';
const USING_MODEL = process.env.ENABLE_MODEL_SUMMARY === 'true';

/* -------------------------------------------------------------------------- */
/*  Utilities                                                                 */
/* -------------------------------------------------------------------------- */
/** Safely pick best & worst Money-line price for each team. */
function aggregateMoneyLines(game: any) {
  const prices: Record<string, number[]> = {};
  for (const b of game.bookmakers ?? []) {
    const ml = b.markets?.find((m: any) => m.key === 'h2h');
    if (!ml) continue;
    for (const o of ml.outcomes) {
      (prices[o.name] = prices[o.name] ?? []).push(o.price);
    }
  }
  // build "Team best / worst" strings
  return Object.entries(prices)
    .map(([team, arr]) => {
      const best = Math.max(...arr);           // highest positive or least -
      const worst = Math.min(...arr);
      return `**${team}** ${worst} / ${best}`;
    })
    .join(' · ');
}

/** Consensus total (median of all totals points). */
function consensusTotal(game: any) {
  const pts: number[] = [];
  for (const b of game.bookmakers ?? []) {
    const tot = b.markets?.find((m: any) => m.key === 'totals');
    if (!tot) continue;
    for (const o of tot.outcomes) pts.push(o.point);
  }
  if (!pts.length) return 'n/a';
  pts.sort((a, b) => a - b);
  return pts[Math.floor(pts.length / 2)].toFixed(1);
}

/* -------------------------------------------------------------------------- */
/* 1) GET /sports – keep only tracked leagues                                 */
/* -------------------------------------------------------------------------- */
export const fetchTrackedSportsDefinition = {
  name: 'fetchTrackedSports',
  description:
    'Fetches all available sports and filters to only NBA, MLB, NFL, and NHL. Uses no quota.',
  parameters: z.object({}).describe('No parameters.').strict(),
  strict: true,
};
type FetchTrackedArgs = z.infer<typeof fetchTrackedSportsDefinition.parameters>;

export const fetchTrackedSports: ToolFn<FetchTrackedArgs, string> = async () => {
  const url = `${BASE}/sports/?apiKey=${API_KEY}`;
  try {
    const res = await fetch(url);
    if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
    const data = (await res.json()) as any[];

    const wanted = new Set([
      'basketball_nba',
      'baseball_mlb',
      'americanfootball_nfl',
      'icehockey_nhl',
    ]);
    const filtered = data.filter(d => wanted.has(d.key));

    return JSON.stringify({ success: true, data: filtered }, null, 2);
  } catch (err: any) {
    logger.error('fetchTrackedSports', err);
    throw new Error(`Unable to fetch sports: ${err.message}`);
  }
};

/* -------------------------------------------------------------------------- */
/* 2) GET /sports/{sport}/odds  → compact markdown summary + raw JSON         */
/* -------------------------------------------------------------------------- */
const SPORT_ENUM = z
  .enum(['NBA', 'MLB', 'NFL', 'NHL'])
  .describe('One of: NBA, MLB, NFL, NHL.');

export const getOddsUSADefinition = {
  name: 'getOddsUSA',
  description:
    'Returns upcoming/live odds for a league. Output includes a compact ' +
    'markdown digest (best ML lines, consensus total) plus raw JSON + quota.',
  parameters: z.object({ sport: SPORT_ENUM }).strict(),
  strict: true,
};
type GetOddsArgs = z.infer<typeof getOddsUSADefinition.parameters>;

/* -------- optional lazy-loaded summariser --------------------------------- */
let summarizer: any | null = null;
async function maybeSummarise(md: string) {
  if (!USING_MODEL) return null;
  if (!summarizer) {
    logger.info('‣ Loading @xenova/transformers summariser …');
    const { pipeline } = await import('@xenova/transformers');
    summarizer = await pipeline('summarization', 'Xenova/distilbart-cnn-12-6');
  }
  return (
    await summarizer(md, {
      max_length: 256,
      min_length: 64,
      do_sample: false,
    })
  )[0].summary_text.replace(/\s+/g, ' ');
}

/* -------------------------------------------------------------------------- */
export const getOddsUSA: ToolFn<GetOddsArgs, string> = async ({ toolArgs }) => {
  const SPORT_KEY_MAP: Record<GetOddsArgs['sport'], string> = {
    NBA: 'basketball_nba',
    MLB: 'baseball_mlb',
    NFL: 'americanfootball_nfl',
    NHL: 'icehockey_nhl',
  };

  const sportKey = SPORT_KEY_MAP[toolArgs.sport];
  const qs = new URLSearchParams({
    apiKey: API_KEY,
    regions: REGION,
    markets: MARKETS,
    oddsFormat: FORMAT,
  });
  const url = `${BASE}/sports/${sportKey}/odds?${qs}`;

  try {
    const res = await fetch(url);
    const body = await res.text();

    const meta = {
      url,
      status: res.status,
      remaining: res.headers.get('x-requests-remaining'),
      used: res.headers.get('x-requests-used'),
      cost: res.headers.get('x-requests-last'),
    };
    if (!res.ok) throw new Error(body);

    const json = JSON.parse(body);

    /* ---------- build compact markdown ----------------------------------- */
    const mdBlocks = json.flatMap((g: any) => [
      { h3: `${g.away_team} @ ${g.home_team}` },
      {
        ul: [
          `ML range: ${aggregateMoneyLines(g)}`,
          `Consensus total: **${consensusTotal(g)}**`,
          `Kick-off: ${new Date(g.commence_time).toLocaleString('en-US')}`,
        ],
      },
    ]);
    const markdown = json2md([{ h2: `${toolArgs.sport} odds (${json.length})` }, ...mdBlocks]);

    /* ---------- optional model summary ----------------------------------- */
    const abstractive = await maybeSummarise(markdown);

    return JSON.stringify(
      {
        success: true,
        ...meta,
        markdown,
        model_summary: abstractive ?? undefined,
        data: json, // still present for deep dives
      },
      null,
      2,
    );
  } catch (err: any) {
    logger.error(`getOddsUSA(${toolArgs.sport})`, err);
    throw new Error(`Unable to fetch odds: ${err.message}`);
  }
};

