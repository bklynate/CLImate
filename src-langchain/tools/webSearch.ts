import { tool } from '@langchain/core/tools';
import { z } from 'zod';
import puppeteer from 'puppeteer-extra';
import randomUseragent from 'random-useragent';
import StealthPlugin from 'puppeteer-extra-plugin-stealth';
// Import cleanHtml from original implementation
import { cleanHtml } from '../../src/tools/webScraper/cleanHTML';

puppeteer.use(StealthPlugin());

const webSearchSchema = z.object({
  query: z.string().describe('Search query for DuckDuckGo HTML.'),
  numOfResults: z.number().nullable().optional().default(3).describe('Number of search results to return (default: 3).'),
});

const decodeDuckDuckGoRedirect = (url: string): string => {
  const match = url.match(/uddg=([^&]+)/);
  return match ? decodeURIComponent(match[1]) : url;
};

// Fetch DDG search results
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

    console.log(`[WebSearch] Fetched ${results.length} DuckDuckGo results.`);
    return results;
  } catch (err) {
    console.error('[WebSearch] DuckDuckGo scraping failed:', err);
    throw new Error('Failed to fetch DuckDuckGo search results');
  } finally {
    await browser.close();
  }
}

// Fetch page content
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
    console.error(`[WebSearch] Failed to extract content from ${url}:`, err);
    return 'Error: Unable to extract content.';
  } finally {
    await browser.close();
  }
}

export const queryDuckDuckGoTool = tool(
  async ({ query, numOfResults }) => {
    const searchResults = await fetchDuckDuckGoSearchResults(query);

    const parsedNum = Number(numOfResults);
    const resultsCount =
      Number.isFinite(parsedNum) && parsedNum < 3 ? searchResults.length : parsedNum;

    const processed: string[] = [];

    for (const result of searchResults.slice(0, resultsCount)) {
      try {
        const content = await fetchPageContent(result.url);
        processed.push(`**${result.title}**\n${content}\n\n`);
      } catch (err) {
        processed.push(`**${result.title}**\nError fetching content.\n\n`);
      }
    }

    console.log('[WebSearch] DuckDuckGo results processed successfully');
    return processed.join('\n');
  },
  {
    name: 'query_duckduckgo',
    description: 'Search DuckDuckGo and retrieve content from top results. Use this to find current information from the web.',
    schema: webSearchSchema,
  }
);
