import { JSDOM } from 'jsdom';
import { Readability } from '@mozilla/readability';
import TurndownService from 'turndown';
import { addMessages } from '@src/memory';
import { pipeline } from '@xenova/transformers';
import { Tabletojson } from 'tabletojson';

process.env.ORT_LOG_SEVERITY_LEVEL = '3';

let summarizer: any;

async function getSummarizer() {
  if (!summarizer) {
    summarizer = await pipeline('summarization', 'Xenova/distilbart-cnn-12-6');
  }
  return summarizer;
}

const UNWANTED = [
  '.share', '.social', '.ad', '.promo', '.footer', '.related', '.tags',
  '.author-box', 'nav', 'form', '[hidden]', '[aria-hidden="true"]'
];

function removeBoilerplate(node: Element) {
  UNWANTED.forEach((sel) => {
    node.querySelectorAll(sel).forEach((el) => el.remove());
  });
}

const turndownService = new TurndownService({
  headingStyle: 'atx',
  bulletListMarker: '-',
  codeBlockStyle: 'fenced',
});

turndownService.addRule('headingHR', {
  filter: ['h1', 'h2', 'h3', 'h4', 'h5', 'h6'],
  replacement: (content, node) => {
    const level = Number((node as Element).tagName.substring(1));
    return `\n\n---\n\n${'#'.repeat(level)} ${content}\n\n`;
  },
});

turndownService.addRule('preserveTable', {
  filter: 'table',
  replacement: (content, node) => {
    try {
      const json = Tabletojson.convert((node as Element).outerHTML);
      return `\n\n\`\`\`json\n${JSON.stringify(json, null, 2)}\n\`\`\`\n\n`;
    } catch (e) {
      return content;
    }
  },
});

function dedupeLines(markdown: string): string {
  const seen = new Set<string>();
  return markdown
    .split('\n')
    .filter((line) => {
      const key = line.trim();
      if (!key || key.startsWith('#')) return true;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .join('\n');
}

function prettyWhitespace(markdown: string): string {
  return markdown
    .replace(/[ \t]+\n/g, '\n') // trailing spaces
    .replace(/\n{3,}/g, '\n\n') // collapse ≥3 newlines
    .replace(/^\*{2,}/gm, '*') // "***" → "*"
    .replace(/^[·•]/gm, '*') // normalize bullets
    .replace(/[“”]/g, '"')
    .replace(/[‘’]/g, "'")
    .replace(/[—–]/g, '-')
    .replace(/ /g, ' ') // narrow space
    .replace(/\.{3,}/g, '…'); // long ellipses
}

async function summarizeMarkdown(markdown: string, maxChunkWords = 700): Promise<string> {
  const summarizerPipeline = await getSummarizer();
  const sections = markdown.split(/\n---\n/);
  const summaries: string[] = [];

  for (const section of sections) {
    const wordCount = section.trim().split(/\s+/).length;
    if (wordCount > maxChunkWords) {
      const summary = await summarizerPipeline(section, {
        max_length: 180,
        min_length: 60,
        no_repeat_ngram_size: 3,
      });
      summaries.push(summary?.[0]?.summary_text?.trim() || '');
    } else {
      summaries.push(section.trim());
    }
  }

  return summaries.join('\n\n---\n\n');
}

export async function cleanHtml(rawHtml: string, url: string): Promise<string> {
  try {
    const dom = new JSDOM(rawHtml, { url });
    const reader = new Readability(dom.window.document, { charThreshold: 500 });
    const article = reader.parse();

    if (!article?.content) {
      await addMessages([
        {
          role: 'assistant',
          content: `No readable content found at ${url}.`,
        },
      ]);
      return '';
    }

    // Remove junk inside article body
    const bodyDom = new JSDOM(article.content, { url });
    const body = bodyDom.window.document.body;
    removeBoilerplate(body);

    // Convert to Markdown
    let markdown = turndownService.turndown(body.innerHTML);
    markdown = dedupeLines(prettyWhitespace(markdown));

    // Summarize if oversized
    const cleaned = await summarizeMarkdown(markdown);

    return cleaned;
  } catch (error: any) {
    console.error(`Failed to clean HTML from ${url}:`, error?.message || error);
    throw new Error(`Error cleaning HTML from ${url}`);
  }
}
