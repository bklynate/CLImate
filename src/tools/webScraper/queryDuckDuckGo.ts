import type { ToolFn } from 'types';
import { z } from 'zod';
import { cleanHtml } from './cleanHTML';
import logger from '@utils/logger';
import { SemanticRanker } from './semantic/SemanticRanker';
import type { SearchResult } from './semantic/types';
import { browserPool } from './BrowserPool';

// Initialize semantic ranker
const semanticRanker = new SemanticRanker();

export const queryDuckDuckGoToolDefinition = {
  name: 'query_duckduckgo',
  description:
    'Retrieve top-ranked search results from DuckDuckGo HTML version (no JS required) for offline-compatible scraping.',
  parameters: z.object({
    query: z.string().describe('Search query for DuckDuckGo HTML.'),
    numOfResults: z
      .number()
      .describe('The maximum number of search results to return.'),
    reasoning: z
      .string()
      .describe(
        'Explain why this search is necessary and what you hope to find.',
      ),
    reflection: z
      .string()
      .describe(
        'State how you will evaluate the reliability or relevance of the returned search results.',
      ),
  }),
  strict: true,
};

type Args = z.infer<typeof queryDuckDuckGoToolDefinition.parameters>;

const decodeDuckDuckGoRedirect = (url: string): string => {
  const match = url.match(/uddg=([^&]+)/);
  return match ? decodeURIComponent(match[1]) : url;
};

// --- Fetch DDG search results ---
async function fetchDuckDuckGoSearchResults(
  query: string,
): Promise<Array<{ title: string; url: string }>> {
  let page;
  try {
    page = await browserPool.getPage();
  } catch (error) {
    if (error.message?.includes('shutting down')) {
      logger.warn('Browser pool was shutting down, attempting reset...');
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
      timeout: 30000,
    });

    // Enhanced extraction with snippets and metadata
    const rawResults = await page.$$eval(
      '.result',
      (resultElements) =>
        resultElements
          .map((element) => {
            const titleElement = element.querySelector(
              'h2.result__title > a.result__a',
            );
            const snippetElement = element.querySelector('.result__snippet');
            const urlElement = element.querySelector('.result__url');
            const extraElement = element.querySelector('.result__extras');

            return {
              title: titleElement?.textContent?.trim() || '',
              url: titleElement?.href || '',
              snippet: snippetElement?.textContent?.trim() || '',
              displayUrl: urlElement?.textContent?.trim() || '',
              extras: extraElement?.textContent?.trim() || '', // May contain dates, file types, etc.
              // Extract any additional metadata
              resultType: element.className.includes('result--ad')
                ? 'ad'
                : 'organic',
            };
          })
          .filter((result) => result.title && result.url), // Filter out empty results
    );

    const results = rawResults.map((r) => ({
      ...r,
      url: decodeDuckDuckGoRedirect(r.url),
    }));

    // Log data richness
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

// --- Rank results with robust semantic ranking ---
async function fetchDuckDuckGoResultsWithRelevance(
  query: string,
): Promise<
  Array<{
    title: string;
    url: string;
    relevance: number;
    rankingMethod: string;
  }>
> {
  const results = await fetchDuckDuckGoSearchResults(query);

  // Convert to SearchResult format with enhanced data
  const searchResults: SearchResult[] = results.map((result) => ({
    title: result.title,
    url: result.url,
    snippet: result.snippet || undefined,
    description: result.extras || undefined, // Use extras as description fallback
  }));

  try {
    // Use semantic ranking with enhanced data weights
    const rankedResults = await semanticRanker.rankResults(
      query,
      searchResults,
      {
        useCache: true,
        fallbackStrategy: 'position',
        timeout: 30000,
        weights: {
          title: 0.6, // Primary weight for titles
          snippet: 0.3, // Significant weight for snippets when available
          description: 0.1, // Lower weight for extras/metadata
        },
      },
    );

    return rankedResults.map((result) => ({
      title: result.title,
      url: result.url,
      relevance: result.relevance,
      rankingMethod: result.rankingMethod,
    }));
  } catch (error) {
    logger.error(
      'Semantic ranking failed completely, using position fallback:',
      error,
    );
    return results.map((result, i) => ({
      ...result,
      relevance: 1.0 - i * 0.1,
      rankingMethod: 'position-fallback',
    }));
  }
}

// --- Page content fetch ---
async function fetchPageContent(url: string): Promise<string> {
  let page;
  try {
    page = await browserPool.getPage();
  } catch (error) {
    if (error.message?.includes('shutting down')) {
      logger.warn('Browser pool was shutting down, attempting reset...');
      browserPool.reset();
      page = await browserPool.getPage();
    } else {
      throw error;
    }
  }

  try {
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });

    const html = await page.evaluate(() => {
      const bodyContent = document.body?.innerHTML;
      return bodyContent && bodyContent.trim().length > 0
        ? `<html><body>${bodyContent}</body></html>`
        : document.documentElement.outerHTML;
    });

    return cleanHtml(html, url);
  } catch (err) {
    logger.error(`Failed to extract content from ${url}:`, err);
    return 'Error: Unable to extract content.';
  } finally {
    await browserPool.releasePage(page);
  }
}

// --- Main Tool Entry Point ---
export const queryDuckDuckGo: ToolFn<Args, string> = async ({ toolArgs }) => {
  const { query, numOfResults } = toolArgs;

  const searchResults = await fetchDuckDuckGoResultsWithRelevance(query);

  const parsedNum = Number(numOfResults);
  const resultsCount =
    Number.isFinite(parsedNum) && parsedNum < 3
      ? searchResults.length
      : parsedNum;

  // Log ranking method used and pool stats
  if (searchResults.length > 0) {
    logger.info(
      `DuckDuckGo semantic ranking using: ${searchResults[0].rankingMethod}`,
    );
  }

  const poolStats = browserPool.getStats();
  logger.info(
    `Browser pool stats: ${poolStats.browsers} browsers, ${poolStats.pages} pages, ${poolStats.pagesInUse} in use`,
  );

  // Process pages in parallel using the browser pool
  const contentPromises = searchResults
    .slice(0, resultsCount)
    .map(async (result) => {
      try {
        const content = await fetchPageContent(result.url);
        return `**${result.title}** (relevance: ${result.relevance.toFixed(
          3,
        )})\n${content}\n\n`;
      } catch (err) {
        logger.warn(`Error fetching content from ${result.url}:`, err.message);
        return `**${result.title}** (relevance: ${result.relevance.toFixed(
          3,
        )})\nError fetching content: ${err.message}\n\n`;
      }
    });

  // Wait for all content to be fetched concurrently
  const startTime = Date.now();
  const processed = await Promise.all(contentPromises);
  const duration = Date.now() - startTime;

  logger.info(
    `DuckDuckGo results processed in ${duration}ms using ${
      searchResults[0]?.rankingMethod || 'unknown'
    } ranking (${processed.length} pages)`,
  );
  return processed.join('\n');
};
