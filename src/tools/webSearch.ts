import { tool } from '@langchain/core/tools';
import { z } from 'zod';
import { fetchDuckDuckGoSearchResults, fetchPageContent } from './webScraper/queryDuckDuckGo';

const webSearchSchema = z.object({
  query: z.string().describe('Search query for DuckDuckGo HTML.'),
  numOfResults: z.number().nullable().optional().default(3).describe('Number of search results to return (default: 3).'),
});

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
