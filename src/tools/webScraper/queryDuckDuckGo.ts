import type { ToolFn } from 'types';
import puppeteer from 'puppeteer-extra';
import randomUseragent from 'random-useragent';
import StealthPlugin from 'puppeteer-extra-plugin-stealth';
import { z } from 'zod';
import { cleanHtml } from './cleanHTML';
import logger from '@utils/logger';
import { SemanticRanker } from './semantic/SemanticRanker';
import type { SearchResult } from './semantic/types';

puppeteer.use(StealthPlugin());

// Initialize semantic ranker
const semanticRanker = new SemanticRanker();

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

const decodeDuckDuckGoRedirect = (url: string): string => {
  const match = url.match(/uddg=([^&]+)/);
  return match ? decodeURIComponent(match[1]) : url;
};

// --- Fetch DDG search results ---
async function fetchDuckDuckGoSearchResults(
  query: string,
): Promise<Array<{ title: string; url: string }>> {
  const browser = await puppeteer.launch({ headless: true });
  const page = await browser.newPage();

  try {
    const encoded = encodeURIComponent(query);
    await page.setUserAgent(randomUseragent.getRandom());

    await page.goto(`https://html.duckduckgo.com/html/?q=${encoded}`, {
      waitUntil: 'domcontentloaded',
      timeout: 30000,
    });

    const rawResults = await page.$$eval(
      'h2.result__title > a.result__a',
      (anchors) =>
        anchors.map((a) => ({
          title: a.textContent?.trim() || '',
          url: a.href,
        })),
    );

    const results = rawResults.map((r) => ({
      ...r,
      url: decodeDuckDuckGoRedirect(r.url),
    }));

    logger.info(`Fetched ${results.length} DuckDuckGo results.`);
    return results;
  } catch (err) {
    logger.error('DuckDuckGo scraping failed:', err);
    throw new Error('Failed to fetch DuckDuckGo search results');
  } finally {
    await browser.close();
  }
}

// --- Rank results with robust semantic ranking ---
async function fetchDuckDuckGoResultsWithRelevance(
  query: string,
): Promise<Array<{ title: string; url: string; relevance: number; rankingMethod: string }>> {
  const results = await fetchDuckDuckGoSearchResults(query);
  
  // Convert to SearchResult format
  const searchResults: SearchResult[] = results.map(result => ({
    title: result.title,
    url: result.url,
    // Note: DuckDuckGo HTML doesn't provide snippets, but we could extract them from page content
    snippet: undefined,
    description: undefined
  }));
  
  try {
    // Use semantic ranking with fallback
    const rankedResults = await semanticRanker.rankResults(query, searchResults, {
      useCache: true,
      fallbackStrategy: 'position',
      timeout: 30000,
      weights: {
        title: 1.0,  // Only title available from DDG HTML
        snippet: 0.0,
        description: 0.0
      }
    });
    
    return rankedResults.map(result => ({
      title: result.title,
      url: result.url,
      relevance: result.relevance,
      rankingMethod: result.rankingMethod
    }));
  } catch (error) {
    logger.error('Semantic ranking failed completely, using position fallback:', error);
    return results.map((result, i) => ({
      ...result,
      relevance: 1.0 - (i * 0.1),
      rankingMethod: 'position-fallback'
    }));
  }
}

// --- Page content fetch ---
async function fetchPageContent(url: string): Promise<string> {
  const browser = await puppeteer.launch({ headless: true });
  const page = await browser.newPage();

  try {
    await page.setUserAgent(randomUseragent.getRandom());
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
    await browser.close();
  }
}

// --- Main Tool Entry Point ---
export const queryDuckDuckGo: ToolFn<Args, string> = async ({ toolArgs }) => {
  const { query, numOfResults } = toolArgs;

  const searchResults = await fetchDuckDuckGoResultsWithRelevance(query);

  const parsedNum = Number(numOfResults);
  const resultsCount =
    Number.isFinite(parsedNum) && parsedNum < 3 ? searchResults.length : parsedNum;

  const processed = [];

  // Log ranking method used
  if (searchResults.length > 0) {
    logger.info(`DuckDuckGo semantic ranking using: ${searchResults[0].rankingMethod}`);
  }

  for (const result of searchResults.slice(0, resultsCount)) {
    try {
      const content = await fetchPageContent(result.url);
      processed.push(`**${result.title}** (relevance: ${result.relevance.toFixed(3)})\n${content}\n\n`);
    } catch (err) {
      processed.push(`**${result.title}** (relevance: ${result.relevance.toFixed(3)})\nError fetching content.\n\n`);
    }
  }

  logger.info(`DuckDuckGo results processed successfully using ${searchResults[0]?.rankingMethod || 'unknown'} ranking`);
  return processed.join('\n');
};
