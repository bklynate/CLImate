/**
 * HTTP client for The Odds API V4.
 *
 * Centralises auth, base URL, quota-header extraction, and error handling
 * so individual tool files stay lean.
 *
 * Docs: https://the-odds-api.com/liveapi/guides/v4/
 */

import type { QuotaInfo } from './types';

const BASE_URL = 'https://api.the-odds-api.com/v4';

/** Result wrapper that pairs data with remaining-quota metadata */
export interface OddsApiResponse<T> {
  data: T;
  quota: QuotaInfo;
}

/**
 * Make a GET request to The Odds API.
 *
 * @param path  – path after /v4, e.g. "/sports/basketball_nba/odds"
 * @param params – query-string params (apiKey is added automatically)
 */
export async function oddsApiFetch<T>(
  path: string,
  params: Record<string, string> = {},
): Promise<OddsApiResponse<T>> {
  const apiKey = process.env.THE_ODDS_API_KEY;

  if (!apiKey) {
    throw new Error(
      'THE_ODDS_API_KEY is not set. Please add it to your .env file. ' +
      'Get a free key at https://the-odds-api.com/#get-access',
    );
  }

  const url = new URL(`${BASE_URL}${path}`);
  url.searchParams.set('apiKey', apiKey);
  for (const [key, value] of Object.entries(params)) {
    if (value) url.searchParams.set(key, value);
  }

  const response = await fetch(url.toString(), {
    method: 'GET',
    headers: { accept: 'application/json' },
  });

  // Extract quota headers
  const quota: QuotaInfo = {
    requestsRemaining: parseHeaderInt(response.headers.get('x-requests-remaining')),
    requestsUsed: parseHeaderInt(response.headers.get('x-requests-used')),
    lastRequestCost: parseHeaderInt(response.headers.get('x-requests-last')),
  };

  if (!response.ok) {
    const body = await response.text().catch(() => '');
    throw new Error(
      `Odds API error ${response.status}: ${response.statusText}. ` +
      (body ? `Body: ${body}` : '') +
      ` (quota remaining: ${quota.requestsRemaining ?? 'unknown'})`,
    );
  }

  const data = (await response.json()) as T;

  console.log(
    `[OddsAPI] ${path} — quota remaining: ${quota.requestsRemaining}, cost: ${quota.lastRequestCost}`,
  );

  return { data, quota };
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function parseHeaderInt(value: string | null): number | null {
  if (value === null) return null;
  const n = parseInt(value, 10);
  return Number.isFinite(n) ? n : null;
}
