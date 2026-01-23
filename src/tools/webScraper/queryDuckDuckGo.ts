import puppeteer from 'puppeteer-extra';
import randomUseragent from 'random-useragent';
import StealthPlugin from 'puppeteer-extra-plugin-stealth';
import { cleanHtml } from './cleanHTML';

puppeteer.use(StealthPlugin());

const decodeDuckDuckGoRedirect = (url: string): string => {
  const match = url.match(/uddg=([^&]+)/);
  return match ? decodeURIComponent(match[1]) : url;
};

// --- Fetch DDG search results ---
export async function fetchDuckDuckGoSearchResults(
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

    return results;
  } catch (err) {
    console.error('DuckDuckGo scraping failed:', err);
    throw new Error('Failed to fetch DuckDuckGo search results');
  } finally {
    await browser.close();
  }
}

// --- Page content fetch ---
export async function fetchPageContent(url: string): Promise<string> {
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
    console.error(`Failed to extract content from ${url}:`, err);
    return 'Error: Unable to extract content.';
  } finally {
    await browser.close();
  }
}
