import { JSDOM } from 'jsdom';
import { Readability } from '@mozilla/readability';
import TurndownService from 'turndown';
import { addMessages } from '@src/memory';
import logger from '@utils/logger';
import { pipeline } from '@xenova/transformers';

process.env.ORT_LOG_SEVERITY_LEVEL = '3';

let summarizer: any;
const turndownService = new TurndownService();

/**
 * Lazy-loads the transformer summarizer.
 */
async function getSummarizer() {
  if (!summarizer) {
    logger.info('Loading summarization model...');
    summarizer = await pipeline('summarization', 'Xenova/distilbart-cnn-12-6');
  }
  return summarizer;
}

/**
 * Performs recursive summarization using a max word chunk size.
 */
async function summarizeLongText(text: string, chunkSize = 512): Promise<string> {
  const summarizationPipeline = await getSummarizer();
  const words = text.split(/\s+/);

  if (words.length <= chunkSize) {
    const summaryArray = await summarizationPipeline(text);
    return summaryArray?.[0]?.summary_text?.trim() || '';
  }

  const chunks: string[] = [];
  for (let i = 0; i < words.length; i += chunkSize) {
    chunks.push(words.slice(i, i + chunkSize).join(' '));
  }

  const summaries = [];
  for (const chunk of chunks) {
    const summaryArray = await summarizationPipeline(chunk);
    summaries.push(summaryArray?.[0]?.summary_text?.trim() || '');
  }

  const combined = summaries.join(' ');
  return combined.split(/\s+/).length > chunkSize
    ? summarizeLongText(combined, chunkSize)
    : combined;
}

/**
 * Extracts main article content and converts it to Markdown or summarized text.
 */
export async function cleanHtml(rawHtml: string, url: string): Promise<string> {
  try {
    const dom = new JSDOM(rawHtml, { url });
    const reader = new Readability(dom.window.document);
    const article = reader.parse();

    if (!article || (!article.content && !article.textContent)) {
      logger.warn(`Readability could not extract content from ${url}`);
      await addMessages([
        {
          role: 'assistant',
          content: `No readable content found at ${url}. I’ll try another approach if needed.`,
        },
      ]);
      return '';
    }

    if (article.content) {
      // Preserve structural richness
      const markdown = turndownService.turndown(article.content);
      logger.info(`Successfully converted content from ${url} to markdown.`);
      return markdown;
    }

    // Fallback: summarize plain text if content block was missing
    const extractedText = article.textContent.replace(/\s{2,}/g, ' ').trim();
    logger.info(`Summarizing extracted plain text from ${url}`);
    const summary = await summarizeLongText(extractedText, 512);

    if (!summary) {
      logger.error(`Summarization failed for ${url}`);
      await addMessages([
        {
          role: 'assistant',
          content: `Something went wrong while summarizing content from ${url}.`,
        },
      ]);
      return '';
    }

    logger.info(`Summarization complete for ${url}`);
    return summary;
  } catch (error: any) {
    logger.error(`Error processing HTML from ${url}:`, error?.message || error);
    throw new Error(`Error extracting and summarizing content from ${url}`);
  }
}
