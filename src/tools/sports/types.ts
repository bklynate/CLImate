/**
 * Types for The Odds API V4 and ESPN public API responses.
 *
 * The Odds API docs: https://the-odds-api.com/liveapi/guides/v4/
 */

// ---------------------------------------------------------------------------
// Supported sport keys (free-tier focus: NBA, NFL, MLB)
// ---------------------------------------------------------------------------

export const SUPPORTED_SPORTS = {
  basketball_nba: { label: 'NBA', espnPath: 'basketball/nba' },
  americanfootball_nfl: { label: 'NFL', espnPath: 'football/nfl' },
  baseball_mlb: { label: 'MLB', espnPath: 'baseball/mlb' },
} as const;

export type SportKey = keyof typeof SUPPORTED_SPORTS;

export const SPORT_KEYS = Object.keys(SUPPORTED_SPORTS) as SportKey[];

// ---------------------------------------------------------------------------
// The Odds API – common types
// ---------------------------------------------------------------------------

/** Quota info extracted from response headers */
export interface QuotaInfo {
  requestsRemaining: number | null;
  requestsUsed: number | null;
  lastRequestCost: number | null;
}

/** An outcome within a market (e.g. one side of a moneyline) */
export interface OddsOutcome {
  name: string;
  price: number;
  /** Present for spreads & totals */
  point?: number;
  /** Present for player-prop markets */
  description?: string;
}

/** A single betting market (h2h, spreads, totals) */
export interface OddsMarket {
  key: string;
  last_update?: string;
  outcomes: OddsOutcome[];
}

/** A bookmaker and its markets for an event */
export interface OddsBookmaker {
  key: string;
  title: string;
  last_update?: string;
  markets: OddsMarket[];
}

/** An event returned by /v4/sports/{sport}/events */
export interface OddsEvent {
  id: string;
  sport_key: string;
  sport_title: string;
  commence_time: string;
  home_team: string;
  away_team: string;
}

/** An event with odds from /v4/sports/{sport}/odds */
export interface OddsGame extends OddsEvent {
  bookmakers: OddsBookmaker[];
}

/** Score data for a single team */
export interface ScoreTeam {
  name: string;
  score: string;
}

/** An event with scores from /v4/sports/{sport}/scores */
export interface ScoreGame extends OddsEvent {
  completed: boolean;
  scores: ScoreTeam[] | null;
  last_update: string | null;
}

/** A sport returned by /v4/sports */
export interface OddsSport {
  key: string;
  group: string;
  title: string;
  description: string;
  active: boolean;
  has_outrights: boolean;
}

// ---------------------------------------------------------------------------
// ESPN public API types (simplified)
// ---------------------------------------------------------------------------

export interface EspnStandingsEntry {
  team: string;
  abbreviation: string;
  wins: number;
  losses: number;
  winPercent: string;
  gamesBack: string;
  streak: string;
  /** Conference or division rank */
  rank: number;
  conference?: string;
  division?: string;
}

export interface EspnStandingsGroup {
  name: string;
  entries: EspnStandingsEntry[];
}
