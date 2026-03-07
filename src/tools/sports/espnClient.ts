/**
 * Lightweight client for ESPN's public JSON API.
 *
 * These endpoints are undocumented but widely used and require no API key.
 * Base URL: https://site.api.espn.com/apis/site/v2/sports/
 */

import { SUPPORTED_SPORTS, type SportKey, type EspnStandingsGroup, type EspnStandingsEntry } from './types';

const ESPN_BASE = 'https://site.api.espn.com/apis/site/v2/sports';

/**
 * Fetch and parse standings for a supported sport from ESPN.
 */
export async function fetchEspnStandings(sport: SportKey): Promise<EspnStandingsGroup[]> {
  const espnPath = SUPPORTED_SPORTS[sport].espnPath;
  const url = `${ESPN_BASE}/${espnPath}/standings`;

  const response = await fetch(url, {
    headers: { accept: 'application/json' },
  });

  if (!response.ok) {
    throw new Error(`ESPN standings request failed: ${response.status} ${response.statusText}`);
  }

  // ESPN's response structure: { children: [ { name, standings: { entries: [...] } } ] }
  const json = await response.json() as any;

  const groups: EspnStandingsGroup[] = [];

  const children = json.children ?? [];
  for (const child of children) {
    const groupName: string = child.name ?? child.abbreviation ?? 'Unknown';
    const rawEntries = child.standings?.entries ?? [];
    const entries: EspnStandingsEntry[] = [];

    for (const entry of rawEntries) {
      const team = entry.team?.displayName ?? entry.team?.name ?? 'Unknown';
      const abbreviation = entry.team?.abbreviation ?? '';

      // Stats is an array of { name, value, displayValue } objects
      const stats: Record<string, string> = {};
      for (const stat of entry.stats ?? []) {
        stats[stat.name ?? stat.abbreviation] = stat.displayValue ?? String(stat.value ?? '');
      }

      entries.push({
        team,
        abbreviation,
        wins: parseInt(stats['wins'] ?? '0', 10),
        losses: parseInt(stats['losses'] ?? '0', 10),
        winPercent: stats['winPercent'] ?? stats['winPct'] ?? stats['leagueWinPercent'] ?? '-',
        gamesBack: stats['gamesBehind'] ?? stats['gamesBack'] ?? '-',
        streak: stats['streak'] ?? '-',
        rank: parseInt(stats['playoffSeed'] ?? stats['rank'] ?? '0', 10),
        conference: groupName,
      });
    }

    groups.push({ name: groupName, entries });
  }

  console.log(`[ESPN] Standings fetched for ${SUPPORTED_SPORTS[sport].label} (${groups.length} groups)`);
  return groups;
}
