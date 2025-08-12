import type { ToolFn } from 'types';
import { z } from 'zod';
import got from 'got';
import * as cheerio from 'cheerio';
import puppeteer from 'puppeteer-extra';
import StealthPlugin from 'puppeteer-extra-plugin-stealth';
import randomUseragent from 'random-useragent';
import pLimit from 'p-limit';

import { cleanHtml } from './cleanHTML';
import logger from '@utils/logger';

puppeteer.use(StealthPlugin());

/* ------------------------------------------------------------------ */
/*  Tool definition                                                    */
/* ------------------------------------------------------------------ */

export const queryDuckDuckGoToolDefinition = {
  name: 'query_duckduckgo',
  description:
    'Retrieve top-ranked search results from DuckDuckGo HTML version (no JS required) for offline-compatible scraping.',
  parameters: z.object({
    query: z.string().describe('Search query for DuckDuckGo HTML.'),
    numOfResults: z.number().describe('Number of search results to return.'),
    reasoning: z.string().optional(),
    reflection: z.string().optional(),
  }),
  strict: true,
};

type Args = z.infer<typeof queryDuckDuckGoToolDefinition.parameters>;

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

const USER_AGENT_FALLBACK = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36';

const decodeDuckDuckGoRedirect = (raw: string): string => {
  try {
    const u = new URL(raw, 'https://duckduckgo.com');
    const uddg = u.searchParams.get('uddg');
    if (uddg) return decodeURIComponent(uddg);
    return u.toString();
  } catch {
    return raw;
  }
};

function canonicalKey(u: string) {
  try {
    const url = new URL(u);
    url.hash = '';
    url.searchParams.sort();
    const q = url.searchParams.toString();
    return `${url.origin}${url.pathname}${q ? `?${q}` : ''}`;
  } catch {
    return u;
  }
}

function dedupeByUrl<T extends { url: string }>(arr: T[]): T[] {
  const seen = new Set<string>();
  const out: T[] = [];
  for (const item of arr) {
    const key = canonicalKey(item.url);
    if (!seen.has(key)) {
      seen.add(key);
      out.push(item);
    }
  }
  return out;
}

/* ------------------------------------------------------------------ */
/*  Search via DDG HTML (no puppeteer)                                 */
/* ------------------------------------------------------------------ */

async function fetchDuckDuckGoSearchResults(
  query: string,
): Promise<Array<{ title: string; url: string }>> {
  const res = await got('https://html.duckduckgo.com/html/', {
    searchParams: { q: query, kl: 'us-en', kp: '-2' },
    timeout: { request: 15000 },
    headers: { 'user-agent': USER_AGENT_FALLBACK },
  });

  const $ = cheerio.load(res.body);
  const results = $('h2.result__title a.result__a')
    .map((_i, a) => {
      const $a = $(a);
      return {
        title: $a.text().trim(),
        url: decodeDuckDuckGoRedirect($a.attr('href') || ''),
      };
    })
    .get()
    .filter(r => r.title && r.url.startsWith('http'));

  return dedupeByUrl(results);
}

/* ------------------------------------------------------------------ */
/*  Page fetch: HTTP first, Puppeteer fallback                         */
/* ------------------------------------------------------------------ */

function looksJsBlocked(html: string) {
  return /enable javascript|turn on javascript|unsupported browser/i.test(html);
}

async function fetchWithPuppeteer(url: string): Promise<string> {
  const browser = await puppeteer.launch({ headless: true });
  try {
    const page = await browser.newPage();
    await page.setUserAgent(randomUseragent.getRandom() || USER_AGENT_FALLBACK);

    await page.setRequestInterception(true);
    page.on('request', req => {
      const rt = req.resourceType();
      if (['image', 'media', 'font', 'stylesheet'].includes(rt)) req.abort();
      else req.continue();
    });

    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 20000 });
    const html = await page.content();
    return cleanHtml(html, url);
  } finally {
    await browser.close();
  }
}

async function fetchPageContent(url: string): Promise<string> {
  try {
    const res = await got(url, {
      timeout: { request: 15000 },
      headers: { 'user-agent': USER_AGENT_FALLBACK },
      followRedirect: true,
      throwHttpErrors: false,
    });

    const ctype = (res.headers['content-type'] || '').toLowerCase();

    if (ctype.includes('application/pdf')) {
      // Optional: plug in a pdf->text extractor if you want
      return [
        '---',
        `source_url: ${url}`,
        `title: ""`,
        `published: ""`,
        `lang: ""`,
        '---',
        '',
        '_PDF detected. Skipping extraction._',
      ].join('\n');
    }

    if (!ctype.includes('text/html')) {
      return [
        '---',
        `source_url: ${url}`,
        `title: ""`,
        `published: ""`,
        `lang: ""`,
        '---',
        '',
        '_Non-HTML content. Skipping._',
      ].join('\n');
    }

    const html = res.body || '';
    if (looksJsBlocked(html) || html.length < 1000) {
      // JS-required or too small; try headless
      return await fetchWithPuppeteer(url);
    }

    return await cleanHtml(html, url);
  } catch (e) {
    logger.warn(`Plain fetch failed for ${url}, trying Puppeteer.`, e);
    try {
      return await fetchWithPuppeteer(url);
    } catch (err) {
      logger.error(`Failed to extract content from ${url}:`, err);
      return [
        '---',
        `source_url: ${url}`,
        `title: ""`,
        `published: ""`,
        `lang: ""`,
        '---',
        '',
        'Error: Unable to extract content.',
      ].join('\n');
    }
  }
}

/* ------------------------------------------------------------------ */
/*  Main tool                                                          */
/* ------------------------------------------------------------------ */

export const queryDuckDuckGo: ToolFn<Args, string> = async ({ toolArgs }) => {
  const { query, numOfResults } = toolArgs;

  const searchResults = await fetchDuckDuckGoSearchResults(query);
  const parsedNum = Number(numOfResults);
  const resultsCount = Math.min(
    searchResults.length,
    Number.isFinite(parsedNum) && parsedNum > 0 ? parsedNum : 3
  );

  const limit = pLimit(4);
  const tasks = searchResults.slice(0, resultsCount).map((result) =>
    limit(async () => {
      try {
        const content = await fetchPageContent(result.url);
        return `**${result.title}**\n${content}\n\n`;
      } catch {
        return `**${result.title}**\nError fetching content.\n\n`;
      }
    })
  );

  const processed = await Promise.all(tasks);
  logger.info(`DuckDuckGo results processed successfully: ${processed.length} items.`);
  return processed.join('\n');
};
