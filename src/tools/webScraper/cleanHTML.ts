import { JSDOM } from 'jsdom';
import { Readability } from '@mozilla/readability';
import TurndownService from 'turndown';
import { addMessages } from '@src/memory';
import { pipeline } from '@xenova/transformers';
import { remark } from 'remark';
import remarkGfm from 'remark-gfm';
import { visit } from 'unist-util-visit';
import nlp from 'compromise';
import natural from 'natural';
import logger from '@utils/logger';

process.env.ORT_LOG_SEVERITY_LEVEL = '3';

// Natural.js NLP Analysis
class NaturalNLPAnalyzer {
  /**
   * Analyze content quality using Natural.js NLP features
   */
  static analyzeContentQuality(text: string): {
    readabilityScore: number;
    keywordDensity: number;
    sentimentScore: number;
    informativeness: number;
    overallQuality: number;
  } {
    if (!text || text.trim().length < 50) {
      return {
        readabilityScore: 0,
        keywordDensity: 0,
        sentimentScore: 0,
        informativeness: 0,
        overallQuality: 0,
      };
    }

    try {
      // Tokenize and analyze with safety checks
      const tokens =
        natural.WordTokenizer.prototype.tokenize(text.toLowerCase()) || [];
      const sentences =
        natural.SentenceTokenizer.prototype.tokenize(text) || [];

      // Calculate readability (Flesch-Kincaid approximation)
      const avgWordsPerSentence = tokens.length / Math.max(sentences.length, 1);
      const avgSyllablesPerWord = this.estimateAvgSyllables(tokens);
      const readabilityScore = Math.max(
        0,
        206.835 - 1.015 * avgWordsPerSentence - 84.6 * avgSyllablesPerWord,
      );

      // Keyword density analysis
      const stemmedTokens = tokens.map((token) =>
        natural.PorterStemmer.stem(token),
      );
      const wordFreq = new Map<string, number>();
      stemmedTokens.forEach((token) => {
        if (token.length > 3) {
          // Only meaningful words
          wordFreq.set(token, (wordFreq.get(token) || 0) + 1);
        }
      });

      // Calculate keyword density (how focused the content is)
      const totalMeaningfulWords = stemmedTokens.filter(
        (t) => t.length > 3,
      ).length;
      const topWords = Array.from(wordFreq.entries())
        .sort((a, b) => b[1] - a[1])
        .slice(0, 10);

      const keywordDensity =
        totalMeaningfulWords > 0
          ? topWords.reduce((sum, [_, freq]) => sum + freq, 0) /
            totalMeaningfulWords
          : 0;

      // Sentiment analysis (using a simpler approach due to API complexity)
      let sentimentScore = 0;
      try {
        // Use a basic sentiment approach instead of the complex SentimentAnalyzer
        const positiveWords = [
          'good',
          'great',
          'excellent',
          'amazing',
          'wonderful',
          'fantastic',
          'best',
          'love',
          'perfect',
          'outstanding',
        ];
        const negativeWords = [
          'bad',
          'terrible',
          'awful',
          'horrible',
          'worst',
          'hate',
          'disappointing',
          'poor',
          'failed',
          'broken',
        ];

        const positiveCount = stemmedTokens.filter((token) =>
          positiveWords.includes(token),
        ).length;
        const negativeCount = stemmedTokens.filter((token) =>
          negativeWords.includes(token),
        ).length;

        if (stemmedTokens.length > 0) {
          sentimentScore =
            (positiveCount - negativeCount) / stemmedTokens.length;
          sentimentScore = Math.max(-1, Math.min(1, sentimentScore)); // Normalize to -1,1 range
        }
      } catch (error) {
        logger.warn('Sentiment analysis failed, using neutral score:', error);
        sentimentScore = 0;
      }

      // Informativeness score based on content markers
      const informativeWords = [
        'research',
        'study',
        'analysis',
        'data',
        'findings',
        'results',
        'according',
        'evidence',
        'statistics',
        'report',
        'survey',
      ];
      const informativeCount = tokens.filter((token) =>
        informativeWords.some(
          (word) =>
            natural.PorterStemmer.stem(word) ===
            natural.PorterStemmer.stem(token),
        ),
      ).length;
      const informativeness = Math.min(
        1,
        informativeCount / Math.max(tokens.length * 0.1, 1),
      );

      // Calculate overall quality score
      const normalizedReadability = Math.min(
        1,
        Math.max(0, readabilityScore / 100),
      );
      const normalizedSentiment = Math.min(
        1,
        Math.max(0, (sentimentScore + 1) / 2),
      ); // Convert -1,1 to 0,1

      const overallQuality =
        normalizedReadability * 0.3 +
        keywordDensity * 0.2 +
        normalizedSentiment * 0.2 +
        informativeness * 0.3;

      return {
        readabilityScore: normalizedReadability,
        keywordDensity,
        sentimentScore: normalizedSentiment,
        informativeness,
        overallQuality,
      };
    } catch (error) {
      logger.warn('Content quality analysis failed:', error);
      return {
        readabilityScore: 0,
        keywordDensity: 0,
        sentimentScore: 0,
        informativeness: 0,
        overallQuality: 0,
      };
    }
  }

  /**
   * Extract key terms using TF-IDF
   */
  static extractKeyTerms(text: string, maxTerms: number = 10): string[] {
    try {
      const tokens = (
        natural.WordTokenizer.prototype.tokenize(text.toLowerCase()) || []
      ).filter((token) => token.length > 3 && !/^\d+$/.test(token)); // Filter short words and numbers

      if (tokens.length === 0) return [];

      // Simple TF calculation
      const termFreq = new Map<string, number>();
      tokens.forEach((token) => {
        const stemmed = natural.PorterStemmer.stem(token);
        termFreq.set(stemmed, (termFreq.get(stemmed) || 0) + 1);
      });

      // Sort by frequency and return top terms
      return Array.from(termFreq.entries())
        .sort((a, b) => b[1] - a[1])
        .slice(0, maxTerms)
        .map(([term, _]) => term);
    } catch (error) {
      logger.warn('Key terms extraction failed:', error);
      return [];
    }
  }

  /**
   * Calculate content similarity using Jaro-Winkler
   */
  static calculateSimilarity(text1: string, text2: string): number {
    try {
      if (!text1 || !text2) return 0;

      // Normalize texts
      const normalize = (text: string) =>
        text
          .toLowerCase()
          .replace(/[^\w\s]/g, ' ')
          .replace(/\s+/g, ' ')
          .trim();

      const norm1 = normalize(text1);
      const norm2 = normalize(text2);

      if (norm1 === norm2) return 1;
      if (norm1.length === 0 || norm2.length === 0) return 0;

      return natural.JaroWinklerDistance(norm1, norm2);
    } catch (error) {
      logger.warn('Similarity calculation failed:', error);
      return 0;
    }
  }

  /**
   * Estimate average syllables per word (approximation)
   */
  private static estimateAvgSyllables(tokens: string[]): number {
    if (tokens.length === 0) return 0;

    const totalSyllables = tokens.reduce((sum, word) => {
      // Simple syllable estimation: count vowel groups
      const vowelGroups = word.match(/[aeiouy]+/gi) || [];
      const syllables = Math.max(1, vowelGroups.length);
      return sum + syllables;
    }, 0);

    return totalSyllables / tokens.length;
  }
}

// Advanced DOM Analysis Types"}
interface ContentRegion {
  element: Element;
  score: number;
  type:
    | 'main'
    | 'sidebar'
    | 'navigation'
    | 'footer'
    | 'header'
    | 'advertisement';
  textDensity: number;
  linkDensity: number;
  hasStructuredData: boolean;
}

interface StructuredData {
  type: 'table' | 'list' | 'schema' | 'microdata';
  data: any;
  confidence: number;
}

interface TableData {
  headers: string[];
  rows: string[][];
  caption?: string;
  summary: string;
}

// Singleton summarization service with proper memory management
class SummarizationService {
  private static instance: SummarizationService | null = null;
  private summarizer: any = null;
  private initPromise: Promise<void> | null = null;
  private modelName: string = '';
  private readonly TIMEOUT_MS = 30000; // 30 second timeout
  private readonly MAX_RETRIES = 2;

  static getInstance(): SummarizationService {
    if (!SummarizationService.instance) {
      SummarizationService.instance = new SummarizationService();
    }
    return SummarizationService.instance;
  }

  async initialize(): Promise<void> {
    if (this.summarizer) return;
    if (this.initPromise) return this.initPromise;

    this.initPromise = this.doInitialize();
    return this.initPromise;
  }

  private async doInitialize(): Promise<void> {
    const models = [
      'Xenova/distilbart-cnn-6-6', // Faster, smaller model first
      'Xenova/distilbart-cnn-12-6',
      'Xenova/bart-large-cnn',
    ];

    for (const model of models) {
      try {
        console.log(`Attempting to load summarization model: ${model}`);
        this.summarizer = await Promise.race([
          pipeline('summarization', model),
          new Promise((_, reject) =>
            setTimeout(
              () => reject(new Error('Model load timeout')),
              this.TIMEOUT_MS,
            ),
          ),
        ]);
        this.modelName = model;
        console.log(`Successfully loaded: ${model}`);
        return;
      } catch (error) {
        console.warn(`Failed to load ${model}:`, error);
        continue;
      }
    }
    throw new Error('Failed to initialize any summarization model');
  }

  async summarize(text: string, params: any): Promise<string> {
    await this.initialize();

    for (let attempt = 0; attempt < this.MAX_RETRIES; attempt++) {
      try {
        const result = await Promise.race([
          this.summarizer(text, params),
          new Promise((_, reject) =>
            setTimeout(
              () => reject(new Error('Summarization timeout')),
              this.TIMEOUT_MS,
            ),
          ),
        ]);
        return result?.[0]?.summary_text?.trim() || '';
      } catch (error) {
        console.warn(`Summarization attempt ${attempt + 1} failed:`, error);
        if (attempt === this.MAX_RETRIES - 1) throw error;
        await new Promise((resolve) => setTimeout(resolve, 1000)); // Wait before retry
      }
    }
    throw new Error('Summarization failed after all retries');
  }

  getModelName(): string {
    return this.modelName;
  }

  // Cleanup method for proper memory management
  dispose(): void {
    this.summarizer = null;
    this.initPromise = null;
    SummarizationService.instance = null;
  }
}

// Helper function for backward compatibility
async function getSummarizer() {
  const service = SummarizationService.getInstance();
  await service.initialize();
  return service;
}

const UNWANTED = [
  // Core content filtering
  '.share',
  '.social',
  '.ad',
  '.promo',
  '.footer',
  '.related',
  '.tags',
  '.author-box',
  'nav',
  'form',
  '[hidden]',
  '[aria-hidden="true"]',

  // Cookie/Privacy/Consent
  '[class*="cookie"]',
  '[id*="cookie"]',
  '[class*="consent"]',
  '[class*="gdpr"]',
  '[class*="privacy"]',
  '[class*="banner"]',

  // Popups/Modals
  '[class*="popup"]',
  '[class*="modal"]',
  '[class*="overlay"]',
  '[class*="lightbox"]',
  '[role="dialog"]',
  '[aria-modal="true"]',

  // Advertising
  '[class*="ad-"]',
  '[class*="ads"]',
  '[data-ad]',
  '[data-google-ad]',
  'iframe[src*="doubleclick"]',
  'iframe[src*="googlesyndication"]',

  // Social/Engagement
  '[class*="follow"]',
  '[class*="subscribe"]',
  '[class*="newsletter"]',
  '[class*="signup"]',

  // Navigation/UI
  '[class*="breadcrumb"]',
  '[class*="pagination"]',
  '[class*="sidebar"]',
  '[class*="widget"]',
  'header',
  'aside',
  '.header',
  '.sidebar',

  // Comments/User Content
  '[class*="comment"]',
  '[class*="discuss"]',
];

// Advanced DOM Content Analysis
class ContentAnalyzer {
  /**
   * Analyze DOM tree to identify content regions by scoring elements
   */
  static analyzeContentRegions(document: Document): ContentRegion[] {
    const regions: ContentRegion[] = [];
    const candidates = document.querySelectorAll(
      'div, section, article, main, aside, nav, header, footer',
    );

    candidates.forEach((element) => {
      const region = this.scoreContentRegion(element as Element);
      if (region.score > 0.1) {
        // Only keep potentially relevant regions
        regions.push(region);
      }
    });

    return regions.sort((a, b) => b.score - a.score);
  }

  private static scoreContentRegion(element: Element): ContentRegion {
    const text = element.textContent || '';
    const textLength = text.trim().length;
    const links = element.querySelectorAll('a');
    const totalLinkText = Array.from(links).reduce(
      (sum, link) => sum + (link.textContent?.length || 0),
      0,
    );

    // Calculate densities
    const textDensity = textLength / Math.max(element.innerHTML.length, 1);
    const linkDensity = totalLinkText / Math.max(textLength, 1);

    // Check for structured data
    const hasStructuredData = this.hasStructuredContent(element);

    // Determine region type
    const type = this.classifyRegionType(element);

    // Calculate content score
    let score = 0;

    // Text length scoring (optimal range: 200-2000 characters)
    if (textLength >= 200 && textLength <= 2000) {
      score += 0.4;
    } else if (textLength > 100) {
      score += 0.2;
    }

    // Text density scoring (higher is better for content)
    score += textDensity * 0.3;

    // Link density penalty (too many links = navigation/spam)
    if (linkDensity < 0.3) {
      score += 0.2;
    } else if (linkDensity > 0.7) {
      score -= 0.3;
    }

    // Structured data bonus
    if (hasStructuredData) {
      score += 0.2;
    }

    // Region type modifiers
    switch (type) {
      case 'main':
        score += 0.3;
        break;
      case 'advertisement':
      case 'navigation':
        score -= 0.5;
        break;
      case 'sidebar':
        score -= 0.2;
        break;
    }

    return {
      element,
      score: Math.max(0, Math.min(1, score)),
      type,
      textDensity,
      linkDensity,
      hasStructuredData,
    };
  }

  private static hasStructuredContent(element: Element): boolean {
    return (
      element.querySelectorAll('table, ul, ol, dl').length > 0 ||
      element.querySelector('[itemscope]') !== null ||
      element.querySelector('script[type="application/ld+json"]') !== null
    );
  }

  private static classifyRegionType(element: Element): ContentRegion['type'] {
    const tagName = element.tagName.toLowerCase();
    const className = element.className.toLowerCase();
    const id = element.id.toLowerCase();

    // Check semantic HTML5 elements first
    if (tagName === 'main' || tagName === 'article') return 'main';
    if (tagName === 'nav') return 'navigation';
    if (tagName === 'aside') return 'sidebar';
    if (tagName === 'header') return 'header';
    if (tagName === 'footer') return 'footer';

    // Check class names and IDs
    const adPatterns = /\\b(ad|ads|advertisement|banner|promo|sponsor)\\b/;
    const navPatterns = /\\b(nav|menu|breadcrumb|pagination)\\b/;
    const sidebarPatterns = /\\b(sidebar|aside|widget)\\b/;
    const mainPatterns = /\\b(main|content|article|post|entry)\\b/;

    if (adPatterns.test(className) || adPatterns.test(id))
      return 'advertisement';
    if (navPatterns.test(className) || navPatterns.test(id))
      return 'navigation';
    if (sidebarPatterns.test(className) || sidebarPatterns.test(id))
      return 'sidebar';
    if (mainPatterns.test(className) || mainPatterns.test(id)) return 'main';

    return 'main'; // Default assumption
  }
}

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

// Advanced structured data extraction
class StructuredDataExtractor {
  /**
   * Extract and format table data with preserved structure
   */
  static extractTableData(table: Element): TableData | null {
    const rows = Array.from(table.querySelectorAll('tr'));
    if (rows.length === 0) return null;

    // Extract headers
    const headerCells = rows[0].querySelectorAll('th, td');
    const headers = Array.from(headerCells)
      .map((cell) => cell.textContent?.trim().replace(/\s+/g, ' ') || '')
      .filter((h) => h.length > 0);

    // Extract data rows
    const dataRows = rows
      .slice(headers.length > 0 ? 1 : 0)
      .map((row) => {
        const cells = row.querySelectorAll('td, th');
        return Array.from(cells).map(
          (cell) => cell.textContent?.trim().replace(/\s+/g, ' ') || '',
        );
      })
      .filter((row) => row.some((cell) => cell.length > 0));

    // Extract caption if available
    const caption = table.querySelector('caption')?.textContent?.trim();

    // Generate summary
    const summary = this.generateTableSummary(headers, dataRows, caption);

    return {
      headers,
      rows: dataRows,
      caption,
      summary,
    };
  }

  private static generateTableSummary(
    headers: string[],
    rows: string[][],
    caption?: string,
  ): string {
    if (rows.length === 0) return 'Empty table';

    const parts = [];

    if (caption) {
      parts.push(caption);
    }

    if (headers.length > 0) {
      parts.push(`Columns: ${headers.join(', ')}`);
    }

    parts.push(`${rows.length} rows of data`);

    // Include a sample of the data if it's meaningful
    if (
      rows.length > 0 &&
      headers.length > 0 &&
      rows[0].length === headers.length
    ) {
      const sampleRow = rows[0].slice(0, 3); // First 3 cells
      if (sampleRow.every((cell) => cell.length > 0 && cell.length < 50)) {
        parts.push(`Sample: ${sampleRow.join(' | ')}`);
      }
    }

    return parts.join('. ');
  }

  /**
   * Extract Schema.org structured data
   */
  static extractSchemaData(document: Document): any[] {
    const schemas = [];

    // JSON-LD
    const jsonLdScripts = document.querySelectorAll(
      'script[type="application/ld+json"]',
    );
    jsonLdScripts.forEach((script) => {
      try {
        const data = JSON.parse(script.textContent || '');
        schemas.push({ type: 'json-ld', data });
      } catch (error) {
        // Invalid JSON, skip
      }
    });

    // Microdata
    const microdataElements = document.querySelectorAll('[itemscope]');
    microdataElements.forEach((element) => {
      const microdata = this.extractMicrodata(element);
      if (microdata) {
        schemas.push({ type: 'microdata', data: microdata });
      }
    });

    return schemas;
  }

  private static extractMicrodata(element: Element): any {
    const result: any = {};

    // Get itemtype
    const itemtype = element.getAttribute('itemtype');
    if (itemtype) {
      result['@type'] = itemtype;
    }

    // Get properties
    const propElements = element.querySelectorAll('[itemprop]');
    propElements.forEach((propElement) => {
      const propName = propElement.getAttribute('itemprop');
      if (propName) {
        const propValue =
          propElement.getAttribute('content') ||
          propElement.textContent?.trim() ||
          '';
        if (propValue) {
          result[propName] = propValue;
        }
      }
    });

    return Object.keys(result).length > 0 ? result : null;
  }
}

turndownService.addRule('structuredTable', {
  filter: 'table',
  replacement: (content, node) => {
    const tableData = StructuredDataExtractor.extractTableData(node as Element);

    if (!tableData || tableData.rows.length === 0) {
      return '';
    }

    // For simple tables with clear structure, preserve as markdown table
    if (
      tableData.headers.length > 0 &&
      tableData.headers.length <= 5 &&
      tableData.rows.length <= 10 &&
      tableData.headers.every((h) => h.length < 30)
    ) {
      const headerRow = `| ${tableData.headers.join(' | ')} |`;
      const separatorRow = `| ${tableData.headers
        .map(() => '---')
        .join(' | ')} |`;
      const dataRows = tableData.rows.map((row) => {
        const paddedRow = [...row];
        while (paddedRow.length < tableData.headers.length) {
          paddedRow.push('');
        }
        return `| ${paddedRow
          .slice(0, tableData.headers.length)
          .join(' | ')} |`;
      });

      const table = [headerRow, separatorRow, ...dataRows].join('\n');

      return `\n\n${table}\n\n`;
    }

    // For complex tables, use summary format
    return `\n\n**Table Data**: ${tableData.summary}\n\n`;
  },
});

turndownService.addRule('enhancedLinks', {
  filter: 'a',
  replacement: (content, node) => {
    const href = (node as Element).getAttribute('href');
    const text = content.trim();
    const title = (node as Element).getAttribute('title');

    // Skip empty links
    if (!text) return '';

    // Enhanced URL validation
    const isValidUrl = (url: string): boolean => {
      if (!url || url.length < 7) return false;
      if (
        url.startsWith('javascript:') ||
        url.startsWith('mailto:') ||
        url === '#'
      )
        return false;
      if (url.includes('\n') || url.includes(' ') || url.includes('\t'))
        return false;

      // Check for incomplete URLs
      if (url.match(/^https?:\/\/[^\s\/]+$/)) return false;

      // Check for relative URLs that make sense
      if (
        url.startsWith('/') ||
        url.startsWith('./') ||
        url.startsWith('../')
      ) {
        return url.length > 3 && !url.includes(' ');
      }

      // Check for absolute URLs
      if (url.startsWith('http')) {
        try {
          new URL(url);
          return true;
        } catch {
          return false;
        }
      }

      return false;
    };

    if (!href || !isValidUrl(href)) {
      return text;
    }

    // For very long URLs, truncate in display but keep full URL
    if (href.length > 150) {
      return text; // Just return text for very long URLs
    }

    // If link text is just the URL, make it more readable
    if (text === href || text.includes(href)) {
      try {
        const url = new URL(href.startsWith('http') ? href : `https://${href}`);
        const domain = url.hostname.replace('www.', '');
        const cleanText = title || domain;
        return `[${cleanText}](${href})`;
      } catch {
        return text;
      }
    }

    return `[${text}](${href})`;
  },
});

function dedupeContent(markdown: string): string {
  // Split into paragraphs and sentences for better deduplication
  const paragraphs = markdown.split(/\n\s*\n/);
  const seenContent = new Set<string>();
  const seenSentences = new Set<string>();
  const uniqueParagraphs: string[] = [];

  for (const paragraph of paragraphs) {
    const trimmed = paragraph.trim();

    // Skip empty paragraphs
    if (!trimmed) continue;

    // Always keep headers and special formatting
    if (
      trimmed.startsWith('#') ||
      trimmed.startsWith('**') ||
      trimmed.startsWith('```')
    ) {
      uniqueParagraphs.push(trimmed);
      continue;
    }

    // Normalize content for comparison (remove punctuation, lowercase, collapse whitespace)
    const normalized = trimmed
      .toLowerCase()
      .replace(/[^\w\s]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();

    // Skip if we've seen this content before
    if (seenContent.has(normalized)) {
      continue;
    }

    // Check for sentence-level duplication within the paragraph
    const sentences = trimmed
      .split(/[.!?]+/)
      .map((s) => s.trim())
      .filter((s) => s.length > 10);
    const uniqueSentences: string[] = [];

    for (const sentence of sentences) {
      const normalizedSentence = sentence
        .toLowerCase()
        .replace(/[^\w\s]/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();

      // Keep sentence if it's new and substantial
      if (
        normalizedSentence.length > 20 &&
        !seenSentences.has(normalizedSentence)
      ) {
        uniqueSentences.push(sentence);
        seenSentences.add(normalizedSentence);
      }
    }

    // Add paragraph if it has unique sentences
    if (uniqueSentences.length > 0) {
      const rebuiltParagraph =
        uniqueSentences.join('. ').replace(/\.\s*$/, '') + '.';
      uniqueParagraphs.push(rebuiltParagraph);
      seenContent.add(normalized);
    }
  }

  return uniqueParagraphs.join('\n\n');
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

// Remark transformer to clean up malformed markdown
function remarkCleanMarkdown() {
  return (tree: any) => {
    visit(tree, (node, index, parent) => {
      // Fix malformed links
      if (node.type === 'link') {
        // Remove links with invalid URLs
        if (
          !node.url ||
          node.url.includes('\n') ||
          node.url.includes(' ') ||
          node.url.startsWith('javascript:') ||
          node.url === '#' ||
          node.url.match(/^https?:\/\/[^\s\/]+$/)
        ) {
          // Replace with text content
          if (node.children && node.children.length > 0) {
            const textContent = node.children
              .filter((child: any) => child.type === 'text')
              .map((child: any) => child.value)
              .join('');

            if (textContent.trim()) {
              parent?.children.splice(index, 1, {
                type: 'text',
                value: textContent,
              });
            } else {
              parent?.children.splice(index, 1);
            }
          } else {
            parent?.children.splice(index, 1);
          }
          return;
        }

        // Remove very long URLs that clutter the output
        if (node.url.length > 100) {
          const textContent = node.children
            .filter((child: any) => child.type === 'text')
            .map((child: any) => child.value)
            .join('');

          parent?.children.splice(index, 1, {
            type: 'text',
            value: textContent || 'link',
          });
          return;
        }
      }

      // Remove broken images
      if (node.type === 'image') {
        if (
          !node.url ||
          node.url.includes('data:image') ||
          node.url.includes('\n') ||
          node.url.includes(' ') ||
          !node.alt?.trim()
        ) {
          parent?.children.splice(index, 1);
          return;
        }
      }

      // Clean up empty or minimal headers
      if (node.type === 'heading') {
        const textContent = node.children
          ?.filter((child: any) => child.type === 'text')
          ?.map((child: any) => child.value)
          ?.join('')
          ?.trim();

        if (!textContent || textContent.length < 3) {
          parent?.children.splice(index, 1);
          return;
        }
      }

      // Remove empty list items
      if (node.type === 'listItem') {
        const hasContent = node.children?.some((child: any) => {
          if (child.type === 'paragraph') {
            const text = child.children
              ?.filter((grandchild: any) => grandchild.type === 'text')
              ?.map((grandchild: any) => grandchild.value)
              ?.join('')
              ?.trim();
            return text && text.length > 3;
          }
          return child.type === 'list' || child.type === 'blockquote';
        });

        if (!hasContent) {
          parent?.children.splice(index, 1);
          return;
        }
      }

      // Clean up text nodes
      if (node.type === 'text') {
        // Fix HTML entities
        node.value = node.value
          .replace(/&nbsp;/g, ' ')
          .replace(/&amp;/g, '&')
          .replace(/&lt;/g, '<')
          .replace(/&gt;/g, '>')
          .replace(/&quot;/g, '"')
          .replace(/\\\>/g, '>')
          .replace(/[ \t]{3,}/g, '  '); // Limit excessive spaces

        // Remove if just whitespace or minimal content
        if (
          node.value.trim().length === 0 ||
          /^[,\.\;\:\!\?\s—–\-]*$/.test(node.value)
        ) {
          parent?.children.splice(index, 1);
          return;
        }
      }
    });
  };
}

async function cleanMarkdownArtifacts(markdown: string): Promise<string> {
  try {
    const processor = remark().use(remarkGfm).use(remarkCleanMarkdown);

    const result = await processor.process(markdown);
    let cleaned = String(result);

    // Final cleanup for whitespace
    cleaned = cleaned
      .replace(/\n{4,}/g, '\n\n\n') // Limit to max 3 newlines
      .replace(/\n\s*\n\s*\n/g, '\n\n') // Normalize paragraph spacing
      .trim();

    return cleaned;
  } catch (error) {
    console.warn('Remark processing failed, falling back to original:', error);
    return markdown; // Fallback to original if remark fails
  }
}

// Enhanced content validation and quality assessment
function validateSummaryQuality(
  original: string,
  summary: string,
): { isValid: boolean; score: number; issues: string[] } {
  const issues: string[] = [];
  let score = 100;

  // Basic validation
  if (!summary || summary.length < 10) {
    issues.push('Summary too short');
    return { isValid: false, score: 0, issues };
  }

  // Check for repetition
  const words = summary.toLowerCase().split(/\s+/);
  const wordFreq = new Map<string, number>();
  words.forEach((word) => wordFreq.set(word, (wordFreq.get(word) || 0) + 1));

  const repetitiveWords = Array.from(wordFreq.entries()).filter(
    ([word, count]) =>
      word.length > 3 && count > Math.max(2, words.length * 0.15),
  );

  if (repetitiveWords.length > 0) {
    score -= 20;
    issues.push('Contains repetitive content');
  }

  // Check semantic coherence (basic)
  const sentences = summary.split(/[.!?]+/).filter((s) => s.trim().length > 5);
  if (sentences.length === 0) {
    score -= 30;
    issues.push('No complete sentences');
  }

  // Check for key entity preservation
  const originalDoc = nlp(original);
  const summaryDoc = nlp(summary);

  const originalEntities = [
    ...originalDoc.people().out('array'),
    ...originalDoc.places().out('array'),
    ...originalDoc.organizations().out('array'),
  ].slice(0, 5);

  const summaryEntities = [
    ...summaryDoc.people().out('array'),
    ...summaryDoc.places().out('array'),
    ...summaryDoc.organizations().out('array'),
  ];

  const preservedEntities = originalEntities.filter((entity) =>
    summaryEntities.some((se) =>
      se.toLowerCase().includes(entity.toLowerCase()),
    ),
  );

  const entityPreservationRatio =
    originalEntities.length > 0
      ? preservedEntities.length / originalEntities.length
      : 1;

  if (entityPreservationRatio < 0.3 && originalEntities.length > 2) {
    score -= 25;
    issues.push('Lost important entities');
  }

  return {
    isValid: score >= 50 && issues.length === 0,
    score,
    issues,
  };
}

function assessContentQuality(text: string): number {
  let score = 50; // Base score

  const trimmed = text.trim();
  if (!trimmed) return 0;

  // Word count scoring - optimal range gives bonus points
  const wordCount = trimmed.split(/\s+/).length;
  if (wordCount >= 30 && wordCount <= 300) {
    score += 20;
  } else if (wordCount >= 10 && wordCount < 30) {
    score += 10;
  } else if (wordCount < 10) {
    score -= 25;
  } else if (wordCount > 500) {
    score -= 10; // Very long might be repetitive
  }

  // Information density indicators
  const hasNumbers = /\d+/.test(trimmed);
  const hasProperNouns = /\b[A-Z][a-z]+\b/.test(trimmed);
  const hasCompleteStructure = /[.!?]/.test(trimmed);
  const sentenceCount = trimmed.split(/[.!?]+/).length - 1;

  if (hasNumbers) score += 10;
  if (hasProperNouns) score += 10;
  if (hasCompleteStructure && sentenceCount >= 2) score += 15;

  // Content richness - diverse vocabulary
  const uniqueWords = new Set(trimmed.toLowerCase().split(/\s+/));
  const vocabularyRatio = uniqueWords.size / wordCount;
  if (vocabularyRatio > 0.7) score += 10;
  else if (vocabularyRatio < 0.3) score -= 15;

  // Low-value content patterns (decrease score)
  const promotionalPatterns =
    /\b(subscribe|follow|buy now|click here|sign up|download|register|join now)\b/gi;
  const navigationPatterns =
    /\b(home|about|contact|menu|search|login|profile|settings)\b/gi;
  const metadataPatterns =
    /\b(posted|updated|published|tags|categories|share|tweet|like)\b/gi;
  const loadingPatterns =
    /\b(loading|please wait|error|404|not found|unavailable)\b/gi;

  const promotionalMatches = (trimmed.match(promotionalPatterns) || []).length;
  const navigationMatches = (trimmed.match(navigationPatterns) || []).length;
  const metadataMatches = (trimmed.match(metadataPatterns) || []).length;
  const loadingMatches = (trimmed.match(loadingPatterns) || []).length;

  score -= promotionalMatches * 8;
  score -= navigationMatches * 6;
  score -= metadataMatches * 4;
  score -= loadingMatches * 15;

  // Repetitive content detection
  const words = trimmed.toLowerCase().split(/\s+/);
  const wordFreq = new Map<string, number>();
  words.forEach((word) => {
    if (word.length > 3) {
      // Only count meaningful words
      wordFreq.set(word, (wordFreq.get(word) || 0) + 1);
    }
  });

  // Check for excessive repetition
  let repetitiveWords = 0;
  wordFreq.forEach((count) => {
    if (count > Math.max(3, wordCount * 0.1)) {
      repetitiveWords += count;
    }
  });

  if (repetitiveWords > wordCount * 0.3) {
    score -= 20;
  }

  // Bonus for informational content
  const informationalPatterns =
    /\b(analysis|data|study|research|report|statistics|findings|results)\b/gi;
  const factualPatterns =
    /\b(according to|based on|study shows|data indicates|research suggests)\b/gi;

  if (informationalPatterns.test(trimmed)) score += 8;
  if (factualPatterns.test(trimmed)) score += 10;

  // Ensure score stays within bounds
  return Math.max(0, Math.min(100, score));
}

function intelligentChunk(markdown: string, maxChunkWords = 700): string[] {
  // Safety check for undefined/null markdown
  if (!markdown || typeof markdown !== 'string') {
    logger.warn('intelligentChunk received invalid markdown:', markdown);
    return [];
  }

  // First split by explicit separators (headers with ---)
  const majorSections = markdown.split(/\n---\n/);
  const chunks: string[] = [];

  for (const section of majorSections) {
    const trimmed = section.trim();
    if (!trimmed) continue;

    const wordCount = trimmed.split(/\s+/).length;

    // If section is small enough, keep as-is
    if (wordCount <= maxChunkWords) {
      chunks.push(trimmed);
      continue;
    }

    // Split large sections at semantic boundaries
    // Priority: headers > paragraphs > sentences
    let subChunks: string[] = [];

    // Try splitting by headers first
    const headerSplit = trimmed.split(/\n(#{1,6}\s+[^\n]+)\n/);
    if (headerSplit.length > 1) {
      let currentChunk = '';

      for (let i = 0; i < headerSplit.length; i++) {
        const part = headerSplit[i];
        if (!part.trim()) continue;

        const potentialChunk =
          currentChunk + (currentChunk ? '\n\n' : '') + part;
        const potentialWordCount = potentialChunk.split(/\s+/).length;

        if (potentialWordCount <= maxChunkWords) {
          currentChunk = potentialChunk;
        } else {
          if (currentChunk) {
            subChunks.push(currentChunk);
          }
          currentChunk = part;
        }
      }

      if (currentChunk) {
        subChunks.push(currentChunk);
      }
    } else {
      // Fall back to paragraph splitting
      const paragraphs = trimmed.split(/\n\s*\n/);
      let currentChunk = '';

      for (const paragraph of paragraphs) {
        if (!paragraph.trim()) continue;

        const potentialChunk =
          currentChunk + (currentChunk ? '\n\n' : '') + paragraph;
        const potentialWordCount = potentialChunk.split(/\s+/).length;

        if (potentialWordCount <= maxChunkWords) {
          currentChunk = potentialChunk;
        } else {
          if (currentChunk) {
            subChunks.push(currentChunk);
          }

          // If single paragraph is too long, split by sentences
          const paragraphWordCount = paragraph.split(/\s+/).length;
          if (paragraphWordCount > maxChunkWords) {
            const sentences = paragraph.split(/(?<=[.!?])\s+/);
            let sentenceChunk = '';

            for (const sentence of sentences) {
              const potentialSentenceChunk =
                sentenceChunk + (sentenceChunk ? ' ' : '') + sentence;
              const sentenceWordCount =
                potentialSentenceChunk.split(/\s+/).length;

              if (sentenceWordCount <= maxChunkWords) {
                sentenceChunk = potentialSentenceChunk;
              } else {
                if (sentenceChunk) {
                  subChunks.push(sentenceChunk);
                }
                sentenceChunk = sentence;
              }
            }

            if (sentenceChunk) {
              subChunks.push(sentenceChunk);
            }
          } else {
            currentChunk = paragraph;
          }
        }
      }

      if (currentChunk) {
        subChunks.push(currentChunk);
      }
    }

    chunks.push(...subChunks);
  }

  return chunks.filter((chunk) => chunk.trim().length > 0);
}

// STAGE 1: CLASSIFY - Identify general content characteristics
interface ContentClassification {
  contentType: 'structured' | 'narrative' | 'mixed';
  informationDensity: 'high' | 'medium' | 'low';
  keyEntities: string[];
  hasNumericData: boolean;
  hasListStructure: boolean;
  readabilityScore: number;
}

function classifyContent(text: string): ContentClassification {
  // Use Compromise for entity extraction
  const doc = nlp(text);
  const people = doc.people().out('array');
  const places = doc.places().out('array');
  const organizations = doc.organizations().out('array');
  const numbers = doc.numbers().out('array');

  // Use Natural.js for enhanced analysis
  const naturalAnalysis = NaturalNLPAnalyzer.analyzeContentQuality(text);
  const keyTerms = NaturalNLPAnalyzer.extractKeyTerms(text, 8);

  // Detect content structure patterns
  const hasNumbers = numbers.length > 0;
  const hasList = (doc.match('#List') || []).length > 2;
  const hasTable = /\*\*Table\*\*/.test(text);
  const hasListStructure = (text.match(/^[-*+]\s/gm) || []).length > 3;

  // Determine content type based on structure
  let contentType: ContentClassification['contentType'] = 'narrative';
  if (hasNumbers && (hasList || hasTable || hasListStructure)) {
    contentType = 'structured';
  } else if (hasNumbers || hasList || hasListStructure) {
    contentType = 'mixed';
  }

  // Calculate information density
  const wordCount = text.split(/\s+/).length;
  const entityCount = people.length + places.length + organizations.length;
  const numberCount = numbers.length;
  const uniqueWords = new Set(text.toLowerCase().split(/\s+/)).size;
  const vocabularyRatio = uniqueWords / wordCount;

  // Enhanced information density using Natural.js analysis
  let densityScore = naturalAnalysis.informativeness * 20; // Base score from Natural.js
  if (entityCount > 0) densityScore += entityCount * 2;
  if (numberCount > 0) densityScore += numberCount;
  if (vocabularyRatio > 0.6) densityScore += 10;
  if (hasTable || hasListStructure) densityScore += 5;
  if (naturalAnalysis.keywordDensity > 0.3) densityScore += 8;

  const informationDensity: ContentClassification['informationDensity'] =
    densityScore >= 20 ? 'high' : densityScore >= 10 ? 'medium' : 'low';

  // Combine all entities with Natural.js key terms
  const allEntities = [
    ...new Set([...people, ...places, ...organizations, ...keyTerms]),
  ];
  const keyEntities = allEntities.slice(0, 12); // Increased to capture more context including key terms

  return {
    contentType,
    informationDensity,
    keyEntities,
    hasNumericData: hasNumbers,
    hasListStructure,
    readabilityScore: naturalAnalysis.readabilityScore,
  };
}

// STAGE 2: EXTRACT - General information extraction using Natural + Compromise
function extractKeyInformation(
  text: string,
  classification: ContentClassification,
): string[] {
  const doc = nlp(text);
  const extracted: string[] = [];

  // Extract universal content elements
  const numbers = doc.numbers().out('array').slice(0, 6);
  const people = doc.people().out('array').slice(0, 5);
  const places = doc.places().out('array').slice(0, 5);
  const organizations = doc.organizations().out('array').slice(0, 5);
  const dates = doc.match('#Date').out('array').slice(0, 3);
  const money = doc.money().out('array').slice(0, 4);
  const percentages = doc.percentages().out('array').slice(0, 4);
  const quotations = doc.quotations().out('array').slice(0, 2);

  // Add all extracted information
  extracted.push(...numbers);
  extracted.push(...people);
  extracted.push(...places);
  extracted.push(...organizations);
  extracted.push(...dates);
  extracted.push(...money);
  extracted.push(...percentages);
  extracted.push(...quotations);

  // Extract key phrases (noun phrases that might be important)
  const nounPhrases = doc.match('#Noun+ #Noun').out('array').slice(0, 5);
  extracted.push(...nounPhrases);

  return extracted.filter((item) => item && item.length > 0 && item.length > 2);
}

// Post-process summary to make it more concise
function postProcessSummary(
  summary: string,
  classification?: ContentClassification,
): string {
  let processed = summary;

  // Remove common filler phrases
  const fillerPhrases = [
    /\baccording to (the )?report[s]?\b/gi,
    /\bthe article (states|mentions|says|reports)\b/gi,
    /\bin addition to\b/gi,
    /\bit is important to note that\b/gi,
    /\bit should be noted that\b/gi,
    /\bas previously mentioned\b/gi,
    /\bfor example,?\b/gi,
    /\bfor instance,?\b/gi,
    /\bin conclusion,?\b/gi,
    /\bto summarize,?\b/gi,
    /\boverall,?\b/gi,
    /\bin summary,?\b/gi,
  ];

  fillerPhrases.forEach((pattern) => {
    processed = processed.replace(pattern, '');
  });

  // Convert passive voice to active when possible (generalized)
  processed = processed
    .replace(
      /\bwas (created|developed|built|designed|implemented|established|completed|announced)\b/gi,
      '$1',
    )
    .replace(
      /\bwere (developed|created|built|designed|implemented|awarded|given|presented)\b/gi,
      '$1',
    )
    .replace(/\bis expected to\b/gi, 'will')
    .replace(/\bwill be able to\b/gi, 'can')
    .replace(/\bis being\b/gi, 'is')
    .replace(/\bare being\b/gi, 'are');

  // Compress common phrases (generalized)
  processed = processed
    .replace(/\bmore than\b/gi, '>')
    .replace(/\bless than\b/gi, '<')
    .replace(/\bapproximately\b/gi, '~')
    .replace(/\babout\b/gi, '~')
    .replace(/\bpercent\b/gi, '%')
    .replace(/\bmillion\b/gi, 'M')
    .replace(/\bbillion\b/gi, 'B')
    .replace(/\bthousand\b/gi, 'K');

  // Clean up extra whitespace and punctuation
  processed = processed
    .replace(/\s+/g, ' ')
    .replace(/\s*,\s*/g, ', ')
    .replace(/\s*\.\s*/g, '. ')
    .replace(/\.\s*\./g, '.')
    .replace(/,\s*,/g, ',')
    .trim();

  return processed;
}

// STAGE 4: COMPRESS - Intelligent multi-stage summarization with content-aware optimization
async function intelligentSummarization(
  text: string,
  targetLength: number,
  classification: ContentClassification,
): Promise<string> {
  // Input validation
  if (!text || text.trim().length < 50) {
    throw new Error('Input text too short for summarization');
  }

  if (targetLength < 10 || targetLength > 1000) {
    throw new Error('Invalid target length for summarization');
  }

  const summarizerService = await getSummarizer();

  try {
    // Extract key information from content
    const keyInfo = extractKeyInformation(text, classification);

    // Determine compression strategy based on content characteristics
    let strategy = {
      firstPassRatio: 1.8,
      compressionLevel: 'moderate' as 'aggressive' | 'moderate' | 'gentle',
      preserveStructure: false,
      maxIterations: 2,
    };

    // Adapt strategy based on content type and information density
    if (
      classification.contentType === 'structured' &&
      classification.informationDensity === 'high'
    ) {
      strategy = {
        firstPassRatio: 1.6,
        compressionLevel: 'gentle',
        preserveStructure: true,
        maxIterations: 2,
      };
    } else if (classification.contentType === 'structured') {
      strategy = {
        firstPassRatio: 1.5,
        compressionLevel: 'moderate',
        preserveStructure: true,
        maxIterations: 2,
      };
    } else if (classification.informationDensity === 'low') {
      strategy = {
        firstPassRatio: 1.2,
        compressionLevel: 'aggressive',
        preserveStructure: false,
        maxIterations: 1,
      };
    } else if (classification.informationDensity === 'high') {
      strategy = {
        firstPassRatio: 1.9,
        compressionLevel: 'gentle',
        preserveStructure: false,
        maxIterations: 2,
      };
    }

    // Stage 1: Domain-aware initial summarization
    const firstPassParams = {
      max_length: Math.floor(targetLength * strategy.firstPassRatio),
      min_length: Math.floor(targetLength * 1.1),
      no_repeat_ngram_size: strategy.compressionLevel === 'aggressive' ? 4 : 3,
      do_sample: classification.contentType === 'narrative',
      early_stopping: true,
    };

    const firstSummary = await summarizerService.summarize(
      text,
      firstPassParams,
    );

    // Validate first summary
    const firstValidation = validateSummaryQuality(text, firstSummary);
    if (!firstValidation.isValid) {
      console.warn(
        'First pass summary validation failed:',
        firstValidation.issues,
      );

      // Intelligent fallback: create general summary from extracted info
      if (keyInfo.length > 0) {
        const fallbackSummary = createGeneralFallback(keyInfo, classification);
        const fallbackValidation = validateSummaryQuality(
          text,
          fallbackSummary,
        );
        if (fallbackValidation.isValid) {
          return fallbackSummary;
        }
      }

      // Ultimate fallback: extractive summary using Natural
      const extractiveSummary = naturalExtractiveSummary(
        text,
        Math.ceil(targetLength / 20),
      );
      if (extractiveSummary.length > 30) {
        return extractiveSummary;
      }

      // Use the original text if summarization completely fails
      return text;
    }

    // Apply domain-aware post-processing
    firstSummary = postProcessSummary(firstSummary, classification);

    // Check if we need further compression
    const firstWordCount = firstSummary.split(/\s+/).length;
    if (firstWordCount <= targetLength || strategy.maxIterations === 1) {
      return firstSummary;
    }

    // Stage 2: Targeted compression based on domain
    const secondPassParams = {
      max_length: targetLength,
      min_length: Math.floor(
        targetLength * (strategy.compressionLevel === 'aggressive' ? 0.5 : 0.7),
      ),
      no_repeat_ngram_size: 4,
      do_sample: false,
      early_stopping: true,
    };

    let finalSummary = await summarizerService.summarize(
      firstSummary,
      secondPassParams,
    );

    if (finalSummary) {
      finalSummary = postProcessSummary(finalSummary, classification);

      // Validate final summary
      const finalValidation = validateSummaryQuality(text, finalSummary);
      if (!finalValidation.isValid) {
        console.warn(
          'Final summary validation failed:',
          finalValidation.issues,
        );
        // Fall back to first summary if final is invalid
        return postProcessSummary(firstSummary, classification);
      }

      // Stage 3: Final optimization if still too long and strategy allows
      if (
        strategy.maxIterations === 3 &&
        finalSummary.split(/\s+/).length > targetLength * 1.2
      ) {
        const finalPassParams = {
          max_length: Math.floor(targetLength * 0.9),
          min_length: Math.floor(targetLength * 0.5),
          no_repeat_ngram_size: 5,
          do_sample: false,
          early_stopping: true,
        };

        const ultraCompressed = await summarizerService.summarize(
          finalSummary,
          finalPassParams,
        );

        if (ultraCompressed && ultraCompressed.length > 30) {
          const ultraValidation = validateSummaryQuality(text, ultraCompressed);
          if (ultraValidation.isValid) {
            return postProcessSummary(ultraCompressed, classification);
          } else {
            console.warn(
              'Ultra-compressed summary validation failed, keeping previous version',
            );
          }
        }
      }
    }

    return finalSummary || firstSummary;
  } catch (error) {
    console.warn(
      'Intelligent summarization failed, using Natural fallback:',
      error,
    );
    // Use Natural-based extractive summarization as fallback
    const naturalSummary = naturalExtractiveSummary(
      text,
      Math.ceil(targetLength / 20),
    );
    if (naturalSummary.length > 50) {
      return naturalSummary;
    }

    // Ultimate fallback: general key info
    const keyInfo = extractKeyInformation(text, classification);
    if (keyInfo.length > 0) {
      return createGeneralFallback(keyInfo, classification);
    }
    // Return original text if all summarization methods fail
    return text;
  }
}

// Enhanced intelligent fallback using Natural's extractive summarization
function createGeneralFallback(
  keyInfo: string[],
  classification: ContentClassification,
): string {
  if (keyInfo.length === 0) {
    return 'Content summary unavailable.';
  }

  // Create a general summary based on extracted information
  const entities = classification.keyEntities.slice(0, 3);
  const keyPoints = keyInfo.slice(0, 6);

  if (entities.length > 0) {
    return `Key topics: ${entities.join(', ')}. Summary: ${keyPoints.join(
      '; ',
    )}.`;
  } else {
    return `Summary: ${keyPoints.join('; ')}.`;
  }
}

// Natural-based extractive summarization as ultimate fallback
function naturalExtractiveSummary(text: string, maxSentences = 3): string {
  const doc = nlp(text);
  const sentences = doc.sentences().out('array');

  if (sentences.length <= maxSentences) return text;

  // Score sentences based on key indicators
  const scoredSentences = sentences.map((sentence: string) => {
    const sentenceDoc = nlp(sentence);
    let score = 0;

    // Boost sentences with numbers/values
    score += sentenceDoc.numbers().length * 2;
    score += sentenceDoc.percentages().length * 2;
    score += sentenceDoc.money().length * 2;

    // Boost sentences with people/organizations
    score += sentenceDoc.people().length;
    score += sentenceDoc.organizations().length;

    // Boost sentences with action words
    score += sentenceDoc.verbs().length * 0.5;

    // Penalize very short sentences
    if (sentence.split(' ').length < 5) score -= 2;

    return { sentence, score };
  });

  // Return top-scored sentences
  const topSentences = scoredSentences
    .sort((a: any, b: any) => b.score - a.score)
    .slice(0, maxSentences)
    .map((item: any) => item.sentence);

  return topSentences.join(' ');
}

async function summarizeMarkdown(
  markdown: string,
  maxChunkWords = 700,
): Promise<string> {
  // Assess overall content quality to determine optimal chunk size
  const overallQuality = assessContentQuality(markdown);

  // Adjust chunk size based on quality
  // Higher quality content gets larger chunks to preserve context
  let adaptiveChunkSize = maxChunkWords;
  if (overallQuality >= 70) {
    adaptiveChunkSize = Math.floor(maxChunkWords * 1.4); // 980 words for high-quality
  } else if (overallQuality >= 50) {
    adaptiveChunkSize = Math.floor(maxChunkWords * 1.2); // 840 words for medium-quality
  } else if (overallQuality < 30) {
    adaptiveChunkSize = Math.floor(maxChunkWords * 0.8); // 560 words for low-quality
  }

  // Use intelligent chunking with adaptive sizing
  const rawSections = intelligentChunk(markdown, adaptiveChunkSize);

  // Safety check for undefined rawSections
  if (!rawSections || !Array.isArray(rawSections)) {
    logger.error('intelligentChunk returned invalid data:', rawSections);
    return markdown; // Return original markdown as fallback
  }

  // DEDUPLICATION: Remove similar sections using Natural.js similarity scoring
  const sections: string[] = [];
  const SIMILARITY_THRESHOLD = 0.85; // 85% similarity threshold

  for (const currentSection of rawSections) {
    const trimmedCurrent = currentSection.trim();
    if (!trimmedCurrent || trimmedCurrent.length < 50) continue;

    // Check similarity against already added sections
    let isDuplicate = false;
    for (const existingSection of sections) {
      const similarity = NaturalNLPAnalyzer.calculateSimilarity(
        trimmedCurrent,
        existingSection,
      );
      if (similarity > SIMILARITY_THRESHOLD) {
        // Keep the longer/higher quality version
        const currentQuality = assessContentQuality(trimmedCurrent);
        const existingQuality = assessContentQuality(existingSection);

        if (
          currentQuality > existingQuality ||
          (currentQuality === existingQuality &&
            trimmedCurrent.length > existingSection.length)
        ) {
          // Replace existing with current (better quality/longer)
          const index = sections.indexOf(existingSection);
          sections[index] = trimmedCurrent;
        }
        isDuplicate = true;
        break;
      }
    }

    if (!isDuplicate) {
      sections.push(trimmedCurrent);
    }
  }

  logger.info(
    `Deduplication: ${rawSections.length} sections → ${
      sections.length
    } sections (removed ${rawSections.length - sections.length} duplicates)`,
  );
  const summaries: string[] = [];

  for (const section of sections) {
    const trimmed = section.trim();
    if (!trimmed) continue;

    // Assess content quality before processing
    const qualityScore = assessContentQuality(trimmed);

    // Skip low-quality content entirely
    if (qualityScore < 25) {
      continue;
    }

    const wordCount = trimmed.split(/\s+/).length;

    // Determine target length for multi-stage summarization
    let targetLength = 60; // Default target length in words
    let shouldSummarize = false;

    // Content type detection for specialized parameters
    const hasTabularData = /\*\*Table\*\*/.test(trimmed);
    const hasNumericData =
      (trimmed.match(/\d+/g) || []).length > wordCount * 0.1;
    const hasListStructure = (trimmed.match(/^[-*+]\s/gm) || []).length > 3;
    const isNarrative = /\b(story|narrative|article|report)\b/i.test(trimmed);

    if (qualityScore >= 70) {
      // High-quality: summarize if over 300 words (reduced threshold)
      shouldSummarize = wordCount > 300;
      targetLength = hasTabularData || hasNumericData ? 90 : 70;
    } else if (qualityScore >= 50) {
      // Medium-quality: summarize if over 500 words
      shouldSummarize = wordCount > 500;
      targetLength = hasListStructure ? 50 : 60;
    } else {
      // Low-quality (25-49): only summarize if very long
      shouldSummarize = wordCount > adaptiveChunkSize;
      targetLength = 40; // Very concise for low-quality content
    }

    if (shouldSummarize) {
      // STAGE 1: CLASSIFY the content before summarizing
      const classification = classifyContent(trimmed);

      // STAGE 4: COMPRESS using intelligent summarization
      const summary = await intelligentSummarization(
        trimmed,
        targetLength,
        classification,
      );
      if (summary && summary.length > 20) {
        summaries.push(summary);
      } else {
        // If summarization failed, keep original content
        summaries.push(trimmed);
      }
    } else {
      summaries.push(trimmed);
    }
  }

  return summaries.join('\n\n---\n\n');
}

export async function cleanHtml(rawHtml: string, url: string): Promise<string> {
  let dom: JSDOM | null = null;
  let bodyDom: JSDOM | null = null;

  try {
    // Input validation
    if (!rawHtml || rawHtml.trim().length < 100) {
      throw new Error('HTML content too short or empty');
    }

    if (rawHtml.length > 10_000_000) {
      // 10MB limit
      throw new Error('HTML content too large for processing');
    }

    dom = new JSDOM(rawHtml, { url });

    // PHASE 1: Extract structured data before processing
    const structuredData = StructuredDataExtractor.extractSchemaData(
      dom.window.document,
    );
    if (structuredData.length > 0) {
      logger.info(
        `Extracted ${structuredData.length} structured data items from ${url}`,
      );
    }

    // PHASE 2: Advanced content region analysis
    const contentRegions = ContentAnalyzer.analyzeContentRegions(
      dom.window.document,
    );

    // Safety check for contentRegions
    if (!contentRegions || !Array.isArray(contentRegions)) {
      logger.error(
        'ContentAnalyzer.analyzeContentRegions returned invalid data:',
        contentRegions,
      );
      throw new Error('Failed to analyze content regions');
    }

    logger.info(
      `Identified ${contentRegions.length} content regions, top score: ${
        contentRegions[0]?.score.toFixed(3) || 'none'
      }`,
    );

    // PHASE 3: Use Readability with fallback to content regions
    const reader = new Readability(dom.window.document, { charThreshold: 500 });
    let article = reader.parse();

    // If Readability fails, use our content region analysis with sentiment filtering
    if (!article?.content && contentRegions.length > 0) {
      // Filter regions by sentiment quality
      const qualityRegions = contentRegions.filter((region) => {
        const text = region.element.textContent || '';
        if (text.length < 100) return false; // Skip very short content

        const sentimentAnalysis =
          NaturalNLPAnalyzer.analyzeContentQuality(text);
        // Filter out extremely negative or low-quality content
        return (
          sentimentAnalysis.overallQuality > 0.3 &&
          sentimentAnalysis.sentimentScore > 0.2
        );
      });

      const candidateRegions =
        qualityRegions.length > 0 ? qualityRegions : contentRegions;
      const bestRegion =
        candidateRegions.find((r) => r.type === 'main' && r.score > 0.3) ||
        candidateRegions[0];

      if (bestRegion && bestRegion.score > 0.2) {
        const sentimentInfo = NaturalNLPAnalyzer.analyzeContentQuality(
          bestRegion.element.textContent || '',
        );
        logger.info(
          `Readability failed, using content region analysis (score: ${bestRegion.score.toFixed(
            3,
          )}, quality: ${sentimentInfo.overallQuality.toFixed(3)})`,
        );
        article = {
          title: dom.window.document.title || '',
          content: bestRegion.element.innerHTML,
          textContent: bestRegion.element.textContent || '',
          length: bestRegion.element.textContent?.length || 0,
          excerpt: '',
          byline: '',
          dir: '',
          siteName: '',
          lang: '',
        };
      }
    }

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
    bodyDom = new JSDOM(article.content, { url });
    const body = bodyDom.window.document.body;
    removeBoilerplate(body);

    // PHASE 5: Convert to Markdown with enhanced processing
    let markdown = turndownService.turndown(body.innerHTML);

    // Add structured data as context if available
    if (structuredData.length > 0) {
      const structuredContext = structuredData
        .map((item) => {
          if (item.type === 'json-ld' && item.data.name) {
            return `**${item.data.name}**: ${
              item.data.description || 'Structured data available'
            }`;
          } else if (item.type === 'microdata' && item.data['@type']) {
            return `**${item.data['@type']}**: Structured content`;
          }
          return null;
        })
        .filter(Boolean)
        .slice(0, 3); // Limit to 3 items

      if (structuredContext.length > 0) {
        markdown = `*Structured Data: ${structuredContext.join(
          ', ',
        )}*\n\n---\n\n${markdown}`;
      }
    }

    markdown = dedupeContent(prettyWhitespace(markdown));

    // Validate markdown before processing
    if (!markdown || markdown.trim().length < 50) {
      console.warn(`Insufficient content extracted from ${url}`);
      return 'Content too short after cleaning.';
    }

    // Clean up markdown conversion artifacts using remark
    markdown = await cleanMarkdownArtifacts(markdown);

    // Summarize if oversized with timeout protection
    const cleaned = await Promise.race([
      summarizeMarkdown(markdown),
      new Promise<string>(
        (_, reject) =>
          setTimeout(() => reject(new Error('Summarization timeout')), 120000), // 2 min timeout
      ),
    ]);

    return cleaned;
  } catch (error: any) {
    console.error(`Failed to clean HTML from ${url}:`, error?.message || error);

    // Provide more specific error messages
    if (error.message?.includes('timeout')) {
      throw new Error(`Timeout while processing content from ${url}`);
    } else if (error.message?.includes('too large')) {
      throw new Error(`Content from ${url} is too large to process`);
    } else {
      throw new Error(
        `Error cleaning HTML from ${url}: ${error.message || 'Unknown error'}`,
      );
    }
  } finally {
    // Explicit cleanup to prevent memory leaks
    try {
      if (bodyDom?.window) {
        bodyDom.window.close();
      }
      if (dom?.window) {
        dom.window.close();
      }
    } catch (cleanupError) {
      console.warn('Cleanup warning:', cleanupError);
    }
  }
}

// Export cleanup function for manual memory management
export function cleanupSummarizationService(): void {
  try {
    const service = SummarizationService.getInstance();
    service.dispose();
  } catch (error) {
    console.warn('Error during summarization service cleanup:', error);
  }
}
