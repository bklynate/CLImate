import type { ToolFn } from 'types';
import { z } from 'zod';
import { cleanHtml } from './01cleanHTML';
import logger from '@utils/logger';
import { SemanticRanker } from './semantic/SemanticRanker';
import type { SearchResult } from './semantic/types';
import { browserPool } from './BrowserPool';

const semanticRanker = new SemanticRanker();

/* ------------------------------------------------------------------ */
/*  tool definition                                                    */
/* ------------------------------------------------------------------ */
export const queryDuckDuckGoToolDefinition = {
  name: 'query_duckduckgo',
  description:
    'Retrieve top-ranked search results from DuckDuckGo HTML version (no JS required) for offline-compatible scraping.',
  parameters: z.object({
    query: z.string().describe('Search query for DuckDuckGo HTML.'),
    numOfResults: z
      .number()
      .int()
      .positive()
      .max(10)
      .default(10)
      .describe('Maximum number of results to load (≤10).'),
    reasoning: z.string(),
    reflection: z.string(),
  }),
  strict: true,
};

type Args = z.infer<typeof queryDuckDuckGoToolDefinition.parameters>;

/* ------------------------------------------------------------------ */
/*  helper to decode DDG redirect links                                */
/* ------------------------------------------------------------------ */
function decodeDuckDuckGoRedirect(rawUrl: string): string {
  try {
    const parsed = new URL(rawUrl);
    const encoded = parsed.searchParams.get('uddg');
    return encoded ? decodeURIComponent(encoded) : rawUrl;
  } catch {
    // `rawUrl` wasn’t a valid absolute URL; fall back to regex
    const match = rawUrl.match(/[?&]uddg=([^&]+)/);
    return match ? decodeURIComponent(match[1]) : rawUrl;
  }
}

/* ------------------------------------------------------------------ */
/*  fetch search-result HTML page                                      */
/* ------------------------------------------------------------------ */
async function fetchPageContent(url: string): Promise<string> {
  let page: import('puppeteer').Page | undefined;

  /* ------------ acquire a page, retry once if pool was resetting ------------ */
  try {
    page = await browserPool.getPage();
  } catch (err: any) {
    if (String(err?.message).includes('shutting down')) {
      logger.warn('Browser pool was shutting down, attempting reset…');
      browserPool.reset();
      page = await browserPool.getPage();
    } else {
      throw err;
    }
  }

  /* ---------- if we still failed, bail early to avoid undefined access ------ */
  if (!page) throw new Error('Failed to obtain a browser page from the pool');

  try {
    await page.setUserAgent(
      'Mozilla/5.0 (compatible; GPT-Scraper/1.0; +https://stockquery.app/bot)',
    );

    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 10_000 });

    const html = await page.evaluate(() => {
      const body = document.body?.innerHTML ?? '';
      return body.trim().length
        ? `<html><body>${body}</body></html>`
        : document.documentElement.outerHTML;
    });

    try {
      return await cleanHtml(html, url);
    } catch (cleanErr: any) {
      logger.warn(`cleanHtml failed for ${url}: ${cleanErr.message}`);
      /* fallback: return raw markdown without summarisation so the user still sees content */
      return (
        html
          .replace(/<[^>]+>/g, ' ') // naive strip tags
          .replace(/\s+/g, ' ')
          .trim()
          .slice(0, 1_000) + '\n\n*(automatic cleaning failed)*'
      );
    }
  } catch (navErr: any) {
    logger.warn(`Navigation failed for ${url}: ${navErr.message}`);
    return `Content unavailable from ${url}`;
  } finally {
    if (page) await browserPool.releasePage(page);
  }
}

/* ------------------------------------------------------------------ */
/*  fetch SERP, with your original rich extraction + logging           */
/* ------------------------------------------------------------------ */
async function fetchDuckDuckGoSearchResults(query: string): Promise<
  Array<{
    title: string;
    url: string;
    snippet?: string;
    displayUrl?: string;
    extras?: string;
    resultType?: 'ad' | 'organic';
  }>
> {
  let page;
  try {
    page = await browserPool.getPage();
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    if (errorMessage.includes('shutting down')) {
      logger.warn('Browser pool was shutting down, attempting reset…');
      browserPool.reset();
      page = await browserPool.getPage();
    } else {
      throw error;
    }
  }

  try {
    const encoded = encodeURIComponent(query);

    await page.goto(`https://html.duckduckgo.com/html/?q=${encoded}`, {
      waitUntil: 'domcontentloaded',
      timeout: 15_000,
    });

    const rawResults = await page.$$eval('.result', (resultElements) =>
      resultElements
        .map((el) => {
          const titleElement = el.querySelector<HTMLAnchorElement>(
            'h2.result__title > a.result__a',
          );
          const snippetElement =
            el.querySelector<HTMLElement>('.result__snippet');
          const urlElement = el.querySelector<HTMLElement>('.result__url');
          const extraElement = el.querySelector<HTMLElement>('.result__extras');

          return {
            title: titleElement?.textContent?.trim() || '',
            url: titleElement?.href || '',
            snippet: snippetElement?.textContent?.trim() || '',
            displayUrl: urlElement?.textContent?.trim() || '',
            extras: extraElement?.textContent?.trim() || '',
            resultType: el.className.includes('result--ad') ? 'ad' : 'organic',
          };
        })
        .filter((r) => r.title && r.url),
    );

    const results = rawResults.map((r) => ({
      ...r,
      url: decodeDuckDuckGoRedirect(r.url),
      resultType:
        r.resultType === 'ad' || r.resultType === 'organic'
          ? r.resultType
          : undefined,
    }));

    const withSnippets = results.filter(
      (r) => r.snippet && r.snippet.length > 10,
    ).length;
    const withExtras = results.filter(
      (r) => r.extras && r.extras.length > 0,
    ).length;

    logger.info(
      `Fetched ${results.length} DuckDuckGo results: ${withSnippets} with snippets, ${withExtras} with metadata`,
    );
    return results;
  } catch (err) {
    logger.error('DuckDuckGo scraping failed:', err);
    throw new Error('Failed to fetch DuckDuckGo search results');
  } finally {
    await browserPool.releasePage(page);
  }
}

/* ------------------------------------------------------------------ */
/*  main tool function                                                 */
/* ------------------------------------------------------------------ */
export const queryDuckDuckGo: ToolFn<Args, string> = async ({ toolArgs }) => {
  const { query, numOfResults } = toolArgs;

  const searchResults = await fetchDuckDuckGoSearchResults(query);
  const ranked: Array<
    SearchResult & { relevance: number; rankingMethod: string }
  > = await semanticRanker.rankResults(query, searchResults, {
    useCache: true,
    fallbackStrategy: 'position',
    timeout: 30_000,
  });

  /* ---------------------------------------------------------------- */
  /*  process pages in batches, honouring pool capacity                */
  /* ---------------------------------------------------------------- */
  const BATCH_SIZE = Math.min(3, browserPool.options.maxConcurrentPages);
  const processed: string[] = [];

  for (let i = 0; i < Math.min(numOfResults, ranked.length); i += BATCH_SIZE) {
    const batch = ranked.slice(i, i + BATCH_SIZE);

    const batchResults = await Promise.all(
      batch.map(async (r) => {
        try {
          const content = await fetchPageContent(r.url);
          return `**${r.title}** (relevance: ${r.relevance.toFixed(
            3,
          )})\n${content}\n`;
        } catch (err: any) {
          logger.warn(
            `Error fetching content from ${r.url}:`,
            err.message || 'Unknown',
          );
          return `**${r.title}** (relevance: ${r.relevance.toFixed(
            3,
          )})\nContent unavailable\n`;
        }
      }),
    );

    processed.push(...batchResults); // <-- syntax fix

    if (i + BATCH_SIZE < ranked.length) await sleep(500);
  }

  return processed.join('\n');
};

/* simple sleep helper */
function sleep(ms: number): Promise<void> {
  return new Promise((res) => setTimeout(res, ms));
}
